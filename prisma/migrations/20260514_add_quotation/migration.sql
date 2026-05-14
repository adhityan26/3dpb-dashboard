CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nomor" TEXT NOT NULL,
    "buyerNama" TEXT NOT NULL,
    "buyerContact" TEXT,
    "catatan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tanggal" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "dpAmount" REAL,
    "dpTanggal" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Quotation_nomor_key" ON "Quotation"("nomor");

CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "produkInternalId" TEXT,
    "namaProduk" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "hargaPerUnit" REAL NOT NULL,
    "channelHarga" TEXT NOT NULL DEFAULT 'marketplace',
    "catatan" TEXT,
    CONSTRAINT "QuotationItem_quotationId_fkey"
        FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
