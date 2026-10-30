/**
 * Deterministic check of assistant speech against the session's evidence (tool results and the
 * buyer's own words). Every number and voucher-like code the assistant would say must appear in
 * that evidence, or be a simple sum/product of evidence numbers (totals, quantity x price); colour
 * words must appear in it too.
 */

export type SpeechLanguage = 'vi' | 'en';
export interface SpeechCheck {
  ok: boolean;
  unsupported: string[];
}

const scale: Record<string, number> = { k: 1000, nghin: 1000, ngan: 1000, thousand: 1000, trieu: 1e6, million: 1e6, ty: 1e9, billion: 1e9 };

function fold(text: string): string {
  return text.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/** Numbers as written: "18.490.000₫", "18,490,000", "790k", "1,5 triệu", "1 triệu 580 nghìn", "50%", "128GB". */
export function extractNumbers(text: string): Array<{ raw: string; value: number }> {
  const out: Array<{ raw: string; value: number }> = [];
  const pattern = /(\d{1,3}(?:[.,]\d{3})+(?![.,]?\d)|\d+(?:[.,]\d+)?)(?:\s*(k|nghin|ngan|thousand|trieu|million|ty|billion)\b)?/g;
  const folded = fold(text);
  let last: { raw: string; value: number; unit?: string; end: number } | undefined;
  for (const match of folded.matchAll(pattern)) {
    const [raw, digits, unit] = match;
    let value: number;
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(digits!)) value = Number(digits!.replace(/[.,]/g, ''));
    else value = Number(digits!.replace(',', '.'));
    if (unit) value = Math.round(value * scale[unit]!);
    if (!Number.isFinite(value)) continue;
    // "1 triệu 580 nghìn" / "2 million 500 thousand" is one amount.
    const gap = last ? folded.slice(last.end, match.index) : '';
    if (last?.unit && unit && scale[unit]! < scale[last.unit]! && /^\s*(?:and\s*|va\s*)?$/.test(gap)) {
      const merged = out[out.length - 1]!;
      merged.value += value;
      merged.raw = `${merged.raw} ${raw!.trim()}`;
      last = { ...last, unit, end: match.index! + raw!.length };
      continue;
    }
    out.push({ raw: raw!.trim(), value });
    last = { raw: raw!, value, unit, end: match.index! + raw!.length };
  }
  return out;
}

