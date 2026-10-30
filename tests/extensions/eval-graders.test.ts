import { describe, expect, it } from "vitest";
import { grade } from "../../apps/api/src/assistant/eval/grader.js";
import {
  parseClaims,
  type Claim,
} from "../../apps/api/src/assistant/eval/claims.js";
import type { EvalCase } from "../../apps/api/src/assistant/eval/cases/index.js";
import { dbMismatches } from "../../apps/api/src/assistant/eval/evidence.js";

const test: EvalCase = {
  id: "recorded",
  shop: 1,
  buyer: 1,
  language: "en",
  question: "Price?",
  requiredTool: "search_products",
  factFields: [],
};
const tools = [
  {
    name: "search_products",
    success: true,
    text: JSON.stringify([
      { item_id: 1, name: "Điện thoại Đỏ", price_min: 790000, stock: 5 },
      { item_id: 2, name: "Blue phone", price_min: 200000, stock: 8 },
    ]),
  },
];
const claim = (
  entity: string,
  field: Claim["field"],
  value: string | number | boolean,
): Claim => ({
  entity,
  field,
  value,
  unit: field === "shipping_fee" ? "VND" : null,
});
const check = (
  answer: string,
  claims: Claim[],
  calls = tools,
  scenario = test,
) => grade(scenario, { answer, claims, tools: calls, latencyMs: 1 });
describe("structured run-scoped grading", () => {
  it("rejects a wrong entity price even when another product has it", () =>
    expect(
      check("Điện thoại Đỏ price is 200,000 VND.", [
        claim("Điện thoại Đỏ", "price", 200000),
      ]).passed,
    ).toBe(false));
  it("accepts spoken numbers, accent-insensitive entity and English", () => {
    expect(
      check("Giá bảy trăm chín mươi nghìn đồng.", [
        claim("Dien thoai Do", "price", 790000),
      ]).passed,
    ).toBe(true);
    expect(
      check("Price is 200,000 VND.", [claim("Blue phone", "price", 200000)])
        .passed,
    ).toBe(true);
  });
  it("accepts k and triệu shorthand", () => {
    expect(
      check("Price is 790k.", [claim("Điện thoại Đỏ", "price", 790000)]).passed,
    ).toBe(true);
    expect(
      check("Price is 0.2 triệu.", [claim("Blue phone", "price", 200000)])
        .passed,
    ).toBe(true);
  });
  it("rejects uncovered and invented numeric claims", () => {
    expect(
      check("There are 5 items.", []).flags.some(
        (f) => f.reason === "unclaimed",
      ),
    ).toBe(true);
    expect(
      check("No stock mentioned.", [
        claim("Blue phone", "stock", 8),
      ]).flags.some((f) => f.reason === "claim_not_in_answer"),
    ).toBe(true);
  });
  it("distinguishes product and channel and shipping field", () => {
    const calls = [
      ...tools,
      {
        name: "get_shipping_info",
        success: true,
        input: { item_id: 1 },
        text: JSON.stringify({
          channels: [{ name: "Express", base_fee: 10000, min_days: 2 }],
        }),
      },
      {
        name: "get_shipping_info",
        success: true,
        input: { item_id: 2 },
        text: JSON.stringify({
          channels: [{ name: "Express", base_fee: 20000, min_days: 3 }],
        }),
      },
    ];
    expect(
      check(
        "Shipping is 20,000 VND.",
        [claim("Điện thoại Đỏ Express", "shipping_fee", 20000)],
        calls,
      ).passed,
    ).toBe(false);
    expect(
      check(
        "Shipping is 10,000 VND.",
        [claim("Điện thoại Đỏ Express", "shipping_fee", 10000)],
        calls,
      ).passed,
    ).toBe(true);
    expect(
      check(
        "Delivery takes 2 days.",
        [claim("Điện thoại Đỏ Express", "shipping_fee", 2)],
        calls,
      ).passed,
    ).toBe(false);
  });
  it("requires actual handoff and flags leaked tool names", () => {
    expect(
      check(
        "I can ask the seller.",
        [claim("request", "handoff_offered", true)],
        [],
        { ...test, requiredTool: undefined, mustHandoff: true },
      ).passed,
    ).toBe(false);
    expect(
      grade(
        { ...test, requiredTool: undefined },
        {
          answer: "Use get_cart.",
          claims: [],
          tools: [],
          toolNames: ["get_cart"],
          latencyMs: 1,
        },
      ).passed,
    ).toBe(false);
  });
  it("requires structured refusal", () =>
    expect(
      check("I cannot do that.", [], [], {
        ...test,
        requiredTool: undefined,
        mustRefuse: true,
      }).passed,
    ).toBe(false));
});

