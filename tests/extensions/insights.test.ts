import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { HuspeeClient } from "@huspee/sdk";
import { expect, it } from "vitest";
import { fakeCodexLoginHome } from "../helpers/codex-login.js";
import { SEED } from "../helpers/env.js";
import { serverEnv } from "../setup/global-setup.js";

it("aggregates scoped tool logs and stores fake summaries asynchronously", async () => {
  const home = await mkdtemp(resolve(tmpdir(), "huspee-insights-"));
  const loginHome = await fakeCodexLoginHome();
  const port = 44000 + Math.floor(Math.random() * 10000);
  const baseUrl = `http://localhost:${port}`;
  const server = spawn(process.execPath, ["dist/main.js"], {
    cwd: resolve(__dirname, "../../apps/api"),
    env: {
      ...serverEnv,
      PORT: String(port),
      PUBLIC_BASE_URL: baseUrl,
      ASSISTANT_VOICE_ENABLED: "true",
      HOME: loginHome,
      ASSISTANT_CODEX_HOME: home,
      ASSISTANT_CODEX_BIN: resolve(__dirname, "../helpers/fake-codex/codex"),
    },
    stdio: "ignore",
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${baseUrl}/healthz`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* starting */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ready).toBe(true);
    const buyer = new HuspeeClient({ baseUrl, cookieJar: true });
    const seller = new HuspeeClient({ baseUrl, cookieJar: true });
    const other = new HuspeeClient({ baseUrl, cookieJar: true });
    await buyer.auth.login("an.nguyen@example.com", "Password123!");
    await seller.auth.login(SEED.sellers.techzone.email, "Password123!");
    await other.auth.login(SEED.sellers.glowup.email, "Password123!");
    const shop = SEED.sellers.techzone.shopId;
    const start = Math.floor(Date.now() / 1000);
    const baseline = await seller.seller.assistant.insights(shop, {
      from: start,
      to: start + 60,
    });
    const session = await buyer.assistant.text.start({
      shop_id: shop,
      lang: "en",
    });
    await buyer.assistant.voice.text(session.conversation_id, "Find a product");
    const run = (name: string, args: unknown) =>
      buyer.http.request("POST", `/api/v1/assistant/_debug/tools/${name}`, {
        body: { conversation_id: session.conversation_id, args },
      });
    await run("get_product_details", { item_id: SEED.items.iphone.itemId });
    await run("search_products", { query: "no-such-product-xyz" });
    await run("get_product_details", { item_id: SEED.items.iphone.itemId, requested_attributes: { color: "nonexistent-color-xyz" } });
    await run("get_product_details", { item_id: SEED.items.iphone.itemId, requested_attributes: { "Màu sắc": "Xanh dương" } });
    await run("get_vouchers", {});
    await run("handoff_to_seller", {
      question: "Can you help?",
      reason: "unknown",
    });
    await buyer.assistant.voice.stop(session.conversation_id);
    let insight = await seller.seller.assistant.insights(shop, {
      from: start,
      to: start + 60,
    });
    for (
      let i = 0;
      i < 100 &&
      !insight.summaries.some(
        (s) => s.conversation_id === session.conversation_id,
      );
      i++
    ) {
      await new Promise((r) => setTimeout(r, 100));
      insight = await seller.seller.assistant.insights(shop, {
        from: start,
        to: start + 60,
      });
    }
    expect(insight.totals.conversations).toBe(
      baseline.totals.conversations + 1,
    );
    expect(insight.totals.text).toBe(baseline.totals.text + 1);
    expect(insight.totals.handoffs).toBe(baseline.totals.handoffs + 1);
    expect(insight.top_products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: SEED.items.iphone.itemId }),
      ]),
    );
    expect(insight.missing_requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conversation_id: session.conversation_id, tool: "get_product_details" }),
      ]),
    );
    expect(insight.missing_requests.filter((row) => row.conversation_id === session.conversation_id && row.tool === "get_product_details")).toHaveLength(2);
    expect(insight.missing_requests.some((row) => row.conversation_id === session.conversation_id && row.tool === "search_products")).toBe(false);
    expect(insight.unanswered_questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ question: "Can you help?" }),
      ]),
    );
    expect(insight.daily.length).toBeGreaterThan(0);
    expect(insight.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversation_id: session.conversation_id,
          source: "model",
          summary: expect.objectContaining({ topics: ["product"] }),
        }),
      ]),
    );
    await expect(other.seller.assistant.insights(shop)).rejects.toMatchObject({
      status: 403,
    });
    await expect(buyer.seller.assistant.insights(shop)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      other.seller.assistant.summarize(shop, session.conversation_id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      seller.seller.assistant.insights(shop, {
        from: start,
        to: start + 91 * 86400,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await seller.seller.assistant.insights(shop, { from: 1, to: 2 })).totals
        .conversations,
    ).toBe(0);
    expect(
      await seller.seller.assistant.summarize(shop, session.conversation_id),
    ).toEqual({ scheduled: true });
    const fail = await buyer.assistant.text.start({ shop_id: shop });
    await buyer.assistant.voice.text(
      fail.conversation_id,
      "FAKE_SUMMARY_ERROR",
    );
    await buyer.assistant.voice.stop(fail.conversation_id);
    for (let i = 0; i < 100; i++) {
      insight = await seller.seller.assistant.insights(shop, {
        from: start,
        to: start + 60,
      });
      if (
        insight.summaries.some(
          (s) =>
            s.conversation_id === fail.conversation_id && "error" in s.summary,
        )
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(insight.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversation_id: fail.conversation_id,
          summary: { error: "Summary unavailable" },
        }),
      ]),
    );
  } finally {
    server.kill("SIGTERM");
    await rm(home, { recursive: true, force: true });
    await rm(loginHome, { recursive: true, force: true });
  }
}, 30000);

it("counts executed actions, voice channels, voucher codes and zero stock deterministically", async () => {
  const { InsightsService } = await import(
    "../../apps/api/src/assistant/insights/insights.service.js"
  );
  const date = new Date("2026-01-01T00:00:00Z");
  const conversation = {
    messages: [{ createdAt: date, text: "Is it available?" }],
  };
  const prisma = {
    conversation: {
      findMany: async () => [
        { id: "c", channel: "VOICE", startedAt: date, summary: null },
      ],
    },
    conversationToolCall: {
      findMany: async () => [
        {
          conversationId: "c",
          conversation,
          tool: "get_product_details",
          args: { item_id: 7 },
          result: { text: JSON.stringify({ models: [{ stock: 0 }] }) },
          success: true,
          createdAt: date,
        },
        {
          conversationId: "c",
          conversation,
          tool: "get_vouchers",
          args: {},
          result: { text: JSON.stringify([{ voucher_code: "SAVE" }]) },
          success: true,
          createdAt: date,
        },
        {
          conversationId: "c",
          conversation,
          tool: "place_order",
          args: {},
          result: {
            text: JSON.stringify({
              lines: [{ label: "Mã giảm giá / Voucher", value: "SAVE" }],
            }),
          },
          success: true,
          createdAt: date,
        },
        {
          conversationId: "c",
          conversation,
          tool: "get_return_policy",
          args: {},
          result: { text: "Unavailable" },
          success: false,
          createdAt: date,
        },
      ],
    },
    handoffTicket: {
      findMany: async () => [
        { conversationId: "c", subject: "Help", createdAt: date },
      ],
    },
    pendingAction: {
      findMany: async () => [
        { type: "PLACE_ORDER", updatedAt: date },
        { type: "OPEN_RETURN", updatedAt: date },
      ],
    },
    item: { findMany: async () => [{ id: 7, name: "Product" }] },
    order: { findMany: async () => [] },
  };
  const service = new InsightsService(
    prisma as unknown as ConstructorParameters<typeof InsightsService>[0],
  );
  const result = await service.get(1, 1767225600, 1767225600);
  expect(result.totals).toEqual({
    conversations: 1,
    voice: 1,
    text: 0,
    handoffs: 1,
    orders_placed: 1,
    returns_opened: 1,
  });
  expect(result.daily).toEqual([{ date: "2026-01-01", ...result.totals }]);
  expect(result.top_products).toEqual([
    { item_id: 7, name: "Product", count: 1 },
  ]);
  expect(result.campaigns).toEqual([{ code: "SAVE", count: 2 }]);
  expect(result.missing_requests).toEqual([
    expect.objectContaining({ question: "Is it available?" }),
  ]);
  expect(result.unanswered_questions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ question: "Help" }),
      expect.objectContaining({ question: "Is it available?" }),
    ]),
  );
});
