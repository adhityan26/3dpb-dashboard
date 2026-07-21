-- AlterTable
ALTER TABLE "Printer" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Printer_slug_key" ON "Printer"("slug");
