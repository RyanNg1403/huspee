import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

const sec = (d: Date) => Math.floor(d.getTime() / 1000);
const totals = () => ({
  conversations: 0,
  voice: 0,
  text: 0,
  handoffs: 0,
  orders_placed: 0,
  returns_opened: 0,
});
type Totals = ReturnType<typeof totals>;
function walk(
  value: unknown,
  visit: (key: string, value: unknown) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((v) => {
      visit("", v);
      walk(v, visit);
    });
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value)) {
    visit(key, v);
    walk(v, visit);
  }
}
/** Lowercase, accent-folded, punctuation-free wording, so "Pin bao lâu?" and "pin bao lau" group together. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function parsed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}
  async get(shopId: number, from: number, to: number) {
    const dates = { gte: new Date(from * 1000), lt: new Date((to + 1) * 1000) };
    const [conversations, calls, tickets, actions, started] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { shopId, startedAt: dates },
        orderBy: { startedAt: "desc" },
      }),
      this.prisma.conversationToolCall.findMany({
        where: {
          conversation: { shopId },
          createdAt: dates,
          tool: { not: "speech_check" },
        },
        include: {
          conversation: {
            include: {
              messages: {
                where: { role: "USER" },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.handoffTicket.findMany({
        where: { shopId, conversationId: { not: null }, createdAt: dates },
      }),
      this.prisma.pendingAction.findMany({
        where: {
          shopId,
          status: "EXECUTED",
          type: { in: ["PLACE_ORDER", "OPEN_RETURN"] },
          updatedAt: dates,
        },
      }),
      // Every action prepared in the period, executed or not, for the funnel's quote and cart steps.
      this.prisma.pendingAction.findMany({
        where: { shopId, createdAt: dates },
        select: { conversationId: true, type: true, status: true },
      }),
    ]);
    const total = totals();
    const days = new Map<string, Totals>();
    const inc = (date: Date, key: keyof Totals) => {
      total[key]++;
      const day = date.toISOString().slice(0, 10);
      const entry = days.get(day) ?? totals();
      entry[key]++;
      days.set(day, entry);
    };
    for (const c of conversations) {
      inc(c.startedAt, "conversations");
      inc(c.startedAt, c.channel === "VOICE" ? "voice" : "text");
    }
    for (const t of tickets) inc(t.createdAt, "handoffs");
    for (const a of actions)
      inc(
        a.updatedAt,
        a.type === "PLACE_ORDER" ? "orders_placed" : "returns_opened",
      );
    const products = new Map<number, number>();
    const campaigns = new Map<string, number>();
    const missing: Array<{
      conversation_id: string;
      question: string;
      tool: string;
      created_at: number;
    }> = [];
    const unanswered = tickets.map((t) => ({
      conversation_id: t.conversationId!,
      question: t.subject,
      tool: "handoff_to_seller",
      created_at: sec(t.createdAt),
    }));
    for (const call of calls) {
      const result = call.result as Record<string, unknown> | null;
      const body = parsed(result?.text);
      const card = result?.card;
      const before = call.conversation.messages.filter(
        (m) => m.createdAt <= call.createdAt,
      );
      const question = before.at(-1)?.text ?? "";
      const row = {
        conversation_id: call.conversationId,
        question,
        tool: call.tool,
        created_at: sec(call.createdAt),
      };
      const emptySearch = call.tool === 'search_products' && body && typeof body === 'object' && 'items' in body && Array.isArray(body.items) && body.items.length === 0;
      const validationMiss = Boolean(result?.validation_miss);
      if (
        !call.success || emptySearch || validationMiss ||
        body == null ||
        body === "" ||
        (Array.isArray(body) && body.length === 0)
      )
        unanswered.push(row);
      const structuredMiss = Boolean(result?.missing || result?.out_of_stock);
      if (
        ["search_products", "get_product_details", "compare_products"].includes(
          call.tool,
        )
      ) {
        const ids = new Set<number>();
        let zero = false;
        const inspect = (key: string, v: unknown) => {
          if (key === "item_id" && typeof v === "number") ids.add(v);
          if (key === "item_ids" && Array.isArray(v))
            v.forEach((id: unknown) => {
              if (typeof id === "number") ids.add(id);
            });
          if (key === "stock" && (v === 0 || v === "0")) zero = true;
        };
        walk(call.args, inspect);
        walk(body, inspect);
        walk(card, inspect);
        for (const id of ids) products.set(id, (products.get(id) ?? 0) + 1);
        if (!validationMiss && (structuredMiss || zero))
          missing.push(row);
      }
      if (
        ["add_to_cart", "add_cart_items", "update_cart_item"].includes(call.tool) &&
        !validationMiss && (structuredMiss || (!call.success && body === "Product variation not found"))
      )
        missing.push(row);
      if (["get_vouchers", "place_order"].includes(call.tool)) {
        const codes = new Set<string>();
        const inspect = (key: string, v: unknown) => {
          if (
            ["voucher_code", "code"].includes(key) &&
            typeof v === "string" &&
            v
          )
            codes.add(v);
        };
        walk(body, inspect);
        walk(card, inspect);
        const findVoucherLine = (_key: string, v: unknown) => {
          if (v && typeof v === "object" && !Array.isArray(v)) {
            const line = v as Record<string, unknown>;
            if (
              line.label === "Mã giảm giá / Voucher" &&
              typeof line.value === "string" &&
              line.value !== "Không có / None"
            )
              codes.add(line.value);
          }
        };
        walk(body, findVoucherLine);
        walk(card, findVoucherLine);
        for (const code of codes)
          campaigns.set(code, (campaigns.get(code) ?? 0) + 1);
      }
    }
    const orderSns = actions
      .filter((a) => a.type === "PLACE_ORDER")
      .map((a) => (a.result as { order_sn?: unknown } | null)?.order_sn)
      .filter((sn): sn is string => typeof sn === "string");
    const [items, orders] = await Promise.all([
      this.prisma.item.findMany({
        where: { shopId, id: { in: [...products.keys()] } },
        select: { id: true, name: true },
      }),
      this.prisma.order.findMany({
        where: { shopId, orderSn: { in: orderSns } },
        select: { totalAmount: true },
      }),
    ]);
    const inConversations = new Set(conversations.map((c) => c.id));
    const reached = (test: (conversationId: string) => boolean) =>
      [...inConversations].filter(test).length;
    const asked = new Set(
      calls
        .filter((c) =>
          ["get_product_details", "get_viewed_product", "compare_products"].includes(c.tool),
        )
        .map((c) => c.conversationId),
    );
    const step = (type: string, executed: boolean) =>
      new Set(
        started
          .filter(
            (a) =>
              (type === "CART"
                ? a.type === "ADD_TO_CART" || a.type === "UPDATE_CART_ITEM"
                : a.type === type) && (!executed || a.status === "EXECUTED"),
          )
          .map((a) => a.conversationId),
      );
    const quoted = step("PLACE_ORDER", false);
    const carted = step("CART", true);
    const ordered = step("PLACE_ORDER", true);
    // Unanswered questions grouped by their normalized wording; handoffs are counted separately.
    const groups = new Map<
      string,
      { question: string; count: number; buyers: Set<number>; last_at: number; conversation_ids: Set<string> }
    >();
    const buyerOf = new Map(conversations.map((c) => [c.id, c.buyerId]));
    for (const row of unanswered) {
      if (row.tool === "handoff_to_seller" || !row.question.trim()) continue;
      const key = normalizeQuestion(row.question);
      const group = groups.get(key) ?? { question: row.question, count: 0, buyers: new Set<number>(), last_at: 0, conversation_ids: new Set<string>() };
      group.count++;
      const buyer = buyerOf.get(row.conversation_id);
      if (buyer !== undefined) group.buyers.add(buyer);
      if (row.created_at >= group.last_at) {
        group.last_at = row.created_at;
        group.question = row.question;
      }
      group.conversation_ids.add(row.conversation_id);
      groups.set(key, group);
    }
    const top_products = items
      .map((i) => ({ item_id: i.id, name: i.name, count: products.get(i.id)! }))
      .sort((a, b) => b.count - a.count || a.item_id - b.item_id);
    return {
      source: "logs" as const,
      from,
      to,
      totals: total,
      unique_buyers: new Set(conversations.map((c) => c.buyerId)).size,
      orders_revenue: orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      funnel: {
        conversations: inConversations.size,
        asked_product: reached((id) => asked.has(id)),
        quoted: reached((id) => quoted.has(id)),
        cart_confirmed: reached((id) => carted.has(id)),
        ordered: reached((id) => ordered.has(id)),
      },
      unanswered_groups: [...groups.values()]
        .map((g) => ({
          question: g.question,
          count: g.count,
          buyers: g.buyers.size,
          last_at: g.last_at,
          conversation_ids: [...g.conversation_ids],
        }))
        .sort((a, b) => b.count - a.count || b.last_at - a.last_at),
      top_products,
      missing_requests: missing,
      unanswered_questions: unanswered,
      daily: [...days]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts })),
      campaigns: [...campaigns]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, count]) => ({ code, count })),
      summaries: conversations
        .filter((c) => c.summary !== null)
        .map((c) => ({
          conversation_id: c.id,
          source: "model" as const,
          summary: c.summary,
        })),
    };
  }
}
