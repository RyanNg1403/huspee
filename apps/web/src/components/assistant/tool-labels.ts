type Group =
  | 'Search'
  | 'Product'
  | 'Compare'
  | 'Vouchers'
  | 'Shipping'
  | 'ReturnPolicy'
  | 'Faqs'
  | 'Cart'
  | 'Order'
  | 'CartChange'
  | 'PlaceOrder'
  | 'OpenReturn'
  | 'Confirm'
  | 'Handoff'
  | 'Other';
/** Message keys (assistant messages) describing a tool call. */
export type ToolLabelKey = `tool${Group}` | `tool${Group}Done` | 'toolError';

const GROUPS: Record<string, Group> = {
  search_products: 'Search',
  get_viewed_product: 'Product',
  get_product_details: 'Product',
  compare_products: 'Compare',
  get_vouchers: 'Vouchers',
  get_shipping_info: 'Shipping',
  get_return_policy: 'ReturnPolicy',
  get_shop_faqs: 'Faqs',
  get_cart: 'Cart',
  get_order_status: 'Order',
  add_to_cart: 'CartChange',
  update_cart_item: 'CartChange',
  place_order: 'PlaceOrder',
  open_return: 'OpenReturn',
  confirm_action: 'Confirm',
  handoff_to_seller: 'Handoff',
};
/** Tools whose result becomes a card; a placeholder holds its place while it runs. */
const CARD_TOOLS = new Set([
  'search_products',
  'get_viewed_product',
  'get_product_details',
  'compare_products',
  'get_cart',
  'get_order_status',
  'add_to_cart',
  'update_cart_item',
  'place_order',
  'open_return',
]);

/** A short line describing a tool call from its name alone; the result itself is shown by its card. */
export function toolLabelKey(name: string, status: 'running' | 'done' | 'error'): ToolLabelKey {
  if (status === 'error') return 'toolError';
  const group = GROUPS[name] ?? 'Other';
  return status === 'done' ? `tool${group}Done` : `tool${group}`;
}

export function toolMakesCard(name: string): boolean {
  return CARD_TOOLS.has(name);
}
