# Slizebiz — Fase 1a-2: Auth Dual-Channel (Email + WhatsApp OTP) Design

**Tanggal:** 2026-07-18
**Status:** Draft (brainstorming, menunggu review user)
**Scope:** Enhancement auth untuk **`apps/saas`** (Slizebiz) yang sudah live di homelab (`http://192.168.88.113:3300`, 1a-1). Menambah **jalur login kedua via nomor WhatsApp (OTP)** di samping email magic-link yang sudah ada, plus merapikan UX login. **Bukan** implementasi; output = masukan `writing-plans`.

**Relasi dokumen:**
- Induk teknis: [`2026-07-16-fase1a-fondasi-design.md`](2026-07-16-fase1a-fondasi-design.md) — auth/entitlement/Config 1a-1. Spec ini melebarkan lapisan auth-nya.
- Integrasi WA Omni: endpoint kirim `POST /api/send` `{phone, body, account_id}` (Bearer token di CLAUDE.md global user), base `http://192.168.88.92:3020`. Vault 3DPB: `apps/wa-omni.md`.

---

## 1. Keputusan (decision log)

| # | Keputusan | Alasan |
|---|---|---|
| 1 | **Dua jalur login:** email (magic-link, existing) + **nomor WA (OTP 6 digit)**. | Sebagian user ogah share nomor (email lebih anonim); sebagian lebih akrab WA. |
| 2 | **Gaya verifikasi (Jalur 2):** email = **magic-link** (tak diubah), WA = **OTP** (ketik kode). | OTP paling andal di HP (link di WA sering nyasar sesi/webview); email magic-link sudah jalan. |
| 3 | **Pendekatan A:** email tetap 100% lewat NextAuth; WA lewat **route custom** yang bikin **sesi-database yang sama**. | Credentials-provider NextAuth tak mulus dg sesi-DB; A mengisolasi WA & tak menyentuh alur email teruji. |
| 4 | **Opsi B (bertahap):** rilis dua jalur login **sekarang** (akun email & akun WA bisa terpisah); **linking & merge ditunda**. | Tier Free belum simpan data & belum ada pembelian → akun "kembar" masih kosong, merge trivial. Merge sesungguhnya dirancang saat 1b/1c bawa data. |
| 5 | **Skema siap-linking sejak awal:** `User.email` & `User.phone` dua-duanya **nullable + unique**. | Linking/merge nanti tinggal nempel/pindah identifier, tak bongkar skema. |
| 6 | **UI login = satu input auto-detect** (bukan tab). Ada `@` → email; diawali `0`/`+62`/`62`/digit → WA; lainnya → hint. | Nol friksi milih tab; aturan `@` tegas & anti-ambigu. |
| 7 | **Beresin URL query** `provider=resend&type=email`: email pakai `signIn(..., {redirect:false})` + state inline "cek email". | UX login-first; hilangkan query param nyangkut (bukan isu keamanan, hanya rapi). |

---

## 2. Skema & model sesi

**`User` (ubah + tambah):**
```prisma
model User {
  id            String       @id @default(cuid())
  name          String?
  email         String?      @unique   // JADI nullable
  emailVerified DateTime?
  phone         String?      @unique   // BARU (format 628…)
  phoneVerified DateTime?              // BARU
  image         String?
  accounts      Account[]
  sessions      Session[]
  entitlement   Entitlement?
  createdAt     DateTime     @default(now())
}
```
- Constraint app-level: minimal salah satu (`email` atau `phone`) terisi (bukan DB constraint — divalidasi di jalur create).
- Migrasi = **pelebaran aman** (`email` NOT NULL → nullable, tambah kolom nullable). `prisma db push` di entrypoint container tak menghapus data (1 user existing = owner, tetap utuh).

**Sesi:** tetap **database session** (Prisma adapter). Dua channel konvergen ke tabel `Session` yang sama; `auth()` di server component baca sesi apa pun (email/WA) identik.

**`WaOtp` (tabel baru — challenge OTP WA):**
```prisma
model WaOtp {
  phone       String   @id          // 628… (satu challenge aktif per nomor)
  codeHash    String                // hash kode (bukan plaintext)
  expires     DateTime
  attempts    Int      @default(0)  // percobaan verify salah pada kode aktif
  lastSentAt  DateTime @default(now())
  sentCount   Int      @default(0)  // jumlah kirim dalam window kuota berjalan
  windowStart DateTime @default(now()) // awal window kuota-per-jam
}
```
- `@id` di `phone` = satu challenge aktif per nomor; `issueOtp` upsert (overwrite challenge lama). Kolom `sentCount`/`windowStart` bertahan lintas-issue (bukan direset tiap issue) supaya kuota-per-jam bisa dihitung dari satu baris. Email tetap pakai `VerificationToken` bawaan NextAuth — tak dicampur.

---

## 3. Arsitektur WA-OTP (Pendekatan A)

Unit kecil, satu tanggung jawab masing-masing:

