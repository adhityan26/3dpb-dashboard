import { S3Client } from "@aws-sdk/client-s3"

// Lazy singleton — build-time safe (env vars may not be present during docker build)
let _client: S3Client | null = null

export function getMinioClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
      },
      forcePathStyle: true, // required for MinIO
    })
  }
  return _client
}

export const LG_BUCKET = process.env.MINIO_BUCKET ?? "lamp-orders"
