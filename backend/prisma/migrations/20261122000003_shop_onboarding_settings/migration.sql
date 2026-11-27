-- CreateEnum
CREATE TYPE "ShopType" AS ENUM ('TEA_SHOP', 'CAFE', 'RESTAURANT', 'OTHER');

-- AlterTable
ALTER TABLE "shops"
ADD COLUMN "type" "ShopType" NOT NULL DEFAULT 'TEA_SHOP',
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}'::jsonb;
