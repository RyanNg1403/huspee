-- CreateEnum
CREATE TYPE "AssistantTone" AS ENUM ('FRIENDLY', 'PROFESSIONAL', 'ENTHUSIASTIC');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('VOICE', 'TEXT');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "PendingActionType" AS ENUM ('ADD_TO_CART', 'UPDATE_CART_ITEM', 'PLACE_ORDER', 'OPEN_RETURN');

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'EXECUTED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HandoffAuthor" AS ENUM ('BUYER', 'SELLER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "assistant_configs" (
    "shop_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tone" "AssistantTone" NOT NULL DEFAULT 'FRIENDLY',
    "voice" TEXT NOT NULL DEFAULT 'spruce',
    "greeting_vi" TEXT NOT NULL,
    "greeting_en" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_configs_pkey" PRIMARY KEY ("shop_id")
);

-- CreateTable
CREATE TABLE "assistant_faqs" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "channel" "ConversationChannel" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "language" TEXT,
    "summary" JSONB,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_tool_calls" (
    "id" SERIAL NOT NULL,
    "conversation_id" UUID NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_actions" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "type" "PendingActionType" NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "requires_tap" BOOLEAN NOT NULL,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "result" JSONB,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoff_tickets" (
    "id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "conversation_id" UUID,
    "subject" TEXT NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'OPEN',
    "buyer_unread" INTEGER NOT NULL DEFAULT 0,
    "seller_unread" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handoff_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoff_messages" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "author" "HandoffAuthor" NOT NULL,
    "author_user_id" INTEGER,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handoff_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_faqs_shop_id_idx" ON "assistant_faqs"("shop_id");

-- CreateIndex
CREATE INDEX "conversations_shop_id_started_at_idx" ON "conversations"("shop_id", "started_at");

-- CreateIndex
CREATE INDEX "conversations_buyer_id_idx" ON "conversations"("buyer_id");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_tool_calls_conversation_id_created_at_idx" ON "conversation_tool_calls"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pending_actions_idempotency_key_key" ON "pending_actions"("idempotency_key");

-- CreateIndex
CREATE INDEX "pending_actions_buyer_id_shop_id_idx" ON "pending_actions"("buyer_id", "shop_id");

-- CreateIndex
CREATE INDEX "handoff_tickets_shop_id_status_idx" ON "handoff_tickets"("shop_id", "status");

-- CreateIndex
CREATE INDEX "handoff_tickets_buyer_id_idx" ON "handoff_tickets"("buyer_id");

-- CreateIndex
CREATE INDEX "handoff_messages_ticket_id_created_at_idx" ON "handoff_messages"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "assistant_configs" ADD CONSTRAINT "assistant_configs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_faqs" ADD CONSTRAINT "assistant_faqs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_tool_calls" ADD CONSTRAINT "conversation_tool_calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_tickets" ADD CONSTRAINT "handoff_tickets_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_tickets" ADD CONSTRAINT "handoff_tickets_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_tickets" ADD CONSTRAINT "handoff_tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_messages" ADD CONSTRAINT "handoff_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "handoff_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_messages" ADD CONSTRAINT "handoff_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
