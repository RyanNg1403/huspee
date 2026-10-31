/** Shared checkout availability rules; these validate commerce state, not natural-language intent. */
export function purchaseIssue(
  item: { status: string; hasModel: boolean },
  model: { isDefault: boolean; status: string; stock: number },
  shop: { status: string; holidayMode: boolean },
  quantity: number,
  ownsShop: boolean,
): string | undefined {
  if (item.status !== 'NORMAL' || shop.status !== 'NORMAL') return 'Product is no longer available';
  if (shop.holidayMode) return 'Shop is on holiday';
  if (item.hasModel === model.isDefault || model.status !== 'MODEL_NORMAL') return 'Variation is unavailable';
  if (ownsShop) return 'You cannot buy from your own shop';
  if (model.stock < quantity) return model.stock === 0 ? 'Out of stock' : `Only ${model.stock} left in stock`;
  return undefined;
}
