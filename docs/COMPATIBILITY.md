# Shopee compatibility notes (Phase 1)

Huspee is a **simulated, self-hosted** marketplace. It reproduces selected Shopee Open API v2 seller
contracts so that unmodified `@congminh1254/shopee-sdk` methods work against it, but it does **not**
claim parity with production Shopee. Huspee is unaffiliated with Shopee.

Behaviour is grouped as **faithful** (matches the documented contract), **approximated** (same
contract shape, simplified or simulated semantics) and **unsupported**.

## Transport, signing and envelopes

| Aspect | Status | Notes |
|---|---|---|
| Paths `/api/v2/<module>/<op>`, HTTP methods, query vs. JSON body locations | Faithful | GET params accept repeated keys (`a=1&a=2`, the SDK's encoding) and comma lists (`a=1,2`). |
| Common params `partner_id`, `timestamp`, `sign`, `access_token`, `shop_id` | Faithful | Always read from the query string, including on POST. |
| Signature base strings | Faithful | Partner-level `partner_id + path + timestamp`; shop-level adds `access_token + shop_id`; HMAC-SHA256 hex, constant-time compare. |
| Timestamp freshness | Faithful | ±300 s (`SIGNATURE_MAX_AGE_SECONDS`). |
| Success envelope | Faithful | `{ request_id, error: "", message: "", response }`. `auth/token/get`, `auth/access_token/get` and `public/get_shops_by_partner`, `shop/get_shop_info` return fields at top level (the latter two also mirror them under `response` for typed SDK consumers). |
| Error envelope | Approximated | `{ request_id, error, message }` with a non-2xx HTTP status. Codes: see table below. Production Shopee sometimes returns HTTP 200 for business errors. |
| `request_id` | Faithful | 32-char hex per response. |

### Error codes

| `error` | HTTP | When |
|---|---|---|
| `error_param` | 400/403/405 | Validation failure, missing common params, wrong HTTP method (405), expired/invalid timestamp (403), invalid/used/revoked refresh token (403) |
| `error_sign` | 403 | Signature mismatch |
| `error_auth` | 403 | Unknown partner, invalid/used/expired auth code, revoked or expired shop grant |
| `invalid_access_token` | 403 | Unknown, expired or revoked token; token used for another shop or partner |
| `error_permission` | 403 | Shop not in `NORMAL` status |
| `error_not_found` | 404 | Unknown API path, or a resource outside the authorized shop (never distinguishes "other shop" from "missing") |
| `error_invalid_status` | 400 | Illegal order/return/voucher state transition |
| `error_stock` | 400 | Stock conflict |
| `error_duplicate`, `voucher.error_duplicate_code` | 409 | Duplicates |
| `error_version_conflict` | 409 | Optimistic concurrency failure on custom policy updates |
| `error_server` | 500 | Unexpected errors (details only in server logs) |

The upstream SDK automatically refreshes and retries once on `invalid_access_token` / `error_auth`
for shop-level calls; Huspee's errors are chosen so that this behaviour works as intended.

## Authorization and tokens

| Aspect | Status | Notes |
|---|---|---|
| `GET /api/v2/shop/auth_partner?partner_id&timestamp&sign&redirect` | Faithful (v2 signed flow) | Redirect host must be registered on the Partner app. Consent pages (login, shop selection, approve/deny) are Huspee-owned HTML. |
| SDK `getAuthorizationUrl()` (Shopee's newer `open.shopee.com/auth` page) | Unsupported | Use `HuspeeShopeeSDK.buildAuthPartnerUrl()` or the backend's `/seller/shops/:id/authorization-url`. |
| Redirect with `code` + `shop_id` | Faithful | Codes: 32-char hex, single use, 10 min TTL, bound to partner, shop and redirect. Deny redirects with `error=access_denied`. |
| `auth/token/get` with `shop_id` | Faithful | `main_account_id` (merchant) authorization is unsupported. |
| Access token | Faithful | Opaque 32-hex, 4 h (`expire_in: 14400`). Stored only as SHA-256. Previous access tokens stay valid until expiry after a refresh. |
| Refresh token | Approximated | 30 days, **single use with rotation**. Reusing a rotated refresh token revokes the whole token family (stricter than Shopee). |
| Grant | Approximated | One Partner–shop grant, 365-day expiry, revocable by the seller (`/seller/shops/:id/disconnect`). |
| `public/get_shops_by_partner` | Faithful | `sip_affi_shops` always empty. |

## Shop and catalog

- **Faithful:** `shop.get_shop_info/get_profile/update_profile/get_shop_holiday_mode/set_shop_holiday_mode`; `shop_category.*` (status codes 1 normal, 2 inactive, 0 deleted; `get_item_list` uses 0-based `page_no`); `product.get_item_list` (offset paging, `item_status` filter incl. `SELLER_DELETE`), `search_item`, `get_item_base_info` (≤50 ids, items of other shops silently omitted), `get_model_list`, `get_item_extra_info`, `get_comment`/`reply_comment`, `get_category`, `get_attribute_tree`, `get_brand_list`, `add_item`, `update_item`, `add_model`, `update_model`, `delete_model`, `update_price`, `update_stock`, `unlist_item`, `delete_item`.
- **Items without variations** expose `model_id: 0` (Shopee convention) for price/stock updates and order items; internally a hidden default model holds the price and stock.
- **Approximated:**
  - `init_tier_variation` accepts both the classic `tier_variation` and `standardise_tier_variation` (option names only; variation/option IDs are not validated). It replaces the default model, so carts holding the un-varianted item are cleared.
  - `update_tier_variation` only renames tiers/options or appends options; it cannot remove options or change tier count.
  - `get_item_promotion` reports seeded "Discount Promotions" only (no flash sale/bundle/add-on deals).
  - Stock is a single seller location (`location_id: ""`); `reserved_stock` is always 0.
  - Media: `media_space/upload_image` and `media/upload_image` require **shop-level** auth (the SDK sends a token; Shopee treats these as partner-level). Images are stored in Postgres and served from `/media/:imageId`. Only PNG/JPEG/GIF/WEBP up to 10 MB.
  - Category/attribute/brand taxonomies are small seeded sets; brands of a parent category apply to its children.
- **Unsupported:** kit/bundle items, size charts, wholesale tiers, videos, GTIN validation, pre-order rules beyond `days_to_ship`, item content diagnosis, boosting.

## Vouchers

- **Faithful:** shop (`voucher_type` 1) and product (2) vouchers; fixed amount (`reward_type` 1) and percentage (2) with optional `max_price` cap; `upcoming/ongoing/expired/all` lists; ongoing vouchers may only change name, display, end time (later) and increase `usage_quantity`; `end_voucher` for ongoing, `delete_voucher` for upcoming.
- **Approximated:** one use per buyer per voucher; `display_channel_list` containing `1` makes a voucher public on the storefront, otherwise it is code-only. Usage is reserved at checkout and released on cancellation.
- **Unsupported:** coin cashback (`reward_type` 3), follow-prize/private/live vouchers, platform (Shopee) vouchers.

## Orders and logistics

- **Order state machine** (explicit, enforced in `OrderService`):
  `UNPAID → READY_TO_SHIP → PROCESSED → SHIPPED → TO_CONFIRM_RECEIVE → COMPLETED`; cancellation from `UNPAID`, `READY_TO_SHIP`, `PROCESSED`, `SHIPPED` (delivery failure); `TO_CONFIRM_RECEIVE/COMPLETED ⇄ TO_RETURN` while a return is open.
- **Payments are simulated:** COD orders start `READY_TO_SHIP` unpaid; `SHOPEEPAY_SIM`, `CARD_SIM`, `BANK_TRANSFER_SIM` are captured instantly (`pay_time` set). `UNPAID`/`IN_CANCEL` exist in the enum but are not produced in Phase 1.
- **Faithful:** `get_order_list` (≤15-day window, `create_time`/`update_time`, cursor paging, optional `order_status`), `cancel_order` (`OUT_OF_STOCK` requires `item_list`; `COD_NOT_SUPPORTED` only for COD; restores stock and voucher usage), `get_channel_list`, `get_address_list`, `get_tracking_number`, `get_tracking_info` (newest event first).
- **Approximated:**
  - `get_order_detail` (base fields + requested `response_optional_fields`: `buyer_user_id, buyer_username, recipient_address, actual_shipping_fee, actual_shipping_fee_confirmed, goods_to_declare, note, note_update_time, pay_time, dropshipper, dropshipper_phone, split_up, buyer_cancel_reason, cancel_by, cancel_reason, fulfillment_flag, pickup_done_time, checkout_shipping_carrier, reverse_shipping_fee, order_chargeable_weight_gram, return_request_due_date, edt_from, edt_to, item_list, package_list, payment_info`; other optional fields are omitted).
  - `get_shipping_parameter` offers pickup addresses with deterministic AM/PM slots for the next 3 days (`pickup_time_id` = `YYYYMMDD_AM|PM`) and a dropoff option without branch lists.
  - `ship_order` accepts `pickup` or `dropoff`; generates a carrier-prefixed tracking number. `non_integrated` and seller-supplied tracking numbers are ignored.
  - Carrier progress is driven by the custom signed `POST /api/v2/custom/logistics/simulate_shipment_event` (`PICKED_UP → SHIPPED`, `DELIVERED → TO_CONFIRM_RECEIVE`, `DELIVERY_FAILED → CANCELLED` with restock). Buyers confirm receipt (`→ COMPLETED`).
  - Shipping fees: `base_fee + per_kg_fee × ceil(max(weight − 1 kg, 0))`; channels must be enabled on every item in the shop group; COD excludes non-COD channels; per-shop free-shipping threshold comes from the persisted shop policy.
  - Buyer cancellation is immediate in `UNPAID`/`READY_TO_SHIP` (Shopee routes `READY_TO_SHIP` cancellations through seller approval / `IN_CANCEL`).
- **Unsupported:** split/unsplit orders, invoices, shipping documents/AWB, mass shipping, booking, first-mile, FBS, notes.

## Returns

- **Faithful:** `get_return_list` (0-based `page_no`, status/time filters), `get_return_detail`, `get_available_solutions`, `confirm`, `offer`, `dispute`, `cancel_dispute`, `get_return_dispute_reason`, `get_reverse_tracking_info` shapes.
- **Approximated:** buyers create returns within the shop policy's `return_window_days` after delivery; refund amount = discounted line price × quantity minus a proportional share of the shop voucher. `confirm` and buyer acceptance of a seller offer mark the refund **paid immediately (simulated)**; return-and-refund cases get a synthetic reverse-logistics timeline. Disputes stay in `JUDGING` (no platform arbitration); sellers may cancel the dispute. Returned stock is not restocked automatically.
- **Unsupported:** buyer counter-offers (`returns.accept_offer` on the seller side), proofs/evidence uploads, shipping carriers for returns, compensation.

## Push

- `set_app_push_config` / `get_app_push_config` require **shop-level** auth (as the SDK sends it) but configure the **Partner** (Shopee: partner-level).
- Supported codes: 1 shop authorization, 2 authorization cancelled, 3 order status, 4 tracking number, 8 stock change (used for seller stock updates; Shopee's code 8 is reserved-stock change), 9 voucher/promotion update, 29 return status (Huspee-specific).
- Delivery: `POST` JSON `{ shop_id, code, timestamp, data }` with `Authorization: hex(HMAC-SHA256(partner_key, callback_url + "|" + body))`, 3 attempts with backoff; failures become "lost push messages" (`get_lost_push_message` / `confirm_consumed_lost_push_message`).

## Project-owned extensions (not Shopee)

- `/api/v2/custom/shop/get_policies`, `/update_policies` (versioned, optimistic concurrency via `expected_version`), `/get_sales_summary`, `/api/v2/custom/logistics/simulate_shipment_event` — signed like shop-level APIs, labelled `X-Huspee-Provenance: custom-signed`.
- Everything under `/api/v1` (buyer, marketplace, identity, onboarding, seller gateway) is project-defined and uses cookie sessions, never Partner signing.
