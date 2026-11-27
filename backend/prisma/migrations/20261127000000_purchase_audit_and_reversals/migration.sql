-- Preserve purchase corrections and cancellations as immutable ledger events.
CREATE TYPE "TransactionStatus" AS ENUM ('ACTIVE', 'CANCELLED');
ALTER TYPE "TransactionType" ADD VALUE 'REVERSAL';

ALTER TABLE "stock_transactions"
ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "inputUnit" "ItemUnit",
ADD COLUMN "inputQuantity" DECIMAL(12,3),
ADD COLUMN "inputUnitCost" DECIMAL(12,2),
ADD COLUMN "reversalOfId" TEXT,
ADD COLUMN "auditGroupId" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "cancellationReason" TEXT;

CREATE UNIQUE INDEX "stock_transactions_reversalOfId_key" ON "stock_transactions"("reversalOfId");
CREATE INDEX "stock_transactions_shopId_status_idx" ON "stock_transactions"("shopId", "status");
CREATE INDEX "stock_transactions_auditGroupId_idx" ON "stock_transactions"("auditGroupId");

ALTER TABLE "stock_transactions"
ADD CONSTRAINT "stock_transactions_reversalOfId_fkey"
FOREIGN KEY ("reversalOfId") REFERENCES "stock_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_transactions"
ADD CONSTRAINT "stock_transactions_cancelledById_fkey"
FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
