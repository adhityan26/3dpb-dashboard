-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LabelStatus" (
    "orderId" TEXT NOT NULL PRIMARY KEY,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "printedAt" DATETIME,
    "printedBy" TEXT
);

-- CreateTable
CREATE TABLE "ProductHpp" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "hpp" REAL
);

-- CreateTable
CREATE TABLE "VariantHpp" (
    "variantId" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "hpp" REAL,
    CONSTRAINT "VariantHpp_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductHpp" ("productId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Config_key_key" ON "Config"("key");
