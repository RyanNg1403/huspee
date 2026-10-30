/**
 * @huspee/sdk — browser-safe entry point.
 *
 * Typed client for Huspee's PROJECT-DEFINED routes (/api/v1): auth, marketplace, cart,
 * checkout, buyer orders/returns and seller onboarding. These are not Shopee Open API
 * endpoints. Authentication is the platform's cookie session; this module never imports
 * Node built-ins, the upstream Shopee SDK, Partner keys or shop access tokens.
 *
 * Server-side Shopee-compatible signing lives in `@huspee/sdk/server`.
 */
import { HttpTransport, HuspeeClientOptions } from './http.js';
import type {
  Address,
  AssistantProfile, AssistantConfig, AssistantConfigInput, AssistantFaq, AssistantFaqInput, AssistantConversation, AssistantConversationDetail, PendingActionView, HandoffTicket, HandoffTicketDetail, HandoffMessage,
  AddressInput,
  BuyerOrder,
  BuyerOrderListQuery,
  BuyerReturn,
  Cart,
  CategoryNode,
  CheckoutInput,
  CheckoutQuote,
  CheckoutResult,
  CreateReturnInput,
  CreateShopInput,
  OrderStatus,
  OrderTracking,
  Paginated,
  PaymentMethod,
  ProductDetail,
  ProductReview,
  ProductSearchQuery,
  ProductSummary,
  PublicShop,
  PublicVoucher,
  SalesSummary,
  SellerShop,
  ShippingOption,
  ShopConnection,
  ShopeeEnvelope,
  ShopPolicies,
  SignupInput,
  UserProfile,
} from './types.js';

export { HuspeeApiError } from './http.js';
export type { HuspeeClientOptions, RequestOptions } from './http.js';
export type * from './types.js';

type Query = Record<string, string | number | boolean | undefined | null>;

export class HuspeeClient {
  readonly http: HttpTransport;

  constructor(options: HuspeeClientOptions) {
    this.http = new HttpTransport(options);
  }

  readonly auth = {
    signup: (input: SignupInput) => this.http.request<UserProfile>('POST', '/api/v1/auth/signup', { body: input }),
    login: (email: string, password: string) => this.http.request<UserProfile>('POST', '/api/v1/auth/login', { body: { email, password } }),
    logout: () => this.http.request<{ logged_out: boolean }>('POST', '/api/v1/auth/logout'),
    me: () => this.http.request<UserProfile>('GET', '/api/v1/auth/me'),
  };

  readonly marketplace = {
    categories: () => this.http.request<CategoryNode[]>('GET', '/api/v1/marketplace/categories'),
    listShops: (query: { q?: string; page?: number; page_size?: number } = {}) =>
      this.http.request<Paginated<PublicShop>>('GET', '/api/v1/marketplace/shops', { query, raw: true }),
    getShop: (shopId: number) => this.http.request<PublicShop>('GET', `/api/v1/marketplace/shops/${shopId}`),
    shopVouchers: (shopId: number) => this.http.request<PublicVoucher[]>('GET', `/api/v1/marketplace/shops/${shopId}/vouchers`),
    shopPolicies: (shopId: number) => this.http.request<ShopPolicies>('GET', `/api/v1/marketplace/shops/${shopId}/policies`),
    searchProducts: (query: ProductSearchQuery = {}) =>
      this.http.request<Paginated<ProductSummary>>('GET', '/api/v1/marketplace/products', { query: query as Query, raw: true }),
    getProduct: (itemId: number) => this.http.request<ProductDetail>('GET', `/api/v1/marketplace/products/${itemId}`),
    getReviews: (itemId: number, query: { rating?: number; page?: number; page_size?: number } = {}) =>
      this.http.request<Paginated<ProductReview> & { summary: Record<string, number> }>('GET', `/api/v1/marketplace/products/${itemId}/reviews`, {
        query,
        raw: true,
      }),
  };

