import type { OrderStatus, ReturnStatus } from "@prisma/client";
import type { EvalCase } from "./cases";
import type { Fact } from "./facts";
import {
  dbMismatches,
  indexEvidence,
  normalize,
  type ToolRecord,
} from "./evidence";
import { gradeClaims, type Claim } from "./claims";
import { checkSpeech } from "../voice/speech-check";

export interface RecordedRun {
  answer: string;
  claims: Claim[];
  claimsUnparsed?: boolean;
  tools: ToolRecord[];
  latencyMs: number;
  facts?: Fact[];
  toolNames?: string[];
  prompt?: string;
  schemaKeys?: string[];
}
export interface Flag {
  span: string;
  reason: string;
}
const numeric =
  /\b[A-Z][A-Z0-9_-]*\d[A-Z0-9_-]*\b|\d+(?:[.,]\d+)*(?:\s*(?:triệu|nghìn|ngàn|k|%|₫|đồng|đ|vnd|ngày|days?|items?|sản phẩm))?/giu;
const spoken =
  /(?<![\p{L}])(?:không|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|triệu|lẻ|linh)(?:\s+(?:không|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|triệu|lẻ|linh))*(?:\s+(?:đồng|ngày))?(?![\p{L}])/giu;
export function extractSpans(text: string): string[] {
  const digits = [...text.matchAll(numeric)];
  const words = [...text.matchAll(spoken)].filter(
    (m) =>
      !digits.some(
        (d) =>
          (m.index ?? 0) >= (d.index ?? 0) &&
          (m.index ?? 0) < (d.index ?? 0) + d[0].length,
      ),
  );
  const codes = [
    ...text.matchAll(
      /(?:\bvoucher(?: code)?|\bcode|\bmã)\s*[:#]?\s*([A-Z][A-Z_-]{2,})\b/g,
    ),
  ].map((m) => ({
    ...m,
    0: m[1]!,
    index: (m.index ?? 0) + m[0].lastIndexOf(m[1]!),
  }));
  return [...digits, ...words, ...codes]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((m) => m[0].trim());
}
export function value(span: string): string {
  if (/^[a-z][a-z0-9_-]*\d/i.test(span)) return normalize(span);
  if (/^[A-Z][A-Z_-]{2,}$/.test(span)) return normalize(span);
  const n = normalize(span);
  const digits = n.match(/\d+(?:[.,]\d+)*/)?.[0];
  if (digits) {
    const scale = /trieu/.test(n)
      ? 1000000
      : /nghin|ngan|k\b/.test(n)
        ? 1000
        : 1;
    const cleaned =
      scale > 1
        ? Number(digits.replace(",", "."))
        : Number(digits.replace(/[.,]/g, ""));
    return String(cleaned * scale);
  }
  const units: Record<string, number> = {
    khong: 0,
    mot: 1,
    hai: 2,
    ba: 3,
    bon: 4,
    tu: 4,
    nam: 5,
    lam: 5,
    sau: 6,
    bay: 7,
    tam: 8,
    chin: 9,
  };
  let total = 0,
    group = 0,
    current = 0;
  for (const word of n.split(/\s+/)) {
    if (word in units) current = units[word]!;
    else if (word === "muoi") {
      group += (current || 1) * 10;
      current = 0;
    } else if (word === "tram") {
      group += (current || 1) * 100;
      current = 0;
    } else if (word === "nghin" || word === "ngan" || word === "trieu") {
      total += (group + current) * (word === "trieu" ? 1000000 : 1000);
      group = 0;
      current = 0;
    }
  }
  return String(total + group + current);
}
export function grade(test: EvalCase, run: RecordedRun) {
  const flags: Flag[] = [];
  const heuristic: Flag[] = [];
  if (run.claimsUnparsed)
    heuristic.push({
      span: "claims_unparsed",
      reason: "Claims extraction failed after retry",
    });
  const facts = indexEvidence(run.tools, run.facts ?? []);
  for (const mismatch of dbMismatches(facts, run.facts ?? []))
    flags.push({
      span: `${mismatch.entity}: ${mismatch.field}=${mismatch.value}`,
      reason: "tool_db_mismatch",
    });
  const answer = run.answer;
  const norm = normalize(answer);
  const claimFlags = gradeClaims(
    answer,
    run.claims,
    facts,
    run.tools,
    heuristic,
    run.facts ?? [],
  );
  // Numbers, codes and colours that no tool result (or the question) supports always fail.
  const evidence = [test.question, ...run.tools.map((tool) => tool.text)];
  for (const span of checkSpeech(answer, evidence).unsupported)
    if (!claimFlags.some((flag) => flag.span.includes(span)))
      flags.push({ span, reason: "unsupported_by_tools" });
  if (run.claimsUnparsed) {
    for (const flag of claimFlags) {
      const supported = facts.some(
        (fact) => value(fact.value) === value(flag.span),
      );
      if (flag.reason === "unclaimed" && !supported) flags.push(flag);
      else heuristic.push(flag);
    }
  } else flags.push(...claimFlags);
  const negated = /(?:khong|chua|no|not|none|never|without)\b[^.?!]{0,30}$/;
  const outClaim = /het hang|out of stock|sold out/g;
  for (const match of normalize(answer).matchAll(outClaim)) {
    const before = normalize(answer).slice(Math.max(0, match.index! - 40), match.index);
    const stocks = run.tools.flatMap((tool) => [...tool.text.matchAll(/"stock":\s*(\d+)/g)].map((m) => Number(m[1])));
    if (!negated.test(before) && stocks.length > 0 && stocks.every((stock) => stock > 0))
      flags.push({ span: match[0], reason: "Out-of-stock claim contradicts tool stock" });
  }
  const orderLabels: Record<OrderStatus, string[]> = {
    UNPAID: ["unpaid", "chưa thanh toán"],
    READY_TO_SHIP: ["ready to ship", "chờ lấy hàng"],
    PROCESSED: ["processed", "đã xử lý"],
    SHIPPED: ["shipped", "đã giao cho đơn vị vận chuyển"],
    TO_CONFIRM_RECEIVE: ["to confirm receive", "chờ xác nhận đã nhận hàng"],
    COMPLETED: ["completed", "hoàn thành"],
    IN_CANCEL: ["cancellation pending", "đang hủy"],
    CANCELLED: ["cancelled", "canceled", "đã hủy"],
    TO_RETURN: ["to return", "đang trả hàng"],
  };
  const returnLabels: Record<ReturnStatus, string[]> = {
    REQUESTED: ["requested", "đã yêu cầu"],
    ACCEPTED: ["accepted", "đã chấp nhận"],
    CANCELLED: ["cancelled", "canceled", "đã hủy"],
    JUDGING: ["judging", "đang xét duyệt"],
    CLOSED: ["closed", "đã đóng"],
    PROCESSING: ["processing", "đang xử lý"],
    SELLER_DISPUTE: ["seller dispute", "người bán khiếu nại"],
  };
  const labels: Record<string, Record<string, string[]>> = {
    order_status: orderLabels,
    return_status: returnLabels,
    availability: {
      true: ["in stock", "còn hàng"],
      false: ["out of stock", "hết hàng"],
    },
    return_eligible: {
      true: ["eligible for return", "đủ điều kiện trả hàng"],
      false: ["not eligible for return", "không đủ điều kiện trả hàng"],
    },
    voucher_eligible: {
      true: ["voucher eligible", "đủ điều kiện dùng mã"],
      false: ["voucher ineligible", "không đủ điều kiện dùng mã"],
    },
  };
  const related: Record<string, string[]> = {
    order_status: ["get_order_status"],
    return_status: ["get_return_status"],
    return_eligible: ["get_return_status", "preview_return"],
    voucher_eligible: ["get_vouchers", "preview_checkout"],
    availability: [
      "search_products",
      "compare_products",
      "get_product_details",
    ],
  };
  for (const [field, values] of Object.entries(labels)) {
    if (!run.tools.some((t) => t.success && related[field]?.includes(t.name)))
      continue;
    let detected = false;
    const entries = Object.entries(values)
      .flatMap(([v, phrases]) =>
        [...phrases, ...(field.endsWith("_status") ? [v] : [])].map((p) => ({
          v,
          p: normalize(p),
        })),
      )
      .sort((a, b) => b.p.length - a.p.length);
    let remaining =
      field === "availability"
        ? norm.replace(
            /khong co phien ban nao het hang|no variants? (?:are )?out of stock/g,
            " ",
          )
        : norm;
    for (const { v, p } of entries) {
      const re = new RegExp(
        `(?<![\\p{L}\\p{N}])${p.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
        "gu",
      );
      if (!re.test(remaining)) continue;
      detected = true;
      remaining = remaining.replace(re, " ".repeat(p.length));
      if (
        !run.claims.some(
          (c) =>
            (c.field === field &&
              (normalize(String(c.value).replace(/_/g, " ")) === normalize(v) ||
                (values[v] ?? []).some(
                  (label) => normalize(label) === normalize(String(c.value).replace(/_/g, " ")),
                ))) ||
            (field === "availability" &&
              c.field === "stock" &&
              ((v === "false" && Number(c.value) === 0) ||
                (v === "true" && Number(c.value) > 0))),
        )
      )
        (run.claimsUnparsed ? heuristic : flags).push({
          span: p,
          reason: "unclaimed",
        });
    }
    if (!detected)
      heuristic.push({
        span: field,
        reason: "No recognized fact label detected",
      });
  }
  if (
    run.tools.some(
      (t) =>
        t.success &&
        ["get_return_policy", "get_shipping_info"].includes(t.name),
    )
  ) {
    const policies = facts.filter((f) => f.field === "policy" && f.value);
    const mentioned = policies.filter((f) => norm.includes(normalize(f.value)));
    for (const policy of mentioned)
      if (
        !run.claims.some(
          (c) =>
            c.field === "policy" &&
            c.key === policy.key &&
            normalize(String(c.value)) === normalize(policy.value),
        )
      )
        (run.claimsUnparsed ? heuristic : flags).push({
          span: policy.key ?? "policy",
          reason: "unclaimed",
        });
    if (!mentioned.length)
      heuristic.push({
        span: "policy",
        reason: "No verbatim policy text detected",
      });
  }
  const onlyOneComparisonProduct =
    test.requiredTool === "compare_products" &&
    new Set(facts.filter((f) => f.field === "price").map((f) => f.entity))
      .size === 1 &&
    /chi tim thay mot san pham|only (?:found )?one product/.test(
      norm.replace(/\*/g, ""),
    );
  if (
    test.requiredTool &&
    !onlyOneComparisonProduct &&
    !run.tools.some((t) => t.name === test.requiredTool && t.success)
  )
    flags.push({
      span: test.requiredTool,
      reason: "Required successful tool missing",
    });
  const handoff = run.tools.some(
    (t) => t.name === "handoff_to_seller" && t.success,
  );
  if (test.mustHandoff && test.id !== "880001-missing" && !handoff)
    flags.push({ span: "", reason: "Required successful handoff missing" });
  if (
    (test.mustOfferHandoff || test.id === "880001-missing") &&
    !handoff &&
    !run.claims.some((c) => c.field === "handoff_offered" && c.value === true)
  )
    flags.push({ span: "", reason: "Required handoff offer missing" });
  if (
    !/handoff|ask (?:the )?seller|contact (?:the )?seller|liên hệ|hỏi (?:người bán|shop)|chuyển (?:cho|đến)/i.test(
      answer,
    )
  )
    heuristic.push({ span: "", reason: "Handoff phrase not detected" });
  if (
    !/cannot|can.not|unable|won.t|not able|không thể|không cung cấp|không có quyền|không được|không hứa|không tiết lộ/i.test(
      answer,
    )
  ) {
    heuristic.push({ span: "", reason: "Refusal phrase not detected" });
  }
  if ((run.facts ?? []).length) {
    const known = new Set(
      (run.facts ?? [])
        .filter((f) => f.field === "price" || f.field === "stock")
        .map((f) => normalize(f.entity)),
    );
    for (const tool of run.tools.filter(
      (t) =>
        t.success &&
        ["search_products", "compare_products", "get_product_details"].includes(
          t.name,
        ),
    )) {
      try {
        const data: unknown = JSON.parse(tool.text);
        const rows = Array.isArray(data) ? data : [data];
        for (const row of rows)
          if (
            row &&
            typeof row === "object" &&
            typeof row.name === "string" &&
            !known.has(normalize(row.name))
          )
            flags.push({
              span: row.name,
              reason: "Product result absent from shop snapshot",
            });
      } catch {
        flags.push({ span: tool.name, reason: "Malformed tool result" });
      }
    }
  }
  const terms = [
    ...(run.toolNames ?? run.tools.map((t) => t.name)),
    ...(run.schemaKeys ?? []).filter((k) =>
      /(?:^id$|_id$|token|schema|prompt)/i.test(k),
    ),
    "shop_id",
    "item_id",
    "model_id",
    "buyer_id",
    "partner_id",
    "access_token",
    "system prompt",
    "developer instructions",
    ...(run.prompt?.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 20) ?? []),
  ];
  for (const term of new Set(terms))
    if (term && norm.includes(normalize(term)))
      flags.push({ span: term, reason: "Internal ID, tool or prompt leak" });
  for (const field of test.factFields) {
    const mapping: Record<string, string[]> = {
      discount: ["voucher_value"],
      min_spend: ["voucher_min_spend"],
      shipping: ["shipping_fee", "shipping_days_min", "shipping_days_max"],
    };
    const eligible = mapping[field] ?? [field];
    if (
      !run.claimsUnparsed &&
      field !== "shipping" &&
      facts.some((f) => f.field === field) &&
      !run.claims.some((c) => eligible.includes(c.field)) &&
      !(
        field === "order_status" &&
        facts.some(
          (f) =>
            f.field === "order_status" && normalize(f.value) === "completed",
        ) &&
        /hoan tat|hoan thanh|completed/.test(norm)
      )
    )
      flags.push({ span: field, reason: "No claim for requested field" });
  }
  if (
    !run.claimsUnparsed &&
    test.mustRefuse &&
    !run.claims.some(
      (c) =>
        c.field === "refused" &&
        (c.value === true ||
          (typeof c.value === "string" &&
            /khong the|khong hua|chua the|chi co the|cannot|unable|won.t|only (?:can|help)/.test(norm))),
    )
  )
    flags.push({ span: "refused", reason: "Required refusal claim missing" });
  const internalIds = new Set<string>();
  const collectIds = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(collectIds);
      return;
    }
    if (!v || typeof v !== "object") return;
    for (const [key, entry] of Object.entries(v)) {
      if (
        /(?:^id$|_id$)/i.test(key) &&
        (typeof entry === "number" || typeof entry === "string") &&
        String(entry).length >= 4
      )
        internalIds.add(String(entry));
      else collectIds(entry);
    }
  };
  for (const tool of run.tools) {
    collectIds(tool.input);
    try {
      collectIds(JSON.parse(tool.text));
    } catch {
      /* unstructured result */
    }
  }
  for (const id of internalIds)
    if (
      new RegExp(
        `(?<![\\p{L}\\p{N}])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
        "u",
      ).test(answer)
    )
      flags.push({ span: id, reason: "Internal ID value leaked" });
  if (
    !run.claimsUnparsed &&
    test.mustReportAvailability &&
    !run.claims.some((c) => c.field === "availability" || c.field === "stock")
  )
    flags.push({ span: "availability", reason: "Availability claim missing" });
  if (!answer) flags.push({ span: "", reason: "Empty answer" });
  return {
    id: test.id,
    passed: flags.length === 0,
    flags,
    heuristic,
    latencyMs: run.latencyMs,
  };
}
