CREATE TABLE "ProdukHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produkInternalId" TEXT NOT NULL,
    "tanggal" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qty" INTEGER NOT NULL,
    "catatan" TEXT,
    "kalkulasiId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProdukHistory_produkInternalId_fkey"
        FOREIGN KEY ("produkInternalId") REFERENCES "ProdukInternal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
