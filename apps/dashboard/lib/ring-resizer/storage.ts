import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  type LifecycleRule,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  NoSuchKey,
  S3Client,
  BucketAlreadyOwnedByYou,
  BucketAlreadyExists,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getMinioClient } from "@/lib/minio"
import { ZIP_TAIL_BYTES, zipEntryNamesFromTail } from "./zip-index"

export const RING_BUCKET = process.env.RING_BUCKET ?? "ring-models"

export function ringPartKey(modelId: string, partId: string): string {
  return `${modelId}/${partId}.stl`
}

let bucketEnsured = false
async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return
  try {
    await getMinioClient().send(new CreateBucketCommand({ Bucket: RING_BUCKET }))
    bucketEnsured = true
  } catch (err) {
    if (err instanceof BucketAlreadyOwnedByYou || err instanceof BucketAlreadyExists) {
      // already exists / already owned — fine, the bucket is usable
      bucketEnsured = true
      return
    }
    // Unexpected failure (e.g. network/auth error) — don't poison the flag.
    // A subsequent put/get will surface the real error on its own.
  }
}

export async function uploadRingStl(modelId: string, partId: string, body: Buffer): Promise<void> {
  await ensureBucket()
  await getMinioClient().send(
    new PutObjectCommand({
      Bucket: RING_BUCKET,
      Key: ringPartKey(modelId, partId),
      Body: body,
      ContentType: "model/stl",
    }),
  )
}

export async function downloadRingStl(modelId: string, partId: string): Promise<Buffer> {
  const res = await getMinioClient().send(
    new GetObjectCommand({ Bucket: RING_BUCKET, Key: ringPartKey(modelId, partId) }),
  )
  if (!res.Body) throw new Error("empty object body")
  return Buffer.from(await res.Body.transformToByteArray())
}

export async function deleteRingStl(modelId: string, partId: string): Promise<void> {
  try {
    await getMinioClient().send(
      new DeleteObjectCommand({ Bucket: RING_BUCKET, Key: ringPartKey(modelId, partId) }),
    )
  } catch (err) {
    if (err instanceof NoSuchKey) return
    throw err
  }
}

/** Days a processed-result ZIP is kept before MinIO deletes it. */
export const RESULT_RETENTION_DAYS = 3
const RESULT_LIFECYCLE_RULE_ID = "expire-results"

/**
 * MinIO lifecycle rule that expires results/ after RESULT_RETENTION_DAYS —
 * the storage server does the cleanup, no app-side timer. Put replaces the
 * whole bucket config, so other rules are read and kept. Applied once per
 * process; failures are logged and retried on the next upload.
 */
let lifecycleEnsured = false
export async function ensureResultLifecycle(): Promise<void> {
  if (lifecycleEnsured) return
  const client = getMinioClient()
  try {
    let rules: LifecycleRule[] = []
    try {
      const cur = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: RING_BUCKET }))
      rules = cur.Rules ?? []
    } catch (err) {
      if ((err as { name?: string }).name !== "NoSuchLifecycleConfiguration") throw err
    }
    const ours = rules.find((r) => r.ID === RESULT_LIFECYCLE_RULE_ID)
    if (ours?.Expiration?.Days !== RESULT_RETENTION_DAYS || ours.Filter?.Prefix !== "results/") {
      await client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: RING_BUCKET,
          LifecycleConfiguration: {
            Rules: [
              ...rules.filter((r) => r.ID !== RESULT_LIFECYCLE_RULE_ID),
              {
                ID: RESULT_LIFECYCLE_RULE_ID,
                Status: "Enabled",
                Filter: { Prefix: "results/" },
                Expiration: { Days: RESULT_RETENTION_DAYS },
              },
            ],
          },
        }),
      )
    }
    lifecycleEnsured = true
  } catch (err) {
    console.error("[ring-resizer] failed to set results lifecycle rule:", err)
  }
}

/** Key for a processed-result ZIP in the results/ prefix. */
export function ringResultKey(id: string): string {
  return `results/${id}.zip`
}

/** Descriptive metadata stored on a result ZIP (ASCII-safe values only). */
export interface RingResultMeta {
  fileName: string
  model: string
  label: string
}

