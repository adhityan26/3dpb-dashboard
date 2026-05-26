/**
 * One-time import: lightgenerator PostgreSQL DB → Sanity
 *
 * Downloads images from MinIO and uploads as proper Sanity assets.
 * Must run inside the shopee-dashboard container (or with MinIO accessible).
 *
 * Usage:
 *   LIGHTGENERATOR_DB_URL=postgresql://postgres:<pass>@light-generator-postgres-1:5432/lightgenerator \
 *   SANITY_PROJECT_ID=<id> \
 *   SANITY_DATASET=production \
 *   SANITY_WRITE_TOKEN=<token> \
 *   MINIO_ENDPOINT=http://minio:9000 \
 *   MINIO_ACCESS_KEY=<key> \
 *   MINIO_SECRET_KEY=<secret> \
 *   MINIO_BUCKET=lamp-orders \
 *   node scripts/import-lg-to-sanity.mjs
 *
 * Idempotent: uses createOrReplace so safe to re-run.
 * Skips image upload if the Sanity document already has an asset ref.
 */

import pkg from "pg"
const { Client } = pkg

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { createClient } from "@sanity/client"

// ── env ───────────────────────────────────────────────────────────────────────

const srcUrl        = process.env.LIGHTGENERATOR_DB_URL
const projectId     = process.env.SANITY_PROJECT_ID
const dataset       = process.env.SANITY_DATASET       ?? "production"
const apiVersion    = process.env.SANITY_API_VERSION   ?? "2024-10-01"
const writeToken    = process.env.SANITY_WRITE_TOKEN
const minioEndpoint = process.env.MINIO_ENDPOINT       ?? "http://minio:9000"
const minioAccess   = process.env.MINIO_ACCESS_KEY
const minioSecret   = process.env.MINIO_SECRET_KEY
const minioBucket   = process.env.MINIO_BUCKET         ?? "lamp-orders"

for (const [name, val] of Object.entries({ LIGHTGENERATOR_DB_URL: srcUrl, SANITY_PROJECT_ID: projectId, SANITY_WRITE_TOKEN: writeToken, MINIO_ACCESS_KEY: minioAccess, MINIO_SECRET_KEY: minioSecret })) {
  if (!val) { console.error(`❌ ${name} is not set`); process.exit(1) }
}

// ── clients ───────────────────────────────────────────────────────────────────

const db = new Client({ connectionString: srcUrl })

const sanity = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: writeToken,
})

const s3 = new S3Client({
  endpoint: minioEndpoint,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: minioAccess,
    secretAccessKey: minioSecret,
  },
})

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Download object from MinIO and return as Buffer.
 * Returns null if the key is empty or the object doesn't exist.
 */
async function downloadFromMinio(key) {
  if (!key) return null
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: minioBucket, Key: key }))
    const bytes = await res.Body.transformToByteArray()
    return Buffer.from(bytes)
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      console.warn(`  ⚠️  MinIO key not found: ${key}`)
      return null
    }
    throw err
  }
}

/**
 * Upload a buffer to Sanity as an image asset.
 * Returns the Sanity asset _id (e.g. "image-abc123-800x600-jpg").
 */
async function uploadToSanity(buffer, filename) {
  const asset = await sanity.assets.upload("image", buffer, { filename })
  return asset._id
}

/**
 * Build a Sanity image reference object from an asset _id.
 */
