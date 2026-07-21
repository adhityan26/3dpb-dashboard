# Slizebiz — Fase 1c-2: Bukti Bayar (Upload Foto → R2) Design

**Tanggal:** 2026-07-20
**Status:** Disetujui user — siap `writing-plans`
**Scope:** "Saya sudah bayar" di `/beli` **wajib upload foto bukti transfer**; foto disimpan di **Cloudflare R2** (auto-hapus 60 hari) dan **tampil di antrian aktivasi admin + halaman status user**.

**Konteks:** 1c (payment QRIS manual) sudah live — user checkout → QR nominal unik → klik "Saya sudah bayar" (`markPaid` hanya set `paidMarkedAt`) → admin verifikasi manual di `/admin` tab Pembayaran → `activate` flip `lifetimeOwned`. Masalah: admin cuma lihat klaim "diklaim", tanpa bukti. 1c-2 menambah bukti foto ke titik keputusan itu.

---

## 1. Keputusan (decision log)

| # | Keputusan | Alasan |
|---|---|---|
| 1 | **Storage = Cloudflare R2** (S3-compatible), akses via **`aws4fetch`** (signing SigV4 mungil), BUKAN aws-sdk. | Keputusan user. App tak punya storage file; container di-`rm` tiap redeploy tanpa volume → hanya DB/eksternal yang bertahan. R2 gratis 10GB, akun CF sudah ada. `aws4fetch` jauh lebih ringan dari `@aws-sdk/client-s3`. |
| 2 | **Lifecycle rule bucket: objek auto-hapus setelah 60 hari.** | Keputusan user — bukti cuma perlu sampai diverifikasi; jangan menuhin storage. |
| 3 | Foto **WAJIB** — tombol "Saya sudah bayar" disabled sampai foto dipilih; route tolak request tanpa file. | Keputusan user ("wajib upload foto"). |
| 4 | Foto **di-resize/kompres di browser** (canvas → JPEG, maks sisi 1280px, quality 0.8 → ~150–300KB) sebelum upload. | Hemat bandwidth & storage; foto struk/mutasi tak perlu resolusi penuh. |
| 5 | Bukti tampil di **dua tempat**: antrian aktivasi admin (`/admin` tab Pembayaran) **dan** halaman status user ("sedang diverifikasi"). | Keputusan user. Admin butuh utk verifikasi; user butuh reassurance bukti terkirim. |
| 6 | Serve foto lewat **endpoint proxy ber-auth** `GET /api/beli/[id]/proof` (owner ATAU user pemilik), server GetObject dari R2 → stream. BUKAN URL publik/presigned. | Kredensial R2 tetap server-only; akses ter-gate; tak ada URL bocor. |
| 7 | DB simpan **referensi saja**: `Payment.proofKey` + `Payment.proofType`. Bytes di R2. | Hindari bloat Postgres. |
| 8 | **Upload dulu ke R2, baru `markPaid`.** Kalau upload gagal → tak ter-mark (user bisa ulang). Objek yatim (kalau markPaid gagal) dibersihkan lifecycle 60 hari. | Jangan pernah "diklaim bayar" tanpa bukti. |
| 9 | Env R2 absen → endpoint balas **503** "Upload bukti belum aktif" (pola sama `qris.static`/`price.beli` belum diset). Fitur mati anggun, tak crash. | Konsisten dg 1c; deploy bisa duluan sebelum kredensial siap. |

---

## 2. Data model & config

**Prisma `Payment`** (aditif, `db push`):
```prisma
  proofKey     String?   // object key di R2, mis. "proofs/<paymentId>.jpg"
  proofType    String?   // mime, mis. "image/jpeg"
```
(Field 1c lain tetap: `status`, `paidMarkedAt`, `verifiedAt`, `verifiedBy`, dst.)

**Env (server-only, `.env.deploy`):**
- `R2_ACCOUNT_ID` (boleh reuse nilai `CLOUDFLARE_ACCOUNT_ID` = `79cf4805a7bf203e238f754920441f28`)
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — **dibuat user** di dashboard CF (R2 → Manage API tokens). Controller TIDAK mengisi kredensial.
- `R2_BUCKET` (default `slizebiz-proofs`)
- Endpoint diturunkan: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

**Bucket (setup sekali, gated):** buat bucket `slizebiz-proofs` + **lifecycle rule hapus objek umur > 60 hari**.

---

## 3. Modul R2 — `apps/saas/lib/storage/r2.ts`

```ts
export class R2NotConfigured extends Error {}

export function r2Config(): { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };
// throw R2NotConfigured bila env kurang

export async function putProof(key: string, body: ArrayBuffer|Uint8Array, contentType: string): Promise<void>;
export async function getProof(key: string): Promise<{ body: ArrayBuffer; contentType: string } | null>;
```
Implementasi pakai `AwsClient` dari `aws4fetch` (`service: "s3"`, `region: "auto"`), PUT/GET ke `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`. `getProof` → `null` bila 404.

---

## 4. Alur upload

**Client — `components/BeliCheckout.tsx`:**
- Tambah `<input type="file" accept="image/*">` + preview thumbnail lokal + state `file`.
- Tombol **"Saya sudah bayar" disabled** selama `!file || pending`. Hint: "Upload foto bukti transfer dulu."
- `sudahBayar()`: resize/kompres via canvas (helper `lib/image/compress.ts`: `compressImage(file, maxSide=1280, quality=0.8) → Blob`) → `FormData` field `bukti` → `POST /api/beli/[id]/mark-paid`.
- Sukses → state `paid` + tampil thumbnail bukti dari `/api/beli/[id]/proof`.
- Gagal → pesan ("Gagal upload bukti, coba lagi." / 503 → "Upload bukti belum aktif, hubungi admin.").

