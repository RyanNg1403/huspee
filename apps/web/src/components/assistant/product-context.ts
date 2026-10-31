/** Public product identity shown as "viewing"; only item_id is sent to the assistant API. */
export type ViewedProduct = {
  item_id: number;
  name: string;
  image?: string;
  /** The variant picked on the page, with its price as the page shows it. */
  variant?: string;
  price?: number;
};

/**
 * The order on screen. The assistant API takes no order context, so it is only shown and used in
 * suggested questions that name the order.
 */
export type ViewedOrder = { order_sn: string; status: string; image?: string };