export async function uploadRingZip(id: string, body: Uint8Array, meta?: RingResultMeta): Promise<void> {
  await ensureBucket()
  await ensureResultLifecycle()
  await getMinioClient().send(
    new PutObjectCommand({
      Bucket: RING_BUCKET,
      Key: ringResultKey(id),
      Body: body,
      ContentType: "application/zip",
      Metadata: meta ? { filename: meta.fileName, model: meta.model, label: meta.label } : undefined,
    }),
  )
}

export interface RingResultInfo {
  id: string
  lastModified: string
  sizeBytes: number
  /** STL entry names inside the ZIP ([] when unreadable). */
  entries: string[]
  /** From object metadata; null for results stored before metadata existed. */
  fileName: string | null
  model: string | null
  label: string | null
}

const RESULT_KEY_RE = /^results\/([0-9a-f-]{36})\.zip$/

/** Newest result ZIPs first, with entry names read from each ZIP's tail. */
export async function listRingResults(limit: number): Promise<RingResultInfo[]> {
  const client = getMinioClient()
  const objects: { id: string; lastModified: Date; size: number }[] = []
  let token: string | undefined
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: RING_BUCKET, Prefix: "results/", ContinuationToken: token }),
    )
    for (const o of page.Contents ?? []) {
      const m = o.Key ? RESULT_KEY_RE.exec(o.Key) : null
      if (m && o.LastModified && o.Size) objects.push({ id: m[1], lastModified: o.LastModified, size: o.Size })
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)

  objects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
  return Promise.all(
    objects.slice(0, limit).map(async (o) => {
      const key = ringResultKey(o.id)
      const start = Math.max(0, o.size - ZIP_TAIL_BYTES)
      let entries: string[] = []
      let meta: Record<string, string> = {}
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: RING_BUCKET, Key: key, Range: `bytes=${start}-${o.size - 1}` }),
        )
        meta = res.Metadata ?? {}
        if (res.Body) entries = zipEntryNamesFromTail(Buffer.from(await res.Body.transformToByteArray()), o.size)
      } catch {
        // unreadable tail — list the file anyway with unknown contents
      }
      return {
        id: o.id,
        lastModified: o.lastModified.toISOString(),
        sizeBytes: o.size,
        entries,
        fileName: meta.filename ?? null,
        model: meta.model ?? null,
        label: meta.label ?? null,
      }
    }),
  )
}

/** Delete a result ZIP; S3 DeleteObject is idempotent, so a missing key is not an error. */
export async function deleteRingZip(id: string): Promise<void> {
  await getMinioClient().send(new DeleteObjectCommand({ Bucket: RING_BUCKET, Key: ringResultKey(id) }))
}

export async function downloadRingZip(id: string): Promise<Buffer> {
  const res = await getMinioClient().send(
    new GetObjectCommand({ Bucket: RING_BUCKET, Key: ringResultKey(id) }),
  )
  if (!res.Body) throw new Error("empty object body")
  return Buffer.from(await res.Body.transformToByteArray())
}

// Presigning may target a different host than the server-side client uses:
// MINIO_PUBLIC_ENDPOINT (e.g. an https reverse-proxied hostname, or the NAS
// LAN address) is what ends up in the URL the BROWSER opens. Defaults to
// MINIO_ENDPOINT — the LAN NAS address — which is exactly the "direct, not
// via the app/tunnel" path when the operator is on the local network.
let presignClient: S3Client | null = null
function getPresignClient(): S3Client {
  const pub = process.env.MINIO_PUBLIC_ENDPOINT
  if (!pub) return getMinioClient()
  if (!presignClient) {
    presignClient = new S3Client({
      endpoint: pub,
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
      },
      forcePathStyle: true,
    })
  }
  return presignClient
}

/** Presigned direct-download URL for a result ZIP (default 1 hour). */
export async function presignRingZipUrl(
  id: string,
  fileName: string,
  expiresInSeconds = 3600,
): Promise<string> {
  return getSignedUrl(
    getPresignClient(),
    new GetObjectCommand({
      Bucket: RING_BUCKET,
      Key: ringResultKey(id),
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
      ResponseContentType: "application/zip",
    }),
    { expiresIn: expiresInSeconds },
  )
}
