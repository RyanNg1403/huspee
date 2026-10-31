const DAY = 86_400;

/**
 * The return deadline (delivery + window, as the API computes it) and whether the request was
 * sent before it. Null when the delivery time is unknown.
 */
export function returnDeadline(
  deliveredAt: number | null,
  windowDays: number,
  requestedAt: number,
): { due: number; withinWindow: boolean } | null {
  if (!deliveredAt) return null;
  const due = deliveredAt + windowDays * DAY;
  return { due, withinWindow: requestedAt < due };
}
