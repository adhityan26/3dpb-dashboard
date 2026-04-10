-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alertKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ProductStatusSnapshot" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "NotificationLog_alertKey_sentAt_idx" ON "NotificationLog"("alertKey", "sentAt");