  readonly cart = {
    get: () => this.http.request<Cart>('GET', '/api/v1/cart'),
    addItem: (modelId: number, quantity: number) => this.http.request<Cart>('POST', '/api/v1/cart/items', { body: { model_id: modelId, quantity } }),
    updateItem: (cartItemId: number, change: { quantity?: number; model_id?: number }) =>
      this.http.request<Cart>('PATCH', `/api/v1/cart/items/${cartItemId}`, { body: change }),
    removeItem: (cartItemId: number) => this.http.request<Cart>('DELETE', `/api/v1/cart/items/${cartItemId}`),
  };

  readonly checkout = {
    preview: (input: CheckoutInput) => this.http.request<CheckoutQuote>('POST', '/api/v1/checkout/preview', { body: input }),
    /** Pass an idempotencyKey to make retries safe: the same key returns the original orders. */
    placeOrder: (input: CheckoutInput, opts: { idempotencyKey?: string } = {}) =>
      this.http.request<CheckoutResult>('POST', '/api/v1/checkout', {
        body: input,
        headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {},
      }),
  };

  readonly shipping = {
    quote: (items: Array<{ model_id: number; quantity: number }>, paymentMethod?: PaymentMethod) =>
      this.http.request<
        Array<{ shop_id: number; shop_name: string; items_subtotal: number; options: ShippingOption[]; recommended_logistics_channel_id: number | null; free_shipping_applied: boolean }>
      >('POST', '/api/v1/shipping/quote', { body: { items, payment_method: paymentMethod } }),
  };

  readonly assistant = {
    profile: (shopId: number) => this.http.request<AssistantProfile>('GET', `/api/v1/assistant/shops/${shopId}/profile`),
    voices: () => this.http.request<{ voices: string[] }>('GET', '/api/v1/assistant/voices'),
    text: {
      start: (input: { shop_id: number; lang?: string }) => this.http.request<{ conversation_id: string }>('POST', '/api/v1/assistant/text/sessions', { body: input }),
    },
    voice: {
      start: (input: { shop_id: number; sdp_offer: string; lang?: string }) => this.http.request<{ conversation_id: string; sdp_answer: string }>('POST', '/api/v1/assistant/voice/sessions', { body: input }),
      text: (conversationId: string, text: string) => this.http.request<{ ok: true }>('POST', `/api/v1/assistant/voice/sessions/${encodeURIComponent(conversationId)}/text`, { body: { text } }),
      stop: (conversationId: string) => this.http.request<{ ok: true }>('POST', `/api/v1/assistant/voice/sessions/${encodeURIComponent(conversationId)}/stop`),
      eventsUrl: (conversationId: string) => this.http.url(`/api/v1/assistant/voice/sessions/${encodeURIComponent(conversationId)}/events`),
    },
    actions: {
      confirm: (actionId: string, idempotencyKey: string) => this.http.request<{ action: PendingActionView }>('POST', `/api/v1/assistant/actions/${encodeURIComponent(actionId)}/confirm`, { body: { idempotency_key: idempotencyKey } }),
      cancel: (actionId: string) => this.http.request<{ action: PendingActionView }>('POST', `/api/v1/assistant/actions/${encodeURIComponent(actionId)}/cancel`),
    },
  };

