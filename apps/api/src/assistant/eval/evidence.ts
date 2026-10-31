import type { Fact, FactField } from "./facts";

export interface ToolRecord {
  name: string;
  text: string;
  success: boolean;
  input?: unknown;
}
export interface Evidence extends Fact {
  aliases: string[];
  product?: string;
  channel?: string;
  id?: string;
  unit?: string;
}
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

/** Only values in successful, structured tool results enter the evidence index. */
export function indexEvidence(tools: ToolRecord[], facts: Fact[]): Evidence[] {
  const result: Evidence[] = [];
  const ids = new Map<string, string>();
  for (const fact of facts) if (fact.id) ids.set(fact.id, fact.entity);
  const parsed = tools
    .filter((t) => t.success)
    .map((t) => {
      try {
        return { ...t, data: JSON.parse(t.text) as unknown };
      } catch {
        return { ...t, data: null };
      }
    });
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const rows = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.map(obj) : [];
  for (const t of parsed) {
    for (const row of [...rows(t.data), obj(t.data)]) {
      if (row.item_id != null && typeof row.name === "string")
        ids.set(String(row.item_id), row.name);
      if ((t.name === "get_product_details" || t.name === "get_viewed_product") && typeof row.name === "string") {
        const id = row.item_id ?? obj(t.input).item_id;
        if (id != null) ids.set(String(id), row.name);
      }
    }
  }
  const add = (
    field: FactField,
    entity: string,
    value: unknown,
    extra: Partial<Evidence> = {},
  ) => {
    if (value === null || value === undefined || value === "") return;
    result.push({
      field,
      entity,
      value: String(value),
      aliases: [entity, ...(extra.variant ? [extra.variant] : [])].filter(
        Boolean,
      ),
      ...extra,
    });
  };
  for (const t of parsed) {
    const data = obj(t.data);
    if (t.name === "search_products" || t.name === "compare_products")
      for (const row of Array.isArray(t.data)
        ? rows(t.data)
        : rows(data.items)) {
        const entity = String(row.name ?? "");
        add("price", entity, row.price_min, { id: String(row.item_id ?? "") });
        add("price", entity, row.price_max, { id: String(row.item_id ?? "") });
        add("stock", entity, row.stock ?? obj(row.rows).stock, {
          id: String(row.item_id ?? ""),
        });
      }
    if ((t.name === "get_product_details" || t.name === "get_viewed_product")) {
      const entity = String(data.name ?? "");
      const models = rows(data.models);
      if (models.length && models.every((m) => typeof m.stock === "number"))
        add(
          "stock",
          entity,
          models.reduce((sum, m) => sum + Number(m.stock), 0),
          { id: String(data.item_id ?? obj(t.input).item_id ?? "") },
        );
      for (const model of models) {
        const variant = String(model.name ?? "");
        add("price", entity, model.price, {
          variant,
          id: String(model.model_id ?? obj(t.input).item_id ?? ""),
        });
        add("stock", entity, model.stock, {
          variant,
          id: String(model.model_id ?? obj(t.input).item_id ?? ""),
        });
      }
    }
    if (t.name === "get_vouchers")
      for (const row of rows(t.data)) {
        const entity = String(row.code ?? "");
        const aliases = [entity, String(row.name ?? "")].filter(Boolean);
        add("voucher_code", entity, row.code, { aliases });
        add("discount", entity, row.discount_amount, { aliases });
        add("discount", entity, row.percentage, { aliases });
        add("discount", entity, row.max_discount, {
          aliases,
          key: "max_discount",
        });
        add("min_spend", entity, row.min_spend, { aliases });
      }
    if (t.name === "get_return_policy") {
      add("policy", "return", data.return_policy, { key: "return_policy" });
      add("return_days", "return", data.return_window_days, {
        aliases: ["return", "returns", "trả hàng", "đổi trả"],
      });
    }
    if (t.name === "get_order_status")
      for (const row of rows(t.data))
        add("order_status", String(row.order_sn ?? "order"), row.status, {
          id: String(row.order_sn ?? ""),
          aliases: [String(row.order_sn ?? ""), "order"],
        });
    if (t.name === "get_shop_faqs")
      for (const row of rows(t.data))
        add("faq", String(row.question ?? ""), row.answer);
    if (t.name === "get_shipping_info") {
      add("policy", "shipping", data.shipping_policy, {
        key: "shipping_policy",
      });
      const product = ids.get(String(obj(t.input).item_id ?? ""));
      for (const row of rows(data.channels)) {
        const channel = String(row.name ?? "");
        for (const [key, field] of [
          ["base_fee", "shipping_fee"],
          ["per_kg_fee", "shipping_fee"],
          ["min_days", "shipping_days_min"],
          ["max_days", "shipping_days_max"],
        ] as const)
          add(field, channel, row[key], {
            unit:
              key === "base_fee"
                ? "vnd"
                : key === "per_kg_fee"
                  ? "vnd/kg"
                  : "days",
            product,
            channel,
            aliases: [channel, ...(product ? [product] : [])],
          });
      }
    }
  }
  return result;
}

/** Compare only matching identities and units, including absent shipping channels. */
export function dbMismatches(evidence: Evidence[], facts: Fact[]): Evidence[] {
  if (!facts.length) return [];
  return evidence.filter((e) => {
    const comparable = facts.filter(
      (f) =>
        f.field === e.field &&
        (normalize(f.entity) === normalize(e.entity) ||
          (e.field === "order_status" && f.entity === "order" && !f.id)) &&
        (!e.variant || normalize(f.variant ?? "") === normalize(e.variant)) &&
        (!e.product || normalize(f.product ?? "") === normalize(e.product)) &&
        (!e.unit || f.unit === e.unit) &&
        (!e.key || f.key === e.key),
    );
    if (!comparable.length)
      return (
        (!e.key || facts.some((f) => f.field === e.field && f.key === e.key)) &&
        facts.some((f) => f.field === e.field) &&
        ((!!e.product && e.field.startsWith("shipping_")) ||
          ["order_status", "return_status", "policy"].includes(e.field))
      );
    return !comparable.some((f) => normalize(f.value) === normalize(e.value));
  });
}
