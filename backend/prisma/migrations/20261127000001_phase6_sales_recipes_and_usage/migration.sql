-- AlterTable
ALTER TABLE "stock_transactions" ADD COLUMN     "saleId" TEXT,
ADD COLUMN     "usageRecordId" TEXT;

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'TEA',
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotencyKey" TEXT,
    "auditGroupId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "createdById" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_usage_records" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotencyKey" TEXT,
    "auditGroupId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "createdById" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_usage_items" (
    "id" TEXT NOT NULL,
    "usageRecordId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "ItemUnit" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "stock_usage_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_items_shopId_isActive_idx" ON "menu_items"("shopId", "isActive");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "menu_items_shopId_name_key" ON "menu_items"("shopId", "name");

-- CreateIndex
CREATE INDEX "recipe_items_itemId_idx" ON "recipe_items"("itemId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "recipe_items_menuItemId_itemId_key" ON "recipe_items"("menuItemId", "itemId");

-- CreateIndex
CREATE INDEX "sales_shopId_date_idx" ON "sales"("shopId", "date");

-- CreateIndex
CREATE INDEX "sales_shopId_status_idx" ON "sales"("shopId", "status");

-- CreateIndex
CREATE INDEX "sales_auditGroupId_idx" ON "sales"("auditGroupId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "sales_shopId_idempotencyKey_key" ON "sales"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE INDEX "sale_items_menuItemId_idx" ON "sale_items"("menuItemId");

-- CreateIndex
CREATE INDEX "stock_usage_records_shopId_date_idx" ON "stock_usage_records"("shopId", "date");

-- CreateIndex
CREATE INDEX "stock_usage_records_shopId_status_idx" ON "stock_usage_records"("shopId", "status");

-- CreateIndex
CREATE INDEX "stock_usage_records_auditGroupId_idx" ON "stock_usage_records"("auditGroupId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "stock_usage_records_shopId_idempotencyKey_key" ON "stock_usage_records"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "stock_usage_items_usageRecordId_idx" ON "stock_usage_items"("usageRecordId");

-- CreateIndex
CREATE INDEX "stock_usage_items_itemId_idx" ON "stock_usage_items"("itemId");

-- CreateIndex
CREATE INDEX "stock_transactions_saleId_idx" ON "stock_transactions"("saleId");

-- CreateIndex
CREATE INDEX "stock_transactions_usageRecordId_idx" ON "stock_transactions"("usageRecordId");

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_usageRecordId_fkey" FOREIGN KEY ("usageRecordId") REFERENCES "stock_usage_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_usage_records" ADD CONSTRAINT "stock_usage_records_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_usage_records" ADD CONSTRAINT "stock_usage_records_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_usage_records" ADD CONSTRAINT "stock_usage_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_usage_items" ADD CONSTRAINT "stock_usage_items_usageRecordId_fkey" FOREIGN KEY ("usageRecordId") REFERENCES "stock_usage_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_usage_items" ADD CONSTRAINT "stock_usage_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
