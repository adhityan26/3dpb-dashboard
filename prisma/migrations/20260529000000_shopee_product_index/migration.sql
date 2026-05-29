CREATE TABLE "ShopeeProductIndex" (
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "imageUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopeeProductIndex_pkey" PRIMARY KEY ("itemId")
);
