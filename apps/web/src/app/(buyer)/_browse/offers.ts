import type { PublicShop, PublicVoucher } from '@huspee/sdk';

/** A shop with the public vouchers and free-shipping threshold its API returned. */
export interface ShopOffers {
  shop: PublicShop;
  vouchers: PublicVoucher[];
  freeShippingMinSpend: number | null;
}

/** Shop-wide vouchers a buyer can use right now. */
export function usableShopVouchers(vouchers: PublicVoucher[]): PublicVoucher[] {
  return vouchers.filter((v) => v.voucher_type === 'shop' && v.status === 'ongoing' && !v.fully_redeemed);
}

/** Largest discount the voucher can give, as configured by the seller. */
function ceiling(v: PublicVoucher) {
  return v.reward_type === 'percentage' ? (v.max_discount ?? 0) : (v.discount_amount ?? 0);
}

/** First shop (in API order) with a usable voucher, and its voucher with the highest ceiling. */
export function featuredVoucher(offers: ShopOffers[]): { shop: PublicShop; voucher: PublicVoucher } | null {
  for (const offer of offers) {
    const [voucher] = usableShopVouchers(offer.vouchers).sort((a, b) => ceiling(b) - ceiling(a));
    if (voucher) return { shop: offer.shop, voucher };
  }
  return null;
}

/** First shop with free shipping, preferring one other than `avoidShopId`. */
export function featuredFreeShipping(
  offers: ShopOffers[],
  avoidShopId?: number,
): { shop: PublicShop; minSpend: number } | null {
  const eligible = offers.filter((o) => o.freeShippingMinSpend !== null);
  const pick = eligible.find((o) => o.shop.shop_id !== avoidShopId) ?? eligible[0];
  return pick ? { shop: pick.shop, minSpend: pick.freeShippingMinSpend! } : null;
}

/** Shorthand used on vouchers and shop cards: 50.000 → "50K", 2.000.000 → "2tr" ("2M" in English). */
export function compactVnd(amount: number, lang: 'vi' | 'en' = 'vi'): string {
  const short = (n: number) => String(+n.toFixed(1)).replace('.', lang === 'vi' ? ',' : '.');
  if (amount >= 1_000_000) return `${short(amount / 1_000_000)}${lang === 'en' ? 'M' : 'tr'}`;
  if (amount >= 1000) return `${short(amount / 1000)}K`;
  return String(amount);
}

/** Badge text for a voucher tile: "10%" or "50K". */
export function voucherBadge(v: PublicVoucher, lang: 'vi' | 'en' = 'vi'): string {
  return v.reward_type === 'percentage' ? `${v.percentage ?? 0}%` : compactVnd(v.discount_amount ?? 0, lang);
}