describe("database corroboration and omissions", () => {
  it.each([
    "return_status",
    "return_eligible",
    "voucher_eligible",
    "policy",
  ] as const)("compares %s evidence against its database value", (field) => {
    const fact = {
      field,
      entity: "case",
      value: "true",
      ...(field === "policy" ? { key: "cod_allowed" } : {}),
    };
    const evidence = { ...fact, aliases: ["case"] };
    expect(dbMismatches([evidence], [fact])).toEqual([]);
    expect(dbMismatches([evidence], [{ ...fact, value: "false" }])).toEqual([
      evidence,
    ]);
  });
  const shippingCalls = [
    {
      name: "get_shipping_info",
      success: true,
      input: { item_id: 1 },
      text: JSON.stringify({
        channels: [
          {
            name: "Express",
            base_fee: 10000,
            per_kg_fee: 5000,
            min_days: 2,
            max_days: 4,
          },
        ],
      }),
    },
  ];
  const snapshot = [
    {
      field: "shipping_fee" as const,
      entity: "Express",
      product: "Phone",
      unit: "vnd",
      value: "10000",
    },
    {
      field: "shipping_fee" as const,
      entity: "Express",
      product: "Phone",
      unit: "vnd/kg",
      value: "5000",
    },
    {
      field: "shipping_days_min" as const,
      entity: "Express",
      product: "Phone",
      unit: "days",
      value: "2",
    },
    {
      field: "shipping_days_max" as const,
      entity: "Express",
      product: "Phone",
      unit: "days",
      value: "4",
    },
    { field: "price" as const, entity: "Phone", id: "1", value: "100" },
  ];
  const evaluate = (
    calls: typeof shippingCalls,
    facts = snapshot,
    claims: Claim[] = [claim("Phone Express", "shipping_fee", 10000)],
  ) =>
    grade(
      { ...test, requiredTool: undefined },
      {
        answer: "Shipping is 10,000 VND.",
        claims,
        tools: calls,
        facts,
        latencyMs: 0,
      },
    );
  it("corroborates separate base fee, per-kg fee and day bounds", () => {
    expect(evaluate(shippingCalls).passed).toBe(true);
    for (const index of [0, 1, 2, 3]) {
      const changed = snapshot.map((f, i) =>
        i === index ? { ...f, value: "999" } : f,
      );
      expect(
        evaluate(shippingCalls, changed).flags.some(
          (f) => f.reason === "tool_db_mismatch",
        ),
      ).toBe(true);
    }
  });
  it("rejects an omitted availability label and warns when none matches", () => {
    expect(
      check("Blue phone is in stock.", []).flags.some(
        (f) => f.reason === "unclaimed",
      ),
    ).toBe(true);
    expect(
      check("Blue phone exists.", []).heuristic.some(
        (f) => f.span === "availability",
      ),
    ).toBe(true);
  });
  it("checks order status against its exact order and database", () => {
    const calls = [
      {
        name: "get_order_status",
        success: true,
        text: JSON.stringify([{ order_sn: "ORD-X", status: "COMPLETED" }]),
      },
    ];
    const facts = [
      {
        field: "order_status" as const,
        entity: "ORD-X",
        id: "ORD-X",
        value: "COMPLETED",
      },
    ];
    const run = (status: string, db = facts) =>
      grade(
        {
          ...test,
          requiredTool: "get_order_status",
          factFields: ["order_status"],
        },
        {
          answer: `Order is ${status}.`,
          claims: [claim("ORD-X", "order_status", status)],
          tools: calls,
          facts: db,
          latencyMs: 0,
        },
      );
    expect(run("COMPLETED").passed).toBe(true);
    expect(run("SHIPPED").passed).toBe(false);
    expect(
      run("COMPLETED", [{ ...facts[0]!, value: "SHIPPED" }]).flags.some(
        (f) => f.reason === "tool_db_mismatch",
      ),
    ).toBe(true);
    expect(
      grade(
        { ...test, requiredTool: undefined },
        {
          answer: "Order completed.",
          claims: [],
          tools: calls,
          facts,
          latencyMs: 0,
        },
      ).flags.some((f) => f.reason === "unclaimed"),
    ).toBe(true);
  });
  it("checks return policy text by key", () => {
    const calls = [
      {
        name: "get_return_policy",
        success: true,
        text: JSON.stringify({
          return_policy: "Unopened items only",
          return_window_days: 7,
        }),
      },
    ];
    const facts = [
      {
        field: "policy" as const,
        entity: "return",
        key: "return_policy",
        value: "Unopened items only",
      },
      { field: "return_days" as const, entity: "return", value: "7" },
    ];
    const run = (text: string) =>
      grade(
        { ...test, requiredTool: undefined },
        {
          answer: text,
          claims: [
            { ...claim("return", "policy", text), key: "return_policy" },
          ],
          tools: calls,
          facts,
          latencyMs: 0,
        },
      );
    expect(run("Unopened items only").passed).toBe(true);
    expect(run("All items accepted").passed).toBe(false);
    // A translation or close rewording goes to review; a number no tool returned still fails.
    expect(run("Chỉ nhận hàng chưa mở").passed).toBe(true);
    expect(run("Unopened items only, within 30 days").passed).toBe(false);
  });
  it("flags internal names, IDs and prompt fragments", () => {
    for (const answer of [
      "get_cart",
      "item_id",
      "secret instruction sentence here",
    ]) {
      expect(
        grade(
          { ...test, requiredTool: undefined },
          {
            answer,
            claims: [],
            tools: [],
            toolNames: ["get_cart"],
            prompt: "secret instruction sentence here",
            latencyMs: 0,
          },
        ).passed,
      ).toBe(false);
    }
  });
});

