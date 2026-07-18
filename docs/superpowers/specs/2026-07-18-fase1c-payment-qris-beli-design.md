# Slizebiz — Fase 1c: Payment QRIS Manual (Beli) Design

**Tanggal:** 2026-07-18
**Status:** Draft (brainstorming, menunggu review user)
**Scope:** Flow pembayaran **Beli (sekali, lifetime)** via **dynamic QRIS + verifikasi manual** untuk `apps/saas` Slizebiz (live homelab :3300). Bangun model Payment, generator dynamic QRIS, checkout `/beli`, antrian admin (verifikasi → flip entitlement), notif aktivasi. **Subscribe (bulanan) ditunda ke 1c-lanjut.** **Bukan** implementasi; output = masukan `writing-plans`.

**Relasi dokumen:**
- Funnel: `2026-07-16-fase1a-funnel-ux-design.md` §3 tier (Beli/Subscribe orthogonal), §3.5 refund 7 hari, §3.6 entitlement komposit.
- Fondasi: `2026-07-16-fase1a-fondasi-design.md` — Entitlement/Config/admin-mini existing.
- **Keputusan payment terkunci (memory):** dynamic QRIS sendiri, **BUKAN** payment gateway/Tripay; verifikasi **manual** owner.

---

## 1. Keputusan (decision log)

| # | Keputusan | Alasan |
|---|---|---|
| 1 | **Beli (one-time) dulu**; Subscribe (siklus bulanan) = 1c-lanjut. | Loop bayar-manual identik; Beli lifetime = nol siklus hidup → bukti flow tercepat & bersih. |
| 2 | **Payment di APP** (login-gated), bukan landing. Landing cuma CTA arahkan ke app. | Payment mengunci entitlement user → butuh identitas login; landing statik/anon. |
| 3 | **Kode unik via diskon** (bukan surcharge). `amount = displayPrice − discountBuffer + kode(0..999)`. Contoh: 150.000 − 1.000 + 347 = **149.347** (selalu < harga tampil). | Customer merasa dapat diskon, bukan kena tambahan; kode bikin **nominal beda-beda antar invoice hidup** → owner cocokkan dari **nominal penuh persis** di mutasi (bukan cuma 3 digit — kalau `price−buffer` kelipatan 1000, 3 digit terakhir memang = kode, tapi pencocokan tetap by nominal penuh biar robust ke harga berapa pun). |
| 4 | **Kode unik = beda antar Payment HIDUP** (`PENDING` && umur < 3 jam), bukan reset kalender-harian. | Karena invoice expire 3 jam, kode otomatis bebas lagi → praktis selalu ada slot; reset harian bisa bentrok lintas tengah malam. |
| 5 | **Invoice/QR berlaku 3 jam** → lewat itu `EXPIRED` ("hilang", buat baru). Expiry **lazy** (tanpa cron). | Simpel, tak butuh scheduler. |
| 6 | **Dynamic QRIS di-generate** dari **QRIS statis merchant** yang **di-set owner di admin** (Config `qris.static`, paste teks payload). | Customer scan → nominal terisi otomatis (anti salah-ketik). Owner kontrol base QRIS tanpa redeploy. |
| 7 | **Notif aktivasi otomatis** via channel user (nomor→WA `sendWA`; email→Resend). Best-effort (gagal ≠ gagal aktivasi). | Tutup loop; reuse infra WA Omni (1a-2) + Resend. |
| 8 | **Refund minimal:** kebijakan 7 hari (copy) + tombol admin **"Nonaktifkan"** (flip `lifetimeOwned=false`). Uang balik dikirim owner **manual**. Request in-app = nanti. | Refund langka; transfer balik manual apa pun caranya. |
| 9 | **Caveat go-live:** fitur Beli (save/multi-plate/labor) = **1b**, belum ada. 1c buka gating tapi isinya nyusul → **jangan tagih customer beneran sampai 1b**. 1c = infra payment yang bisa dites owner end-to-end. | Urutan build 1c-sebelum-1b (pilihan user "flow payment dulu"). |

---

## 2. Data model

**`Payment` (Prisma, baru):**
```prisma
model Payment {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tier         String    // "beli" (1c ini; "subscribe" 1c-lanjut)
  displayPrice Int       // harga tampil (rupiah bulat), mis. 150000
  amount       Int       // nominal bayar akhir = base + kode, mis. 149347
  uniqueCode   Int       // 0..999 (3 digit terakhir amount)
  qrPayload    String    // dynamic QRIS ter-generate (disimpan untuk tampilan konsisten)
  status       String    @default("PENDING") // PENDING | PAID | EXPIRED | CANCELLED
  paidMarkedAt DateTime? // user klik "sudah bayar"
  verifiedAt   DateTime?
  verifiedBy   String?   // email owner yang aktivasi
  createdAt    DateTime  @default(now())

  @@index([status, createdAt])
}
```
- **Hidup** = `status='PENDING'` && `createdAt > now − 3 jam`.
- Migrasi = aditif (`prisma db push` aman, data utuh). Tambah relasi `payments Payment[]` di model `User`.

