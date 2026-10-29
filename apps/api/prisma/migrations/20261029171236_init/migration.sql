-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('NORMAL', 'BANNED', 'FROZEN');

-- CreateEnum
CREATE TYPE "ShopMemberRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('NORMAL', 'UNLIST', 'BANNED', 'DELETED', 'REVIEWING');

-- CreateEnum
CREATE TYPE "ModelStatus" AS ENUM ('MODEL_NORMAL', 'MODEL_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ShopCategoryStatus" AS ENUM ('NORMAL', 'INACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('UNPAID', 'READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED', 'IN_CANCEL', 'CANCELLED', 'TO_RETURN');

-- CreateEnum
CREATE TYPE "LogisticsStatus" AS ENUM ('LOGISTICS_NOT_START', 'LOGISTICS_READY', 'LOGISTICS_REQUEST_CREATED', 'LOGISTICS_PICKUP_DONE', 'LOGISTICS_DELIVERY_DONE', 'LOGISTICS_DELIVERY_FAILED', 'LOGISTICS_REQUEST_CANCELED', 'LOGISTICS_INVALID');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'CANCELLED', 'JUDGING', 'CLOSED', 'PROCESSING', 'SELLER_DISPUTE');

-- CreateEnum
CREATE TYPE "PushDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "roles" "UserRole"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "web_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logo_url" TEXT,
    "region" TEXT NOT NULL DEFAULT 'VN',
    "status" "ShopStatus" NOT NULL DEFAULT 'NORMAL',
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "holiday_mode" BOOLEAN NOT NULL DEFAULT false,
    "holiday_mode_at" TIMESTAMP(3),
    "city" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_members" (
    "user_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "role" "ShopMemberRole" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_members_pkey" PRIMARY KEY ("user_id","shop_id")
);

-- CreateTable
CREATE TABLE "shop_policies" (
    "shop_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "shipping_policy" TEXT NOT NULL,
    "return_policy" TEXT NOT NULL,
    "warranty_policy" TEXT NOT NULL,
    "return_window_days" INTEGER NOT NULL DEFAULT 7,
    "free_shipping_min_spend" DECIMAL(14,2),
    "allow_buyer_cancel_until" TEXT NOT NULL DEFAULT 'READY_TO_SHIP',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_policies_pkey" PRIMARY KEY ("shop_id")
);

-- CreateTable
CREATE TABLE "shop_addresses" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'VN',
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "town" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL,
    "zipcode" TEXT NOT NULL DEFAULT '',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_pickup" BOOLEAN NOT NULL DEFAULT true,
    "is_return" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_apps" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "key_ref" TEXT NOT NULL,
    "redirect_domains" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_authorizations" (
    "id" SERIAL NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "status" "GrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "authorized_by_user_id" INTEGER NOT NULL,
    "authorized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "shop_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_requests" (
    "id" TEXT NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "auth_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_codes" (
    "code_hash" TEXT NOT NULL,
    "authorization_id" INTEGER NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "auth_codes_pkey" PRIMARY KEY ("code_hash")
);

