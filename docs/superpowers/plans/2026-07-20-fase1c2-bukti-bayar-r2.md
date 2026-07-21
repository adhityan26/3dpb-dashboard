# Fase 1c-2: Bukti Bayar (Upload Foto → R2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Saya sudah bayar" di `/beli` wajib upload foto bukti transfer; foto disimpan di Cloudflare R2 dan tampil di antrian aktivasi admin + halaman status user.

**Architecture:** Foto dikompres di browser (canvas → JPEG ~1280px) → `FormData` ke route mark-paid → di-`PUT` ke R2 lewat `aws4fetch` (SigV4) → object key disimpan di `Payment.proofKey`. Ditampilkan lewat endpoint proxy ber-auth `GET /api/beli/[id]/proof` (owner ATAU user pemilik) yang GetObject dari R2 lalu stream. Bucket punya lifecycle auto-hapus 60 hari.

**Tech Stack:** Next.js 16 (App Router route handlers), Prisma/Postgres, `aws4fetch`, vitest + jsdom + @testing-library/react.

## Global Constraints

- **Node 22 wajib** — prefix tiap shell command: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
- **Upload dulu, baru markPaid.** Jika `putProof` gagal / R2 tak terkonfigurasi, `markPaid` TIDAK boleh dipanggil (jangan pernah "diklaim bayar" tanpa bukti).
- **Foto WAJIB:** route tolak request tanpa file (400 `bukti_wajib`); tombol client disabled sampai file dipilih.
- **Validasi server:** mime ∈ `image/jpeg`, `image/png`, `image/webp`; ukuran ≤ **5MB** (5 \* 1024 \* 1024). Selain itu 400.
- **Env R2 absen → 503** (`R2NotConfigured`), fitur lain tetap jalan. Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
- **Object key:** `proofs/<paymentId>.jpg`.
- **Izin endpoint proof:** `isOwner(email)` ATAU `payment.userId === session.user.id`; selain itu **404** (jangan 403).
- **Kredensial:** controller TIDAK mengisi kredensial R2 — user paste sendiri ke `.env.deploy`. Jangan commit nilai asli ke `.env.deploy.example` (placeholder saja).
- **Bahasa Indonesia** semua copy UI. Nama paket di copy = **"Pro"** (bukan "Beli"; "beli/bayar" hanya aksi).
- Deploy homelab :3300 = **GATED**.

---

### Task 1: Schema `proofKey`/`proofType` + `markPaid` simpan bukti

**Files:**
- Modify: `apps/saas/prisma/schema.prisma` (model `Payment`)
- Modify: `apps/saas/lib/payment/service.ts`
- Test: `apps/saas/lib/payment/service.test.ts` (append; file sudah ada dari 1c)

**Interfaces:**
- Consumes: `prisma`, model `Payment` existing.
- Produces: `Payment.proofKey?: string`, `Payment.proofType?: string`; `markPaid(id, userId, proof: { proofKey: string; proofType: string }, now?)`; `listPending` ikut mengembalikan `proofKey`.

- [ ] **Step 1: Write the failing test** — append ke `apps/saas/lib/payment/service.test.ts`:

```ts
describe("1c-2 markPaid simpan bukti", () => {
  it("menyimpan paidMarkedAt + proofKey + proofType", async () => {
    const now = new Date("2026-07-20T10:00:00Z");
    prismaMock.payment.findFirst.mockResolvedValue({ id: "p1", userId: "u1", status: "PENDING" });
    await markPaid("p1", "u1", { proofKey: "proofs/p1.jpg", proofType: "image/jpeg" }, now);
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { paidMarkedAt: now, proofKey: "proofs/p1.jpg", proofType: "image/jpeg" },
    });
  });
  it("tetap tolak payment bukan milik user", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(null);
    await expect(markPaid("p1", "lain", { proofKey: "k", proofType: "image/jpeg" })).rejects.toThrow("not_found");
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });
});
```

(Sesuaikan nama mock prisma dengan pola yang sudah dipakai file test itu — baca dulu bagian atas file dan ikuti gaya mock existing. Kalau file test belum ada, buat dengan pola mock `vi.mock("@/lib/db")` seperti test 1c lain.)

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: FAIL (markPaid belum terima param proof / update tanpa proofKey).

- [ ] **Step 3: Implement**

`apps/saas/prisma/schema.prisma` — tambahkan dua field ke model `Payment` (setelah `verifiedBy`):
```prisma
  proofKey     String?
  proofType    String?
```

