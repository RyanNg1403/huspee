/** Typed shapes for Huspee project-defined (/api/v1) routes. Not Shopee APIs. */

export interface PageInfo {
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
}

export interface Paginated<T> {
  data: T[];
  page: PageInfo;
}

export type Role = 'buyer' | 'seller';

export interface UserProfile {
  user_id: number;
  email: string;
  name: string;
  phone: string | null;
  roles: Role[];
  create_time: number;
  shops?: Array<{ shop_id: number; shop_name: string; role: 'owner' | 'staff' }>;
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  account_type?: Role;
}

export interface CategoryNode {
  category_id: number;
  name: string;
  display_name: string;
  image_url: string | null;
  children: CategoryNode[];
}

export interface PublicShop {
  shop_id: number;
  shop_name: string;
  description: string;
  logo_url: string | null;
  city: string | null;
  is_official: boolean;
  on_holiday: boolean;
  item_count: number;
  rating_star: number;
  rating_count: number;
  join_time: number;
  collections?: Array<{ shop_category_id: number; name: string; item_count: number }>;
}

export interface ProductSearchQuery {
  q?: string;
  category_id?: number;
  shop_id?: number;
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  has_promotion?: boolean;
  min_rating?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'top_sales' | 'rating';
  page?: number;
  page_size?: number;
}

export interface ProductSummary {
  item_id: number;
  name: string;
  image_url: string | null;
  shop: { shop_id: number; shop_name: string; city: string | null };
  category_id: number;
  brand: string | null;
  price_min: number;
  price_max: number;
  original_price_min: number;
  original_price_max: number;
  has_promotion: boolean;
  discount_percent: number;
  in_stock: boolean;
  sold: number;
  rating_star: number;
  rating_count: number;
  currency: 'VND';
}

export interface ProductModel {
  model_id: number;
  tier_index: number[];
  name: string;
  price: number;
  original_price: number;
  promotion_end_time: number | null;
  stock: number;
  available: boolean;
}

export interface ProductDetail {
  item_id: number;
  name: string;
  description: string;
  condition: string;
  shop: { shop_id: number; shop_name: string; on_holiday: boolean };
  category: { category_id: number; display_name: string };
  brand: { brand_id: number; name: string } | null;
  images: string[];
  attributes: Array<{ name: string; value: string }>;
  price_min: number;
  price_max: number;
  original_price_min: number;
  original_price_max: number;
  has_promotion: boolean;
  currency: 'VND';
  stock: number;
  sold: number;
  likes: number;
  rating_star: number;
  rating_count: number;
  days_to_ship: number;
  weight_kg: number;
  tier_variations: Array<{ name: string; options: Array<{ option: string; image_url: string | null }> }>;
  models: ProductModel[];
}

export interface ProductReview {
  comment_id: number;
  rating: number;
  comment: string;
  buyer_name: string;
  model_name: string | null;
  image_urls: string[];
  seller_reply: string | null;
  verified_purchase: boolean;
  create_time: number;
}

export interface PublicVoucher {
  voucher_code: string;
  voucher_name: string;
  voucher_type: 'shop' | 'product';
  reward_type: 'fixed_amount' | 'percentage';
  discount_amount: number | null;
  percentage: number | null;
  max_discount: number | null;
  min_spend: number;
  item_id_list: number[];
  start_time: number;
  end_time: number;
  status: 'upcoming' | 'ongoing' | 'expired';
  fully_redeemed: boolean;
}

export interface ShopPolicies {
  shop_id: number;
  version: number;
  shipping_policy: string;
  return_policy: string;
  warranty_policy: string;
  return_window_days: number;
  free_shipping_min_spend: number | null;
  update_time: number;
  shipping_channels?: Array<{ logistics_channel_id: number; name: string; base_fee: number; per_kg_fee: number; estimated_days: string; cod_enabled: boolean }>;
}

