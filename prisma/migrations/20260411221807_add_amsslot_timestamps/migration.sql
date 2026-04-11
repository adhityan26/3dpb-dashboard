/*
  Warnings:

  - Added the required column `updatedAt` to the `AmsSlot` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AmsSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productType" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "filamentName" TEXT NOT NULL,
    "spoolId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AmsSlot_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "Spool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AmsSlot" ("filamentName", "id", "productType", "slotNumber", "spoolId", "variantName") SELECT "filamentName", "id", "productType", "slotNumber", "spoolId", "variantName" FROM "AmsSlot";
DROP TABLE "AmsSlot";
ALTER TABLE "new_AmsSlot" RENAME TO "AmsSlot";
CREATE INDEX "AmsSlot_productType_idx" ON "AmsSlot"("productType");
CREATE INDEX "AmsSlot_spoolId_idx" ON "AmsSlot"("spoolId");
CREATE UNIQUE INDEX "AmsSlot_productType_variantName_slotNumber_key" ON "AmsSlot"("productType", "variantName", "slotNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
