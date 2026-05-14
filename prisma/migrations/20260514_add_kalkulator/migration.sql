-- CreateTable: KalkulasiHarga
CREATE TABLE "KalkulasiHarga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nama" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "batch" INTEGER NOT NULL DEFAULT 1,
    "marginTier" TEXT NOT NULL DEFAULT 'A',
    "hargaShopeeAktual" REAL,
    "packingType" TEXT,
    "gantunganType" TEXT,
    "switchQty" INTEGER NOT NULL DEFAULT 0,
    "hasLabel" BOOLEAN NOT NULL DEFAULT false,
    "hppProduksi" REAL NOT NULL DEFAULT 0,
    "hppKomponen" REAL NOT NULL DEFAULT 0,
    "hppTotal" REAL NOT NULL DEFAULT 0,
    "floorPrice" REAL NOT NULL DEFAULT 0,
    "offlineA" REAL NOT NULL DEFAULT 0,
    "offlineB" REAL NOT NULL DEFAULT 0,
    "offlineC" REAL NOT NULL DEFAULT 0,
    "shopeeA" REAL NOT NULL DEFAULT 0,
    "shopeeB" REAL NOT NULL DEFAULT 0,
    "shopeeC" REAL NOT NULL DEFAULT 0,
    "resellerStd" REAL NOT NULL DEFAULT 0,
    "resellerBulk" REAL NOT NULL DEFAULT 0,
    "marginOfflineA" REAL NOT NULL DEFAULT 0,
    "marginShopeeA" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'TIDAK_DISET'
);

-- CreateTable: KalkulasiPlate
CREATE TABLE "KalkulasiPlate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kalkulasiId" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "namaPart" TEXT,
    "tipe" TEXT NOT NULL DEFAULT 'FDM',
    "gramasi" REAL NOT NULL,
    "durasiJam" REAL NOT NULL,
    CONSTRAINT "KalkulasiPlate_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: KomponenKustom
CREATE TABLE "KomponenKustom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kalkulasiId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "harga" REAL NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "KomponenKustom_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: KalkulasiProduk
CREATE TABLE "KalkulasiProduk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kalkulasiId" TEXT NOT NULL,
    "shopeeItemId" TEXT,
    "namaManual" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "KalkulasiProduk_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: FilamentHarga
CREATE TABLE "FilamentHarga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "hargaPerGram" REAL NOT NULL
);
CREATE UNIQUE INDEX "FilamentHarga_brand_material_key" ON "FilamentHarga"("brand", "material");

-- CreateTable: ResinHarga
CREATE TABLE "ResinHarga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "hargaPerGram" REAL NOT NULL
);
CREATE UNIQUE INDEX "ResinHarga_brand_grade_key" ON "ResinHarga"("brand", "grade");

-- Seed default Config keys for kalkulator rates
INSERT OR IGNORE INTO "Config" ("id", "key", "value", "updatedAt") VALUES
    ('kalk-cfg-01', 'kalk.fdm.hppPerGram',    '300',  CURRENT_TIMESTAMP),
    ('kalk-cfg-02', 'kalk.fdm.jualPerGram',   '900',  CURRENT_TIMESTAMP),
    ('kalk-cfg-03', 'kalk.sla.hppPerGram',    '1750', CURRENT_TIMESTAMP),
    ('kalk-cfg-04', 'kalk.sla.jualPerGram',   '3500', CURRENT_TIMESTAMP),
    ('kalk-cfg-05', 'kalk.mesin.perJam',       '4000', CURRENT_TIMESTAMP),
    ('kalk-cfg-06', 'kalk.adminEcommerce',     '1.2',  CURRENT_TIMESTAMP),
    ('kalk-cfg-07', 'kalk.packing.S',          '1500', CURRENT_TIMESTAMP),
    ('kalk-cfg-08', 'kalk.packing.M',          '2500', CURRENT_TIMESTAMP),
    ('kalk-cfg-09', 'kalk.packing.L',          '5000', CURRENT_TIMESTAMP),
    ('kalk-cfg-10', 'kalk.packing.XL',         '8000', CURRENT_TIMESTAMP),
    ('kalk-cfg-11', 'kalk.switch.perPcs',      '2500', CURRENT_TIMESTAMP),
    ('kalk-cfg-12', 'kalk.label.perLembar',    '750',  CURRENT_TIMESTAMP),
    ('kalk-cfg-13', 'kalk.gantungan.kew_kew',  '900',  CURRENT_TIMESTAMP),
    ('kalk-cfg-14', 'kalk.gantungan.ring',     '800',  CURRENT_TIMESTAMP),
    ('kalk-cfg-15', 'kalk.gantungan.rantai',   '350',  CURRENT_TIMESTAMP),
    ('kalk-cfg-16', 'kalk.gantungan.tali',     '400',  CURRENT_TIMESTAMP);