describe("saved-run regressions", () => {
  it("resolves product and variant labels, stock-zero wording and aggregates", () => {
    const calls = [
      {
        name: "get_product_details",
        input: { item_id: 1 },
        success: true,
        text: JSON.stringify({
          name: "Apple iPhone 15 128GB Chính Hãng VN/A",
          models: [
            { model_id: 11, name: "Đen", stock: 25, price: 100 },
            { model_id: 12, name: "Xanh dương", stock: 0, price: 200 },
          ],
        }),
      },
    ];
    const result = grade(
      { ...test, requiredTool: "get_product_details" },
      {
        answer: "iPhone 15 128GB: Đen còn 25, Xanh dương hết hàng. Tổng 25.",
        claims: [
          claim("iPhone 15 128GB - Đen", "stock", 25),
          claim("iPhone 15 128GB - Xanh dương", "stock", 0),
          claim("iPhone 15 128GB", "stock", 25),
        ],
        tools: calls,
        latencyMs: 1,
      },
    );
    expect(result.flags).toEqual([]);
    const wrong = grade(
      { ...test, requiredTool: "get_product_details" },
      {
        answer: "iPhone 15 128GB: Đen còn 25.",
        claims: [claim("iPhone 15 128GB - Xanh dương", "stock", 25)],
        tools: calls,
        latencyMs: 1,
      },
    );
    expect(wrong.passed).toBe(false);
  });
  it("rejects facts that no tool returned", () => {
    for (const field of [
      "return_status",
      "return_eligible",
      "voucher_eligible",
      "policy",
    ] as const) {
      const result = check("Eligible.", [
        {
          ...claim("return", field, true),
          ...(field === "policy" ? { key: "cod_allowed" } : {}),
        },
      ]);
      expect(
        result.flags.some((f) => f.reason === "unsupported_by_tools"),
      ).toBe(true);
    }
  });
});