export interface AddressInput {
  name: string;
  phone: string;
  state: string;
  city: string;
  district: string;
  town?: string;
  address: string;
  zipcode?: string;
  is_default?: boolean;
}

export interface Address extends Required<Omit<AddressInput, 'is_default'>> {
  address_id: number;
  region: string;
  is_default: boolean;
}

export interface CartLine {
  cart_item_id: number;
  item_id: number;
  model_id: number;
  item_name: string;
  model_name: string;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  original_price: number;
  line_total: number;
  stock: number;
  available: boolean;
  issue: string | null;
}

export interface Cart {
  shops: Array<{ shop_id: number; shop_name: string; items: CartLine[]; subtotal: number }>;
  item_count: number;
  subtotal: number;
  currency: 'VND';
}

export type PaymentMethod = 'COD' | 'SHOPEEPAY_SIM' | 'CARD_SIM' | 'BANK_TRANSFER_SIM';

export interface CheckoutInput {
  address_id?: number;
  payment_method?: PaymentMethod;
  cart_item_ids?: number[];
  items?: Array<{ model_id: number; quantity: number }>;
  shops?: Array<{ shop_id: number; logistics_channel_id?: number; voucher_code?: string; message_to_seller?: string }>;
}

export interface ShippingOption {
  logistics_channel_id: number;
  logistics_channel_name: string;
  shipping_fee: number;
  estimated_delivery_days_min: number;
  estimated_delivery_days_max: number;
  cod_enabled: boolean;
}

export interface CheckoutQuote {
  groups: Array<{
    shop_id: number;
    shop_name: string;
    lines: Array<{
      cart_item_id: number | null;
      item_id: number;
      model_id: number;
      item_name: string;
      model_name: string;
      quantity: number;
      stock: number;
      original_price: number;
      unit_price: number;
      line_total: number;
      available: boolean;
      issue?: string;
    }>;
    items_subtotal: number;
    shipping_options: ShippingOption[];
    logistics_channel_id: number | null;
    shipping_fee: number;
    shipping_discount: number;
    voucher: { voucher_id: number; code: string; eligible: boolean; discount: number; reason?: string } | null;
    voucher_discount: number;
    total: number;
    issues: string[];
  }>;
  payment_method: PaymentMethod;
  totals: { items_subtotal: number; shipping_fee: number; shipping_discount: number; voucher_discount: number; total: number; currency: 'VND' };
  issues: string[];
  can_checkout: boolean;
}

export type OrderStatus =
  | 'UNPAID'
  | 'READY_TO_SHIP'
  | 'PROCESSED'
  | 'SHIPPED'
  | 'TO_CONFIRM_RECEIVE'
  | 'COMPLETED'
  | 'IN_CANCEL'
  | 'CANCELLED'
  | 'TO_RETURN';

export interface BuyerOrder {
  order_sn: string;
  checkout_id: string;
  shop: { shop_id: number; shop_name: string };
  status: OrderStatus;
  payment_method: string;
  cod: boolean;
  currency: 'VND';
  items: Array<{
    item_id: number;
    model_id: number;
    item_name: string;
    model_name: string;
    image_url: string | null;
    quantity: number;
    original_price: number;
    unit_price: number;
    line_total: number;
  }>;
  amounts: { items_subtotal: number; shipping_fee: number; shipping_discount: number; voucher_discount: number; total_amount: number };
  voucher_code: string | null;
  recipient_address: Record<string, string>;
  message_to_seller: string;
  logistics: { logistics_channel_id: number; shipping_carrier: string; tracking_number: string | null; logistics_status: string | null };
  cancel_by: string | null;
  cancel_reason: string | null;
  create_time: number;
  update_time: number;
  pay_time: number | null;
  ship_by_date: number;
  delivered_time: number | null;
  actions: { can_cancel: boolean; can_confirm_receipt: boolean; can_request_return: boolean; return_request_due_date: number | null };
}

