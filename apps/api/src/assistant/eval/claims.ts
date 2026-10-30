import { checkSpeech, detectLanguage } from "../voice/speech-check";
import { z } from "zod";
import { normalize, type Evidence, type ToolRecord } from "./evidence";
import { extractSpans, value } from "./grader";

export const claimsSchema = z.array(
  z
    .object({
      entity: z.string().min(1),
      field: z.enum([
        "price",
        "stock",
        "voucher_code",
        "voucher_value",
        "voucher_min_spend",
        "shipping_fee",
        "shipping_days_min",
        "shipping_days_max",
        "return_days",
        "faq",
        "availability",
        "order_status",
        "return_status",
        "return_eligible",
        "voucher_eligible",
        "policy",
        "handoff_offered",
        "refused",
      ]),
      value: z.union([z.string(), z.number(), z.boolean()]),
      unit: z.string().nullable(),
      key: z.string().optional(),
    })
    .strict(),
);
export type Claim = z.infer<typeof claimsSchema>[number];

const variantAliases: Record<string, string[]> = {
  den: ["black"],
  hong: ["pink"],
  "xanh duong": ["blue"],
};
function variantMention(entity: string, variant: string): boolean {
  const q = normalize(entity)
    .replace(/(\d)\s+(?=(?:ml|gb|kg)\b)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const v = normalize(variant)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return [v, ...(variantAliases[v] ?? [])].some((name) =>
    ` ${q} `.includes(` ${name} `),
  );
}
function entityMatches(entity: string, f: Evidence): boolean {
  const q = normalize(entity)
    .replace(/(\d)\s+(?=(?:ml|gb|kg)\b)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const clean = (x: string) =>
    normalize(x)
      .replace(/(\d)\s+(?=(?:ml|gb|kg)\b)/g, "$1")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  if (f.id === entity || f.aliases.some((a) => clean(a) === q)) return true;
  if (f.variant) {
    const v = clean(f.variant);
    const names = [v, ...(variantAliases[v] ?? [])];
    if (!names.some((name) => ` ${q} `.includes(` ${name} `))) return false;
  }
  if (f.channel) {
    const channel = clean(f.channel);
    if (!` ${q} `.includes(` ${channel} `)) {
      if (channel === "hoa toc ninja van" && q === "ninja van express")
        return true;
      return false;
    }
    const remainder = q.replace(channel, "").trim();
    return !remainder || (!!f.product && clean(f.product) === remainder);
  }
  if (
    ["voucher_code", "discount", "min_spend"].includes(f.field) &&
    ` ${q} `.includes(` ${clean(f.entity)} `)
  )
    return true;
  const tokens = clean(f.entity).split(" ").filter(Boolean);
  const qt = q.split(" ");
  const shared = tokens.filter((token) => qt.includes(token));
  return (
    (shared.length >= 2 && shared.some((token) => /[a-z]/.test(token))) ||
    (shared.some((token) => /\d/.test(token)) &&
      shared.some((token) => /^[a-z]{4,}$/.test(token)))
  );
}

export function parseClaims(raw: unknown): Claim[] {
  if (!Array.isArray(raw) && raw && typeof raw === "object") {
    const object = raw as Record<string, unknown>;
    raw = Array.isArray(object.claims) ? object.claims : [object];
  }
  if (!Array.isArray(raw)) return claimsSchema.parse(raw);
  const flattened = raw.flatMap((claim: unknown) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim))
      return [claim];
    const c = claim as Record<string, unknown>;
    if (Array.isArray(c.value))
      return c.value.map((v) => ({ ...c, value: v, unit: c.unit ?? null }));
    if (!c.value || typeof c.value !== "object")
      return [{ ...c, unit: c.unit ?? null }];
    let v = c.value as Record<string, unknown>;
    while (v.value && typeof v.value === "object" && !Array.isArray(v.value))
      v = v.value as Record<string, unknown>;
    if (["string", "number", "boolean"].includes(typeof v.value))
      return [{ ...c, value: v.value, unit: c.unit ?? null }];
    if (typeof v.amount === "number" || typeof v.amount === "string")
      return [{ ...c, value: v.amount, unit: c.unit ?? v.currency ?? null }];
    if (
      v.min !== undefined &&
      v.max !== undefined &&
      (c.field === "shipping_days_min" ||
        c.field === "shipping_days_max" ||
        c.field === "shipping_days")
    )
      return [
        { ...c, field: "shipping_days_min", value: v.min },
        { ...c, field: "shipping_days_max", value: v.max },
      ];
    return [c];
  });
  return claimsSchema.parse(flattened);
}

