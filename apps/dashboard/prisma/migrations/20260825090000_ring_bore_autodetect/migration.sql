-- AlterTable
ALTER TABLE "RingModel" ALTER COLUMN "baseBoreMm" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RingPart" ADD COLUMN     "boreMm" DOUBLE PRECISION;
