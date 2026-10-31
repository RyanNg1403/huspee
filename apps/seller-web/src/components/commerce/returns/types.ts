import type { ReturnStatus } from './return-filters';

export interface ReturnLine {
  item_id: number;
  model_id: number;
  name: string;
  images: string[];
  amount: number;
  item_price: number;
  item_sku?: string;
  variation_sku?: string;
  refund_amount?: number;
}

export interface ReturnSummary {
  return_sn: string;
  order_sn: string;
  reason: string;
  text_reason: string;
  refund_amount: number;
  create_time: number;
  update_time: number;
  status: ReturnStatus;
  due_date: number;
  negotiation_status?: string;
  return_solution: number;
  user: { username: string };
  item: ReturnLine[];
  image: string[];
}

export interface ReturnDetail extends Omit<ReturnSummary, 'negotiation_status'> {
  negotiation: {
    negotiation_status: string;
    latest_solution: '' | 'refund' | 'return_refund';
    latest_offer_amount: number;
    offer_due_date: number;
  };
}

export interface ReturnSolutions {
  offer_return_refund: { eligibility: boolean; max_refund_amount: number };
  offer_refund: { eligibility: boolean; max_refund_amount: number; min_refund_amount: number };
}

/** Solution codes stored on a return. */
export const SOLUTION_REFUND_ONLY = 1;