**`lib/wa/normalize.ts`**
- `normalizePhone(input): string | null` — `08xx`/`+62xx`/`62xx`/`8xx` → `628xx`; buang spasi/`-`; tolak (null) kalau < 9 atau > 15 digit atau bukan angka.
- `detectChannel(input): 'email' | 'phone' | null` — ada `@` → `email`; else `normalizePhone` sukses → `phone`; else `null`.

**`lib/wa/client.ts`**
- `sendWA(phone: string, body: string): Promise<void>` — `POST {WA_OMNI_URL}/api/send` header `Authorization: Bearer {WA_OMNI_TOKEN}`, body `{ phone, body, account_id: Number(WA_OMNI_ACCOUNT_ID) }`. `AbortSignal.timeout(10_000)`. Throw `Error` kalau env absen, non-2xx, atau timeout.

**`lib/wa/otp.ts`**
- `issueOtp(phone): Promise<{ code: string }>` — generate **6 digit** (`crypto`, bukan `Math.random`), upsert `codeHash` (mis. sha256(code+phone)) + `expires = now + 10 menit`, reset `attempts=0`, set `lastSentAt=now`, **`sentCount++`** (dalam window berjalan). Return `code` (dipakai caller utk kirim WA; tak pernah dilog).
- `verifyOtp(phone, code): Promise<'ok' | 'invalid' | 'expired' | 'locked'>` — ambil `WaOtp` by phone; tak ada/`expires`<now → `expired`; `attempts >= 5` → `locked`; hash cocok → hapus row → `ok`; tak cocok → `attempts++` → `invalid`.
- `canSend(phone): Promise<{ ok: boolean; waitSec?: number }>` — (1) **cooldown 60 dtk** sejak `lastSentAt`; (2) **kuota jam**: bila `now - windowStart > 1 jam` → reset window (`sentCount=0`, `windowStart=now`) lalu izinkan; else bila `sentCount >= 5` → tolak. Baris belum ada = izinkan. `issueOtp` yang menaikkan `sentCount`.

**`lib/wa/session.ts`**
- `createUserSession(userId): Promise<void>` — buat `sessionToken` random (`crypto`), `adapter.createSession({ sessionToken, userId, expires: now+30hari })`, set cookie **`authjs.session-token`** (httpOnly, `sameSite:lax`, `path:/`, `secure` = (origin https)). Nama cookie & atribut mengikuti kontrak Auth.js v5 (origin homelab = http → non-secure, konsisten dg email magic-link). **Build note:** verifikasi nama cookie aktual (login email sukses → inspect cookie di browser; Auth.js v5 = `authjs.session-token` di http, `__Secure-authjs.session-token` di https) sebelum hardcode — samakan persis biar `auth()` mengenali sesi WA.
- `upsertUserByPhone(phone): Promise<User>` — cari `User` by phone; kalau tak ada → create `{ phone, phoneVerified: now }` + **buat `Entitlement` default** (samakan dg event `createUser` email). Kalau ada → set `phoneVerified` bila belum.

**Route (App Router, `app/api/auth/wa/…`):**
- `POST /api/auth/wa/start` — body `{ input }` → `normalizePhone` (400 kalau null) → `canSend` (429 + `waitSec` kalau kena) → `issueOtp` → `sendWA(phone, "Kode masuk Slizebiz: {code}. Berlaku 10 menit, jangan dibagikan.")` → **selalu** `{ ok: true }` (privasi: tak bocorkan nomor terdaftar). Env WA absen → 503 `{ error: "wa_disabled" }`.
- `POST /api/auth/wa/verify` — body `{ input, code }` → `normalizePhone` → `verifyOtp` → `ok`: `upsertUserByPhone` → `createUserSession` → `{ ok: true }`; selain itu `{ ok:false, reason }` (`invalid`/`expired`/`locked`) status 401.

---

## 4. UX halaman login (`app/login/page.tsx` → client component)

Satu input auto-detect, login-first (app root sudah redirect ke sini bila belum auth).

```
[ Logo Slizebiz ]   Masuk Slizebiz
┌─────────────────────────────────┐
│ Email atau nomor WhatsApp        │
└─────────────────────────────────┘
            [  Lanjut  ]
        tanpa password
```

**State machine (client):**
- `idle` → user isi input, klik **Lanjut** → `detectChannel`:
  - **email:** `signIn("resend", { email, redirect:false })` → state `email_sent` → tampil *"Link masuk dikirim ke {email}. Cek inbox/spam."* URL tetap `/login` (query `provider=…` hilang).
  - **phone:** `POST /api/auth/wa/start` → state `wa_code` → input **6 digit** + **Verifikasi** (`/api/auth/wa/verify`) + **Kirim ulang** (disable 60 dtk, countdown). Sukses → `router.push("/")` (kalkulator). Gagal → pesan (`kode salah` / `kadaluarsa, kirim ulang` / `terlalu banyak percobaan`).
  - **null:** hint inline *"Masukkan email (ada @) atau nomor WhatsApp (08…/+62…)."*
- Tombol punya loading state; input divalidasi ringan sebelum submit.

