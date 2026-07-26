-- CreateTable
CREATE TABLE "CydFieldPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CydFieldPreset_pkey" PRIMARY KEY ("id")
);
