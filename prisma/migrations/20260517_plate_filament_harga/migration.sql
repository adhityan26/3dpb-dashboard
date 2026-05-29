-- Add filament catalog selection to KalkulasiPlate
-- Allows per-part filament override from FilamentHarga catalog
ALTER TABLE "KalkulasiPlate" ADD COLUMN "filamentHargaId" TEXT;
ALTER TABLE "KalkulasiPlate" ADD COLUMN "filamentHargaPerGram" REAL;
