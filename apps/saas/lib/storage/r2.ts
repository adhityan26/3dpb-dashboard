import { AwsClient } from "aws4fetch";

export class R2NotConfigured extends Error {
  constructor() { super("r2_not_configured"); }
}

export function r2Config(): { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string } {
  const accountId = process.env.R2_ACCOUNT_ID ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  const bucket = process.env.R2_BUCKET ?? "";
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new R2NotConfigured();
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function clientAndUrl(key: string) {
  const { accountId, accessKeyId, secretAccessKey, bucket } = r2Config();
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  return { client, url };
}

export async function putProof(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
  const { client, url } = clientAndUrl(key);
  // TS 5.7+ menganggap Uint8Array<ArrayBufferLike> tak persis BodyInit; keduanya valid BufferSource saat runtime.
  const res = await client.fetch(url, { method: "PUT", body: body as BodyInit, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`r2_put_failed_${res.status}`);
}

export async function getProof(key: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const { client, url } = clientAndUrl(key);
  const res = await client.fetch(url, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`r2_get_failed_${res.status}`);
  return { body: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}