  readonly buyer = {
    messages: {
      list: (query: { page?: number; page_size?: number } = {}) => this.http.request<Paginated<HandoffTicket>>('GET', '/api/v1/buyer/messages', { query, raw: true }),
      unreadCount: () => this.http.request<{ count: number }>('GET', '/api/v1/buyer/messages/unread-count'),
      get: (ticketId: number) => this.http.request<HandoffTicketDetail>('GET', `/api/v1/buyer/messages/${ticketId}`),
      reply: (ticketId: number, body: string) => this.http.request<HandoffMessage>('POST', `/api/v1/buyer/messages/${ticketId}/replies`, { body: { body } }),
    },
    addresses: {
      list: () => this.http.request<Address[]>('GET', '/api/v1/buyer/addresses'),
      create: (input: AddressInput) => this.http.request<Address>('POST', '/api/v1/buyer/addresses', { body: input }),
      update: (addressId: number, input: Partial<AddressInput>) => this.http.request<Address>('PATCH', `/api/v1/buyer/addresses/${addressId}`, { body: input }),
      remove: (addressId: number) => this.http.request<{ deleted: boolean }>('DELETE', `/api/v1/buyer/addresses/${addressId}`),
    },
    orders: {
      list: (query: BuyerOrderListQuery = {}) =>
        this.http.request<Paginated<BuyerOrder>>('GET', '/api/v1/buyer/orders', {
          query: {
            ...query,
            status: Array.isArray(query.status) ? query.status.join(',') : query.status,
          },
          raw: true,
        }),
      get: (orderSn: string) => this.http.request<BuyerOrder>('GET', `/api/v1/buyer/orders/${encodeURIComponent(orderSn)}`),
      cancel: (orderSn: string, reason?: string) =>
        this.http.request<BuyerOrder>('POST', `/api/v1/buyer/orders/${encodeURIComponent(orderSn)}/cancel`, { body: reason ? { reason } : {} }),
      confirmReceipt: (orderSn: string) => this.http.request<BuyerOrder>('POST', `/api/v1/buyer/orders/${encodeURIComponent(orderSn)}/confirm-receipt`),
      tracking: (orderSn: string) => this.http.request<OrderTracking>('GET', `/api/v1/buyer/orders/${encodeURIComponent(orderSn)}/tracking`),
      review: (orderSn: string, input: { item_id: number; model_id?: number; rating: number; comment?: string; image_urls?: string[] }) =>
        this.http.request<{ comment_id: number; item_id: number; rating: number; comment: string; create_time: number }>(
          'POST',
          `/api/v1/buyer/orders/${encodeURIComponent(orderSn)}/reviews`,
          { body: input },
        ),
    },
    returns: {
      create: (input: CreateReturnInput) => this.http.request<BuyerReturn>('POST', '/api/v1/buyer/returns', { body: input }),
      list: (query: { status?: BuyerReturn['status']; page?: number; page_size?: number } = {}) =>
        this.http.request<Paginated<BuyerReturn>>('GET', '/api/v1/buyer/returns', { query, raw: true }),
      get: (returnSn: string) => this.http.request<BuyerReturn>('GET', `/api/v1/buyer/returns/${encodeURIComponent(returnSn)}`),
      acceptOffer: (returnSn: string) => this.http.request<BuyerReturn>('POST', `/api/v1/buyer/returns/${encodeURIComponent(returnSn)}/accept-offer`),
      cancel: (returnSn: string) => this.http.request<BuyerReturn>('POST', `/api/v1/buyer/returns/${encodeURIComponent(returnSn)}/cancel`),
    },
  };

