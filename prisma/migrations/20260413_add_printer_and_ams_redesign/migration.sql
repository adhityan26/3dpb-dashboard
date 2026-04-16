-- CreateTable: Printer
CREATE TABLE "Printer" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "name"      TEXT NOT NULL,
    "model"     TEXT NOT NULL DEFAULT '',
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "notes"     TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Add catalogId to AmsSlot (nullable, no data migration needed)
ALTER TABLE "AmsSlot" ADD COLUMN "catalogId" TEXT
    REFERENCES "FilamentCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AmsSlot_catalogId_idx" ON "AmsSlot"("catalogId");

-- CreateTable: AmsSlotAlternative
CREATE TABLE "AmsSlotAlternative" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "slotId"    TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "catalogId" TEXT,
    "brand"     TEXT,
    "material"  TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AmsSlotAlternative_slotId_fkey"
        FOREIGN KEY ("slotId") REFERENCES "AmsSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AmsSlotAlternative_catalogId_fkey"
        FOREIGN KEY ("catalogId") REFERENCES "FilamentCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AmsSlotAlternative_slotId_idx" ON "AmsSlotAlternative"("slotId");