function imageRef(assetId) {
  return {
    _type: "image",
    asset: { _type: "reference", _ref: assetId },
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  await db.connect()
  console.log("🚀 Starting lightgenerator → Sanity import\n")

  const { rows } = await db.query(`
    SELECT
      id,
      status,
      size,
      shape,
      customer_name         AS "customerName",
      customer_contact      AS "customerContact",
      notes_customer        AS "notesCustomer",
      config_json           AS "configJson",
      image_path            AS "imagePath",
      additional_image_path AS "additionalImagePath",
      created_at            AS "createdAt"
    FROM orders
    ORDER BY created_at ASC
  `)

  console.log(`Found ${rows.length} orders\n`)

  let imported = 0
  let skipped  = 0

  for (const row of rows) {
    const docId = `lg-order-${row.id}`
    process.stdout.write(`[${row.id}] ${row.customerName} … `)

    try {
      // Parse config_json
      let cfg = {}
      try {
        cfg = typeof row.configJson === "string"
          ? JSON.parse(row.configJson)
          : (row.configJson ?? {})
      } catch {
        console.warn(`  ⚠️  Could not parse config_json for ${row.id}`)
      }

      // Check if doc already exists (to skip re-uploading images)
      const existing = await sanity.getDocument(docId)

      // Upload silhouette image (main image)
      let silhouetteImage = existing?.silhouetteImage ?? null
      if (!silhouetteImage && row.imagePath) {
        process.stdout.write("⬇️ silhouette… ")
        const buf = await downloadFromMinio(row.imagePath)
        if (buf) {
          const filename = row.imagePath.split("/").pop() ?? `silhouette-${row.id}.jpg`
          const assetId  = await uploadToSanity(buf, filename)
          silhouetteImage = imageRef(assetId)
          process.stdout.write("✅ ")
        }
      }

      // Upload floor insert image (additional image)
      let floorInsertImage = existing?.floorInsertImage ?? null
      if (!floorInsertImage && row.additionalImagePath) {
        process.stdout.write("⬇️ floor… ")
        const buf = await downloadFromMinio(row.additionalImagePath)
        if (buf) {
          const filename = row.additionalImagePath.split("/").pop() ?? `floor-${row.id}.jpg`
          const assetId  = await uploadToSanity(buf, filename)
          floorInsertImage = imageRef(assetId)
          process.stdout.write("✅ ")
        }
      }

      // Require silhouette image — it's mandatory in Sanity schema
      if (!silhouetteImage) {
        console.warn(`\n  ⚠️  No silhouette image for ${row.id} — skipping`)
        skipped++
        continue
      }

      const doc = {
        _id:              docId,
        _type:            "lightGeneratorOrder",
        orderId:          row.id,
        status:           row.status ?? "submitted",
        customerName:     row.customerName,
        customerContact:  row.customerContact,
        ...(row.notesCustomer ? { customerNotes: row.notesCustomer } : {}),
        // size/shape are separate DB columns (config_json is the technical OrderConfig)
        size:             row.size             ?? "M",
        shape:            row.shape            ?? "circle",
        // shapeRatio is encoded in flooring_shape: "rect:w:h" or "oval:w:h"
        ...((() => {
          const fs = cfg.flooring_shape
          if (!fs) return {}
          const parts = fs.split(":")
          if ((parts[0] === "rect" || parts[0] === "oval") && parts.length === 3) {
            const w = Number(parts[1]), h = Number(parts[2])
            if (w > 0 && h > 0) return { shapeRatio: { width: w, height: h } }
          }
          return {}
        })()),
        // floor_half_size (mm) → shadow diameter (cm): (mm * 2) / 10
        shadowDiameter:   cfg.floor_half_size ? (cfg.floor_half_size * 2) / 10 : 0,
        // shadow_offset_x/y were stored negated; reverse them back to customer values
        shadowOffsetX:    cfg.shadow_offset_x ? -cfg.shadow_offset_x : 0,
        shadowOffsetY:    cfg.shadow_offset_y ? -cfg.shadow_offset_y : 0,
        supportStems:     cfg.support_stems   ?? false,
        // Store the original technical config_json for pre-populating configJsonOperator on confirm
        configJsonRaw:    typeof row.configJson === "string" ? row.configJson : JSON.stringify(row.configJson ?? {}),
        silhouetteImage,
        ...(floorInsertImage ? { floorInsertImage } : {}),
        submittedAt:      row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      }

      await sanity.createOrReplace(doc)
      process.stdout.write("✅ saved\n")
      imported++

    } catch (err) {
      process.stdout.write(`\n  ❌ Error: ${err.message}\n`)
      skipped++
    }
  }

  console.log(`\n✅ Done. Imported: ${imported}, Skipped: ${skipped}`)
  await db.end()
}

run().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
