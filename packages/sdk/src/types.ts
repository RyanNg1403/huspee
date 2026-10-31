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

export interface BuyerOrderListQuery {
  shop_id?: number;
  status?: OrderStatus | OrderStatus[] | string | string[];
  page?: number;
  page_size?: number;
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
  evidence_ids?: string[];
}

/** Opaque private evidence metadata. Original filenames and content URLs are never returned. */
export interface ReturnEvidence { evidence_id: string; size: number; create_time: number; return_sn: string | null }
export interface ReturnEvidenceSelection { order_sn: string | null; evidence_ids: string[]; evidence: ReturnEvidence[] }

export interface BuyerReturn {
  evidence: ReturnEvidence[];
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

// Project-defined Phase 2 assistant contracts.
export interface AssistantProfile { shop_id: number; shop_name: string; enabled: boolean; connected: boolean; voice: string; greeting: { vi: string; en: string } }
/** A buyer's own past assistant session with one shop. */
export interface BuyerAssistantConversation { conversation_id: string; channel: 'VOICE' | 'TEXT'; status: 'ACTIVE' | 'ENDED'; started_at: number; ended_at: number | null; preview: string | null; message_count: number }
export interface BuyerAssistantConversationDetail extends BuyerAssistantConversation { shop_id: number; messages: Array<{ role: 'user' | 'assistant'; text: string; created_at: number }>; cards: Array<{ card: Record<string, unknown>; created_at: number }> }
/** The platform's Codex login that the voice runtime uses (shared by every shop). */
export interface AssistantConnection { installed: boolean; connected: boolean; source: 'app' | 'host' | null; plan: string | null; login: { verification_url: string; user_code: string; expires_at: number } | null; error: 'login_failed' | 'login_expired' | null }
export interface AssistantSetupConnection extends AssistantConnection { busy: boolean }
export interface AssistantConfig { shop_id: number; enabled: boolean; tone: 'FRIENDLY' | 'PROFESSIONAL' | 'ENTHUSIASTIC'; voice: string; greeting_vi: string; greeting_en: string; updated_at: number }
export type AssistantConfigInput = Partial<Pick<AssistantConfig, 'enabled' | 'tone' | 'voice' | 'greeting_vi' | 'greeting_en'>>;
export interface AssistantFaq { id: number; shop_id: number; question: string; answer: string; lang: 'vi' | 'en' | 'any'; enabled: boolean; created_at: number; updated_at: number }
export type AssistantFaqInput = Pick<AssistantFaq, 'question' | 'answer' | 'lang' | 'enabled'>;
export interface PendingActionView { action_id: string; type: 'ADD_TO_CART' | 'UPDATE_CART_ITEM' | 'PLACE_ORDER' | 'OPEN_RETURN' | 'CANCEL_RETURN' | 'ACCEPT_RETURN_OFFER'; status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED'; requires_tap: boolean; expires_at: number; summary: { title: string; lines: Array<{label: string; value: string}>; total?: number; evidence?: { order_sn: string; evidence_ids: string[] } }; result?: { order_sn?: string; return_sn?: string; message?: string } }
export type AssistantCard =
  | { kind: 'products'; items: Array<{ item_id: number; name: string; image: string | null; price_min: number; price_max: number; stock: number; rating: number | null }> }
  | { kind: 'product'; item_id: number; name: string; image: string | null; models: Array<{ model_id: number; name: string; price: number; stock: number }> }
  | { kind: 'compare'; items: Array<{ item_id: number; name: string; image: string | null; price_min: number; rows: Record<string, string> }> }
  | { kind: 'cart'; lines: Array<{ item_id: number; model_id: number; name: string; quantity: number; price: number }>; total: number }
  | { kind: 'order'; order_sn: string; status: string; tracking: Array<{ time: number; description: string }> }
  | { kind: 'handoff'; ticket_id: number }
  | { kind: 'action'; action: PendingActionView };
export type AssistantEvent =
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; final: boolean }
  | { type: 'tool'; name: string; status: 'started' | 'done' | 'error' }
  | { type: 'card'; card: AssistantCard }
  | { type: 'action'; action: PendingActionView }
  | { type: 'closed'; reason: string | null }
  | { type: 'error'; message: string };
export interface HandoffMessage { id: number; ticket_id: number; author: 'BUYER' | 'SELLER' | 'ASSISTANT'; author_user_id: number | null; body: string; created_at: number }
export interface HandoffTicket { ticket_id: number; shop_id: number; shop_name: string; logo_url: string | null; subject: string; status: 'OPEN' | 'ANSWERED' | 'CLOSED'; buyer_unread: number; seller_unread: number; updated_at: number; last_message: HandoffMessage | null; conversation_id?: string | null }
export interface HandoffTicketDetail extends HandoffTicket { messages: HandoffMessage[] }
export interface AssistantConversation { conversation_id: string; shop_id: number; buyer_id: number; channel: 'VOICE' | 'TEXT'; status: 'ACTIVE' | 'ENDED'; started_at: number; ended_at: number | null; language: string | null; summary: unknown }
export interface AssistantConversationDetail extends AssistantConversation { messages: Array<{ id: number; role: 'USER' | 'ASSISTANT'; text: string; created_at: number }>; tool_calls: Array<{ id: number; tool: string; args: unknown; result: unknown; success: boolean; error: string | null; latency_ms: number; created_at: number }> }

export interface AssistantInsightsTotals { conversations: number; voice: number; text: number; handoffs: number; orders_placed: number; returns_opened: number }
export type AssistantSummary = { topics: string[]; hesitations: string[]; listing_suggestions: Array<{ item_id?: number; text: string }>; language: string; model: string; created_at: number } | { error: string };
export interface AssistantInsights { source: 'logs'; from: number; to: number; totals: AssistantInsightsTotals; top_products: Array<{ item_id: number; name: string; count: number }>; missing_requests: Array<{ conversation_id: string; question: string; tool: string; created_at: number }>; unanswered_questions: Array<{ conversation_id: string; question: string; tool: string; created_at: number }>; daily: Array<AssistantInsightsTotals & { date: string }>; campaigns: Array<{ code: string; count: number }>; summaries: Array<{ conversation_id: string; source: 'model'; summary: AssistantSummary }> }
