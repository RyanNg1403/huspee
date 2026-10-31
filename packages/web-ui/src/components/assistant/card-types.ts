export type ProductInfo = {
  item_id: number;
  name: string;
  images: string[];
  models: Array<{
    model_id: number;
    name: string;
    price: number;
    stock: number;
  }>;
  description?: string;
  attributes?: Array<{ name: string; value: string }>;
  brand?: string | null;
  category?: string;
  rating?: number | null;
  rating_count?: number;
  sold?: number;
  days_to_ship?: number;
  reviews?: Array<{
    rating: number;
    comment: string;
    buyer_name: string;
    model_name: string | null;
  }>;
};
export type Action = {
  action_id: string;
  type?: 'ADD_TO_CART' | 'UPDATE_CART_ITEM' | 'PLACE_ORDER' | 'OPEN_RETURN';
  status: string;
  requires_tap: boolean;
  /** Unix seconds; the server rejects confirmation after this. */
  expires_at?: number;
  summary: {
    title: string;
    lines: Array<{ label: string; value: string }>;
    total?: number;
  };
  result?: { order_sn?: string; return_sn?: string; message?: string };
};
export type Card =
  | {
      kind: 'products';
      resolution?: {
        resolved_from: string;
        resolved_to: string;
        confidence: number;
      };
      items: Array<{
        item_id: number;
        name: string;
        image: string | null;
        rating: number | null;
        price_min: number;
        price_max: number;
        stock: number;
      }>;
    }
  | ({
      kind: 'product';
      item_id: number;
      name: string;
      image: string | null;
      models: Array<{
        model_id: number;
        name: string;
        price: number;
        stock: number;
      }>;
    } & Omit<Partial<ProductInfo>, 'item_id' | 'name' | 'models'>)
  | {
      kind: 'compare';
      items: Array<{
        item_id: number;
        name: string;
        image: string | null;
        price_min: number;
        rows: Record<string, string>;
      }>;
    }
  | {
      kind: 'cart';
      lines: Array<{
        item_id: number;
        model_id: number;
        name: string;
        quantity: number;
        price: number;
      }>;
      total: number;
    }
  | {
      kind: 'order';
      order_sn: string;
      status: string;
      items?: Array<{
        item_id: number;
        model_id: number;
        name: string;
        variant?: string;
        quantity: number;
        price: number;
      }>;
      tracking: Array<{ time: number; description: string }>;
    }
  | { kind: 'handoff'; ticket_id: number }
  | { kind: 'action'; action: Action };