const colorWords = [
  'đen', 'trắng', 'đỏ', 'xanh', 'vàng', 'hồng', 'tím', 'bạc', 'xám', 'nâu', 'cam', 'kem',
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'silver', 'gray', 'grey', 'brown', 'orange', 'gold', 'beige', 'navy',
];
/** English colour names and their Vietnamese variant names, so either language matches the catalog. */
const colorFamilies: Record<string, string[]> = {
  black: ['đen'], white: ['trắng'], red: ['đỏ'], blue: ['xanh', 'dương'], navy: ['xanh', 'navy'], green: ['xanh', 'lá'],
  yellow: ['vàng'], gold: ['vàng'], pink: ['hồng'], purple: ['tím'], silver: ['bạc'], gray: ['xám'], grey: ['xám'],
  brown: ['nâu'], orange: ['cam'], beige: ['kem', 'be'],
  đen: ['black'], trắng: ['white'], đỏ: ['red'], xanh: ['blue', 'green', 'navy'], vàng: ['yellow', 'gold'], hồng: ['pink'],
  tím: ['purple'], bạc: ['silver'], xám: ['gray', 'grey'], nâu: ['brown'], cam: ['orange'], kem: ['beige'],
};
function words(text: string): string[] {
  // "cam kết" (commit) and similar are not colours; "ghi" (grey) is left out as it usually means "write".
  const lower = text.toLocaleLowerCase().normalize('NFC').replace(/\bcam\s+(kết|đoan)/gu, '$1');
  return lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Phrases that state stock, availability, policy or discounts: only the text model may say these. */
const claimPattern =
  /\b(con hang|het hang|in stock|out of stock|sold out|available|khong co|khong ban|chi co|co mau|co size|mien phi|free|doi tra|tra hang|return|refund|hoan tien|giao hang|giao trong|ship|van chuyen|bao hanh|warranty|giam gia|discount|voucher|ma giam|khuyen mai|promotion|sale|don't|do not|doesn't|does not|only)\b/;

/** True when text states a fact (number, code, colour, stock, policy) rather than only acknowledging. */
export function statesFact(text: string): boolean {
  if (/\d/.test(text) || extractCodes(text).length) return true;
  if (words(text).some((word) => colorWords.includes(word))) return true;
  return claimPattern.test(fold(text));
}

/** The realtime voice talking about itself as a general-purpose AI instead of the shop's assistant. */
export function offPersona(text: string): boolean {
  const t = fold(text);
  return (
    /\b(chatgpt|gpt|openai|codex|mo hinh ngon ngu|language model)\b/.test(t) ||
    /\b(khong|chang) (co|ban|mo) (shop|cua hang|san pham)/.test(t) ||
    /\bdon'?t (have|own|run) (a )?(shop|store)\b/.test(t)
  );
}

/** An acknowledgement that promises a lookup or an action, e.g. "để mình kiểm tra nhé", "let me check". */
export function promisesAction(text: string): boolean {
  return /\b(de minh|minh se|minh dang|toi se|de toi|let me|i ll|i will|i m checking|checking|one moment|mot chut|chot|kiem tra|xem|xu ly)\b/.test(
    fold(text).replace(/['’]/g, ' '),
  );
}

/** Voucher-like codes: upper-case letters mixed with digits, e.g. TECH50K, FREESHIP30. */
export function extractCodes(text: string): string[] {
  return [...text.matchAll(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{4,20}\b/g)].map((m) => m[0]);
}

export function checkSpeech(text: string, evidence: string[]): SpeechCheck {
  const numbers = new Set<number>([0, 1]);
  const codes = new Set<string>();
  for (const source of evidence) {
    for (const { value } of extractNumbers(source)) numbers.add(value);
    for (const code of extractCodes(source)) codes.add(code);
    for (const code of source.toUpperCase().match(/\b[A-Z0-9]{4,20}\b/g) ?? []) codes.add(code);
  }
  const list = [...numbers].filter((n) => n > 0).slice(0, 400);
  const derived = new Set<number>(numbers);
  for (let i = 0; i < list.length; i++)
    for (let j = i; j < list.length; j++) {
      derived.add(list[i]! + list[j]!);
      derived.add(list[i]! * list[j]!);
      for (let k = j; k < Math.min(list.length, j + 60); k++) derived.add(list[i]! + list[j]! + list[k]!);
    }
  const unsupported: string[] = [];
  for (const { raw, value } of extractNumbers(text)) if (!derived.has(value)) unsupported.push(raw);
  for (const code of extractCodes(text)) if (!codes.has(code)) unsupported.push(code);
  const known = new Set(evidence.flatMap(words));
  for (const word of new Set(words(text))) if (colorWords.includes(word) && !known.has(word) && !(colorFamilies[word] ?? []).some((alias) => known.has(alias)))
      unsupported.push(word);
  return { ok: unsupported.length === 0, unsupported };
}

export function detectLanguage(text: string | undefined): SpeechLanguage {
  if (!text) return 'vi';
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) return 'vi';
  // No Vietnamese diacritics: English when it reads as a sentence, not a bare name or number.
  return (text.match(/[a-z]{2,}/gi) ?? []).length >= 2 ? 'en' : 'vi';
}

export const speechText = {
  fallback: {
    vi: 'Mình chưa có dữ liệu xác nhận cho thông tin này. Bạn có muốn mình hỏi người bán giúp không?',
    en: "I don't have verified data for that yet. Would you like me to ask the seller?",
  },
  correction: {
    vi: 'Xin lỗi, mình vừa nói một thông tin chưa được xác nhận, bạn đừng dựa vào nó nhé. Để mình kiểm tra lại.',
    en: "Sorry, I just said something I haven't verified, please don't rely on it. Let me check.",
  },
  checking: { vi: 'Để mình kiểm tra dữ liệu của shop nhé.', en: "Let me check the shop's data." },
  orderPlaced: {
    vi: 'Đơn hàng đã được đặt thành công. Bạn có thể xem chi tiết trong mục Đơn mua nhé.',
    en: 'Your order has been placed. You can see the details under My orders.',
  },
  returnOpened: {
    vi: 'Yêu cầu trả hàng đã được gửi tới người bán.',
    en: 'Your return request has been sent to the seller.',
  },
  cancelled: { vi: 'Đã hủy, mình chưa thực hiện thao tác này.', en: "Cancelled; I haven't done that." },
  confirm: { vi: 'Bạn có đồng ý không?', en: 'Do you confirm?' },
  confirmTap: {
    vi: 'Nếu đúng, bạn nói đồng ý rồi bấm Xác nhận trên thẻ trên màn hình nhé.',
    en: 'If this is right, say yes and then tap Confirm on the on-screen card.',
  },
} as const;
