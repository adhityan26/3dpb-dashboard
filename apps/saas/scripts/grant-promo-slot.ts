import "dotenv/config";
import { prisma } from "../lib/db";

/**
 * Pemberian grant PROMO manual oleh admin (bukan lewat UI -- lihat spec
 * sub-project 1 §"CYD Product Variants" & §PROMO exception: admin action
 * cukup script sampai ada kebutuhan nyata utk UI).
 *
 * Usage:
 *   pnpm --filter @3pb/saas exec tsx scripts/grant-promo-slot.ts <userId> <quantity> [validFromISO] [validUntilISO]
 */
async function main() {
  const [userId, quantityStr, validFromStr, validUntilStr] = process.argv.slice(2);
  if (!userId || !quantityStr) {
    console.error("Usage: grant-promo-slot.ts <userId> <quantity> [validFromISO] [validUntilISO]");
    process.exit(1);
  }
  const quantity = Number(quantityStr);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    console.error(`quantity harus bilangan bulat positif, dapat: ${quantityStr}`);
    process.exit(1);
  }

  const grant = await prisma.slotGrant.create({
    data: {
      userId,
      source: "PROMO",
      quantity,
      validFrom: validFromStr ? new Date(validFromStr) : undefined,
      validUntil: validUntilStr ? new Date(validUntilStr) : undefined,
    },
  });
  console.log(`Grant PROMO dibuat: ${grant.id} (+${quantity} slot untuk user ${userId})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