**Config keys baru** (tabel Config existing, editable di admin):
- `price.beli` — harga tampil (mis. `"150000"`); belum diset → checkout 503.
- `price.discountBuffer` — default `"1000"` bila absen.
- `qris.static` — payload QRIS statis merchant (`00020101…`); belum diset → checkout 503.
- `copy.refund` — teks kebijakan refund (default: "Refund 7 hari, hubungi kami via WhatsApp/email.").

---

## 3. Dynamic QRIS — `lib/qris/dynamic.ts`

`generateDynamicQris(staticPayload: string, amount: number): string`:
1. Parse TLV EMVCo. Ubah tag **00 (Payload Format)** biarkan; ubah tag **01 (Point of Initiation)** dari `11` (statik) → `12` (dinamis). Bila tag 01 absen, sisipkan `010212`.
2. Sisipkan/timpa tag **54 (Transaction Amount)** = `String(amount)` (rupiah bulat, tanpa desimal), format `54` + len2 + value. Letakkan sebelum tag 58/59/60 sesuai urutan EMVCo (implementer: sisipkan setelah tag 53/sebelum 58; urutan tag non-CRC toleran, yang wajib CRC di akhir).
3. Buang tag **63 (CRC)** lama bila ada. Susun payload + `"6304"`, hitung **CRC16-CCITT (FALSE)** (poly `0x1021`, init `0xFFFF`, tanpa reflect/xorout) atas string itu → 4 hex uppercase → tempel.
4. Return payload baru.

Helper `crc16ccitt(s: string): string` (unit-testable terpisah).
Frontend render payload → gambar QR via lib **`qrcode`** (tambah ke `@3pb/saas` deps, sudah dipakai `apps/dashboard`).

**Test (TDD):** vektor QRIS statis contoh + amount → assert tag 01 = `12`, tag 54 = amount benar, CRC16 cocok nilai known-good (hitung manual/tool sekali, hardcode di test). `crc16ccitt("...6304")` == expected.

---

## 4. Payment service — `lib/payment/service.ts`

Consumes `prisma` (`@/lib/db`), `getConfig` (`@/lib/config`), `generateDynamicQris`, `getEntitlement` (`@/lib/entitlement`).

- `allocUniqueCode(now): Promise<number>` — ambil kode 0..999 yang **tak dipakai** Payment hidup (`PENDING`, `createdAt > now−3jam`). Acak dari sisa. Semua terpakai → throw `CodePoolExhausted`.
- `createOrReuseCheckout(userId, now): Promise<Payment>` — bila `getEntitlement(userId).lifetimeOwned` → throw `AlreadyOwned`. Bila ada Payment **hidup** milik user → return itu (jangan bikin kode baru). Else: baca `price.beli` (invalid → throw `PriceNotSet`), `qris.static` (absen → throw `QrisNotSet`), `discountBuffer`; `code = allocUniqueCode`; `amount = price − buffer + code`; `qrPayload = generateDynamicQris(static, amount)`; create `Payment PENDING`.
- `markPaid(id, userId, now): Promise<void>` — set `paidMarkedAt` bila Payment milik user & hidup; else throw.
- `listPending(now): Promise<Payment[]>` — Payment hidup, urut `paidMarkedAt` desc nulls last, lalu `createdAt` desc.
- `activate(id, ownerEmail): Promise<void>` — bila `status!=='PENDING'` → no-op (idempoten). Set `status=PAID`, `verifiedAt=now`, `verifiedBy=ownerEmail`; flip `Entitlement.lifetimeOwned=true`, `lifetimePurchasedAt=now`. (Notif dipicu caller/route, non-fatal.)
- `cancel(id): Promise<void>` — set `status=CANCELLED` (untuk invoice sampah).
- `deactivate(userId): Promise<void>` — set `Entitlement.lifetimeOwned=false` (refund). Tak menghapus Payment; catat verifiedBy? (opsional).
- `listPaid(limit): Promise<Payment[]>` — Payment `PAID` terbaru (untuk daftar refund admin).

Semua nominal **integer rupiah** (tanpa desimal).

---

## 5. Alur & route

