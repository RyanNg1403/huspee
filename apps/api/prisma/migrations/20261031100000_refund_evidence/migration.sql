-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PendingActionType" ADD VALUE 'CANCEL_RETURN';
ALTER TYPE "PendingActionType" ADD VALUE 'ACCEPT_RETURN_OFFER';

-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "order_status_before_return" "OrderStatus",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "return_evidence" (
    "id" UUID NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "order_sn" TEXT NOT NULL,
    "return_sn" TEXT,
    "data" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_evidence_selections" (
    "conversation_id" UUID NOT NULL,
    "order_sn" TEXT NOT NULL,
    "evidence_ids" TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_evidence_selections_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateIndex
CREATE INDEX "return_evidence_buyer_id_order_sn_idx" ON "return_evidence"("buyer_id", "order_sn");

-- CreateIndex
CREATE INDEX "return_evidence_return_sn_idx" ON "return_evidence"("return_sn");

-- AddForeignKey
ALTER TABLE "return_evidence" ADD CONSTRAINT "return_evidence_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_evidence" ADD CONSTRAINT "return_evidence_order_sn_fkey" FOREIGN KEY ("order_sn") REFERENCES "orders"("order_sn") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_evidence" ADD CONSTRAINT "return_evidence_return_sn_fkey" FOREIGN KEY ("return_sn") REFERENCES "returns"("return_sn") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_evidence_selections" ADD CONSTRAINT "return_evidence_selections_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_evidence_selections" ADD CONSTRAINT "return_evidence_selections_order_sn_fkey" FOREIGN KEY ("order_sn") REFERENCES "orders"("order_sn") ON DELETE CASCADE ON UPDATE CASCADE;
