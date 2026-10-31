export type OrderStatusType =
  | 'UNPAID'
  | 'READY_TO_SHIP'
  | 'PROCESSED'
  | 'SHIPPED'
  | 'TO_CONFIRM_RECEIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TO_RETURN'
  | 'IN_CANCEL';

export interface OrderItem {
  item_id: number;
  item_name: string;
  item_sku: string;
  model_id: number;
  model_name: string;
  model_sku: string;
  model_quantity_purchased: number;
  model_original_price: number;
  model_discounted_price: number;
  wholesale?: boolean;
  weight?: number;
  order_item_id?: number;
  image_info?: {
    image_url: string;
  };
}

export interface RecipientAddress {
  name: string;
  phone: string;
  full_address: string;
  city?: string;
  district?: string;
  state?: string;
  region?: string;
  zipcode?: string;
}

export interface OrderPackage {
  package_number: string;
  logistics_status: string;
  shipping_carrier: string;
}

export interface PaymentInfo {
  payment_method: string;
  transaction_id?: string;
  payment_amount: number;
}

export interface OrderDetail {
  order_sn: string;
  region?: string;
  currency: string;
  cod: boolean;
  total_amount: number;
  order_status: OrderStatusType;
  shipping_carrier: string;
  payment_method: string;
  estimated_shipping_fee: number;
  actual_shipping_fee?: number;
  message_to_seller?: string;
  create_time: number;
  update_time: number;
  ship_by_date: number;
  days_to_ship: number;
  buyer_username?: string;
  buyer_user_id?: number;
  recipient_address?: RecipientAddress;
  cancel_by?: string;
  cancel_reason?: string;
  buyer_cancel_reason?: string;
  pay_time?: number;
  item_list?: OrderItem[];
  package_list?: OrderPackage[];
  payment_info?: PaymentInfo[];
}

export interface TrackingEvent {
  update_time: number;
  description: string;
  logistics_status: string;
}

export interface TrackingInfoResponse {
  order_sn: string;
  package_number: string;
  logistics_status: string;
  tracking_info: TrackingEvent[];
}

export interface TrackingNumberResponse {
  tracking_number: string;
  hint: string;
}

export interface TimeSlot {
  date: number;
  time_text: string;
  pickup_time_id: string;
  flags: string[];
}

export interface PickupAddress {
  address_id: number;
  region: string;
  state: string;
  city: string;
  district: string;
  town: string;
  address: string;
  zipcode: string;
  address_flag: string[];
  time_slot_list: TimeSlot[];
}

export interface ShippingParameterResponse {
  info_needed: {
    pickup: string[];
    dropoff: string[];
  };
  pickup: {
    address_list: PickupAddress[];
  };
  dropoff: {
    branch_list: Array<{ branch_id: number; branch_name: string }>;
  };
}

// Returns
export type ReturnStatusType =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'CANCELLED'
  | 'JUDGING'
  | 'CLOSED'
  | 'PROCESSING'
  | 'SELLER_DISPUTE';

export interface ReverseTrackingEvent {
  update_time: number;
  tracking_description: string;
}

export interface ReverseTrackingResponse {
  return_sn: string;
  reverse_logistics_status: string;
  reverse_logistics_update_time: number;
  tracking_number: string;
  tracking_info: ReverseTrackingEvent[];
  post_return_logistics_tracking_info?: unknown[];
}

export interface ReturnItemLine {
  item_id: number;
  item_name?: string;
  item_sku?: string;
  variation_sku?: string;
  model_id: number;
  name: string;
  images: string[];
  amount: number;
  item_price: number;
  refund_amount?: number;
}

export interface ReturnDetail {
  return_sn: string;
  order_sn: string;
  reason: string;
  text_reason: string;
  refund_amount: number;
  currency: string;
  create_time: number;
  update_time: number;
  status: ReturnStatusType;
  due_date: number;
  tracking_number: string;
  dispute_reason: string[];
  dispute_text_reason: string[];
  needs_logistics: boolean;
  amount_before_discount: number;
  user: {
    username: string;
    email: string;
  };
  item: ReturnItemLine[];
  image: string[];
  negotiation_status: string;
  return_ship_due_date?: number;
  return_seller_due_date?: number;
}

export interface AvailableSolutions {
  return_sn: string;
  offer_return_refund: {
    eligibility: boolean;
    refund_amount_adjustable: boolean;
    max_refund_amount: number;
    min_refund_amount: number;
  };
  offer_refund: {
    eligibility: boolean;
    refund_amount_adjustable: boolean;
    max_refund_amount: number;
    min_refund_amount: number;
  };
}

export interface DisputeReason {
  reason_id: number;
  reason_text: string;
}

// Vouchers
export interface VoucherItem {
  voucher_id: number;
  voucher_code: string;
  voucher_name: string;
  voucher_type: number; // 1: shop, 2: product
  reward_type: number; // 1: fix amount, 2: percentage
  usage_quantity: number;
  current_usage: number;
  start_time: number;
  end_time: number;
  discount_amount?: number;
  percentage?: number;
  display_channel_list?: number[];
  min_basket_price?: number;
  max_price?: number;
  item_id_list?: number[];
  status?: 'upcoming' | 'ongoing' | 'expired';
}