`app/login/verify/page.tsx` (verify-request lama) boleh tetap ada sebagai fallback, tapi alur utama email kini inline (tak redirect ke sana).

---

## 5. Error handling

- **WA Omni mati/timeout/non-2xx:** `wa/start` → pesan ramah *"Gagal kirim kode via WhatsApp, coba lagi."* Email tak terpengaruh.
- **Env WA absen** (`WA_OMNI_URL`/`WA_OMNI_TOKEN`/`WA_OMNI_ACCOUNT_ID`): `wa/start` 503 `wa_disabled` → UI tampil *"Login WhatsApp belum aktif, pakai email dulu."* App + login email tetap normal (WA opt-in, non-fatal).
- **OTP:** salah → sisa percobaan; ≥5 → `locked` (kode hangus, minta kirim ulang); expired → minta kirim ulang.
- **Rate-limit:** 429 + `waitSec` → *"Terlalu sering, tunggu {n} detik."*
- **Privasi:** `wa/start` selalu `ok` walau nomor tak terdaftar (anti-enumerasi). Nomor invalid (format) → 400 dg hint.
- **Buat sesi gagal:** `verify` 500 ramah, tak setengah-login (cookie hanya di-set setelah `createSession` sukses).
- **Email (Resend) gagal:** penanganan bawaan NextAuth + pesan actionable.

---

## 6. Config & env

Tambahan env `apps/saas` (deploy.sh + `.env.deploy(.example)`):
- `WA_OMNI_URL` (mis. `http://192.168.88.92:3020`)
- `WA_OMNI_TOKEN` (Bearer — dari CLAUDE.md global user)
- `WA_OMNI_ACCOUNT_ID` (akun WA pengirim OTP; **default `1`** bila user tak set preferensi — dikonfirmasi saat build)

Semua opsional untuk boot: bila absen, login WA non-aktif (503) tapi app + email jalan.

---

## 7. Testing

- **`normalize.ts`** — `normalizePhone` (`08…/+62…/62…/8…`→`628…`, junk→null) & `detectChannel` (`@`→email, `08…`→phone, ngawur→null). Pure fn, unit.
- **`otp.ts`** (mock `prisma.waOtp`) — issue simpan hash+expires; verify sukses konsumsi row; salah → `invalid` + `attempts++`; expired → `expired`; ≥5 → `locked`; `canSend` cooldown 60 dtk + kuota jam.
- **`client.ts`** (mock `fetch`) — body `{phone, body, account_id:number}` + Bearer benar; throw saat env absen / non-2xx / timeout.
- **`session.ts`** — `createUserSession` panggil `adapter.createSession` dg field benar + set cookie `authjs.session-token` atribut benar (mock adapter+cookies); `upsertUserByPhone` buat user+entitlement utk nomor baru, idempoten utk nomor lama.
- **Route** (opsional integrasi ringan) — `wa/start` selalu `ok`/503-env-absen; `wa/verify` sukses→cookie, salah→401.
- Regresi: test 1a-1 existing (owner guard, entitlement, config, compute, cloudflare, calculator) tetap hijau.

---

## 8. Batas scope

| Area | Fase 1a-2 (spec ini) | Ditunda |
|---|---|---|
| Login email (magic-link) | ✅ dipertahankan + rapikan `redirect:false` | — |
| Login WA (OTP) | ✅ start+verify+sesi | — |
| Skema `email` nullable + `phone` + `WaOtp` | ✅ | — |
| Satu-input auto-detect | ✅ | — |
| **Linking** (tambah channel saat login) | ❌ | task berikut / 1b (pencegahan akun kembar) |
| **Merge** akun terpisah + rekonsiliasi data/pembelian | ❌ | 1b/1c (saat sudah ada data & bayar) |
| Manajemen user di `/admin` | ❌ | nanti |
| Landing (`apps/landing`) | ❌ tak disentuh | — |

**Alur merge (referensi arah, dibangun nanti):** user login ke akun yang dipertahankan → Akun → "Tambah WA" → OTP → sistem deteksi nomor sudah dipakai akun lain → konfirmasi *"gabungkan? data & status dipindah, akun lain dihapus"* → backend pindah data + rekonsiliasi entitlement (ambil lebih tinggi) + hapus akun kosong. Dua-duanya berbayar = edge-case admin.

---

## 9. Deploy

- Redeploy homelab (`bash apps/saas/deploy.sh`) — container `slizebiz` :3300, image rebuild. Entrypoint `prisma db push` menerapkan skema baru (email nullable + phone + WaOtp) pada DB `slizebiz` — pelebaran aman, data existing utuh.
- Env baru (`WA_OMNI_*`) ditambah ke `.env.deploy` (gitignored) + `.env.deploy.example`.

---

## 10. Di luar scope spec ini

- Linking/merge (di atas). Payment (1c). Save/IndexedDB (1b). Poles UX app lain (header/logout, /admin). Perubahan landing. Migrasi VPS. Implementasi kode — spec berhenti di desain; lanjut `writing-plans`.
