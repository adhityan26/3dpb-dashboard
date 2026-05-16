-- Add materialsJson for multi-filament per plate (AMS support)
-- Each entry: { brand, material, color, gramasi, isSupport, hargaPerGram, filamentId }
ALTER TABLE "KalkulasiPlate" ADD COLUMN "materialsJson" TEXT;
