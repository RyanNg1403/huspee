import type { OrderStatus } from './order-filters';

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
  image_info?: { image_url: string };
}

export interface OrderDetail {
  order_sn: string;
  cod: boolean;
  total_amount: number;
  order_status: OrderStatus;
  shipping_carrier: string;
  payment_method: string;
  estimated_shipping_fee: number;
  actual_shipping_fee?: number;
  message_to_seller?: string;
  create_time: number;
  ship_by_date: number;
  buyer_username?: string;
  recipient_address?: { name: string; phone: string; full_address: string };
  cancel_by?: string;
  cancel_reason?: string;
  item_list?: OrderItem[];
}

export interface TrackingEvent {
  update_time: number;
  description: string;
  logistics_status: string;
}

export interface LogisticsChannel {
  logistics_channel_id: number;
  logistics_channel_name: string;
  enabled: boolean;
}

export interface PickupAddress {
  address_id: number;
  state: string;
  city: string;
  district: string;
  town: string;
  address: string;
  time_slot_list: Array<{ date: number; time_text: string; pickup_time_id: string; flags: string[] }>;
}
