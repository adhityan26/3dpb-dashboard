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

export interface BinaryMeta {
  version?: string;
  commitHash?: string;
}

// Bucket/kredensial SAMA dengan proof (satu bucket R2 per app) -- cuma prefix key beda
// ("agent/latest/..."). putBinary dipakai admin upload manual (skrip lokal), BUKAN dari
// endpoint publik mana pun. `metadata` (version + commit hash git) disimpan sbg custom
// object metadata R2/S3 (header `x-amz-meta-*`) -- dibaca balik oleh getBinary/headBinary
// supaya endpoint download & halaman Settings tahu persis build mana yang lagi ke-host,
// tanpa perlu file metadata terpisah.
export async function putBinary(
  key: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
  metadata?: BinaryMeta,
): Promise<void> {
  const { client, url } = clientAndUrl(key);
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (metadata?.version) headers["x-amz-meta-version"] = metadata.version;
  if (metadata?.commitHash) headers["x-amz-meta-commit"] = metadata.commitHash;
  const res = await client.fetch(url, { method: "PUT", body: body as BodyInit, headers });
  if (!res.ok) throw new Error(`r2_put_failed_${res.status}`);
}

// `body` diteruskan sbg STREAM (bukan `await res.arrayBuffer()`) -- binary installer Agent
// ~100-120MB, buffer-penuh-dulu bikin route penunggu diam berdetik-detik (narik seluruh file
// dari R2 ke memori server) SEBELUM byte pertama nyampe browser: progress bar download browser
// gak muncul sampai transfer server<->R2 kelar semua, kelihatan kayak "nggak kejadian apa-apa".
// Streaming: route pipe body ini langsung ke NextResponse, byte pertama nyampe browser begitu
// R2 mulai kirim. Cuma dipakai satu-satunya konsumen (binary download route) -- tak ada
// konsumen lain yang butuh varian buffered.
export async function getBinary(key: string): Promise<({ body: ReadableStream<Uint8Array>; contentType: string; contentLength: number | null } & BinaryMeta) | null> {
  const { client, url } = clientAndUrl(key);
  const res = await client.fetch(url, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`r2_get_failed_${res.status}`);
  const contentLengthHeader = res.headers.get("content-length");
  return {
    body: res.body as ReadableStream<Uint8Array>,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    contentLength: contentLengthHeader ? Number(contentLengthHeader) : null,
    version: res.headers.get("x-amz-meta-version") ?? undefined,
    commitHash: res.headers.get("x-amz-meta-commit") ?? undefined,
  };
}

// Metadata-only (HEAD, tak ada body) -- dipakai halaman Settings buat tampilkan "build
// tersedia saat ini" tanpa harus download seluruh installer (~100MB) cuma buat baca versi.
export async function headBinary(key: string): Promise<BinaryMeta | null> {
  const { client, url } = clientAndUrl(key);
  const res = await client.fetch(url, { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`r2_head_failed_${res.status}`);
  return {
    version: res.headers.get("x-amz-meta-version") ?? undefined,
    commitHash: res.headers.get("x-amz-meta-commit") ?? undefined,
  };
}

export async function putLog(key: string, body: ArrayBuffer): Promise<void> {
  const { client, url } = clientAndUrl(key);
  const res = await client.fetch(url, { method: "PUT", body, headers: { "Content-Type": "text/plain" } });
  if (!res.ok) throw new Error(`r2_put_failed_${res.status}`);
}