`apps/saas/lib/payment/service.ts` — ubah `markPaid`:
```ts
export async function markPaid(
  id: string,
  userId: string,
  proof: { proofKey: string; proofType: string },
  now = new Date(),
): Promise<void> {
  const p = await prisma.payment.findFirst({
    where: { id, userId, status: "PENDING", createdAt: { gt: liveSince(now) } },
  });
  if (!p) throw new Error("not_found");
  await prisma.payment.update({
    where: { id },
    data: { paidMarkedAt: now, proofKey: proof.proofKey, proofType: proof.proofType },
  });
}
```
Pastikan `listPending` mengembalikan `proofKey` (kalau pakai `select` eksplisit, tambahkan `proofKey: true`; kalau mengembalikan row penuh, tak perlu diubah).

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: PASS. Catatan: pemanggil lama `markPaid(id, userId)` akan gagal typecheck — itu diperbaiki di Task 4 (route). Kalau `pnpm --filter @3pb/saas build` dijalankan sekarang ia bisa merah; itu wajar dan selesai setelah Task 4.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/prisma/schema.prisma apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts
git commit -m "feat(saas): Payment.proofKey/proofType + markPaid simpan bukti (TDD)"
```

---

### Task 2: Modul R2 (`aws4fetch`)

**Files:**
- Create: `apps/saas/lib/storage/r2.ts`
- Test: `apps/saas/lib/storage/r2.test.ts`
- Modify: `apps/saas/package.json` (dep `aws4fetch`)

**Interfaces:**
- Produces: `class R2NotConfigured extends Error`; `r2Config(): {accountId,accessKeyId,secretAccessKey,bucket}`; `putProof(key, body: ArrayBuffer|Uint8Array, contentType): Promise<void>`; `getProof(key): Promise<{ body: ArrayBuffer; contentType: string } | null>`.

- [ ] **Step 1: Write the failing test** — create `apps/saas/lib/storage/r2.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("aws4fetch", () => ({
  AwsClient: class { fetch = (...a: unknown[]) => fetchMock(...a); },
}));

import { r2Config, putProof, getProof, R2NotConfigured } from "./r2";

const ENV = { ...process.env };
beforeEach(() => {
  fetchMock.mockReset();
  process.env.R2_ACCOUNT_ID = "acc123";
  process.env.R2_ACCESS_KEY_ID = "ak";
  process.env.R2_SECRET_ACCESS_KEY = "sk";
  process.env.R2_BUCKET = "slizebiz-proofs";
});
afterEach(() => { process.env = { ...ENV }; });

describe("r2Config", () => {
  it("baca env lengkap", () => {
    expect(r2Config()).toEqual({ accountId: "acc123", accessKeyId: "ak", secretAccessKey: "sk", bucket: "slizebiz-proofs" });
  });
  it("throw R2NotConfigured bila env kurang", () => {
    delete process.env.R2_SECRET_ACCESS_KEY;
    expect(() => r2Config()).toThrow(R2NotConfigured);
  });
});

describe("putProof", () => {
  it("PUT ke URL bucket/key dg Content-Type", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await putProof("proofs/p1.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://acc123.r2.cloudflarestorage.com/slizebiz-proofs/proofs/p1.jpg");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("image/jpeg");
  });
  it("throw bila respons tak ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(putProof("k", new Uint8Array(), "image/jpeg")).rejects.toThrow();
  });
});