**Server — `app/api/beli/[id]/mark-paid/route.ts`** (kini parse body):
1. auth → `userId`; 401 bila anon.
2. `formData()` → ambil `bukti`. Tak ada file → **400** `{error:"bukti_wajib"}`.
3. Validasi: mime ∈ `image/jpeg|image/png|image/webp`, ukuran ≤ **5MB** → else 400.
4. `putProof("proofs/<id>.jpg", bytes, mime)` — `R2NotConfigured` → **503**.
5. `markPaid(id, userId, { proofKey, proofType })` → set `paidMarkedAt` + kedua kolom. Tidak ketemu → 404.

**Service — `lib/payment/service.ts`:** `markPaid(id, userId, proof: { proofKey: string; proofType: string }, now?)` — signature nambah param `proof` (wajib), update `paidMarkedAt` + `proofKey` + `proofType`. `listPending` select `proofKey` juga.

---

## 5. Serve & tampilan

**`app/api/beli/[id]/proof/route.ts` (GET):**
- auth wajib. Ambil payment; tak ada / tak punya `proofKey` → **404**.
- Izin: `isOwner(session.user.email)` **ATAU** `payment.userId === session.user.id`; selain itu **404** (bukan 403 — jangan bocorkan keberadaan).
- `getProof(key)` → stream bytes, header `Content-Type: <proofType>`, `Cache-Control: private, max-age=300`.

**Admin `components/admin/PaymentQueue.tsx`:** `PendingRow` + `hasProof: boolean`. Kolom **Bukti**: bila `hasProof` → `<img src="/api/beli/{id}/proof">` thumbnail (~64px, klik → buka tab baru ukuran penuh); bila tidak → "—". Banner peringatan "'diklaim' bukan bukti bayar — cek mutasi PERSIS" **TETAP** (foto bisa dipalsukan; mutasi bank tetap sumber kebenaran).
`app/admin/page.tsx`: map `hasProof: !!p.proofKey`.

**User `components/BeliCheckout.tsx`** (state `paid`): "Terima kasih! Pembayaran kamu sedang **diverifikasi admin**." + thumbnail `/api/beli/{inv.id}/proof`.

---

## 6. Error handling

| Kasus | Perilaku |
|---|---|
| Env R2 kurang | Upload 503 "Upload bukti belum aktif"; checkout & QR tetap jalan |
| File bukan gambar / >5MB | 400 + pesan jelas; tak ter-mark |
| R2 PUT gagal | 500/503; **`markPaid` TIDAK dipanggil** → user bisa ulang |
| R2 GET 404 / objek sudah kedaluwarsa (>60 hari) | Endpoint proof 404; UI tampil "Bukti sudah kedaluwarsa" (jangan broken image) |
| User lain / anon akses proof | 404 |

---

## 7. Testing (TDD)

- **`lib/storage/r2.ts`**: `r2Config` throw `R2NotConfigured` bila env kurang; `putProof`/`getProof` panggil URL & header benar (mock `fetch`/AwsClient); `getProof` → `null` saat 404.
- **`lib/image/compress.ts`**: jsdom/canvas mock — hasil Blob, sisi terpanjang ≤ 1280 (test ringan; kalau canvas tak tersedia di jsdom, test helper murni penghitung dimensi `fitDimensions(w,h,max)`).
- **`markPaid`**: menyimpan `proofKey`+`proofType`+`paidMarkedAt`; tetap tolak payment bukan milik user / kedaluwarsa.
- **mark-paid route**: tanpa file → 400; mime salah → 400; >5MB → 400; sukses → `putProof` dipanggil lalu `markPaid`; `R2NotConfigured` → 503 **dan `markPaid` tak dipanggil**.
- **proof route**: owner boleh; user pemilik boleh; user lain → 404; tanpa `proofKey` → 404.
- **PaymentQueue**: `hasProof=true` → ada `<img>` ke `/api/beli/{id}/proof`; `false` → "—"; banner peringatan tetap ada.
- **BeliCheckout**: tombol disabled tanpa file; pilih file → enabled; submit kirim FormData berisi `bukti`; state paid → thumbnail tampil.
- Regresi test 1c existing tetap hijau (signature `markPaid` berubah → update pemanggil & test).

---

## 8. Batas scope & deploy

| IN (1c-2) | Ditunda / di luar |
|---|---|
| Kolom `proofKey`/`proofType`, modul R2 (`aws4fetch`), kompres client, upload wajib di mark-paid, endpoint proof ber-auth, thumbnail di admin & user, 503 anggun | OCR/verifikasi otomatis bukti; multi-file; hapus manual objek dari admin; presigned URL publik; Subscribe |

- **Dep baru:** `aws4fetch`. **Schema:** aditif (`db push`).
- **Deploy homelab :3300 = GATED.** Prasyarat sebelum fitur hidup: (a) bucket `slizebiz-proofs` + lifecycle 60 hari, (b) user bikin R2 API token → isi `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/`R2_ACCOUNT_ID` di `.env.deploy`. Tanpa itu upload balas 503 (sisanya tetap jalan).
- Lanjut `writing-plans`.
