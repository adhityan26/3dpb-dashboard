import {
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

/** Key for a processed-result ZIP in the results/ prefix. */
export function ringResultKey(id: string): string {
  return `results/${id}.zip`
}

export async function uploadRingZip(id: string, body: Uint8Array): Promise<void> {
  await ensureBucket()
  await getMinioClient().send(
    new PutObjectCommand({
      Bucket: RING_BUCKET,
      Key: ringResultKey(id),
      Body: body,
      ContentType: "application/zip",
    }),
  )
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
