/** Conservative, deterministic matching of speech transcripts to verified shop data. */
export function words(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
}

const units: Record<string, number> = { zero: 0, khong: 0, one: 1, mot: 1, two: 2, hai: 2, three: 3, ba: 3, four: 4, bon: 4, tu: 4, five: 5, nam: 5, lam: 5, six: 6, sau: 6, seven: 7, bay: 7, eight: 8, tam: 8, nine: 9, chin: 9 };
const teens: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const tens: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const numberWords = new Set([...Object.keys(units), ...Object.keys(teens), ...Object.keys(tens), 'muoi', 'tram', 'hundred', 'linh', 'le', 'and']);
export function spokenNumber(value: string): number | undefined {
  const input = words(value);
  if (/^\d+$/.test(input)) return Number(input);
  let tokens = input.split(' ');
  if (!input || tokens.some((token) => !numberWords.has(token))) return undefined;
  let total = 0;
  if (tokens.length >= 2 && units[tokens[0]!] && ['tram', 'hundred'].includes(tokens[1]!)) {
    total = units[tokens[0]!]! * 100;
    tokens = tokens.slice(2);
    if (['linh', 'le', 'and'].includes(tokens[0]!)) tokens = tokens.slice(1);
  }
  if (tokens.length === 0) return total;
  if (tokens.length === 1) {
    const value = units[tokens[0]!] ?? teens[tokens[0]!] ?? tens[tokens[0]!] ?? (tokens[0] === 'muoi' ? 10 : undefined);
    return value === undefined ? undefined : total + value;
  }
  if (tokens.length === 2) {
    const first = tokens[0]!, last = tokens[1]!;
    if (first === 'muoi' && units[last] !== undefined && units[last]! > 0) return total + 10 + units[last]!;
    if (tens[first] && units[last] !== undefined && units[last]! > 0) return total + tens[first]! + units[last]!;
    if (units[first] && last === 'muoi') return total + units[first]! * 10;
  }
  if (tokens.length === 3 && units[tokens[0]!] && tokens[1] === 'muoi' && units[tokens[2]!] !== undefined && units[tokens[2]!]! > 0)
    return total + units[tokens[0]!]! * 10 + units[tokens[2]!]!;
  return undefined;
}

function voucherForm(value: string): string {
  const tokens = words(value).split(' ');
  const output: string[] = [];
  for (let i = 0; i < tokens.length;) {
    if (numberWords.has(tokens[i]!)) {
      let end = i + 1;
      while (end < tokens.length && (numberWords.has(tokens[end]!))) end++;
      output.push(String(spokenNumber(tokens.slice(i, end).join(' ')) ?? tokens.slice(i, end).join('')));
      i = end;
    } else output.push(tokens[i++]!);
  }
  return output.join('');
}
export function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j]! + 1, previous[j + 1]! + 1, previous[j]! + (a[i] === b[j] ? 0 : 1)));
    previous = next;
  }
  return previous[b.length]!;
}
export type Resolution = { resolved_from: string; resolved_to: string; confidence: number };
export function resolveVoucher(heard: string, codes: string[]): { resolution?: Resolution; candidates: string[] } {
  const normalized = voucherForm(heard);
  if (!normalized) return { candidates: [] };
  const matches = codes.map((code) => ({ code, d: distance(normalized, voucherForm(code)) })).filter(({ d }) => d <= 2).sort((a, b) => a.d - b.d);
  const exact = matches.filter((match) => match.d === 0);
  const best = exact.length ? exact : matches;
  if (best.length !== 1) return { candidates: best.map(({ code }) => code) };
  return { candidates: [], resolution: { resolved_from: heard, resolved_to: best[0]!.code, confidence: 1 - best[0]!.d / Math.max(normalized.length, voucherForm(best[0]!.code).length) } };
}
function tokenMatches(token: string, target: string[], misheard = true): boolean {
  return target.some(
    (word) =>
      word === token ||
      // Plural and longer forms: "charger" finds "chargers", "dresses" finds "dress".
      (Math.min(token.length, word.length) >= 4 && (word.startsWith(token) || token.startsWith(word))) ||
      (misheard && token.length >= 4 && distance(token, word) <= Math.min(2, Math.floor(token.length / 4))),
  );
}
const split = (value: string | null | undefined): string[] => (value ? words(value).split(' ').filter(Boolean) : []);
/**
 * Everyday names buyers use for the platform's categories that the category names leave out, keyed by
 * the English name of the category (or of one kind in a category such as "Mice & Keyboards").
 */
