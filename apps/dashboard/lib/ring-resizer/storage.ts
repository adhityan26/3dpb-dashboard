import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  NoSuchKey,
  BucketAlreadyOwnedByYou,
  BucketAlreadyExists,
} from "@aws-sdk/client-s3"
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
