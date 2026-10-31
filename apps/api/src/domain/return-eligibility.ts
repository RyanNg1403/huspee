/** Commerce eligibility for submitting a request, never image-based approval. */
export const OPEN_RETURN_STATUSES = ['REQUESTED', 'PROCESSING', 'JUDGING', 'SELLER_DISPUTE'];
type Purchased = { modelId: number; quantity: number };
type Previous = { status: string; items: unknown };
export function remainingReturnQuantities(items: Purchased[], requests: Previous[]) {
  const remaining = new Map(items.map((line) => [line.modelId, line.quantity]));
  for (const request of requests.filter((entry) => !['CANCELLED', 'CLOSED'].includes(entry.status))) {
    for (const line of request.items as Array<{ model_id: number; quantity: number }>) remaining.set(line.model_id, (remaining.get(line.model_id) ?? 0) - line.quantity);
  }
  return remaining;
}
export function returnRequestBlock(input: { status: string; deliveredAt: Date | null; completedAt: Date | null; windowDays: number; items: Purchased[]; returns: Previous[] }, at = new Date()) {
  if (input.returns.some((request) => OPEN_RETURN_STATUSES.includes(request.status))) return { code: 'OPEN_RETURN', message: 'This order already has an open return request' };
  if (!['TO_CONFIRM_RECEIVE', 'COMPLETED'].includes(input.status)) return { code: 'ORDER_STATE', message: `A return cannot be requested for an order in status ${input.status}` };
  const delivered = input.deliveredAt ?? input.completedAt;
  if (!delivered || delivered.getTime() + input.windowDays * 86400000 <= at.getTime()) return { code: 'RETURN_WINDOW', message: `The ${input.windowDays}-day return window for this order has passed` };
  if (![...remainingReturnQuantities(input.items, input.returns).values()].some((quantity) => quantity > 0)) return { code: 'NOTHING_TO_RETURN', message: 'Nothing left to return for this order' };
  return null;
}
