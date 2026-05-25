/**
 * One-time migration: lightgenerator PostgreSQL DB → shopee_dashboard
 *
 * Run inside container OR locally with both DBs accessible:
 *   LIGHTGENERATOR_DB_URL=postgresql://postgres:<pass>@light-generator-postgres-1:5432/lightgenerator \
 *   DATABASE_URL=postgresql://postgres:<pass>@light-generator-postgres-1:5432/shopee_dashboard \
 *   node scripts/migrate-lg-orders.mjs
 */

import pkg from "pg"
const { Client } = pkg
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const srcUrl = process.env.LIGHTGENERATOR_DB_URL
const dstUrl = process.env.DATABASE_URL
if (!srcUrl) { console.error("LIGHTGENERATOR_DB_URL is not set"); process.exit(1) }
if (!dstUrl) { console.error("DATABASE_URL is not set"); process.exit(1) }

const srcClient = new Client({ connectionString: srcUrl })
const adapter = new PrismaPg({ connectionString: dstUrl })
const prisma = new PrismaClient({ adapter })

async function migrate() {
  await srcClient.connect()
  console.log("🚀 Starting lightgenerator → shopee_dashboard migration\n")

  // Read all orders from source DB
  const { rows } = await srcClient.query(`
    SELECT
      id, status, "statusNote", "customerName", "customerContact",
      "notesCustomer", "configJson", "imagePath", "configJsonOperator",
      "stlPath", "notesOperator", "additionalImagePath",
      "createdAt", "updatedAt"
    FROM "LightGeneratorOrder"
    ORDER BY "createdAt" ASC
  `)

  console.log(`Found ${rows.length} orders to migrate`)

  let migrated = 0
  let skipped = 0

  for (const row of rows) {
    try {
      await prisma.lightGeneratorOrder.upsert({
        where: { id: row.id },
        create: {
          id:                  row.id,
          sanityDocId:         null, // not available in source DB
          status:              row.status ?? "submitted",
          statusNote:          row.statusNote ?? null,
          customerName:        row.customerName,
          customerContact:     row.customerContact,
          notesCustomer:       row.notesCustomer ?? null,
          configJson:          typeof row.configJson === "string"
                                 ? row.configJson
                                 : JSON.stringify(row.configJson),
          imagePath:           row.imagePath ?? "",
          configJsonOperator:  row.configJsonOperator ?? null,
          stlPath:             row.stlPath ?? null,
          notesOperator:       row.notesOperator ?? null,
          additionalImagePath: row.additionalImagePath ?? null,
          createdAt:           row.createdAt ? new Date(row.createdAt) : new Date(),
          updatedAt:           row.updatedAt ? new Date(row.updatedAt) : new Date(),
        },
        update: {}, // idempotent — don't overwrite on re-run
      })
      migrated++
      if (migrated % 10 === 0) console.log(`  Migrated ${migrated}/${rows.length}...`)
    } catch (err) {
      console.error(`  ⚠️  Failed to migrate ${row.id}:`, err.message)
      skipped++
    }
  }

  console.log(`\n✅ Done. Migrated: ${migrated}, Skipped: ${skipped}`)
  await srcClient.end()
  await prisma.$disconnect()
}

migrate().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