describe("getProof", () => {
  it("kembalikan body + contentType", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: async () => new ArrayBuffer(3),
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "image/png" : null) },
    });
    const out = await getProof("proofs/p1.jpg");
    expect(out?.contentType).toBe("image/png");
    expect(out?.body.byteLength).toBe(3);
  });
  it("null bila 404", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    expect(await getProof("hilang.jpg")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/storage/r2.test.ts`
Expected: FAIL (`./r2` not found).

- [ ] **Step 3: Implement**

Tambah dep:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter @3pb/saas add aws4fetch
```

Create `apps/saas/lib/storage/r2.ts`:
```ts
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
  const res = await client.fetch(url, { method: "PUT", body, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`r2_put_failed_${res.status}`);
}

export async function getProof(key: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const { client, url } = clientAndUrl(key);
  const res = await client.fetch(url, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`r2_get_failed_${res.status}`);
  return { body: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/storage/r2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/storage/r2.ts apps/saas/lib/storage/r2.test.ts apps/saas/package.json pnpm-lock.yaml
git commit -m "feat(saas): modul R2 put/getProof via aws4fetch + guard R2NotConfigured (TDD)"
```

---

### Task 3: Helper kompres gambar (client)

**Files:**
- Create: `apps/saas/lib/image/compress.ts`
- Test: `apps/saas/lib/image/compress.test.ts`

**Interfaces:**
- Produces: `fitDimensions(w: number, h: number, maxSide: number): { w: number; h: number }` (pure, teruji); `compressImage(file: File, maxSide?: number, quality?: number): Promise<Blob>` (browser-only, pakai canvas).

- [ ] **Step 1: Write the failing test** — create `apps/saas/lib/image/compress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fitDimensions } from "./compress";

describe("fitDimensions", () => {
  it("tak mengubah bila sudah di bawah maks", () => {
    expect(fitDimensions(800, 600, 1280)).toEqual({ w: 800, h: 600 });
  });
  it("skala turun berdasar sisi terpanjang (landscape)", () => {
    expect(fitDimensions(2560, 1440, 1280)).toEqual({ w: 1280, h: 720 });
  });
  it("skala turun (portrait)", () => {
    expect(fitDimensions(1000, 2000, 1000)).toEqual({ w: 500, h: 1000 });
  });
  it("bulatkan ke integer", () => {
    const out = fitDimensions(1333, 1000, 1000);
    expect(Number.isInteger(out.w) && Number.isInteger(out.h)).toBe(true);
    expect(out.w).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/image/compress.test.ts`
Expected: FAIL (`./compress` not found).

- [ ] **Step 3: Implement** — create `apps/saas/lib/image/compress.ts`:

```ts
export function fitDimensions(w: number, h: number, maxSide: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= maxSide) return { w, h };
  const scale = maxSide / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Kompres gambar di browser: resize ke maxSide lalu encode JPEG. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitDimensions(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("compress_failed");
  return blob;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/image/compress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/image/compress.ts apps/saas/lib/image/compress.test.ts
git commit -m "feat(saas): helper kompres gambar client (fitDimensions + compressImage, TDD)"
```

---

### Task 4: Route mark-paid terima & simpan bukti

**Files:**
- Modify: `apps/saas/app/api/beli/[id]/mark-paid/route.ts`
- Test: `apps/saas/app/api/beli/payment-routes.test.ts` (append)

**Interfaces:**
- Consumes: `putProof`, `R2NotConfigured` (Task 2); `markPaid(id, userId, proof, now?)` (Task 1).
- Produces: `POST` menerima `multipart/form-data` field `bukti`.

- [ ] **Step 1: Write the failing test** — append ke `apps/saas/app/api/beli/payment-routes.test.ts` (ikuti pola mock `auth`/service yang sudah ada di file itu; tambahkan mock `@/lib/storage/r2`):

```ts
describe("1c-2 mark-paid wajib bukti", () => {
  const fd = (file?: File) => { const f = new FormData(); if (file) f.append("bukti", file); return f; };
  const req = (f: FormData) => ({ formData: async () => f }) as unknown as Request;
  const ctx = { params: Promise.resolve({ id: "p1" }) };

  it("tanpa file → 400 bukti_wajib, markPaid tak dipanggil", async () => {
    const res = await POST(req(fd()), ctx);
    expect(res.status).toBe(400);
    expect(markPaidMock).not.toHaveBeenCalled();
  });
  it("mime bukan gambar → 400", async () => {
    const res = await POST(req(fd(new File(["x"], "a.txt", { type: "text/plain" }))), ctx);
    expect(res.status).toBe(400);
    expect(putProofMock).not.toHaveBeenCalled();
  });
  it("sukses → putProof lalu markPaid", async () => {
    const res = await POST(req(fd(new File(["x"], "a.jpg", { type: "image/jpeg" }))), ctx);
    expect(res.status).toBe(200);
    expect(putProofMock).toHaveBeenCalledWith("proofs/p1.jpg", expect.anything(), "image/jpeg");
    expect(markPaidMock).toHaveBeenCalledWith("p1", "u1", { proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
  });
  it("R2 belum dikonfigurasi → 503 dan markPaid TAK dipanggil", async () => {
    putProofMock.mockRejectedValueOnce(new R2NotConfigured());
    const res = await POST(req(fd(new File(["x"], "a.jpg", { type: "image/jpeg" }))), ctx);
    expect(res.status).toBe(503);
    expect(markPaidMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run app/api/beli/payment-routes.test.ts`
Expected: FAIL (route belum parse formData).

- [ ] **Step 3: Implement** — ganti isi `apps/saas/app/api/beli/[id]/mark-paid/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markPaid } from "@/lib/payment/service";
import { putProof, R2NotConfigured } from "@/lib/storage/r2";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("bukti");
    if (f && typeof f !== "string") file = f as File;
  } catch {
    return NextResponse.json({ error: "bukti_wajib" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "bukti_wajib" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "tipe_tidak_didukung" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_terlalu_besar" }, { status: 400 });

  const proofKey = `proofs/${id}.jpg`;
  try {
    await putProof(proofKey, await file.arrayBuffer(), file.type);
  } catch (e) {
    if (e instanceof R2NotConfigured) return NextResponse.json({ error: "upload_belum_aktif" }, { status: 503 });
    return NextResponse.json({ error: "upload_gagal" }, { status: 502 });
  }

  try {
    await markPaid(id, userId, { proofKey, proofType: file.type });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run app/api/beli/payment-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/app/api/beli/\[id\]/mark-paid/route.ts apps/saas/app/api/beli/payment-routes.test.ts
git commit -m "feat(saas): mark-paid wajib bukti — validasi + upload R2 sebelum markPaid (TDD)"
```

---

### Task 5: Endpoint serve bukti (`GET /api/beli/[id]/proof`)

**Files:**
- Create: `apps/saas/app/api/beli/[id]/proof/route.ts`
- Test: `apps/saas/app/api/beli/proof-route.test.ts`

**Interfaces:**
- Consumes: `getProof` (Task 2), `auth`, `isOwner` (`@/lib/owner`), `prisma`.
- Produces: `GET` → stream bytes bukti (200) atau 404.

- [ ] **Step 1: Write the failing test** — create `apps/saas/app/api/beli/proof-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const findUniqueMock = vi.fn();
const getProofMock = vi.fn();
const isOwnerMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/db", () => ({ prisma: { payment: { findUnique: (...a: unknown[]) => findUniqueMock(...a) } } }));
vi.mock("@/lib/storage/r2", () => ({ getProof: (...a: unknown[]) => getProofMock(...a) }));
vi.mock("@/lib/owner", () => ({ isOwner: (...a: unknown[]) => isOwnerMock(...a) }));

import { GET } from "@/app/api/beli/[id]/proof/route";

const ctx = { params: Promise.resolve({ id: "p1" }) };
beforeEach(() => {
  authMock.mockReset(); findUniqueMock.mockReset(); getProofMock.mockReset(); isOwnerMock.mockReset();
  isOwnerMock.mockReturnValue(false);
  getProofMock.mockResolvedValue({ body: new ArrayBuffer(3), contentType: "image/jpeg" });
});

describe("GET proof", () => {
  it("anon → 404", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET({} as Request, ctx)).status).toBe(404);
  });
  it("user pemilik → 200 + content-type", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
    const res = await GET({} as Request, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });
  it("user lain → 404", async () => {
    authMock.mockResolvedValue({ user: { id: "lain", email: "x@y.z" } });
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
    expect((await GET({} as Request, ctx)).status).toBe(404);
  });
  it("owner (admin) → 200", async () => {
    authMock.mockResolvedValue({ user: { id: "adm", email: "owner@x.com" } });
    isOwnerMock.mockReturnValue(true);
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
    expect((await GET({} as Request, ctx)).status).toBe(200);
  });
  it("tanpa proofKey → 404", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: null });
    expect((await GET({} as Request, ctx)).status).toBe(404);
  });
  it("objek sudah hilang di R2 → 404", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
    getProofMock.mockResolvedValue(null);
    expect((await GET({} as Request, ctx)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run app/api/beli/proof-route.test.ts`
Expected: FAIL (route belum ada).

- [ ] **Step 3: Implement** — create `apps/saas/app/api/beli/[id]/proof/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isOwner } from "@/lib/owner";
import { getProof } from "@/lib/storage/r2";

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return notFound();
  const { id } = await ctx.params;

  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p?.proofKey) return notFound();
  if (!isOwner(session.user?.email) && p.userId !== userId) return notFound();

  let obj;
  try {
    obj = await getProof(p.proofKey);
  } catch {
    return notFound();
  }
  if (!obj) return notFound();

  return new NextResponse(obj.body, {
    status: 200,
    headers: {
      "Content-Type": p.proofType ?? obj.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run app/api/beli/proof-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/app/api/beli/\[id\]/proof/route.ts apps/saas/app/api/beli/proof-route.test.ts
git commit -m "feat(saas): endpoint proof ber-auth (owner atau pemilik) stream dari R2 (TDD)"
```

---

### Task 6: BeliCheckout — input file wajib + kirim FormData + thumbnail

**Files:**
- Modify: `apps/saas/components/BeliCheckout.tsx`
- Test: `apps/saas/components/beli-checkout.test.tsx` (append)

**Interfaces:**
- Consumes: `compressImage` (Task 3); route mark-paid (Task 4); endpoint proof (Task 5).

- [ ] **Step 1: Write the failing test** — append ke `apps/saas/components/beli-checkout.test.tsx` (ikuti pola mock fetch/`qrcode` yang sudah ada di file):

```ts
describe("1c-2 bukti wajib", () => {
  it("tombol 'Saya sudah bayar' disabled sebelum pilih file", async () => {
    // render sampai state invoice muncul (ikuti helper/pola file ini)
    const btn = await screen.findByText(/Saya sudah bayar/i);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
  it("pilih file → tombol aktif, submit kirim FormData berisi 'bukti'", async () => {
    const file = new File(["x"], "bukti.jpg", { type: "image/jpeg" });
    const input = await screen.findByLabelText(/bukti/i);
    fireEvent.change(input, { target: { files: [file] } });
    const btn = await screen.findByText(/Saya sudah bayar/i);
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => {
      const call = (globalThis.fetch as any).mock.calls.find((c: unknown[]) => String(c[0]).includes("mark-paid"));
      expect(call).toBeTruthy();
      expect(call[1].body instanceof FormData).toBe(true);
      expect((call[1].body as FormData).get("bukti")).toBeTruthy();
    });
  });
});
```

Mock `compressImage` supaya tak butuh canvas di jsdom:
```ts
vi.mock("@/lib/image/compress", () => ({
  compressImage: async (f: File) => f,
  fitDimensions: (w: number, h: number) => ({ w, h }),
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/beli-checkout.test.tsx`
Expected: FAIL (belum ada input file / tombol tak disabled).

- [ ] **Step 3: Implement** — di `apps/saas/components/BeliCheckout.tsx`:

Tambah import + state:
```ts
import { compressImage } from "@/lib/image/compress";
// ...
const [file, setFile] = useState<File | null>(null);
```

Ganti `sudahBayar`:
```ts
async function sudahBayar() {
  if (!inv || !file) return;
  setPending(true);
  setMsg("");
  try {
    const blob = await compressImage(file);
    const form = new FormData();
    form.append("bukti", new File([blob], "bukti.jpg", { type: "image/jpeg" }));
    const res = await fetch(`/api/beli/${inv.id}/mark-paid`, { method: "POST", body: form });
    if (res.ok) setPaid(true);
    else if (res.status === 503) setMsg("Upload bukti belum aktif. Hubungi admin.");
    else setMsg("Gagal upload bukti, coba lagi.");
  } catch {
    setMsg("Gagal memproses foto, coba lagi.");
  }
  setPending(false);
}
```

Di blok QR (sebelum tombol "Saya sudah bayar"), tambah input file + tombol jadi conditional-disabled:
```tsx
          <label className="text-[12px] g-t3 flex flex-col gap-1">
            Foto bukti transfer (wajib)
            <input type="file" accept="image/*" aria-label="Foto bukti transfer"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-[12px] g-t4" />
          </label>
          {file && <p className="text-[11px] g-t4">Terpilih: {file.name}</p>}
          <GlassButton onClick={sudahBayar} disabled={pending || !file} className="w-full">
            {pending ? "Mengunggah…" : "Saya sudah bayar"}
          </GlassButton>
          {!file && <p className="text-[11px] g-t5">Upload foto bukti transfer dulu untuk melanjutkan.</p>}
```
(Ganti tombol "Saya sudah bayar" yang lama dengan blok di atas.)

Di cabang `paid`, tambahkan thumbnail bukti:
```tsx
        <>
          <p className="text-[13px] g-t2">Terima kasih! Pembayaran kamu sedang <b>diverifikasi admin</b>. Kamu akan dikabari begitu aktif.</p>
          {inv && <img src={`/api/beli/${inv.id}/proof`} alt="Bukti transfer" className="mt-2 rounded-[10px] max-h-48" />}
        </>
```

Pastikan `msg` ditampilkan (kalau belum ada elemen pesan di cabang QR, tambahkan `{msg && <p className="text-[12px] g-t4">{msg}</p>}`).

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/beli-checkout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/BeliCheckout.tsx apps/saas/components/beli-checkout.test.tsx
git commit -m "feat(saas): BeliCheckout upload bukti wajib + thumbnail setelah submit (TDD)"
```

---

### Task 7: Admin PaymentQueue — kolom bukti

**Files:**
- Modify: `apps/saas/components/admin/PaymentQueue.tsx`
- Modify: `apps/saas/app/admin/page.tsx`
- Test: `apps/saas/components/admin/payment-queue.test.tsx` (create bila belum ada)

**Interfaces:**
- Consumes: endpoint proof (Task 5), `listPending` yang kini bawa `proofKey` (Task 1).
- Produces: `PendingRow` + `hasProof: boolean`.

- [ ] **Step 1: Write the failing test** — create/append `apps/saas/components/admin/payment-queue.test.tsx`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentQueue, type PendingRow } from "./PaymentQueue";

const row = (o: Partial<PendingRow> = {}): PendingRow =>
  ({ id: "p1", amount: 149000, who: "a@b.c", ageMin: 5, marked: true, hasProof: true, ...o });

describe("PaymentQueue bukti", () => {
  it("hasProof → tampil img ke endpoint proof", () => {
    render(<PaymentQueue rows={[row()]} />);
    const img = screen.getByAltText(/bukti/i) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/beli/p1/proof");
  });
  it("tanpa bukti → tampil '—', tak ada img", () => {
    render(<PaymentQueue rows={[row({ hasProof: false })]} />);
    expect(screen.queryByAltText(/bukti/i)).toBeNull();
  });
  it("banner peringatan cek mutasi tetap ada", () => {
    render(<PaymentQueue rows={[row()]} />);
    expect(screen.getByText(/mutasi/i)).toBeTruthy();
  });
});
```
(Sesuaikan nama prop `rows` dengan signature `PaymentQueue` yang ada — baca komponennya dulu.)

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/admin/payment-queue.test.tsx`
Expected: FAIL (`hasProof` belum ada di tipe / kolom belum dirender).

- [ ] **Step 3: Implement**

`apps/saas/components/admin/PaymentQueue.tsx` — perluas tipe:
```ts
export type PendingRow = { id: string; amount: number; who: string; ageMin: number; marked: boolean; hasProof: boolean };
```
Tambah header kolom `<th>Bukti</th>` dan sel per baris (sebelum kolom Aksi):
```tsx
              <td className="py-1">
                {r.hasProof ? (
                  <a href={`/api/beli/${r.id}/proof`} target="_blank" rel="noreferrer">
                    <img src={`/api/beli/${r.id}/proof`} alt={`Bukti ${r.who}`} className="h-12 w-12 object-cover rounded-[6px]" />
                  </a>
                ) : (
                  <span className="g-t5">—</span>
                )}
              </td>
```

`apps/saas/app/admin/page.tsx` — tambahkan `hasProof` di map:
```ts
  const pendingRows: PendingRow[] = pending.map((p) => ({
    id: p.id, amount: p.amount, who: whoOf(p.userId),
    ageMin: Math.floor((now.getTime() - p.createdAt.getTime()) / 60000), marked: !!p.paidMarkedAt,
    hasProof: !!p.proofKey,
  }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/admin/payment-queue.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/admin/PaymentQueue.tsx apps/saas/app/admin/page.tsx apps/saas/components/admin/payment-queue.test.tsx
git commit -m "feat(saas): antrian aktivasi admin tampil thumbnail bukti bayar (TDD)"
```

---

### Task 8: Verifikasi akhir + docs (deploy & setup R2 GATED)

**Files:**
- Modify: `apps/saas/README.md`
- Modify: `apps/saas/.env.deploy.example`

- [ ] **Step 1: Tambah env placeholder** — di `apps/saas/.env.deploy.example` tambahkan (PLACEHOLDER saja, jangan nilai asli):
```
R2_ACCOUNT_ID=79cf4805a7bf203e238f754920441f28
R2_ACCESS_KEY_ID=ganti-dengan-r2-access-key-id
R2_SECRET_ACCESS_KEY=ganti-dengan-r2-secret-access-key
R2_BUCKET=slizebiz-proofs
```

- [ ] **Step 2: Update README** — tambahkan di `apps/saas/README.md` setelah baris Payment 1c:
```markdown
- Bukti bayar (1c-2): "Saya sudah bayar" **wajib upload foto** bukti transfer. Foto dikompres di browser (`lib/image/compress.ts`, maks 1280px JPEG) → `POST /api/beli/[id]/mark-paid` (multipart, field `bukti`) → disimpan ke **Cloudflare R2** (`lib/storage/r2.ts` via `aws4fetch`, key `proofs/<id>.jpg`), object key di `Payment.proofKey`. Ditampilkan via `GET /api/beli/[id]/proof` (auth: owner ATAU pemilik) di antrian aktivasi admin & halaman status user. **Bucket punya lifecycle auto-hapus 60 hari.** Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; absen → upload balas 503 (fitur lain tetap jalan).
```

- [ ] **Step 3: Prisma generate + full test**
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter @3pb/saas exec prisma generate
pnpm turbo test
```
Expected: semua paket hijau (saas naik dari 165).

- [ ] **Step 4: Build (gotcha prisma monorepo)**

Client `@prisma/client` dipakai bersama saas & dashboard; app yang di-build FRESH harus di-generate TERAKHIR. saas berubah di fase ini, jadi generate saas terakhir:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/saas && npx prisma generate && cd ../..
pnpm turbo build
```
Expected: 3/3 build sukses.

- [ ] **Step 5: Guard — jangan bocorkan kredensial**

Run: `git diff --stat apps/saas/.env.deploy.example` lalu `grep -nE "R2_(ACCESS|SECRET)" apps/saas/.env.deploy.example`
Expected: hanya PLACEHOLDER (`ganti-dengan-…`). Kalau ada nilai asli, kembalikan ke placeholder sebelum commit.

- [ ] **Step 6: Commit**
```bash
git add apps/saas/README.md apps/saas/.env.deploy.example
git commit -m "docs(saas): catat bukti bayar R2 1c-2 + env placeholder R2"
```

- [ ] **Step 7: Setup R2 & deploy — GATED**

JANGAN jalankan tanpa perintah user. Yang dibutuhkan saat go:
1. Buat bucket `slizebiz-proofs` + **lifecycle rule hapus objek umur > 60 hari** (via dashboard/API Cloudflare).
2. **User** membuat R2 API token (R2 → Manage API tokens) dan mengisi `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` di `apps/saas/.env.deploy` — controller tidak mengisi kredensial.
3. `bash apps/saas/deploy.sh` (entrypoint `prisma db push` menambah kolom `proofKey`/`proofType`, aditif).

---

## Self-Review (penulis plan)

**Spec coverage:** §1 keputusan → T2 (R2+aws4fetch), T8 (lifecycle/gated), T4+T6 (wajib), T3 (kompres), T6+T7 (tampil dua tempat), T5 (proxy auth), T1 (proofKey/proofType), T4 (upload-dulu-baru-markPaid), T2+T4 (503 anggun). §2 data/env → T1 + T8. §3 modul R2 → T2. §4 alur upload → T3+T4+T6. §5 serve & tampilan → T5+T6+T7. §6 error handling → T4 (400/503/502), T5 (404 semua kasus), T6 (pesan UI). §7 testing → tiap task; regresi via T8. §8 deploy gated → T8 Step 7. Semua tercakup.

**Placeholder scan:** tak ada TBD/TODO; kode lengkap tiap step. Dua instruksi "ikuti pola mock existing" (T1, T4, T6, T7) menunjuk file konkret yang sudah ada — implementer wajib membacanya, bukan menebak.

**Type consistency:** `markPaid(id, userId, {proofKey, proofType}, now?)` (T1) dipanggil T4 dengan bentuk sama. `putProof(key, body, contentType)` / `getProof(key) → {body,contentType}|null` / `R2NotConfigured` (T2) dipakai T4 & T5. `fitDimensions`/`compressImage` (T3) dipakai T6. `PendingRow` + `hasProof` (T7) diisi `app/admin/page.tsx` dari `p.proofKey` (T1 memastikan `listPending` membawanya). Key objek `proofs/<id>.jpg` konsisten T4↔T5↔T7. Konsisten.