  readonly seller = {
    assistant: {
      getConfig: (shopId: number) => this.http.request<AssistantConfig>('GET', `/api/v1/seller/shops/${shopId}/assistant/config`),
      updateConfig: (shopId: number, input: AssistantConfigInput) => this.http.request<AssistantConfig>('PUT', `/api/v1/seller/shops/${shopId}/assistant/config`, { body: input }),
      faqs: {
        list: (shopId: number) => this.http.request<AssistantFaq[]>('GET', `/api/v1/seller/shops/${shopId}/assistant/faqs`),
        create: (shopId: number, input: AssistantFaqInput) => this.http.request<AssistantFaq>('POST', `/api/v1/seller/shops/${shopId}/assistant/faqs`, { body: input }),
        update: (shopId: number, faqId: number, input: Partial<AssistantFaqInput>) => this.http.request<AssistantFaq>('PUT', `/api/v1/seller/shops/${shopId}/assistant/faqs/${faqId}`, { body: input }),
        remove: (shopId: number, faqId: number) => this.http.request<{ deleted: boolean }>('DELETE', `/api/v1/seller/shops/${shopId}/assistant/faqs/${faqId}`),
      },
      conversations: {
        list: (shopId: number, query: { status?: 'ACTIVE' | 'ENDED'; has_handoff?: boolean; from?: number; to?: number; page?: number; page_size?: number } = {}) => this.http.request<Paginated<AssistantConversation>>('GET', `/api/v1/seller/shops/${shopId}/assistant/conversations`, { query, raw: true }),
        get: (shopId: number, conversationId: string) => this.http.request<AssistantConversationDetail>('GET', `/api/v1/seller/shops/${shopId}/assistant/conversations/${encodeURIComponent(conversationId)}`),
      },
    },
    inbox: {
      list: (shopId: number, query: { status?: 'OPEN' | 'ANSWERED' | 'CLOSED'; page?: number; page_size?: number } = {}) => this.http.request<Paginated<HandoffTicket>>('GET', `/api/v1/seller/shops/${shopId}/inbox`, { query, raw: true }),
      get: (shopId: number, ticketId: number) => this.http.request<HandoffTicketDetail>('GET', `/api/v1/seller/shops/${shopId}/inbox/${ticketId}`),
      reply: (shopId: number, ticketId: number, body: string) => this.http.request<HandoffMessage>('POST', `/api/v1/seller/shops/${shopId}/inbox/${ticketId}/replies`, { body: { body } }),
      close: (shopId: number, ticketId: number) => this.http.request<HandoffTicket>('POST', `/api/v1/seller/shops/${shopId}/inbox/${ticketId}/close`),
    },
    shops: {
      create: (input: CreateShopInput) => this.http.request<SellerShop>('POST', '/api/v1/seller/shops', { body: input }),
      list: () => this.http.request<SellerShop[]>('GET', '/api/v1/seller/shops'),
      get: (shopId: number) => this.http.request<SellerShop>('GET', `/api/v1/seller/shops/${shopId}`),
      /** Backend-signed consent URL for the shared platform Partner; open it in the browser. */
      authorizationUrl: (shopId: number) =>
        this.http.request<{ authorization_url: string; partner_id: number; expires_in: number }>('GET', `/api/v1/seller/shops/${shopId}/authorization-url`),
      connectionStatus: (shopId: number) => this.http.request<ShopConnection>('GET', `/api/v1/seller/shops/${shopId}/connection-status`),
      disconnect: (shopId: number) => this.http.request<ShopConnection & { disconnected: boolean }>('POST', `/api/v1/seller/shops/${shopId}/disconnect`),
    },
    dashboardSummary: (shopId: number, range: { time_from?: number; time_to?: number } = {}) =>
      this.http.request<SalesSummary>('GET', '/api/v1/seller/dashboard/summary', { query: { shop_id: shopId, ...range } }),
    /**
     * Trusted gateway to shop-scoped Shopee-compatible and custom signed operations. The
     * backend signs/validates with the shop's server-held token; the browser never sees it.
     * Returns the Shopee envelope (check `error`).
     */
    shopee: {
      call: <T = unknown>(shopId: number, path: string, params: Record<string, unknown> = {}) =>
        this.http.request<ShopeeEnvelope<T>>('POST', `/api/v1/seller/shops/${shopId}/shopee`, { body: { path, params }, allowError: true }),
      uploadImage: (shopId: number, image: Blob, filename = 'image.png') => {
        const form = new FormData();
        form.set('path', '/media_space/upload_image');
        form.set('params', JSON.stringify({ scene: 'normal' }));
        form.set('image', image, filename);
        return this.http.request<ShopeeEnvelope<{ image_info: { image_id: string; image_url_list: Array<{ image_url: string }> } }>>(
          'POST',
          `/api/v1/seller/shops/${shopId}/shopee`,
          { body: form, allowError: true },
        );
      },
      operations: (shopId: number) =>
        this.http.request<Array<{ path: string; method: string; provenance: string }>>('GET', `/api/v1/seller/shops/${shopId}/shopee/operations`),
    },
  };

  readonly integrations = {
    /**
     * Complete the shop authorization callback from a non-browser client (tests/scripts):
     * forwards the redirect query (code, shop_id, state) with the session and state cookies.
     */
    completeShopeeCallback: (callbackUrl: string) =>
      this.http.request<{ connected: boolean; shop_id: number }>('GET', new URL(callbackUrl).pathname, {
        query: Object.fromEntries(new URL(callbackUrl).searchParams),
      }),
  };
}