export function gradeClaims(
  answer: string,
  claims: Claim[],
  facts: Evidence[],
  tools: ToolRecord[],
  heuristic: Array<{ span: string; reason: string }> = [],
  snapshot: import("./facts").Fact[] = [],
) {
  const flags: Array<{ span: string; reason: string }> = [];
  const spans = extractSpans(answer);
  let scan = normalize(answer);
  for (const f of [...facts, ...snapshot].filter((f) =>
    ["price", "stock"].includes(f.field),
  )) {
    const tokens = normalize(f.entity).match(/[a-z]+|\d+[a-z]*/g) ?? [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (!/\d/.test(token)) continue;
      const prev = tokens[i - 1];
      if (/[a-z]/.test(token))
        scan = scan.replace(
          new RegExp(
            `\\b${token.replace(/(\d+)([a-z]+)/, "$1\\s*$2")}\\b`,
            "g",
          ),
          (m) => " ".repeat(m.length),
        );
      else if (prev && /[a-z]/.test(prev))
        scan = scan.replace(new RegExp(`\\b${prev}\\s+${token}\\b`, "g"), (m) =>
          " ".repeat(m.length),
        );
    }
  }
  const coverageSpans = extractSpans(
    [...answer].map((c, i) => (scan[i] === " " ? " " : c)).join(""),
  );
  const numericFields = new Set([
    "price",
    "stock",
    "voucher_code",
    "voucher_value",
    "voucher_min_spend",
    "shipping_fee",
    "shipping_days_min",
    "shipping_days_max",
    "return_days",
  ]);
  for (const span of coverageSpans) {
    if (
      /%/.test(span) &&
      /khong (?:the |hua )|cannot|won.t|unable/i.test(normalize(answer))
    ) {
      heuristic.push({
        span,
        reason: "Potentially refused amount requires review",
      });
      continue;
    }
    if (/^(?:mot|hai|ba|bon|tu|nam|sau|bay|tam|chin)$/i.test(normalize(span))) {
      heuristic.push({ span, reason: "Possible item count" });
      continue;
    }
    if (normalize(span) === "khong") continue;
    const escaped = span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      new RegExp(
        `\\b${escaped}\\s*(?:ma giam gia|vouchers?|san pham|products?)\\b`,
        "i",
      ).test(scan)
    ) {
      heuristic.push({ span, reason: "Possible item count" });
      continue;
    }
    if (
      !claims.some(
        (c) =>
          (numericFields.has(c.field) &&
            value(String(c.value)) === value(span)) ||
          (["faq", "policy"].includes(c.field) &&
            extractSpans(String(c.value)).some(
              (s) => value(s) === value(span),
            )),
      )
    )
      flags.push({ span, reason: "unclaimed" });
  }
  const mapping: Record<string, string> = {
    voucher_value: "discount",
    voucher_min_spend: "min_spend",
  };
  for (const c of claims) {
    const val = String(c.value);
    if (numericFields.has(c.field)) {
      const freeShipping =
        c.field === "shipping_fee" &&
        Number(c.value) === 0 &&
        /mien phi van chuyen|free shipping/.test(normalize(answer)) &&
        facts.some(
          (f) =>
            f.field === "policy" &&
            /mien phi van chuyen|free shipping/.test(normalize(f.value)) &&
            extractSpans(f.value).some(
              (s) =>
                Number(value(s)) > 0 &&
                facts.some(
                  (p) =>
                    p.field === "price" &&
                    entityMatches(c.entity, p) &&
                    Number(p.value) >= Number(value(s)),
                ),
            ),
        );
      if (
        !freeShipping &&
        !spans.some((span) => value(span) === value(val)) &&
        !(
          c.field === "stock" &&
          Number(c.value) === 0 &&
          /het hang|out of stock|unavailable/.test(normalize(answer))
        )
      )
        flags.push({ span: val, reason: "claim_not_in_answer" });
      const candidates = facts.filter(
        (f) =>
          f.field === (mapping[c.field] ?? c.field) &&
          (entityMatches(c.entity, f) ||
            (c.field === "return_days" &&
              ["return", "returns"].includes(normalize(f.entity)))),
      );
      const specific = candidates.filter(
        (f) => f.variant && variantMention(c.entity, f.variant),
      );
      const generic = candidates.filter((f) => !f.variant);
      const scoped = specific.length
        ? specific
        : generic.length
          ? generic
          : candidates;
      const matching = scoped.filter(
        (f) =>
          value(f.value) === value(val) &&
          (c.field !== "shipping_fee" ||
            (c.unit != null && normalize(c.unit) === f.unit)),
      );
      // A channel alone is ambiguous when shipping was queried for multiple products.
      const identities = new Set(
        candidates.map(
          (f) =>
            `${f.entity}|${f.variant ?? ""}|${f.product ?? ""}|${f.channel ?? ""}`,
        ),
      );
      if (
        (!freeShipping && !matching.length) ||
        (!freeShipping &&
          c.field.startsWith("shipping_") &&
          identities.size !== 1)
      )
        flags.push({
          span: val,
          reason: candidates.length
            ? "Claim does not match entity and field evidence"
            : "unsupported_by_tools",
        });
    } else if (c.field === "faq") {
      const missing =
        /chua co thong tin|khong co thong tin|not (?:specified|available)|no .{0,30}(?:available|returned)|were not specified/i.test(
          normalize(val),
        );
      if (missing) {
        heuristic.push({
          span: val,
          reason: "Missing-data statement requires review",
        });
        continue;
      }
      const source = facts.filter(
        (f) => f.field === "faq" || f.field === "policy",
      );
      const nums = extractSpans(val).filter(
        (span) => /\d/.test(span) && !checkSpeech(span, tools.map((t) => t.text)).ok,
      );
      if (
        nums.length &&
        source.length &&
        nums.some(
          (n) =>
            !source.some((f) =>
              extractSpans(f.value).some((v) => value(v) === value(n)),
            ),
        )
      )
        flags.push({ span: val, reason: "FAQ claim does not match evidence" });
      else if (!source.some((f) => normalize(f.value).includes(normalize(val))))
        heuristic.push({
          span: val,
          reason: "Qualitative claim requires review",
        });
    } else if (c.field === "availability") {
      const stock = facts.filter(
        (f) => f.field === "stock" && entityMatches(c.entity, f),
      );
      const matchingVariants = stock.filter(
        (f) => f.variant && variantMention(c.entity, f.variant),
      );
      const genericStock = stock.filter((f) => !f.variant);
      const scopedStock = matchingVariants.length
        ? matchingVariants
        : genericStock.length
          ? genericStock
          : stock;
      const phrase = normalize(val);
      if (
        /shop co san pham|product (?:is )?available/.test(phrase) &&
        scopedStock.some((f) => Number(f.value) > 0)
      )
        continue;
      if (typeof c.value === "number" && /voucher/.test(normalize(c.entity))) {
        const vouchers = tools
          .filter((t) => t.success && t.name === "get_vouchers")
          .flatMap((t) => {
            try {
              const parsed: unknown = JSON.parse(t.text);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          });
        if (vouchers.length === c.value) continue;
      }
      if (
        /chi tim thay mot san pham|only (?:found )?one product/.test(phrase)
      ) {
        const products = new Set(
          facts.filter((f) => f.field === "price").map((f) => f.entity),
        );
        if (products.size === 1) continue;
      }
      if (
        /chi co mot phien ban|only one variant|khong co phien ban nao het hang|no variants? (?:are )?out of stock/.test(
          phrase,
        )
      ) {
        const variants = new Set(
          stock.filter((f) => f.variant !== undefined).map((f) => f.variant),
        );
        if (!stock.length) {
          heuristic.push({ span: val, reason: "Qualitative claim requires review" });
          continue;
        }
        const valid = /mot phien ban|one variant/.test(phrase)
          ? variants.size === 1
          : stock.length > 0 && stock.every((f) => Number(f.value) > 0);
        if (!valid)
          flags.push({
            span: val,
            reason: "Availability claim does not match evidence",
          });
        continue;
      }
      const available =
        c.value === true ||
        normalize(val) === "available" ||
        normalize(val) === "in stock" ||
        normalize(val) === "con hang";
      const unavailable =
        c.value === false ||
        normalize(val) === "out of stock" ||
        normalize(val) === "unavailable" ||
        normalize(val) === "het hang";
      // Free wording, or no stock data for the entity, cannot be checked deterministically.
      if ((!available && !unavailable) || !scopedStock.length) {
        heuristic.push({ span: val, reason: "Qualitative claim requires review" });
        continue;
      }
      if (
        !scopedStock.some((f) =>
          available ? Number(f.value) > 0 : Number(f.value) === 0,
        )
      )
        flags.push({
          span: val,
          reason: "Availability claim does not match evidence",
        });
    } else if (
      [
        "order_status",
        "return_status",
        "return_eligible",
        "voucher_eligible",
        "policy",
      ].includes(c.field)
    ) {
      const entity = normalize(c.entity);
      const orders = facts.filter((f) => f.field === "order_status");
      const latestAlias =
        c.field === "order_status" &&
        orders.length === 1 &&
        /latest|recent|gan nhat/.test(entity);
      const found = facts.some(
        (f) =>
          f.field === c.field &&
          (normalize(f.entity) === entity ||
            f.aliases.some((a) => normalize(a) === entity) ||
            latestAlias) &&
          (c.field !== "policy" || (!!c.key && f.key === c.key)) &&
          normalize(f.value) === normalize(val),
      );
      const delivered =
        c.field === "order_status" &&
        /delivered successfully|giao hang thanh cong/.test(normalize(val)) &&
        tools.some(
          (t) =>
            t.name === "get_order_status" &&
            t.success &&
            normalize(t.text).includes("giao hang thanh cong"),
        );
      if (delivered) continue;
      // Policy and eligibility wording is paraphrased: fail only on numbers no tool returned.
      const sources = facts.filter(
        (f) => f.field === c.field && (c.field !== "policy" || !c.key || f.key === c.key),
      );
      // Policy and eligibility wording is paraphrased or translated. It fails only on a yes/no
      // without evidence, a number no tool returned, or text that contradicts the stored policy.
      if (
        !found &&
        ["policy", "return_eligible", "voucher_eligible"].includes(c.field) &&
        typeof c.value !== "boolean" &&
        checkSpeech(val, tools.map((t) => t.text)).ok &&
        (missingData.test(normalize(val)) ||
          typeof c.value === "number" ||
          !sources.length ||
          sources.some((f) => paraphrases(val, f.value)))
      )
        heuristic.push({ span: val, reason: "Qualitative claim requires review" });
      else if (!found)
        flags.push({
          span: val,
          reason: facts.some((f) => f.field === c.field)
            ? "Claim does not match entity and field evidence"
            : "unsupported_by_tools",
        });
    } else if (
      c.field === "handoff_offered" &&
      c.value === true &&
      !tools.some((t) => t.name === "handoff_to_seller" && t.success)
    ) {
      // Offering a handoff does not imply a ticket was created; scenario requirements check calls separately.
    }
  }
  return flags;
}

const missingData =
  /chua (?:co|du|ro)|khong co thong tin|not (?:specified|provided|available|listed)|none listed|unknown|subject to/;

/** A translation, or a rewording that keeps at least half of the words, cannot be graded as text. */
function paraphrases(claim: string, fact: string): boolean {
  if (detectLanguage(claim) !== detectLanguage(fact)) return true;
  const tokens = (text: string) => new Set(normalize(text).split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  const said = tokens(claim);
  const source = tokens(fact);
  const shared = [...said].filter((w) => source.has(w)).length;
  return said.size > 0 && shared / said.size >= 0.5;
}
