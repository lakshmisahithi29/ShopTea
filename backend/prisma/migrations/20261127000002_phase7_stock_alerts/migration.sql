-- CreateEnum
CREATE TYPE "StockAlertType" AS ENUM ('OUT_OF_STOCK', 'LOW_STOCK', 'NEEDS_REORDER');

-- CreateEnum
CREATE TYPE "StockAlertStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "StockAlertType" NOT NULL,
    "status" "StockAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeKey" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "currentStock" DECIMAL(12,3) NOT NULL,
    "minStock" DECIMAL(12,3) NOT NULL,
    "reorderLevel" DECIMAL(12,3) NOT NULL,
    "targetStock" DECIMAL(12,3) NOT NULL,
    "suggestedQty" DECIMAL(12,3) NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_alerts_shopId_status_idx" ON "stock_alerts"("shopId", "status");

-- CreateIndex
CREATE INDEX "stock_alerts_shopId_type_idx" ON "stock_alerts"("shopId", "type");

-- CreateIndex
CREATE INDEX "stock_alerts_itemId_idx" ON "stock_alerts"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_alerts_shopId_itemId_type_activeKey_key" ON "stock_alerts"("shopId", "itemId", "type", "activeKey");

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
