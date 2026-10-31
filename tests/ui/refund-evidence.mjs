import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";

// Every API request is intercepted; this test never creates sessions or changes a database.
const buyerUrl = process.env.WEB_URL || "http://127.0.0.1:3111";
const sellerUrl = process.env.SELLER_URL || "http://127.0.0.1:3112";
const out = ".token/refund-implementation/evidence-ui/out";
await fs.mkdir(out, { recursive: true });
let png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1kAAAAASUVORK5CYII=",
  "base64",
);
const orderSn = "MOCK-REFUND-001",
  returnSn = "MOCK-RETURN-001",
  conversationId = "mock-refund-conversation";
const photo = (id, attached = false) => ({
  evidence_id: id,
  size: png.length,
  create_time: 1793430000,
  return_sn: attached ? returnSn : null,
});
const order = {
  order_sn: orderSn,
  checkout_id: "mock-checkout",
  shop: { shop_id: 101, shop_name: "Photo Review Shop" },
  status: "COMPLETED",
  payment_method: "COD",
  cod: true,
  currency: "VND",
  items: [
    {
      item_id: 1,
      model_id: 11,
      item_name: "Test mouse",
      model_name: "Black",
      image_url: null,
      quantity: 1,
      original_price: 100000,
      unit_price: 100000,
      line_total: 100000,
    },
  ],
  amounts: {
    items_subtotal: 100000,
    shipping_fee: 0,
    shipping_discount: 0,
    voucher_discount: 0,
    total_amount: 100000,
  },
  recipient_address: { name: "Mock Buyer", full_address: "Mock address" },
  voucher_code: null,
  message_to_seller: "",
  logistics: {},
  create_time: 1793400000,
  update_time: 1793400000,
  delivered_time: 1793400000,
  actions: {
    can_request_return: true,
    can_cancel: false,
    can_confirm_receipt: false,
  },
};
const submitted = {
  return_sn: returnSn,
  order_sn: orderSn,
  shop_id: 101,
  status: "REQUESTED",
  reason: "ITEM_DAMAGED",
  text_reason: "Seller review requested",
  solution: "RETURN_REFUND",
  refund_amount: 100000,
  currency: "VND",
  refund_paid: false,
  seller_offer: null,
  items: [{ ...order.items[0], refund_amount: 100000 }],
  reverse_tracking: [],
  create_time: 1793400000,
  due_date: 1794400000,
  evidence: [photo("submitted-photo", true)],
};
const baseAction = {
  action_id: "photo-action-1",
  type: "OPEN_RETURN",
  status: "PENDING",
  requires_tap: true,
  summary: {
    title: "Request seller review",
    lines: [
      { label: "Notes", value: "Seller review requested" },
      { label: "Photos", value: "1" },
    ],
    evidence: { order_sn: orderSn, evidence_ids: ["draft-1"] },
  },
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_BIN,
});
const errors = [],
  unknown = [],
  requests = [],
  messages = [],
  edits = [],
  confirmations = [],
  selections = [],
  created = [],
  uploadNames = [];
let drafts = [],
  uploads = 0,
  starts = 0;
