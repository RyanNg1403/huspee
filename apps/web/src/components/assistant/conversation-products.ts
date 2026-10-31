import type { Card } from '@huspee/web-ui/components/assistant/card-types';

export type ConversationProduct = {
  item_id: number;
  name: string;
  image?: string;
  sources: Array<'text' | 'voice'>;
};

/** Only catalog identities returned by a tool become product context; never guess from speech. */
export function collectConversationProducts(
  previous: ConversationProduct[],
  card: Card,
  source?: 'text' | 'voice',
): ConversationProduct[] {
  const products = card.kind === 'product' ? [card]
    : card.kind === 'products' || card.kind === 'compare' ? card.items
    : card.kind === 'cart' ? card.lines
    : card.kind === 'order' ? card.items ?? [] : [];
  if (!products.length) return previous;
  const next = new Map(previous.map((product) => [product.item_id, product]));
  for (const product of products) {
    const old = next.get(product.item_id);
    const image = 'image' in product ? product.image ?? old?.image : old?.image;
    next.set(product.item_id, {
      item_id: product.item_id,
      name: product.name,
      image,
      sources: [...new Set([...(old?.sources ?? []), ...(source ? [source] : [])])],
    });
  }
  return [...next.values()];
}
