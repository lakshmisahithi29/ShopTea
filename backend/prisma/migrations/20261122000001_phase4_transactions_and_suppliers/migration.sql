-- AlterTable
ALTER TABLE "stock_transactions" ADD COLUMN "wastageReason" TEXT;
ALTER TABLE "stock_transactions" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "stock_transactions" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "suppliers_shopId_isActive_idx" ON "suppliers"("shopId", "isActive");
CREATE INDEX "stock_transactions_supplierId_idx" ON "stock_transactions"("supplierId");
CREATE UNIQUE INDEX "stock_transactions_shopId_idempotencyKey_key" ON "stock_transactions"("shopId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 4 integrity constraints
ALTER TABLE "stock_transactions"
ADD CONSTRAINT "stock_transactions_quantity_positive"
CHECK ("quantity" > 0);
