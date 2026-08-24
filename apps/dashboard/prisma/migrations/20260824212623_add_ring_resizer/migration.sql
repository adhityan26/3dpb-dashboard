-- CreateTable
CREATE TABLE "RingModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseBoreMm" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RingModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RingPart" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "triCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RingPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RingAnchor" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "posZ" DOUBLE PRECISION NOT NULL,
    "normX" DOUBLE PRECISION NOT NULL,
    "normY" DOUBLE PRECISION NOT NULL,
    "normZ" DOUBLE PRECISION NOT NULL,
    "upX" DOUBLE PRECISION NOT NULL,
    "upY" DOUBLE PRECISION NOT NULL,
    "upZ" DOUBLE PRECISION NOT NULL,
    "textHeightMm" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "depthMm" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "RingAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RingPart_modelId_idx" ON "RingPart"("modelId");

-- CreateIndex
CREATE INDEX "RingAnchor_partId_idx" ON "RingAnchor"("partId");

-- AddForeignKey
ALTER TABLE "RingPart" ADD CONSTRAINT "RingPart_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "RingModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RingAnchor" ADD CONSTRAINT "RingAnchor_partId_fkey" FOREIGN KEY ("partId") REFERENCES "RingPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

