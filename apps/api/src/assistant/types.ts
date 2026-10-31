export interface PendingActionView {
  action_id: string;
  type: 'ADD_TO_CART' | 'UPDATE_CART_ITEM' | 'PLACE_ORDER' | 'OPEN_RETURN' | 'CANCEL_RETURN' | 'ACCEPT_RETURN_OFFER';
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  requires_tap: boolean;
  expires_at: number;
  summary: { title: string; lines: Array<{ label: string; value: string }>; total?: number; evidence?: { order_sn: string; evidence_ids: string[] } };
  result?: { order_sn?: string; return_sn?: string; message?: string };
}
export type AssistantCard =
  | {
      kind: 'products';
      items: Array<{
        item_id: number;
        name: string;
        image: string | null;
        price_min: number;
        price_max: number;
        stock: number;
        rating: number | null;
      }>;
    }
  | {
      kind: 'product';
      item_id: number;
      name: string;
      image: string | null;
      models: Array<{ model_id: number; name: string; price: number; stock: number }>;
      images?: string[];
      description?: string;
      attributes?: Array<{ name: string; value: string | null }>;
      brand?: string | null;
      category?: string;
      rating?: number | null;
      rating_count?: number;
      sold?: number;
      days_to_ship?: number;
      reviews?: Array<{ rating: number; comment: string; buyer_name: string; model_name: string | null }>;
    }
  | {
      kind: 'compare';
      items: Array<{
        item_id: number;
        name: string;
        image: string | null;
        price_min: number;
        price_max?: number;
        rows: Record<string, string>;
        specs?: Array<{ name: string; value: string | null }>;
        models?: Array<{ model_id: number; name: string; price: number; stock: number }>;
      }>;
    }
  | { kind: 'cart'; lines: Array<{ item_id: number; model_id: number; name: string; quantity: number; price: number }>; total: number }
  | {
      kind: 'order';
      order_sn: string;
      status: string;
      items?: Array<{ item_id: number; model_id: number; name: string; variant?: string; quantity: number; price: number }>;
      shipping_carrier?: string | null;
      tracking_number?: string | null;
      delivered_time?: number | null;
      return?: { window_days: number; due_time: number | null; eligible: boolean; request: { return_sn: string; status: string } | null };
      tracking: Array<{ time: number; description: string }>;
    }
  | { kind: 'handoff'; ticket_id: number }
  | { kind: 'action'; action: PendingActionView };