const events = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
  });
  for (const url of [buyerUrl, sellerUrl])
    await context.addCookies([
      { name: "huspee_lang", value: "en", url },
      { name: "huspee_sid", value: "mock-buyer-cookie", url },
      { name: "huspee_seller_sid", value: "mock-seller-cookie", url },
    ]);
  await context.addInitScript(() => {
    const listeners = new Set();
    window.__refundEvents = [];
    window.__evidenceObjects = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.__evidenceObjects.created++;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      window.__evidenceObjects.revoked++;
      return revoke(url);
    };
    window.EventSource = class {
      constructor() {
        listeners.add(this);
        this.timer = setInterval(() => {
          for (const data of window.__refundEvents.splice(0))
            this.onmessage?.({ data: JSON.stringify(data) });
        }, 50);
      }
      close() {
        clearInterval(this.timer);
        listeners.delete(this);
      }
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  // Synthetic image bytes make the gallery and enlargement visually inspectable.
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 420;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff1e9";
    ctx.fillRect(0, 0, 640, 420);
    ctx.fillStyle = "#ee4d2d";
    ctx.fillRect(60, 60, 520, 300);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText("Photo evidence fixture", 130, 200);
    ctx.font = "22px sans-serif";
    ctx.fillText("For seller review", 230, 245);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  png = Buffer.from(fixture, "base64");
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname,
      seller = url.origin === sellerUrl;
    requests.push({
      path,
      seller,
      surface: req.headers()["x-huspee-surface"],
      method: req.method(),
      cookies: req.headers().cookie || "",
    });
    const ok = (data) => route.fulfill({ json: { data } });
    const paginated = (data, page = 1, more = false) =>
      route.fulfill({
        json: {
          data,
          page: {
            page,
            page_size: 50,
            total: more ? 51 : data.length,
            has_next: more,
          },
        },
      });
    if (path === "/api/v1/auth/me")
      return ok({
        user_id: 2,
        name: "Mock Buyer",
        display_name: "Mock Buyer",
        roles: [seller ? "seller" : "buyer"],
      });
    if (path.endsWith("/unread-count")) return ok({ count: 0 });
    if (path === "/api/v1/cart")
      return ok({ shops: [], item_count: 0, totals: {} });
    if (path === "/api/v1/marketplace/categories" || path === "/api/v1/marketplace/shops/101/categories") return ok([]);
    if (path === "/api/v1/marketplace/shops/101/policies") return ok({ return_policy: "Seller reviews evidence", return_window_days: 7 });
    if (path === "/api/v1/marketplace/shops/101")
      return ok({
        shop_id: 101,
        shop_name: "Photo Review Shop",
        description: "",
        rating_star: 5,
        rating_count: 0,
        item_count: 1,
      });
    if (path === "/api/v1/marketplace/products") return paginated([]);
    if (path.endsWith("/vouchers")) return ok([]);
    if (path === "/api/v1/assistant/shops/101/profile")
      return ok({
        enabled: true,
        connected: true,
        shop_name: "Photo Review Shop",
        greeting: { vi: "Xin chào", en: "Hello" },
      });
    if (path === "/api/v1/assistant/text/sessions") {
      starts++;
      return ok({ conversation_id: conversationId });
    }
    if (path.endsWith("/stop")) return ok({ ok: true });
    if (path.endsWith("/context")) return ok({ item_id: null });
    if (path.endsWith("/text")) {
      messages.push(req.postDataJSON().text);
      return ok({ ok: true });
    }
    if (
      path ===
      `/api/v1/assistant/conversations/${conversationId}/return-evidence`
    ) {
      if (req.method() === "PUT") {
        selections.push(req.postDataJSON());
        return ok({
          ...req.postDataJSON(),
          evidence: drafts.filter((p) =>
            req.postDataJSON().evidence_ids.includes(p.evidence_id),
          ),
        });
      }
      return ok({ order_sn: null, evidence_ids: [], evidence: [] });
    }
    if (path === "/api/v1/buyer/orders") {
      assert.equal(url.searchParams.get("shop_id"), "101");
      assert.equal(url.searchParams.get("page_size"), "50");
      return url.searchParams.get("page") === "2"
        ? paginated([order], 2)
        : paginated([{ ...order, order_sn: "MOCK-FIRST-PAGE" }], 1, true);
    }
    if (path === `/api/v1/buyer/orders/${orderSn}`) return ok(order);
    if (path.endsWith("/tracking"))
      return ok({ order_sn: orderSn, events: [] });
    if (path.endsWith("/return-evidence") && path.includes("/buyer/orders/")) {
      if (req.method() === "POST") {
        uploads++;
        const body = req.postDataBuffer().toString();
        uploadNames.push(body.match(/filename="([^"]+)"/)?.[1]);
        const p = photo(`draft-${uploads}`);
        drafts.push(p);
        return ok(p);
      }
      return ok(drafts);
    }
    if (path.match(/\/buyer\/return-evidence\/[^/]+\/content$/))
      return route.fulfill({ contentType: "image/png", body: png });
    if (
      path.match(/\/buyer\/return-evidence\/[^/]+$/) &&
      req.method() === "DELETE"
    ) {
      drafts = drafts.filter((p) => !path.endsWith(`/${p.evidence_id}`));
      return ok({ deleted: true });
    }
    if (path === "/api/v1/buyer/returns" && req.method() === "POST") {
      created.push(req.postDataJSON());
      return ok(submitted);
    }
    if (path === `/api/v1/buyer/returns/${returnSn}`) return ok(submitted);
    if (path === "/api/v1/assistant/actions/photo-action-2/confirm") {
      confirmations.push({ path, body: req.postDataJSON() });
      return ok({
        action: {
          ...baseAction,
          action_id: "photo-action-2",
          status: "EXECUTED",
          summary: {
            ...baseAction.summary,
            evidence: { order_sn: orderSn, evidence_ids: [] },
          },
        },
      });
    }
    if (
      path === `/api/v1/assistant/actions/${baseAction.action_id}` &&
      req.method() === "PATCH"
    ) {
      edits.push(req.postDataJSON());
      return ok({
        action: {
          ...baseAction,
          action_id: "photo-action-2",
          summary: {
            ...baseAction.summary,
            evidence: {
              order_sn: orderSn,
              evidence_ids: req.postDataJSON().evidence_ids,
            },
          },
        },
      });
    }
    if (path === "/api/v1/seller/shops")
      return ok([
        {
          shop_id: 101,
          shop_name: "Photo Review Shop",
          connection: { connected: true },
        },
      ]);
    if (path.endsWith("/inbox")) return paginated([]);
    if (path === "/api/v1/seller/dashboard/summary")
      return ok({ order_count: 0, total_revenue: 0, order_count_by_status: {}, open_return_count: 0, low_stock_models: [] });
    if (path === `/api/v1/seller/shops/101/returns/${returnSn}/evidence`)
      return ok([photo("submitted-photo", true)]);
    if (
      path ===
      `/api/v1/seller/shops/101/returns/${returnSn}/evidence/submitted-photo/content`
    ) {
      assert.equal(req.headers()["x-huspee-surface"], "seller");
      assert.ok(req.headers().cookie.includes("huspee_sid="));
      assert.ok(req.headers().cookie.includes("huspee_seller_sid="));
      return route.fulfill({ contentType: "image/png", body: png });
    }
    if (path === "/api/v1/seller/shops/101/shopee") {
      const { path: op } = req.postDataJSON();
      const response =
        op === "/returns/get_return_detail"
          ? {
              ...submitted,
              return_solution: 1,
              negotiation: { negotiation_status: "PENDING_RESPOND", latest_solution: "", latest_offer_amount: 0, latest_offer_creator: "", counter_limit: 1, offer_due_date: 0 },
              amount_before_discount: 100000,
              item: [],
              image: [],
              user: { username: "Mock Buyer" },
            }
          : op === "/returns/get_available_solutions"
            ? { offer_return_refund: { eligibility: true, max_refund_amount: 100000 }, offer_refund: { eligibility: true, min_refund_amount: 0, max_refund_amount: 100000 } }
            : op === "/custom/shop/get_policies"
              ? { return_policy: "Seller reviews evidence", return_window_days: 7 }
              : { tracking_info: [] };
      return route.fulfill({ json: { error: "", message: "", response } });
    }
    unknown.push(path);
    return route.fulfill({
      status: 501,
      json: { error: { code: "mock_unhandled", message: path } },
    });
  });
  await page.goto(`${buyerUrl}/orders/${orderSn}`);
  await page
    .getByRole("button", { name: "Request Return / Refund", exact: true })
    .click();
  let modal = page.getByRole("dialog", { name: "Request Return / Refund" });
  // Copy may differ in capitalization: use the picker label for all subsequent controls.
  if (!(await modal.count())) modal = page.getByRole("dialog");
  const picker = page.getByRole("region", { name: "Refund photos" });
  await picker.waitFor();
  await picker
    .getByLabel("Upload photos", { exact: true })
    .setInputFiles({
      name: "private-original.png",
      mimeType: "image/png",
      buffer: png,
    });
  await picker.getByLabel("Select photo 1", { exact: true }).waitFor();
  assert.equal(
    await picker.getByLabel("Select photo 1", { exact: true }).isChecked(),
    false,
    "Uploading must not select photos",
  );
  assert.equal(uploads, 1);
  assert.deepEqual(uploadNames, ["evidence"]);
  await picker.getByLabel("Select photo 1", { exact: true }).check();
  await picker
    .getByLabel("Upload photos", { exact: true })
    .setInputFiles({
      name: "wrong.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    });
  await picker
    .getByText("Choose JPEG, PNG or WebP files, up to 5 MB each.")
    .waitFor();
  assert.equal(uploads, 1);
  await picker.getByLabel("Select photo 1", { exact: true }).uncheck();
  await picker.getByLabel("Select photo 1", { exact: true }).check();
  await page.screenshot({ path: `${out}/buyer-picker.png`, fullPage: true });
  await picker
    .getByLabel("Upload photos", { exact: true })
    .setInputFiles({
      name: "too-big.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
  await picker
    .getByText("Choose JPEG, PNG or WebP files, up to 5 MB each.")
    .waitFor();
  assert.equal(uploads, 1, "Oversized files must not upload");
  await picker
    .getByLabel("Upload photos", { exact: true })
    .setInputFiles(
      Array.from({ length: 8 }, (_, i) => ({
        name: `private-${i}.png`,
        mimeType: "image/png",
        buffer: png,
      })),
    );
  await picker.getByLabel("Select photo 9", { exact: true }).waitFor();
  assert.equal(uploads, 9, "Each file uploads in a separate request");
  assert.ok(uploadNames.every((name) => name === "evidence"));
  for (let n = 2; n <= 8; n++)
    await picker.getByLabel(`Select photo ${n}`, { exact: true }).check();
  await picker.getByLabel("Select photo 9", { exact: true }).click();
  await picker.getByText("Select up to 8 photos.", { exact: true }).waitFor();
  assert.equal(
    await picker.getByLabel("Select photo 9", { exact: true }).isChecked(),
    false,
  );
  for (let n = 2; n <= 8; n++)
    await picker.getByLabel(`Select photo ${n}`, { exact: true }).uncheck();
  await picker
    .getByRole("button", { name: "Delete photo 9", exact: true })
    .click();
  await picker
    .getByLabel("Select photo 9", { exact: true })
    .waitFor({ state: "detached" });
  await modal.getByRole("button", { name: "Submit", exact: true }).click();
  await page.waitForTimeout(100);
  assert.deepEqual(created[0].evidence_ids, ["draft-1"]);
  await page.goto(`${buyerUrl}/returns/${returnSn}`);
  await page.getByRole("button", { name: "Enlarge photo 1" }).waitFor();
  assert.equal(await page.locator('img[src^="blob:"]').count(), 2);
  // A single assistant conversation owns order pagination and explicit attachment selection.
  await page.goto(`${buyerUrl}/shops/101`);
  const panel = page.locator(".assistant-panel");
  await panel.getByRole("textbox").fill("I need help with a refund.");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await panel
    .getByRole("button", { name: "Refund photos", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Refund photos", exact: true });
  await modal.getByRole("button", { name: "Next page", exact: true }).click();
  await modal
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption(orderSn);
  await modal.getByLabel("Select photo 1", { exact: true }).waitFor();
  assert.equal(
    await modal.getByLabel("Select photo 1", { exact: true }).isChecked(),
    false,
  );
  await modal.getByLabel("Select photo 1", { exact: true }).check();
  await modal.getByRole("button", { name: "Attach", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  assert.deepEqual(selections[0], {
    order_sn: orderSn,
    evidence_ids: ["draft-1"],
  });
  assert.equal(starts, 1);
  assert.deepEqual(messages, [
    "I need help with a refund.",
    `Selected 1 photos for the refund request for order ${orderSn}.`,
  ]);
  assert.ok(!messages.join("").includes("private-original"));
  await page.evaluate(
    (action) => window.__refundEvents.push({ type: "action", action }),
    baseAction,
  );
  await panel
    .getByRole("button", { name: "Change photos", exact: true })
    .click();
  const actionPicker = panel.getByRole("region", {
    name: "Refund photos",
    exact: true,
  });
  assert.equal(
    await panel
      .getByRole("button", { name: "Tap to send the return request", exact: true })
      .isDisabled(),
    true,
    "Unsaved photo edits must block old consent",
  );
  await actionPicker.getByLabel("Select photo 1", { exact: true }).uncheck();
  await panel
    .getByRole("button", { name: "Read back for confirmation", exact: true })
    .click();
  await panel.getByText("Cancelled", { exact: true }).waitFor();
  assert.deepEqual(
    edits,
    [{ evidence_ids: [] }],
    "Photo edits must not require quantity or model",
  );
  await panel.getByText("No photos attached.", { exact: true }).waitFor();
  assert.equal(
    await panel.getByRole("button", { name: "Tap to send the return request", exact: true }).count(),
    1,
    "Only the replacement may be confirmed",
  );
  await panel.getByRole("button", { name: "Tap to send the return request", exact: true }).click();
  await panel.getByText("Return requested", { exact: true }).waitFor();
  assert.equal(confirmations.length, 1);
  assert.ok(confirmations[0].body.idempotency_key);
  // Tap-only return lifecycle actions must not acquire variant editors.
  for (const type of ["CANCEL_RETURN", "ACCEPT_RETURN_OFFER"])
    await page.evaluate(
      (action) => window.__refundEvents.push({ type: "action", action }),
      {
        ...baseAction,
        action_id: type,
        type,
        summary: { title: type, lines: [] },
      },
    );
  await panel.getByText("ACCEPT_RETURN_OFFER", { exact: true }).waitFor();
  assert.equal(
    await panel
      .getByRole("button", { name: "Change quantity or variant", exact: true })
      .count(),
    0,
  );
  await panel.getByRole("button", { name: "End chat", exact: true }).click();
  await panel
    .getByRole("button", { name: "Refund photos", exact: true })
    .waitFor({ state: "hidden" });
  const objects = await page.evaluate(() => window.__evidenceObjects);
  assert.ok(
    objects.revoked > 0,
    "Object URLs must be revoked after UI cleanup",
  );
  const beforeSeller = requests.length;
  await page.goto(`${sellerUrl}/returns/${returnSn}`);
  await page
    .getByRole("button", { name: "Enlarge photo 1", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Photo 1", exact: true }).waitFor();
  await page.screenshot({
    path: `${out}/seller-gallery-enlarged.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await page.screenshot({ path: `${out}/seller-gallery.png`, fullPage: true });
  const sellerRequests = requests.slice(beforeSeller);
  assert.ok(
    sellerRequests.some((r) =>
      r.path.endsWith("/evidence/submitted-photo/content"),
    ),
  );
  assert.ok(
    !sellerRequests.some((r) => r.path.includes("/buyer/return-evidence")),
  );
  assert.ok(sellerRequests.every((r) => r.surface === "seller"));
  assert.deepEqual(unknown, []);
  assert.deepEqual(errors, []);
  const result = {
    status: "passed",
    uploads,
    selections,
    edits,
    confirmations,
    starts,
    created: created.map((v) => ({
      order_sn: v.order_sn,
      evidence_ids: v.evidence_ids,
    })),
    sellerPrivateFetch: true,
    objectUrlCleanup: objects,
    screenshots: [
      "buyer-picker.png",
      "seller-gallery.png",
      "seller-gallery-enlarged.png",
    ],
  };
  await fs.writeFile(
    `${out}/mock-browser.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
