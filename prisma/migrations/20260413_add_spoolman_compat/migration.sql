-- CreateTable: SpoolmanVendor
CREATE TABLE "SpoolmanVendor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "emptySpoolWeight" REAL,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: SpoolmanFilament
CREATE TABLE "SpoolmanFilament" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "material" TEXT NOT NULL DEFAULT '',
    "diameter" REAL NOT NULL DEFAULT 1.75,
    "density" REAL NOT NULL DEFAULT 1.24,
    "weight" REAL,
    "spoolWeight" REAL,
    "colorHex" TEXT,
    "vendorId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpoolmanFilament_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "SpoolmanVendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: SpoolmanSpool
CREATE TABLE "SpoolmanSpool" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filamentId" INTEGER NOT NULL,
    "lotNr" TEXT,
    "initialWeight" REAL,
    "usedWeight" REAL NOT NULL DEFAULT 0,
    "firstUsed" DATETIME,
    "lastUsed" DATETIME,
    "spoolId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpoolmanSpool_filamentId_fkey" FOREIGN KEY ("filamentId") REFERENCES "SpoolmanFilament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpoolmanSpool_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "Spool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SpoolmanVendor_name_key" ON "SpoolmanVendor"("name");
CREATE UNIQUE INDEX "SpoolmanFilament_externalId_key" ON "SpoolmanFilament"("externalId");
CREATE UNIQUE INDEX "SpoolmanSpool_lotNr_key" ON "SpoolmanSpool"("lotNr");
CREATE UNIQUE INDEX "SpoolmanSpool_spoolId_key" ON "SpoolmanSpool"("spoolId");
