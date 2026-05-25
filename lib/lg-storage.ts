import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getMinioClient, LG_BUCKET } from "./minio"

/** Upload raw bytes to MinIO. Returns the MinIO object key. */
export async function uploadToMinio(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const client = getMinioClient()
  await client.send(
    new PutObjectCommand({
      Bucket: LG_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  return key
}

/** Download object from MinIO as a Buffer. */
export async function downloadFromMinio(key: string): Promise<Buffer> {
  const client = getMinioClient()
  const res = await client.send(
    new GetObjectCommand({ Bucket: LG_BUCKET, Key: key }),
  )
  if (!res.Body) throw new Error(`MinIO: empty body for key ${key}`)
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Generate a presigned GET URL for a MinIO object (default: 1 hour). */
export async function getPresignedUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getMinioClient()
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: LG_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  )
}

/** Delete an object from MinIO. Silently ignores NoSuchKey errors. */
export async function deleteFromMinio(key: string): Promise<void> {
  const client = getMinioClient()
  try {
    await client.send(new DeleteObjectCommand({ Bucket: LG_BUCKET, Key: key }))
  } catch (err: unknown) {
    const e = err as { name?: string }
    if (e?.name !== "NoSuchKey") throw err
  }
}
