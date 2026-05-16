CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nomor" TEXT,
    "vendorNama" TEXT NOT NULL,
    "tanggal" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "catatan" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

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
    "isFilament" INTEGER NOT NULL DEFAULT 0,
    "brand" TEXT,
    "material" TEXT,
    "colorName" TEXT,
    "filamentCatalogId" TEXT,
    CONSTRAINT "PurchaseOrderItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