-- CreateTable
CREATE TABLE "access_tokens" (
    "token_hash" TEXT NOT NULL,
    "authorization_id" INTEGER NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "access_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "token_hash" TEXT NOT NULL,
    "authorization_id" INTEGER NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "platform_shop_credentials" (
    "shop_id" INTEGER NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "access_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3) NOT NULL,
    "connected_by_user_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_shop_credentials_pkey" PRIMARY KEY ("shop_id","partner_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "image_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_attributes" (
    "id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "input_type" TEXT NOT NULL DEFAULT 'DROP_DOWN',
    "values" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "category_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" INTEGER,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "brand_id" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "item_sku" TEXT NOT NULL DEFAULT '',
    "status" "ItemStatus" NOT NULL DEFAULT 'NORMAL',
    "condition" TEXT NOT NULL DEFAULT 'NEW',
    "weight_kg" DECIMAL(10,3) NOT NULL DEFAULT 0.5,
    "length_cm" INTEGER NOT NULL DEFAULT 10,
    "width_cm" INTEGER NOT NULL DEFAULT 10,
    "height_cm" INTEGER NOT NULL DEFAULT 10,
    "days_to_ship" INTEGER NOT NULL DEFAULT 2,
    "attributes" JSONB NOT NULL DEFAULT '[]',
    "tier_variation" JSONB NOT NULL DEFAULT '[]',
    "logistics" JSONB NOT NULL DEFAULT '[]',
    "has_model" BOOLEAN NOT NULL DEFAULT false,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_images" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "image_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "item_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "tier_index" INTEGER[],
    "sku" TEXT NOT NULL DEFAULT '',
    "original_price" DECIMAL(14,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reserved_stock" INTEGER NOT NULL DEFAULT 0,
    "status" "ModelStatus" NOT NULL DEFAULT 'MODEL_NORMAL',
    "weight_kg" DECIMAL(10,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_images" (
    "image_id" TEXT NOT NULL,
    "shop_id" INTEGER,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "scene" TEXT NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_images_pkey" PRIMARY KEY ("image_id")
);

-- CreateTable
CREATE TABLE "shop_categories" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort_weight" INTEGER NOT NULL DEFAULT 0,
    "status" "ShopCategoryStatus" NOT NULL DEFAULT 'NORMAL',
    "created_by" TEXT NOT NULL DEFAULT 'Seller',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_category_items" (
    "shop_category_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_category_items_pkey" PRIMARY KEY ("shop_category_id","item_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "model_id" INTEGER,
    "order_sn" TEXT,
    "buyer_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "image_urls" TEXT[],
    "seller_reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "voucher_type" INTEGER NOT NULL DEFAULT 1,
    "reward_type" INTEGER NOT NULL DEFAULT 1,
    "discount_amount" DECIMAL(14,2),
    "percentage" INTEGER,
    "max_price" DECIMAL(14,2),
    "min_basket_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "usage_quantity" INTEGER NOT NULL,
    "current_usage" INTEGER NOT NULL DEFAULT 0,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "display_channels" INTEGER[],
    "item_ids" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_models" (
    "discount_id" INTEGER NOT NULL,
    "model_id" INTEGER NOT NULL,
    "promotion_price" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "discount_models_pkey" PRIMARY KEY ("discount_id","model_id")
);

-- CreateTable
CREATE TABLE "buyer_addresses" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'VN',
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "town" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL,
    "zipcode" TEXT NOT NULL DEFAULT '',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "buyer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "model_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_channels" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "base_fee" DECIMAL(14,2) NOT NULL,
    "per_kg_fee" DECIMAL(14,2) NOT NULL,
    "min_days" INTEGER NOT NULL,
    "max_days" INTEGER NOT NULL,
    "cod_enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mask_channel_id" INTEGER NOT NULL DEFAULT 0,
    "tracking_prefix" TEXT NOT NULL,

    CONSTRAINT "logistics_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_sn" TEXT NOT NULL,
    "checkout_id" TEXT NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "payment_method" TEXT NOT NULL,
    "cod" BOOLEAN NOT NULL DEFAULT false,
    "items_subtotal" DECIMAL(14,2) NOT NULL,
    "shipping_fee" DECIMAL(14,2) NOT NULL,
    "shipping_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "voucher_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "voucher_id" INTEGER,
    "voucher_code" TEXT,
    "recipient_address" JSONB NOT NULL,
    "message_to_seller" TEXT NOT NULL DEFAULT '',
    "logistics_channel_id" INTEGER NOT NULL,
    "shipping_carrier" TEXT NOT NULL,
    "days_to_ship" INTEGER NOT NULL,
    "ship_by_date" TIMESTAMP(3) NOT NULL,
    "pay_time" TIMESTAMP(3),
    "cancel_by" TEXT,
    "cancel_reason" TEXT,
    "buyer_cancel_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_sn")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_sn" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "model_id" INTEGER NOT NULL,
    "is_default_model" BOOLEAN NOT NULL,
    "item_name" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "item_sku" TEXT NOT NULL,
    "model_sku" TEXT NOT NULL,
    "image_url" TEXT,
    "quantity" INTEGER NOT NULL,
    "original_price" DECIMAL(14,2) NOT NULL,
    "discounted_price" DECIMAL(14,2) NOT NULL,
    "weight_kg" DECIMAL(10,3) NOT NULL,
    "promotion_id" INTEGER,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "package_number" TEXT NOT NULL,
    "order_sn" TEXT NOT NULL,
    "logistics_status" "LogisticsStatus" NOT NULL DEFAULT 'LOGISTICS_READY',
    "tracking_number" TEXT,
    "ship_method" TEXT,
    "pickup_address_id" INTEGER,
    "pickup_time_id" TEXT,
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("package_number")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" SERIAL NOT NULL,
    "package_number" TEXT NOT NULL,
    "logistics_status" "LogisticsStatus" NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_requests" (
    "buyer_id" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "checkout_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_requests_pkey" PRIMARY KEY ("buyer_id","idempotency_key")
);

-- CreateTable
CREATE TABLE "returns" (
    "return_sn" TEXT NOT NULL,
    "order_sn" TEXT NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "text_reason" TEXT NOT NULL DEFAULT '',
    "image_urls" TEXT[],
    "solution" INTEGER NOT NULL DEFAULT 0,
    "refund_amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "items" JSONB NOT NULL,
    "negotiation" JSONB,
    "dispute" JSONB,
    "needs_return_shipment" BOOLEAN NOT NULL DEFAULT true,
    "reverse_tracking_number" TEXT,
    "reverse_tracking" JSONB NOT NULL DEFAULT '[]',
    "refund_paid_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("return_sn")
);

-- CreateTable
CREATE TABLE "push_configs" (
    "partner_id" INTEGER NOT NULL,
    "callback_url" TEXT NOT NULL DEFAULT '',
    "live_callback_url" TEXT NOT NULL DEFAULT '',
    "push_codes" INTEGER[],
    "blocked_shop_ids" INTEGER[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_configs_pkey" PRIMARY KEY ("partner_id")
);

-- CreateTable
CREATE TABLE "push_events" (
    "id" SERIAL NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "code" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "push_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "web_sessions_user_id_idx" ON "web_sessions"("user_id");

-- CreateIndex
CREATE INDEX "shop_members_shop_id_idx" ON "shop_members"("shop_id");

-- CreateIndex
CREATE INDEX "shop_addresses_shop_id_idx" ON "shop_addresses"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_authorizations_partner_id_shop_id_key" ON "shop_authorizations"("partner_id", "shop_id");

-- CreateIndex
CREATE INDEX "access_tokens_authorization_id_idx" ON "access_tokens"("authorization_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_authorization_id_idx" ON "refresh_tokens"("authorization_id");

-- CreateIndex
CREATE INDEX "items_shop_id_status_idx" ON "items"("shop_id", "status");

-- CreateIndex
CREATE INDEX "items_category_id_idx" ON "items"("category_id");

-- CreateIndex
CREATE INDEX "item_images_item_id_idx" ON "item_images"("item_id");

-- CreateIndex
CREATE INDEX "models_item_id_idx" ON "models"("item_id");

-- CreateIndex
CREATE INDEX "shop_categories_shop_id_idx" ON "shop_categories"("shop_id");

-- CreateIndex
CREATE INDEX "reviews_item_id_idx" ON "reviews"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_sn_item_id_model_id_key" ON "reviews"("order_sn", "item_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_shop_id_code_key" ON "vouchers"("shop_id", "code");

-- CreateIndex
CREATE INDEX "buyer_addresses_user_id_idx" ON "buyer_addresses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_user_id_model_id_key" ON "cart_items"("user_id", "model_id");

-- CreateIndex
CREATE INDEX "orders_shop_id_status_idx" ON "orders"("shop_id", "status");

-- CreateIndex
CREATE INDEX "orders_buyer_id_idx" ON "orders"("buyer_id");

-- CreateIndex
CREATE INDEX "orders_checkout_id_idx" ON "orders"("checkout_id");

-- CreateIndex
CREATE INDEX "order_items_order_sn_idx" ON "order_items"("order_sn");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_sn_key" ON "shipments"("order_sn");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_tracking_number_key" ON "shipments"("tracking_number");

-- CreateIndex
CREATE INDEX "tracking_events_package_number_idx" ON "tracking_events"("package_number");

-- CreateIndex
CREATE INDEX "returns_shop_id_status_idx" ON "returns"("shop_id", "status");

-- CreateIndex
CREATE INDEX "returns_buyer_id_idx" ON "returns"("buyer_id");

-- CreateIndex
CREATE INDEX "push_events_status_idx" ON "push_events"("status");

-- AddForeignKey
ALTER TABLE "web_sessions" ADD CONSTRAINT "web_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_policies" ADD CONSTRAINT "shop_policies_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_addresses" ADD CONSTRAINT "shop_addresses_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_authorizations" ADD CONSTRAINT "shop_authorizations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner_apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_authorizations" ADD CONSTRAINT "shop_authorizations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_requests" ADD CONSTRAINT "auth_requests_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner_apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_codes" ADD CONSTRAINT "auth_codes_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "shop_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "shop_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "shop_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_shop_credentials" ADD CONSTRAINT "platform_shop_credentials_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_images" ADD CONSTRAINT "item_images_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_images" ADD CONSTRAINT "media_images_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_category_items" ADD CONSTRAINT "shop_category_items_shop_category_id_fkey" FOREIGN KEY ("shop_category_id") REFERENCES "shop_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_category_items" ADD CONSTRAINT "shop_category_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_models" ADD CONSTRAINT "discount_models_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_models" ADD CONSTRAINT "discount_models_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_addresses" ADD CONSTRAINT "buyer_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_sn_fkey" FOREIGN KEY ("order_sn") REFERENCES "orders"("order_sn") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_sn_fkey" FOREIGN KEY ("order_sn") REFERENCES "orders"("order_sn") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_package_number_fkey" FOREIGN KEY ("package_number") REFERENCES "shipments"("package_number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_sn_fkey" FOREIGN KEY ("order_sn") REFERENCES "orders"("order_sn") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_configs" ADD CONSTRAINT "push_configs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner_apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
