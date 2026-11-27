-- Add inventory planning details without changing immutable stock-ledger fields.
ALTER TABLE "inventory_items"
ADD COLUMN "description" TEXT,
ADD COLUMN "leadTimeDays" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "inventory_items"
ADD CONSTRAINT "inventory_items_leadTimeDays_nonnegative"
CHECK ("leadTimeDays" >= 0);
