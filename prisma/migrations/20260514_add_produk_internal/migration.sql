-- CreateTable: ProdukInternal
CREATE TABLE "ProdukInternal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nama" TEXT NOT NULL,
    "deskripsi" TEXT,
    "primaryKalkulasiId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProdukInternal_primaryKalkulasiId_fkey"
        FOREIGN KEY ("primaryKalkulasiId")
        REFERENCES "KalkulasiHarga" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: ProdukInternalShopeeLink
CREATE TABLE "ProdukInternalShopeeLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produkInternalId" TEXT NOT NULL,
    "shopeeItemId" TEXT NOT NULL,
    CONSTRAINT "ProdukInternalShopeeLink_produkInternalId_fkey"
        FOREIGN KEY ("produkInternalId")
        REFERENCES "ProdukInternal" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateUniqueIndex: prevent duplicate Shopee links per ProdukInternal
CREATE UNIQUE INDEX "ProdukInternalShopeeLink_produkInternalId_shopeeItemId_key"
    ON "ProdukInternalShopeeLink"("produkInternalId", "shopeeItemId");