const CATEGORY_ALIASES: Record<string, string[]> = {
  Laptops: ['máy tính xách tay', 'máy tính', 'notebook', 'computer'],
  'Mobile Phones': ['điện thoại di động', 'smartphone'],
  Headphones: ['earbuds', 'earphones', 'headset'],
  Chargers: ['cục sạc', 'adapter'],
  Cables: ['dây sạc', 'dây cáp'],
  Mice: ['mouse'],
  Wearables: ['smartwatch'],
  Storage: ['ổ cứng'],
  'T-Shirts': ['áo phông', 'tee'],
  Jeans: ['quần bò', 'denim'],
  Outerwear: ['jacket'],
  Dresses: ['váy'],
  Kitchenware: ['đồ dùng nhà bếp', 'cookware'],
  Lighting: ['lamp'],
};
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
/** The word a category phrase is named by: first in Vietnamese ("Phụ kiện máy tính"), last in English ("Computer Accessories"). */
function head(phrase: string): string {
  const parts = split(phrase);
  return (VIETNAMESE.test(phrase) ? parts[0] : parts.at(-1)) ?? '';
}
/** The phrases whose head word the query names, as words: "máy tính" does not find "Phụ kiện máy tính". */
function namedPhrases(phrases: string[], tokens: string[]): string[] {
  return phrases.filter((phrase) => tokens.some((token) => tokenMatches(token, [head(phrase)], false))).flatMap(split);
}
/** A product as search sees it: its name and brand, and its category in English and Vietnamese. */
export interface SearchableProduct {
  name: string;
  brand?: string | null;
  category?: string;
  categoryVi?: string;
}
/**
 * Which kind of a two-kind category ("Sạc & Cáp") the product is: the one its name mentions first ("Cáp
 * USB-C … sạc 100W" is a cable), or the only one whose head word it contains; -1 when unclear.
 */
function kindOf(own: string[], kinds: string[]): number {
  if (kinds.length < 2) return 0;
  const text = ` ${own.join(' ')} `;
  const mentioned = kinds
    .map((kind, index) => ({ index, at: text.indexOf(` ${split(kind).join(' ')} `) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at);
  if (mentioned.length) return mentioned[0]!.index;
  const heads = kinds.map((kind, index) => ({ index, word: head(kind) })).filter(({ word }) => word && own.includes(word));
  return heads.length === 1 ? heads[0]!.index : -1;
}
/**
 * Name and brand words tolerate misheard spelling; category words must match as written, since short
 * Vietnamese syllables are one letter apart ("chảo" and "chăm"), and only from a category phrase whose
 * head word the query names. A category such as "Chargers & Cables" / "Sạc & Cáp" covers two kinds of
 * product, so only the product's own kind finds it; the other kind only suggests it, as does one brand
 * or English category word alone.
 */
function productWords({ name, brand, category, categoryVi }: SearchableProduct, tokens: string[]) {
  const own = split(`${name} ${brand ?? ''}`);
  const en = (category ?? '').split('&').filter((part) => part.trim());
  const vi = (categoryVi ?? '').split('&').filter((part) => part.trim());
  const kind = kindOf(own, vi.length > 1 ? vi : en);
  const enOf = (index: number) => (en.length > 1 ? en[index] : en[0]) ?? '';
  const aliases = (part: string) => CATEGORY_ALIASES[part.trim()] ?? [];
  const phrases = kind < 0 ? [] : [enOf(kind), vi.length > 1 ? (vi[kind] ?? '') : (vi[0] ?? ''), ...aliases(enOf(kind))];
  return {
    own,
    category: namedPhrases(phrases, tokens),
    related: namedPhrases([...en, ...vi, ...en.flatMap(aliases)], tokens),
    named: split(`${brand ?? ''} ${category ?? ''}`),
  };
}
export function matchProducts<T extends SearchableProduct>(heard: string, products: T[]): T[] {
  const query = words(heard);
  if (!query) return [];
  const tokens = query.split(' ');
  return products.filter((product) => {
    const { own, category } = productWords(product, tokens);
    return tokens.every((token) => tokenMatches(token, own) || tokenMatches(token, category, false));
  });
}
/**
 * Fallback when speech recognition garbles part of a name ("Xiaomi ZP4N5") or the buyer uses a word the
 * catalog lacks ("Logitech mouse"): the products sharing the most query words, if they share at least
 * two and at least half, or one brand or English category word. The buyer is asked to confirm.
 */
export function closestProducts<T extends SearchableProduct>(heard: string, products: T[]): T[] {
  const tokens = words(heard).split(' ').filter((token) => token.length > 1);
  const scored = products.map((product) => {
    const { own, related, named } = productWords(product, tokens);
    const shared = tokens.filter((token) => tokenMatches(token, own) || tokenMatches(token, related, false));
    return { product, score: shared.length, named: shared.some((token) => token.length >= 4 && tokenMatches(token, named, false)) };
  });
  const best = Math.max(0, ...scored.map(({ score }) => score));
  const top = scored.filter(({ score }) => score === best);
  if (best === 0 || (best === 1 ? !top.every(({ named }) => named) : best * 2 < tokens.length)) return [];
  return top.map(({ product }) => product);
}
/**
 * Seller FAQs for a question, the ones sharing the most words first ("bảo hành sạc Anker" finds
 * "Chính sách bảo hành là gì?"). Shops keep few FAQs, so when none match all are returned for the
 * model to choose from: an empty list would make it tell the buyer the shop has no answer.
 */
export function rankFaqs<T extends { question: string; answer: string }>(heard: string, faqs: T[]): T[] {
  const tokens = [...new Set(words(heard).split(' ').filter((token) => token.length > 1))];
  const scored = faqs.map((faq) => {
    const target = words(`${faq.question} ${faq.answer}`).split(' ');
    return { faq, score: tokens.filter((token) => tokenMatches(token, target)).length };
  });
  if (!scored.some(({ score }) => score > 0)) return faqs;
  return scored.filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).map(({ faq }) => faq);
}