export interface CheckoutResult {
  checkout_id: string;
  order_sn_list: string[];
  replayed: boolean;
  orders: BuyerOrder[];
}

export interface OrderTracking {
  order_sn: string;
  order_status: OrderStatus;
  shipping_carrier: string;
  tracking_number: string | null;
  logistics_status: string;
  events: Array<{ time: number; logistics_status: string; description: string }>;
}

export type ReturnReason =
  | 'NOT_RECEIPT'
  | 'WRONG_ITEM'
  | 'ITEM_DAMAGED'
  | 'DIFFERENT_DESCRIPTION'
  | 'MUTUAL_AGREE'
  | 'ITEM_MISSING'
  | 'EXPECTATION_FAILED'
  | 'ITEM_FAKE'
  | 'PHYSICAL_DMG'
  | 'FUNCTIONAL_DMG'
  | 'CHANGE_MIND'
  | 'OTHER';

export interface CreateReturnInput {
  order_sn: string;
  reason: ReturnReason;
  text_reason?: string;
  solution?: 'RETURN_REFUND' | 'REFUND_ONLY';
  items?: Array<{ item_id: number; model_id: number; quantity: number }>;
  image_urls?: string[];
}

export interface BuyerReturn {
  return_sn: string;
  order_sn: string;
  shop_id: number;
  status: 'REQUESTED' | 'ACCEPTED' | 'CANCELLED' | 'JUDGING' | 'CLOSED' | 'PROCESSING' | 'SELLER_DISPUTE';
  reason: ReturnReason;
  text_reason: string;
  solution: 'RETURN_REFUND' | 'REFUND_ONLY';
  refund_amount: number;
  currency: 'VND';
  refund_paid: boolean;
  refund_paid_time: number | null;
  items: Array<{ item_id: number; model_id: number; item_name: string; model_name: string; quantity: number; refund_amount: number; image_url: string | null }>;
  seller_offer: { solution: 'return_refund' | 'refund'; amount: number; due_date: number } | null;
  reverse_tracking_number: string | null;
  reverse_tracking: Array<{ update_time: number; tracking_status: string; tracking_description: string }>;
  create_time: number;
  update_time: number;
  due_date: number;
}

export interface ShopConnection {
  shop_id: number;
  partner_id: number;
  partner_name: string;
  connected: boolean;
  grant_status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'NONE';
  authorized_time: number | null;
  grant_expire_time: number | null;
  access_token_expire_time: number | null;
  refresh_token_expire_time: number | null;
}

export interface SellerShop {
  shop_id: number;
  shop_name: string;
  description: string;
  logo_url: string | null;
  region: string;
  status: string;
  city: string | null;
  role: 'owner' | 'staff';
  item_count: number;
  addresses: Array<AddressInput & { address_id: number; is_pickup: boolean; is_return: boolean }>;
  create_time: number;
  connection: ShopConnection;
}

export interface CreateShopInput {
  shop_name: string;
  description?: string;
  logo_url?: string;
  city?: string;
  pickup_address: Omit<AddressInput, 'is_default'>;
}

export interface SalesSummary {
  shop_id: number;
  time_from: number;
  time_to: number;
  currency: 'VND';
  order_count: number;
  order_count_by_status: Partial<Record<OrderStatus, number>>;
  paid_order_count: number;
  gross_merchandise_value: number;
  voucher_discount_total: number;
  total_revenue: number;
  refunded_amount: number;
  items_sold: number;
  active_item_count: number;
  to_ship_count: number;
  open_return_count: number;
  low_stock_models: Array<{ item_id: number; item_name: string; model_id: number; stock: number }>;
  connection?: ShopConnection;
}

/** Shopee-style envelope returned by the seller gateway (and by /api/v2 routes). */
export interface ShopeeEnvelope<T = unknown> {
  request_id: string;
  error: string;
  message: string;
  response?: T;
  [key: string]: unknown;
}
