-- AddColumn diskon ke Quotation dan QuotationItem
ALTER TABLE "Quotation" ADD COLUMN "diskonGlobal" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN "diskonGlobalPct" REAL;
ALTER TABLE "QuotationItem" ADD COLUMN "diskon" REAL NOT NULL DEFAULT 0;
ALTER TABLE "QuotationItem" ADD COLUMN "diskonPct" REAL;