describe("claim parsing", () => {
  it("accepts envelopes and nested scalar values", () => {
    expect(
      parseClaims({
        claims: [
          {
            entity: "item",
            field: "price",
            value: { value: { amount: 100, currency: "VND" } },
          },
        ],
      })[0]?.value,
    ).toBe(100);
  });
  it("warns when both extraction attempts fail without making absence of claims a failure", () => {
    const result = grade(
      { ...test, requiredTool: undefined },
      {
        answer: "Hello.",
        claims: [],
        claimsUnparsed: true,
        tools: [],
        latencyMs: 0,
      },
    );
    expect(result.passed).toBe(true);
    expect(result.heuristic.some((f) => f.span === "claims_unparsed")).toBe(
      true,
    );
    const invented = grade(
      { ...test, requiredTool: undefined },
      {
        answer: "Price 999 VND.",
        claims: [],
        claimsUnparsed: true,
        tools: [],
        latencyMs: 0,
      },
    );
    expect(invented.flags.some((f) => f.reason === "unclaimed")).toBe(true);
  });
  it("coerces amounts and splits delivery bounds", () => {
    expect(
      parseClaims([
        {
          entity: "item",
          field: "price",
          value: { amount: 100, currency: "VND" },
          unit: null,
        },
      ])[0]?.value,
    ).toBe(100);
    expect(
      parseClaims([
        {
          entity: "channel",
          field: "shipping_days_min",
          value: { min: 2, max: 4 },
          unit: "days",
        },
      ]).map((c) => c.field),
    ).toEqual(["shipping_days_min", "shipping_days_max"]);
  });
});

describe("prior recording regressions", () => {
  it("uses search result envelopes as evidence", () => {
    const calls = [
      {
        name: "search_products",
        success: true,
        text: JSON.stringify({
          items: [{ name: "Phone 15", price_min: 100, stock: 1 }],
        }),
      },
    ];
    expect(
      check("Phone 15 costs 100 VND.", [claim("Phone 15", "price", 100)], calls)
        .passed,
    ).toBe(true);
    expect(
      check("Phone 15 costs 101 VND.", [claim("Phone 15", "price", 101)], calls)
        .passed,
    ).toBe(false);
  });
  it("accepts one in-stock variant and negated out-of-stock wording", () => {
    const calls = [
      {
        name: "get_product_details",
        success: true,
        text: JSON.stringify({
          name: "Cocoon",
          models: [{ name: "", stock: 300, price: 100 }],
        }),
      },
    ];
    for (const phrase of [
      "Chỉ có một phiên bản",
      "Không có phiên bản nào hết hàng",
    ]) {
      expect(
        check(phrase, [claim("Cocoon", "availability", phrase)], calls, {
          ...test,
          requiredTool: "get_product_details",
        }).passed,
      ).toBe(true);
    }
  });
  it("requires a handoff when requested even for a refusal", () => {
    const result = check(
      "I cannot answer.",
      [claim("request", "refused", true)],
      [],
      { ...test, requiredTool: undefined, mustHandoff: true, mustRefuse: true },
    );
    expect(
      result.flags.some(
        (f) => f.reason === "Required successful handoff missing",
      ),
    ).toBe(true);
  });
});
