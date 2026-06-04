-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LabelStatus" (
    "orderId" TEXT NOT NULL PRIMARY KEY,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "printedAt" DATETIME,
    "printedBy" TEXT
);

-- CreateTable
CREATE TABLE "ProductHpp" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "hpp" REAL
);

-- CreateTable
CREATE TABLE "VariantHpp" (
    "variantId" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "hpp" REAL,
    CONSTRAINT "VariantHpp_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductHpp" ("productId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alertKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ProductStatusSnapshot" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FilamentCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Spool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "catalogId" TEXT,
    "brand" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "barcode" TEXT NOT NULL,
    "nfcTagId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "hargaBeli" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Spool_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "FilamentCatalog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpoolmanVendor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "emptySpoolWeight" REAL,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SpoolmanFilament" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "material" TEXT NOT NULL DEFAULT '',
    "diameter" REAL NOT NULL DEFAULT 1.75,
    "density" REAL NOT NULL DEFAULT 1.24,
    "weight" REAL,
    "spoolWeight" REAL,
    "colorHex" TEXT,
    "vendorId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpoolmanFilament_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "SpoolmanVendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpoolmanSpool" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filamentId" INTEGER NOT NULL,
    "lotNr" TEXT,
    "initialWeight" REAL,
    "usedWeight" REAL NOT NULL DEFAULT 0,
    "firstUsed" DATETIME,
    "lastUsed" DATETIME,
    "spoolId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpoolmanSpool_filamentId_fkey" FOREIGN KEY ("filamentId") REFERENCES "SpoolmanFilament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpoolmanSpool_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "Spool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AmsSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productType" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "filamentName" TEXT NOT NULL,
    "spoolId" TEXT,
    "catalogId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AmsSlot_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "Spool" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AmsSlot_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "FilamentCatalog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AmsSlotAlternative" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slotId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "catalogId" TEXT,
    "brand" TEXT,
    "material" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AmsSlotAlternative_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AmsSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AmsSlotAlternative_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "FilamentCatalog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KalkulasiHarga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nama" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "batch" INTEGER NOT NULL DEFAULT 1,
    "marginTier" TEXT NOT NULL DEFAULT 'A',
    "hargaShopeeAktual" REAL,
    "hargaOfflineAktual" REAL,
    "packingType" TEXT,
    "gantunganType" TEXT,
    "switchQty" INTEGER NOT NULL DEFAULT 0,
    "hasLabel" BOOLEAN NOT NULL DEFAULT false,
    "hppProduksi" REAL NOT NULL DEFAULT 0,
    "hppKomponen" REAL NOT NULL DEFAULT 0,
    "hppTotal" REAL NOT NULL DEFAULT 0,
    "floorPrice" REAL NOT NULL DEFAULT 0,
    "offlineA" REAL NOT NULL DEFAULT 0,
    "offlineB" REAL NOT NULL DEFAULT 0,
    "offlineC" REAL NOT NULL DEFAULT 0,
    "shopeeA" REAL NOT NULL DEFAULT 0,
    "shopeeB" REAL NOT NULL DEFAULT 0,
    "shopeeC" REAL NOT NULL DEFAULT 0,
    "resellerStd" REAL NOT NULL DEFAULT 0,
    "resellerBulk" REAL NOT NULL DEFAULT 0,
    "marginOfflineA" REAL NOT NULL DEFAULT 0,
    "marginShopeeA" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'TIDAK_DISET',
    "produktType" TEXT NOT NULL DEFAULT 'SIMPLE',
    "finishType" TEXT NOT NULL DEFAULT 'RAW',
    "jamSanding" REAL NOT NULL DEFAULT 0,
    "jamPainting" REAL NOT NULL DEFAULT 0,
    "jamAssembly" REAL NOT NULL DEFAULT 0,
    "flatFinishingCost" REAL NOT NULL DEFAULT 0,
    "hppFinishing" REAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "KalkulasiPlate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kalkulasiId" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "namaPart" TEXT,
    "tipe" TEXT NOT NULL DEFAULT 'FDM',
    "printer" TEXT,
    "gramasi" REAL NOT NULL,
    "materialsJson" TEXT,
    "durasiJam" REAL NOT NULL,
    "filamentHargaId" TEXT,
    "filamentHargaPerGram" REAL,
    CONSTRAINT "KalkulasiPlate_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KomponenKustom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kalkulasiId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "harga" REAL NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "KomponenKustom_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KalkulasiProduk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kalkulasiId" TEXT NOT NULL,
    "shopeeItemId" TEXT,
    "namaManual" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "KalkulasiProduk_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilamentHarga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "hargaPerGram" REAL NOT NULL,
    "spoolCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ResinHarga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "hargaPerGram" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "ProdukInternal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nama" TEXT NOT NULL,
    "deskripsi" TEXT,
    "kategori" TEXT,
    "tags" TEXT,
    "sourceModel" TEXT,
    "imageUrl" TEXT,
    "primaryKalkulasiId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProdukInternal_primaryKalkulasiId_fkey" FOREIGN KEY ("primaryKalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProdukHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produkInternalId" TEXT NOT NULL,
    "tanggal" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qty" INTEGER NOT NULL,
    "catatan" TEXT,
    "kalkulasiId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProdukHistory_produkInternalId_fkey" FOREIGN KEY ("produkInternalId") REFERENCES "ProdukInternal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProdukInternalShopeeLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produkInternalId" TEXT NOT NULL,
    "shopeeItemId" TEXT NOT NULL,
    "shopeeModelId" TEXT,
    "kalkulasiId" TEXT,
    "namaProduk" TEXT,
    CONSTRAINT "ProdukInternalShopeeLink_produkInternalId_fkey" FOREIGN KEY ("produkInternalId") REFERENCES "ProdukInternal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProdukInternalShopeeLink_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nomor" TEXT NOT NULL,
    "buyerNama" TEXT NOT NULL,
    "buyerContact" TEXT,
    "catatan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tanggal" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "ongkir" REAL NOT NULL DEFAULT 0,
    "diskonGlobal" REAL NOT NULL DEFAULT 0,
    "diskonGlobalPct" REAL,
    "shopeeOrderSn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "tanggal" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jumlah" REAL NOT NULL,
    "metode" TEXT NOT NULL DEFAULT 'Transfer',
    "catatan" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoicePayment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "produkInternalId" TEXT,
    "namaProduk" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "hargaPerUnit" REAL NOT NULL,
    "channelHarga" TEXT NOT NULL DEFAULT 'marketplace',
    "catatan" TEXT,
    "diskon" REAL NOT NULL DEFAULT 0,
    "diskonPct" REAL,
    CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nomor" TEXT,
    "vendorNama" TEXT NOT NULL,
    "tanggal" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "catatan" TEXT,
    "ongkir" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "namaProduct" TEXT NOT NULL,
    "kode" TEXT,
    "qty" REAL NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "harga" REAL NOT NULL,
    "diskon" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "isFilament" BOOLEAN NOT NULL DEFAULT false,
    "brand" TEXT,
    "material" TEXT,
    "colorName" TEXT,
    "filamentCatalogId" TEXT,
    CONSTRAINT "PurchaseOrderItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LightGeneratorOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sanityDocId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "statusNote" TEXT,
    "customerName" TEXT NOT NULL,
    "customerContact" TEXT NOT NULL,
    "notesCustomer" TEXT,
    "configJson" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "configJsonOperator" TEXT,
    "stlPath" TEXT,
    "notesOperator" TEXT,
    "additionalImagePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShopeeProductIndex" (
    "itemId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "imageUrl" TEXT,
    "priceMin" REAL NOT NULL DEFAULT 0,
    "priceMax" REAL NOT NULL DEFAULT 0,
    "stockTotal" INTEGER NOT NULL DEFAULT 0,
    "hasVariants" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Config_key_key" ON "Config"("key");

-- CreateIndex
CREATE INDEX "NotificationLog_alertKey_sentAt_idx" ON "NotificationLog"("alertKey", "sentAt");

-- CreateIndex
CREATE INDEX "FilamentCatalog_brand_idx" ON "FilamentCatalog"("brand");

-- CreateIndex
CREATE UNIQUE INDEX "FilamentCatalog_brand_material_colorName_key" ON "FilamentCatalog"("brand", "material", "colorName");

-- CreateIndex
CREATE UNIQUE INDEX "Spool_barcode_key" ON "Spool"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Spool_nfcTagId_key" ON "Spool"("nfcTagId");

-- CreateIndex
CREATE UNIQUE INDEX "SpoolmanVendor_name_key" ON "SpoolmanVendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SpoolmanFilament_externalId_key" ON "SpoolmanFilament"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SpoolmanSpool_lotNr_key" ON "SpoolmanSpool"("lotNr");

-- CreateIndex
CREATE UNIQUE INDEX "SpoolmanSpool_spoolId_key" ON "SpoolmanSpool"("spoolId");

-- CreateIndex
CREATE INDEX "AmsSlot_productType_idx" ON "AmsSlot"("productType");

-- CreateIndex
CREATE INDEX "AmsSlot_spoolId_idx" ON "AmsSlot"("spoolId");

-- CreateIndex
CREATE INDEX "AmsSlot_catalogId_idx" ON "AmsSlot"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "AmsSlot_productType_variantName_slotNumber_key" ON "AmsSlot"("productType", "variantName", "slotNumber");

-- CreateIndex
CREATE INDEX "AmsSlotAlternative_slotId_idx" ON "AmsSlotAlternative"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "FilamentHarga_brand_material_key" ON "FilamentHarga"("brand", "material");

-- CreateIndex
CREATE UNIQUE INDEX "ResinHarga_brand_grade_key" ON "ResinHarga"("brand", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "ProdukInternalShopeeLink_produkInternalId_shopeeItemId_shopeeModelId_key" ON "ProdukInternalShopeeLink"("produkInternalId", "shopeeItemId", "shopeeModelId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_nomor_key" ON "Quotation"("nomor");

-- CreateIndex
CREATE INDEX "InvoicePayment_quotationId_idx" ON "InvoicePayment"("quotationId");

-- CreateIndex
CREATE INDEX "LightGeneratorOrder_status_idx" ON "LightGeneratorOrder"("status");

-- CreateIndex
CREATE INDEX "LightGeneratorOrder_createdAt_idx" ON "LightGeneratorOrder"("createdAt");
