export interface PendingActionView {
  action_id: string;
  type: 'ADD_TO_CART' | 'UPDATE_CART_ITEM' | 'PLACE_ORDER' | 'OPEN_RETURN';
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  requires_tap: boolean;
  expires_at: number;
  summary: { title: string; lines: Array<{ label: string; value: string }>; total?: number };
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
    }
  | { kind: 'compare'; items: Array<{ item_id: number; name: string; image: string | null; price_min: number; rows: Record<string, string> }> }
  | { kind: 'cart'; lines: Array<{ item_id: number; model_id: number; name: string; quantity: number; price: number }>; total: number }
  | { kind: 'order'; order_sn: string; status: string; tracking: Array<{ time: number; description: string }> }
  | { kind: 'handoff'; ticket_id: number }
  | { kind: 'action'; action: PendingActionView };
