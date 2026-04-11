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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Spool_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "FilamentCatalog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AmsSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productType" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "filamentName" TEXT NOT NULL,
    "spoolId" TEXT,
    CONSTRAINT "AmsSlot_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "Spool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FilamentCatalog_brand_idx" ON "FilamentCatalog"("brand");

-- CreateIndex
CREATE UNIQUE INDEX "FilamentCatalog_brand_material_colorName_key" ON "FilamentCatalog"("brand", "material", "colorName");

-- CreateIndex
CREATE UNIQUE INDEX "Spool_barcode_key" ON "Spool"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Spool_nfcTagId_key" ON "Spool"("nfcTagId");

-- CreateIndex
CREATE INDEX "AmsSlot_productType_idx" ON "AmsSlot"("productType");

-- CreateIndex
CREATE INDEX "AmsSlot_spoolId_idx" ON "AmsSlot"("spoolId");

-- CreateIndex
CREATE UNIQUE INDEX "AmsSlot_productType_variantName_slotNumber_key" ON "AmsSlot"("productType", "variantName", "slotNumber");