**Checkout (user):**
- Kalkulator "Beli 🔒" → link **`/beli`** (ganti UpgradeModal "segera hadir").
- `app/beli/page.tsx` (login wajib; belum login → redirect `/login`):
  - Sudah `lifetimeOwned` → "Kamu sudah punya akses Beli."
  - Else tampil harga + tombol "Beli sekarang" → `POST /api/beli/checkout` → `createOrReuseCheckout`.
  - Tampil **QR** (render `qrPayload`) + **nominal persis** (`Rp149.347`, ditonjolkan "transfer TEPAT nominal ini") + **countdown 3 jam** + tombol **"Saya sudah bayar"** → `POST /api/beli/[id]/mark-paid` → status "Menunggu verifikasi admin".
  - Kadaluarsa → "Invoice kadaluarsa, buat baru."
  - Copy kebijakan refund 7 hari.
- **Error checkout:** `QrisNotSet`/`PriceNotSet` → 503 "pembayaran belum aktif"; `AlreadyOwned` → 200 state "sudah punya"; `CodePoolExhausted` → 503 "coba lagi nanti".

**Admin (owner-only, tab Pembayaran di `/admin`):**
- `listPending()` → tabel: nominal (`149.347`), user (email/nomor), umur, `paidMarkedAt`. Yang sudah "sudah bayar" di atas.
- **Aktifkan** → `PUT /api/admin/payment/[id]/activate` (owner-guard) → `activate` → **notif user** (nomor→`sendWA`; email→Resend) *"Pembayaran terverifikasi, akun Slizebiz kamu sudah aktif 🎉"* (best-effort). 
- **Batalkan** → `PUT /api/admin/payment/[id]/cancel`.
- **Daftar PAID + Nonaktifkan (refund)** → `PUT /api/admin/payment/deactivate` body `{userId}` → `deactivate`.
- Semua route admin: 403 non-owner (pola `isOwner(session?.user?.email)` existing).

**Notif — `lib/payment/notify.ts`:** `notifyActivated(user)` — bila `user.phone` → `sendWA(phone, pesan)`; else bila `user.email` → kirim via Resend API (`RESEND_API_KEY`/`EMAIL_FROM`). Dibungkus try/catch (log, jangan throw ke route aktivasi).

---

## 6. Entitlement, error handling, testing

**Entitlement:** `capabilities()` **tak berubah** (`paidCore = lifetimeOwned || subActive`). Setelah `activate`, `useEntitlement().can.paidCore=true` → UI lepas 🔒 di kontrol Beli. **Fitur Beli-nya sendiri = 1b** (belum ada) → 1c buka gating, isi nyusul.

**Error handling:** ringkasan di §5 + notif non-fatal + `activate` idempoten (double-klik aman) + amount integer.

**Testing (TDD):**
- `lib/qris/dynamic.ts` + `crc16ccitt` — vektor QRIS contoh → tag 01=`12`, tag 54 benar, CRC16 cocok known-good.
- `lib/payment/service.ts` (mock prisma/config) — `allocUniqueCode` lewati kode payment hidup; `createOrReuseCheckout` reuse invoice hidup + hitung `amount` benar + throw `AlreadyOwned`/`PriceNotSet`/`QrisNotSet`; `activate` flip entitlement + `PAID` + idempoten (status≠PENDING → no-op); `deactivate` balik; `listPending` urutan.
- Route admin payment — owner-guard 403 non-owner (mock).
- Regresi 1a-1/1a-2 existing tetap hijau.

**Batas scope:**
| IN (1c ini) | Ditunda |
|---|---|
| Payment model, dynamic QRIS, `/beli` checkout, mark-paid, tab admin Pembayaran (aktivasi/batal/nonaktif-refund), notif aktivasi, Config keys, copy refund | **Subscribe** (bulanan/expiry/renewal/fallback/bulan-1-gratis/diskon-pembeli) = 1c-lanjut; **fitur Beli** (save/multi-plate/labor/settings) = **1b**; refund request in-app; decode gambar QRIS (paste teks dulu); landing CTA update (opsional kecil); auto-expire cron (lazy saja) |

---

## 7. Deploy & di luar scope

- Redeploy homelab (`bash apps/saas/deploy.sh`) — `prisma db push` tambah tabel `Payment` (aditif, aman). Owner set `qris.static` + `price.beli` di `/admin` sebelum checkout jalan.
- **Di luar scope:** Subscribe & siklusnya, fitur Beli (1b), refund in-app, image-QRIS decode, migrasi VPS, implementasi kode (spec berhenti di desain → `writing-plans`).
- **Caveat go-live diulang:** jangan tagih customer nyata sampai 1b memberi isi Beli; 1c = infra payment yang dites owner end-to-end.
