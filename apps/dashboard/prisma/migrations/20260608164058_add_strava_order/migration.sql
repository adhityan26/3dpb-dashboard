-- CreateTable
CREATE TABLE "StravaOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sanityDocId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "items" JSONB NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusChangedAt" TIMESTAMP(3),
    "operatorNotes" TEXT,
    "resultPhotoKeys" TEXT[],
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StravaOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StravaOrder_orderId_key" ON "StravaOrder"("orderId");

-- CreateIndex
CREATE INDEX "StravaOrder_status_idx" ON "StravaOrder"("status");

-- CreateIndex
CREATE INDEX "StravaOrder_submittedAt_idx" ON "StravaOrder"("submittedAt");
