/**
 * One-time migration: SQLite → PostgreSQL
 *
 * Run INSIDE the container (after prisma db push creates the PG schema):
 *   node scripts/migrate-sqlite-to-pg.mjs /app/data/prod.db
 *
 * Or locally (needs access to both SQLite file and PG):
 *   DATABASE_URL=postgresql://... node scripts/migrate-sqlite-to-pg.mjs ./data/prod.db
 */

import Database from "better-sqlite3"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import path from "path"

const sqlitePath = process.argv[2]
if (!sqlitePath) {
  console.error("Usage: node migrate-sqlite-to-pg.mjs <path-to-prod.db>")
  process.exit(1)
}

const sqlite = new Database(path.resolve(sqlitePath), { readonly: true })
const connectionString = process.env.DATABASE_URL
if (!connectionString) { console.error("DATABASE_URL is not set"); process.exit(1) }
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

function rows(table, cols = "*") {
  try {
    return sqlite.prepare(`SELECT ${cols} FROM ${table}`).all()
  } catch (e) {
    console.warn(`  ⚠️  Table ${table} not found or error: ${e.message}`)
    return []
  }
}

async function migrate() {
  console.log("🚀 Starting SQLite → PostgreSQL migration\n")

  // ── Users ──────────────────────────────────────────────
  const users = rows("User")
  if (users.length) {
    console.log(`User: ${users.length} rows`)
    for (const r of users) {
      await prisma.user.upsert({
        where: { id: r.id },
        create: { id: r.id, email: r.email, password: r.password, name: r.name, role: r.role, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── Config ─────────────────────────────────────────────
  const configs = rows("Config")
  if (configs.length) {
    console.log(`Config: ${configs.length} rows`)
    for (const r of configs) {
      await prisma.config.upsert({
        where: { id: r.id },
        create: { id: r.id, key: r.key, value: r.value, updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── LabelStatus ────────────────────────────────────────
  const labelStatuses = rows("LabelStatus")
  if (labelStatuses.length) {
    console.log(`LabelStatus: ${labelStatuses.length} rows`)
    for (const r of labelStatuses) {
      await prisma.labelStatus.upsert({
        where: { orderId: r.orderId },
        create: { orderId: r.orderId, printed: r.printed === 1, printedAt: r.printedAt ? new Date(r.printedAt) : null, printedBy: r.printedBy ?? null },
        update: {},
      })
    }
  }

  // ── ProductHpp ─────────────────────────────────────────
  const productHpps = rows("ProductHpp")
  if (productHpps.length) {
    console.log(`ProductHpp: ${productHpps.length} rows`)
    for (const r of productHpps) {
      await prisma.productHpp.upsert({
        where: { productId: r.productId },
        create: { productId: r.productId, hpp: r.hpp ?? null },
        update: {},
      })
    }
  }

  // ── VariantHpp ─────────────────────────────────────────
  const variantHpps = rows("VariantHpp")
  if (variantHpps.length) {
    console.log(`VariantHpp: ${variantHpps.length} rows`)
    for (const r of variantHpps) {
      await prisma.variantHpp.upsert({
        where: { variantId: r.variantId },
        create: { variantId: r.variantId, productId: r.productId, hpp: r.hpp ?? null },
        update: {},
      })
    }
  }

  // ── NotificationLog ────────────────────────────────────
  const notifLogs = rows("NotificationLog")
  if (notifLogs.length) {
    console.log(`NotificationLog: ${notifLogs.length} rows`)
    for (const r of notifLogs) {
      await prisma.notificationLog.upsert({
        where: { id: r.id },
        create: { id: r.id, alertKey: r.alertKey, channel: r.channel, sentAt: new Date(r.sentAt), message: r.message },
        update: {},
      })
    }
  }

  // ── ProductStatusSnapshot ──────────────────────────────
  const snapshots = rows("ProductStatusSnapshot")
  if (snapshots.length) {
    console.log(`ProductStatusSnapshot: ${snapshots.length} rows`)
    for (const r of snapshots) {
      await prisma.productStatusSnapshot.upsert({
        where: { productId: r.productId },
        create: { productId: r.productId, status: r.status, updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── FilamentCatalog ────────────────────────────────────
  const filamentCatalogs = rows("FilamentCatalog")
  if (filamentCatalogs.length) {
    console.log(`FilamentCatalog: ${filamentCatalogs.length} rows`)
    for (const r of filamentCatalogs) {
      await prisma.filamentCatalog.upsert({
        where: { id: r.id },
        create: { id: r.id, brand: r.brand, material: r.material, colorName: r.colorName, colorHex: r.colorHex, syncedAt: new Date(r.syncedAt) },
        update: {},
      })
    }
  }

  // ── Printer ────────────────────────────────────────────
  const printers = rows("Printer")
  if (printers.length) {
    console.log(`Printer: ${printers.length} rows`)
    for (const r of printers) {
      await prisma.printer.upsert({
        where: { id: r.id },
        create: { id: r.id, name: r.name, model: r.model ?? "", isActive: r.isActive === 1, notes: r.notes ?? "", createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── Spool ──────────────────────────────────────────────
  const spools = rows("Spool")
  if (spools.length) {
    console.log(`Spool: ${spools.length} rows`)
    for (const r of spools) {
      await prisma.spool.upsert({
        where: { id: r.id },
        create: { id: r.id, catalogId: r.catalogId ?? null, brand: r.brand, material: r.material, colorName: r.colorName, colorHex: r.colorHex, status: r.status ?? "new", barcode: r.barcode, nfcTagId: r.nfcTagId ?? null, notes: r.notes ?? "", hargaBeli: r.hargaBeli ?? null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── SpoolmanVendor ─────────────────────────────────────
  const spoolmanVendors = rows("SpoolmanVendor")
  if (spoolmanVendors.length) {
    console.log(`SpoolmanVendor: ${spoolmanVendors.length} rows`)
    for (const r of spoolmanVendors) {
      await prisma.spoolmanVendor.upsert({
        where: { id: r.id },
        create: { id: r.id, name: r.name, comment: r.comment ?? "", emptySpoolWeight: r.emptySpoolWeight ?? null, externalId: r.externalId ?? null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── SpoolmanFilament ───────────────────────────────────
  const spoolmanFilaments = rows("SpoolmanFilament")
  if (spoolmanFilaments.length) {
    console.log(`SpoolmanFilament: ${spoolmanFilaments.length} rows`)
    for (const r of spoolmanFilaments) {
      await prisma.spoolmanFilament.upsert({
        where: { id: r.id },
        create: { id: r.id, externalId: r.externalId ?? null, name: r.name, material: r.material ?? "", diameter: r.diameter ?? 1.75, density: r.density ?? 1.24, weight: r.weight ?? null, spoolWeight: r.spoolWeight ?? null, colorHex: r.colorHex ?? null, vendorId: r.vendorId ?? null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── SpoolmanSpool ──────────────────────────────────────
  const spoolmanSpools = rows("SpoolmanSpool")
  if (spoolmanSpools.length) {
    console.log(`SpoolmanSpool: ${spoolmanSpools.length} rows`)
    for (const r of spoolmanSpools) {
      await prisma.spoolmanSpool.upsert({
        where: { id: r.id },
        create: { id: r.id, filamentId: r.filamentId, lotNr: r.lotNr ?? null, initialWeight: r.initialWeight ?? null, usedWeight: r.usedWeight ?? 0, firstUsed: r.firstUsed ? new Date(r.firstUsed) : null, lastUsed: r.lastUsed ? new Date(r.lastUsed) : null, spoolId: r.spoolId ?? null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── AmsSlot ────────────────────────────────────────────
  const amsSlots = rows("AmsSlot")
  if (amsSlots.length) {
    console.log(`AmsSlot: ${amsSlots.length} rows`)
    for (const r of amsSlots) {
      await prisma.amsSlot.upsert({
        where: { id: r.id },
        create: { id: r.id, productType: r.productType, variantName: r.variantName, slotNumber: r.slotNumber, filamentName: r.filamentName, spoolId: r.spoolId ?? null, catalogId: r.catalogId ?? null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── AmsSlotAlternative ─────────────────────────────────
  const amsAlternatives = rows("AmsSlotAlternative")
  if (amsAlternatives.length) {
    console.log(`AmsSlotAlternative: ${amsAlternatives.length} rows`)
    for (const r of amsAlternatives) {
      await prisma.amsSlotAlternative.upsert({
        where: { id: r.id },
        create: { id: r.id, slotId: r.slotId, type: r.type, catalogId: r.catalogId ?? null, brand: r.brand ?? null, material: r.material ?? null, createdAt: new Date(r.createdAt) },
        update: {},
      })
    }
  }

  // ── FilamentHarga ──────────────────────────────────────
  const filamentHargas = rows("FilamentHarga")
  if (filamentHargas.length) {
    console.log(`FilamentHarga: ${filamentHargas.length} rows`)
    for (const r of filamentHargas) {
      await prisma.filamentHarga.upsert({
        where: { id: r.id },
        create: { id: r.id, brand: r.brand, material: r.material, hargaPerGram: r.hargaPerGram },
        update: {},
      })
    }
  }

  // ── ResinHarga ─────────────────────────────────────────
  const resinHargas = rows("ResinHarga")
  if (resinHargas.length) {
    console.log(`ResinHarga: ${resinHargas.length} rows`)
    for (const r of resinHargas) {
      await prisma.resinHarga.upsert({
        where: { id: r.id },
        create: { id: r.id, brand: r.brand, grade: r.grade, hargaPerGram: r.hargaPerGram },
        update: {},
      })
    }
  }

  // ── KalkulasiHarga ─────────────────────────────────────
  const kalkulasis = rows("KalkulasiHarga")
  if (kalkulasis.length) {
    console.log(`KalkulasiHarga: ${kalkulasis.length} rows`)
    for (const r of kalkulasis) {
      await prisma.kalkulasiHarga.upsert({
        where: { id: r.id },
        create: {
          id: r.id, nama: r.nama, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt),
          batch: r.batch ?? 1, marginTier: r.marginTier ?? "A",
          hargaShopeeAktual: r.hargaShopeeAktual ?? null, hargaOfflineAktual: r.hargaOfflineAktual ?? null,
          packingType: r.packingType ?? null, gantunganType: r.gantunganType ?? null, switchQty: r.switchQty ?? 0,
          hasLabel: r.hasLabel === 1, hppProduksi: r.hppProduksi ?? 0, hppKomponen: r.hppKomponen ?? 0, hppTotal: r.hppTotal ?? 0,
          floorPrice: r.floorPrice ?? 0, offlineA: r.offlineA ?? 0, offlineB: r.offlineB ?? 0, offlineC: r.offlineC ?? 0,
          shopeeA: r.shopeeA ?? 0, shopeeB: r.shopeeB ?? 0, shopeeC: r.shopeeC ?? 0,
          resellerStd: r.resellerStd ?? 0, resellerBulk: r.resellerBulk ?? 0,
          marginOfflineA: r.marginOfflineA ?? 0, marginShopeeA: r.marginShopeeA ?? 0, status: r.status ?? "TIDAK_DISET",
        },
        update: {},
      })
    }
  }

  // ── KalkulasiPlate ─────────────────────────────────────
  const plates = rows("KalkulasiPlate")
  if (plates.length) {
    console.log(`KalkulasiPlate: ${plates.length} rows`)
    for (const r of plates) {
      await prisma.kalkulasiPlate.upsert({
        where: { id: r.id },
        create: { id: r.id, kalkulasiId: r.kalkulasiId, urutan: r.urutan, namaPart: r.namaPart ?? null, tipe: r.tipe ?? "FDM", printer: r.printer ?? null, gramasi: r.gramasi ?? 0, materialsJson: r.materialsJson ?? null, durasiJam: r.durasiJam ?? 0, filamentHargaId: r.filamentHargaId ?? null, filamentHargaPerGram: r.filamentHargaPerGram ?? null },
        update: {},
      })
    }
  }

  // ── KomponenKustom ─────────────────────────────────────
  const komponens = rows("KomponenKustom")
  if (komponens.length) {
    console.log(`KomponenKustom: ${komponens.length} rows`)
    for (const r of komponens) {
      await prisma.komponenKustom.upsert({
        where: { id: r.id },
        create: { id: r.id, kalkulasiId: r.kalkulasiId, nama: r.nama, harga: r.harga, qty: r.qty ?? 1 },
        update: {},
      })
    }
  }

  // ── KalkulasiProduk ────────────────────────────────────
  const kalkulasiProduks = rows("KalkulasiProduk")
  if (kalkulasiProduks.length) {
    console.log(`KalkulasiProduk: ${kalkulasiProduks.length} rows`)
    for (const r of kalkulasiProduks) {
      await prisma.kalkulasiProduk.upsert({
        where: { id: r.id },
        create: { id: r.id, kalkulasiId: r.kalkulasiId, shopeeItemId: r.shopeeItemId ?? null, namaManual: r.namaManual ?? null, isPrimary: r.isPrimary === 1 },
        update: {},
      })
    }
  }

  // ── ProdukInternal ─────────────────────────────────────
  const produks = rows("ProdukInternal")
  if (produks.length) {
    console.log(`ProdukInternal: ${produks.length} rows`)
    for (const r of produks) {
      await prisma.produkInternal.upsert({
        where: { id: r.id },
        create: { id: r.id, nama: r.nama, deskripsi: r.deskripsi ?? null, kategori: r.kategori ?? null, tags: r.tags ?? null, sourceModel: r.sourceModel ?? null, imageUrl: r.imageUrl ?? null, primaryKalkulasiId: r.primaryKalkulasiId ?? null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── ProdukHistory ──────────────────────────────────────
  const produkHistories = rows("ProdukHistory")
  if (produkHistories.length) {
    console.log(`ProdukHistory: ${produkHistories.length} rows`)
    for (const r of produkHistories) {
      await prisma.produkHistory.upsert({
        where: { id: r.id },
        create: { id: r.id, produkInternalId: r.produkInternalId, tanggal: new Date(r.tanggal), qty: r.qty, catatan: r.catatan ?? null, kalkulasiId: r.kalkulasiId ?? null, createdAt: new Date(r.createdAt) },
        update: {},
      })
    }
  }

  // ── ProdukInternalShopeeLink ───────────────────────────
  const shopeeLinks = rows("ProdukInternalShopeeLink")
  if (shopeeLinks.length) {
    console.log(`ProdukInternalShopeeLink: ${shopeeLinks.length} rows`)
    for (const r of shopeeLinks) {
      await prisma.produkInternalShopeeLink.upsert({
        where: { id: r.id },
        create: { id: r.id, produkInternalId: r.produkInternalId, shopeeItemId: r.shopeeItemId, shopeeModelId: r.shopeeModelId ?? null, kalkulasiId: r.kalkulasiId ?? null, namaProduk: r.namaProduk ?? null },
        update: {},
      })
    }
  }

  // ── Quotation ──────────────────────────────────────────
  const quotations = rows("Quotation")
  if (quotations.length) {
    console.log(`Quotation: ${quotations.length} rows`)
    for (const r of quotations) {
      await prisma.quotation.upsert({
        where: { id: r.id },
        create: { id: r.id, nomor: r.nomor, buyerNama: r.buyerNama, buyerContact: r.buyerContact ?? null, catatan: r.catatan ?? null, status: r.status ?? "DRAFT", tanggal: new Date(r.tanggal), dueDate: r.dueDate ? new Date(r.dueDate) : null, ongkir: r.ongkir ?? 0, shopeeOrderSn: r.shopeeOrderSn ?? null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── InvoicePayment ─────────────────────────────────────
  const payments = rows("InvoicePayment")
  if (payments.length) {
    console.log(`InvoicePayment: ${payments.length} rows`)
    for (const r of payments) {
      await prisma.invoicePayment.upsert({
        where: { id: r.id },
        create: { id: r.id, quotationId: r.quotationId, tanggal: new Date(r.tanggal), jumlah: r.jumlah, metode: r.metode ?? "Transfer", catatan: r.catatan ?? null, createdAt: new Date(r.createdAt) },
        update: {},
      })
    }
  }

  // ── QuotationItem ──────────────────────────────────────
  const quotationItems = rows("QuotationItem")
  if (quotationItems.length) {
    console.log(`QuotationItem: ${quotationItems.length} rows`)
    for (const r of quotationItems) {
      await prisma.quotationItem.upsert({
        where: { id: r.id },
        create: { id: r.id, quotationId: r.quotationId, produkInternalId: r.produkInternalId ?? null, namaProduk: r.namaProduk, qty: r.qty ?? 1, hargaPerUnit: r.hargaPerUnit, channelHarga: r.channelHarga ?? "marketplace", catatan: r.catatan ?? null },
        update: {},
      })
    }
  }

  // ── PurchaseOrder ──────────────────────────────────────
  const purchaseOrders = rows("PurchaseOrder")
  if (purchaseOrders.length) {
    console.log(`PurchaseOrder: ${purchaseOrders.length} rows`)
    for (const r of purchaseOrders) {
      await prisma.purchaseOrder.upsert({
        where: { id: r.id },
        create: { id: r.id, nomor: r.nomor ?? null, vendorNama: r.vendorNama, tanggal: new Date(r.tanggal), status: r.status ?? "DRAFT", catatan: r.catatan ?? null, ongkir: r.ongkir ?? 0, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) },
        update: {},
      })
    }
  }

  // ── PurchaseOrderItem ──────────────────────────────────
  const poItems = rows("PurchaseOrderItem")
  if (poItems.length) {
    console.log(`PurchaseOrderItem: ${poItems.length} rows`)
    for (const r of poItems) {
      await prisma.purchaseOrderItem.upsert({
        where: { id: r.id },
        create: { id: r.id, poId: r.poId, namaProduct: r.namaProduct, kode: r.kode ?? null, qty: r.qty, uom: r.uom ?? "EA", harga: r.harga, diskon: r.diskon ?? 0, total: r.total, isFilament: r.isFilament === 1, brand: r.brand ?? null, material: r.material ?? null, colorName: r.colorName ?? null, filamentCatalogId: r.filamentCatalogId ?? null },
        update: {},
      })
    }
  }

  console.log("\n✅ Migration complete!")
  await prisma.$disconnect()
  sqlite.close()
}

migrate().catch((e) => {
  console.error("❌ Migration failed:", e)
  process.exit(1)
})
