-- Add variant-level kalkulasi linking to ProdukInternalShopeeLink
ALTER TABLE "ProdukInternalShopeeLink" ADD COLUMN "shopeeModelId" TEXT;
ALTER TABLE "ProdukInternalShopeeLink" ADD COLUMN "kalkulasiId" TEXT;
ALTER TABLE "ProdukInternalShopeeLink" ADD COLUMN "namaProduk" TEXT;

-- Drop old unique index and create new one that includes shopeeModelId
DROP INDEX IF EXISTS "ProdukInternalShopeeLink_produkInternalId_shopeeItemId_key";
CREATE UNIQUE INDEX "ProdukInternalShopeeLink_produkInternalId_shopeeItemId_shopeeModelId_key"
  ON "ProdukInternalShopeeLink"("produkInternalId", "shopeeItemId", "shopeeModelId");
