import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
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
  } catch {
    // already exists / already owned — fine
  }
  bucketEnsured = true
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
  } catch {
    // idempotent delete
  }
}
