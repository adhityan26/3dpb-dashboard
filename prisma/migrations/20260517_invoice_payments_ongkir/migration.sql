-- AlterTable: Quotation — add ongkir, drop dpAmount/dpTanggal
ALTER TABLE "Quotation" ADD COLUMN "ongkir" REAL NOT NULL DEFAULT 0;

-- CreateTable: InvoicePayment
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

-- CreateIndex
CREATE INDEX "InvoicePayment_quotationId_idx" ON "InvoicePayment"("quotationId");
