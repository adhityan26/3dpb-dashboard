# Slizebiz — Fase 1a Funnel & UX Design

**Tanggal:** 2026-07-16
**Status:** Disetujui (brainstorming via visual companion + panel 4-agent monetisasi)
**Scope:** Desain funnel & UX untuk milestone **Free live** produk SaaS **Slizebiz** — teaser kalkulator tanpa login, garis batas teaser/Free/berbayar, UI tier-lock + modal upgrade, struktur landing page, dan draft template legal. **Bukan** implementasi; output = spec yang jadi masukan `writing-plans`.

**Relasi dokumen:**
- Induk: [`2026-07-08-saas-3pb-design.md`](2026-07-08-saas-3pb-design.md) — spec ini **merevisi** §2 (matriks tier), §5 (entitlement), dan §7 (refund) di sana; lihat §12 "Revisi terhadap spec induk".
- Pasangan: **1a-Fondasi** (infra/auth/entitlement/theme/calc-engine/deploy) belum ditulis — spec itu menyusul setelah funnel matang. Beberapa keputusan di sini (skema entitlement komposit, admin-mini Config) adalah **input wajib** untuk 1a-Fondasi; ditandai di §11.
- Formula: [`../../kalkulator-formula.md`](../../kalkulator-formula.md) — sumber definisi Biaya modal / Harga jual minimum / margin / channel.

> **Catatan pemecahan Fase 1:** Fase 1 = **1a (Free live)** → **1b (Beli, data lokal IndexedDB)** → **1c (Subscribe + payment Tripay)**. Spec ini fokus **1a-Funnel/UX**. Payment belum aktif di 1a — semua CTA berbayar berstatus "segera hadir".

---

## 1. Ringkasan keputusan (decision log)

| # | Keputusan | Ref |
|---|---|---|
| 1 | Teaser (tanpa login) menampilkan: input dasar, **Biaya modal** + rincian, **Harga jual minimum**, **1 rekomendasi harga** (margin B). | §4, §5 |
| 2 | Login (Free) menambah: margin A/B/C, status vs harga pasar, harga per-channel, persistensi sesi, copy/share. Reveal = **in-place blur** + CTA "Login gratis". | §4, §5 |
| 3 | Istilah **"floor price" & "BEP" dibuang**. Dua baris: **"Biaya modal"** (HPP) dan **"Harga jual minimum"**. | §5 |
| 4 | Reframe tier: buang **"Lifetime"** → **Free / Beli / Subscribe / Add-on**. | §3 |
| 5 | **Beli & Subscribe koeksis & masing-masing standalone** — tidak ada paksaan "beli dulu baru boleh langganan". | §3 |
| 6 | **Kompensasi pembeli:** tarif Subscribe pembeli lebih murah **selamanya** + **bulan pertama gratis**. | §3.3 |
| 7 | **Fallback Sub berakhir:** cloud read-only **90 hari** (notif hari 60 & 83) → pembeli jatuh ke **mode lokal penuh**, Sub-saja jatuh ke **Free**; lalu hapus cloud. Tidak ada auto-delete mendadak. | §3.4 |
| 8 | **Refund 7 hari** uang kembali (dikurangi kredit OCR terpakai). Ditampilkan di ToS + checkout + banner login pertama. | §3.5, §10 |
| 9 | **Entitlement komposit** (`lifetimeOwned` + `subStatus`/`subExpiresAt`) disiapkan **sejak 1a** meski payment belum live. | §3.6, §11 |
| 10 | Harga & copy landing/teaser diatur via **admin-mini di dalam apps/saas** (tabel Config + `/admin` owner-only). Dashboard internal **tidak** menyentuh DB SaaS. | §9 |
| 11 | **Modal upgrade** (Free/Beli/Subscribe) + badge **🔒** di kontrol Beli/Sub. CTA berbayar "segera hadir" + waitlist "Beri tahu saya saat rilis". | §6 |
| 12 | **Landing page**: nav+Masuk · hero+powered-by · teaser · 3 value-prop · banding tier · FAQ · footer legal. | §7 |
| 13 | **Copy rule:** "miliki app" tidak boleh mengklaim "penuh" yang menyesatkan; fitur inti wajib jalan tanpa add-on. | §8 |
| 14 | **Offline-first** dikunci sebagai prinsip: stack Beli/lokal wajib fungsional tanpa internet (PWA + IndexedDB). | §8 |
| 15 | **Mini-POS** = value-added roadmap (bukan 1a); muncul di value-story, ikut aturan storage lokal-Beli/cloud-Sub. | §8, §13 |
| 16 | **Pricing angka = TBA** (ditunda, dibahas terpisah). Angka di dokumen ini semata ilustratif. | §3.7 |

---

## 2. Prinsip funnel

1. **Coba dulu, tanpa gesekan.** Kalkulator bisa dicoba tanpa daftar; teaser memberi **satu jawaban harga nyata** supaya user langsung merasakan nilai (bangun trust).
2. **Login harus berguna & jujur.** Login (magic-link, tanpa password) membuka kedalaman banding — bukan sekadar tembok. Email terkumpul karena user memang mau fitur lebih, bukan dipaksa.
3. **Terkunci tetap terlihat.** Fitur berbayar ditampilkan dengan badge 🔒 + modal upgrade (pola upsell), sesuai induk §1.
4. **Tidak menyesatkan.** Setiap klaim ("miliki app", "selamanya", "offline") harus benar-benar ditepati arsitektur. Add-on dinyatakan opsional.
5. **Offline-first.** Nilai inti Beli = jalan tanpa internet. Desain UI & storage tidak boleh mengasumsikan koneksi selalu ada.

---

## 3. Model tier & monetisasi (revisi induk §2/§5)

### 3.1 Empat lapis

| Lapis | Apa | Data | Bayar |
|---|---|---|---|
| **Free** | Kalkulator dasar (single-plate, single-material, margin A/B/C + status, setting default). Login magic-link. | Stateless / sesi | Rp 0 |
| **Beli** | Miliki aplikasinya — **semua fitur inti** (kalkulator lengkap, filamen, PO, invoice, dan modul inti berikutnya), **offline selamanya**. | **Lokal** (IndexedDB) di device user | Sekali bayar (TBA) |
| **Subscribe** | Lapisan **cloud**: sync antar device, kuota OCR, share invoice link. | **Cloud** (Postgres) | Bulanan prepaid (TBA) |
| **Add-on** | Layanan tambahan **opsional** yang butuh server/hardware: kredit OCR (bayar-pakai); (nanti) bridge printer. | — | Pay-as-you-go |

"Beli" adalah label tier (alternatif brand-y "Pro"/"Miliki" tidak dipilih; boleh ditinjau saat finalisasi copy). Subtitle kanonik: **"Miliki aplikasinya — semua fitur inti, selamanya, offline."**

### 3.2 Koeksistensi (bukan tangga)

Beli dan Subscribe adalah **dua dimensi orthogonal**, bukan level bertingkat. Kombinasi valid:

- **Free** — belum apa-apa.
- **Beli saja** — miliki app, data lokal, offline. Tanpa cloud.
- **Subscribe saja** — pakai versi cloud tanpa membeli app; saat langganan berhenti → turun ke Free.
- **Beli + Subscribe** — miliki app **dan** sewa cloud di atasnya. Cloud = otoritatif; lokal = fallback offline.

**Tidak ada paksaan "beli dulu baru boleh subscribe".** (Panel: customer awam menyebut paksaan ini alasan utama ragu bayar; auditor menandainya bundling paksa; developer menandai edge-case berlebih. CFO menerima ini asalkan Sub pembeli murni-aditif — lihat §3.3.)

### 3.3 Kompensasi Beli → Subscribe (dikunci)

Pembeli yang kemudian berlangganan mendapat, **selamanya**:

1. **Tarif Subscribe "pembeli" lebih murah** daripada tarif "standalone". Rasionalnya bukan diskon loyalitas acak, melainkan **SKU berbeda**: langganan standalone juga menyewakan *pemakaian aplikasi*; langganan pembeli hanya menyewa *lapisan server* karena app sudah dimiliki.
2. **Bulan pertama cloud gratis** saat pertama kali subscribe (biaya server marginal ~nol saat idle).

Tidak memakai kredit/proration nominal (developer: paling rawan bug & desync webhook Tripay; auditor: bisa memicu sengketa "sudah bayar lifetime kok bayar lagi"). Implementasi: `harga = lifetimeOwned ? hargaPembeli : hargaStandalone`, plus satu flag `firstCloudMonthUsed`.

**Klausul wajib (auditor):** "Langganan TIDAK menggantikan pembelian Anda. Jika langganan berakhir, Anda kembali ke mode lokal dengan seluruh fitur Beli tetap aktif."

### 3.4 Fallback saat Subscribe tidak diperpanjang (dikunci; selaras induk §9)

Tidak ada penghapusan mendadak. Cloud menjadi **read-only selama 90 hari**:

- **Pembeli (`lifetimeOwned`) + Sub berakhir** → tarik data turun ke device, lanjut pakai **app penuh offline selamanya** (mode lokal Beli). Cloud berhenti sinkron; salinan cloud dihapus setelah 90 hari, tetapi data sudah aman di lokal.
- **Subscribe-saja + berakhir** → cloud read-only 90 hari untuk export/perpanjang → setelah itu turun ke **Free** & salinan cloud dihapus permanen.

**Timeline (sama untuk keduanya):** Hari 0 read-only mulai · Hari 60 notif email · Hari 83 notif terakhir · Hari 90 hapus cloud. Export selalu tersedia sepanjang tenggang; perpanjang sebelum hari 90 memulihkan penuh tanpa kehilangan data. Retensi 90 hari + jadwal notifikasi dicantumkan di ToS & Privacy.

### 3.5 Refund (dikunci; revisi induk §7)

- **Beli:** garansi **7 hari** uang kembali. Jumlah refund = harga dibayar **dikurangi nilai kredit OCR yang sudah terpakai** (kredit belum terpakai ikut direfund).
- **Subscribe:** prepaid, tidak ada refund; sisa bulan berjalan hangus.
- **Wajib tampil di tiga titik:** ToS, halaman checkout (checkbox persetujuan), dan **banner login pertama**.

### 3.6 Skema entitlement komposit (input untuk 1a-Fondasi)

Enum tunggal `plan FREE|LIFETIME|SUB` (induk §5) **tidak cukup** karena Beli & Subscribe orthogonal. Bentuk yang benar:

```
Entitlement {
  userId           unique
  lifetimeOwned    boolean   @default(false)
  lifetimePurchasedAt DateTime?
  subStatus        enum('NONE','ACTIVE','EXPIRED') @default('NONE')
  subStartedAt     DateTime?
  subExpiresAt     DateTime?
  firstCloudMonthUsed boolean @default(false)
  createdAt, updatedAt
}
```

Gating jadi kombinasi OR/kapabilitas, bukan cek enum tunggal:
- akses fitur inti berbayar = `lifetimeOwned || subStatus === 'ACTIVE'`
- akses fitur cloud (sync/OCR/share) = `subStatus === 'ACTIVE'`

**Disiapkan sejak 1a** meski hanya Free yang live — semua field default aman (`false`/`NONE`), sehingga tidak ada migrasi schema menyakitkan saat 1b/1c. Detail teknis (`requirePlan()`/`useEntitlement()`) masuk spec 1a-Fondasi.

### 3.7 Pricing (ditunda)

Angka harga **TBA** dan dibahas di sesi terpisah. Angka ilustratif dari panel CFO (Beli ~Rp149rb, Sub ~Rp29–39rb/bln, OCR ~Rp25rb/100 scan) **tidak dikunci** — user menilai Beli 149rb terasa mahal untuk pasar UMKM; kandidat under-100rb/under-50rb dibahas nanti. Semua harga di UI dibaca dari Config (§9), bukan hardcode.

---

## 4. Batas fitur teaser / Free / berbayar (matriks)

Fitur **kalkulator** dipecah agar batas non-login vs login jelas. Kolom Beli/Subscribe & baris terkunci mengikuti induk §2.

| Fitur kalkulator | Non-login (teaser) | Free (login) | Beli | Subscribe |
|---|:--:|:--:|:--:|:--:|
| Input dasar (gramasi, durasi, 1 filament, printer default) | ✅ | ✅ | ✅ | ✅ |
| Biaya modal + rincian | ✅ | ✅ | ✅ | ✅ |
| Harga jual minimum | ✅ | ✅ | ✅ | ✅ |
| 1 rekomendasi harga jual (margin B) | ✅ | ✅ | ✅ | ✅ |
| Ketiga margin A/B/C berdampingan | 🔒 login | ✅ | ✅ | ✅ |
| Status vs harga aktual pasar | 🔒 login | ✅ | ✅ | ✅ |
| Breakdown harga per channel (Shopee/Tokopedia/offline) | 🔒 login | ✅ | ✅ | ✅ |
| Input diingat sepanjang sesi | 🔒 login | ✅ | ✅ | ✅ |
| Copy / share hasil (teks) | 🔒 login | ✅ | ✅ | ✅ |
| Multi-plate & multi-filament per plate | 🔒 | 🔒 | ✅ | ✅ |
| Labor cost | 🔒 | 🔒 | ✅ | ✅ |
| Settings custom (printer/material/channel/margin) | 🔒 | 🔒 | ✅ | ✅ |
| Master harga filament + recompute | 🔒 | 🔒 | ✅ | ✅ |
| Save & duplicate kalkulasi (bernama, riwayat) | 🔒 | 🔒 | ✅ lokal | ✅ cloud |
| Cloud sync antar device | — | — | — | ✅ |

Printer & material di teaser/Free = **profil default saja** (induk §4); custom baru di Beli.

---

## 5. Kalkulator teaser — layout & istilah

**Layout (dua kolom, responsif wrap):**
- **Kiri (input):** berat (gram), durasi print (jam), jenis filament (dropdown profil default), printer = **Default (mis. Bambu P1P), terkunci** dengan catatan "Printer & material custom di Beli".
- **Kanan (hasil), urut:**
  1. **Biaya modal** + `<details>` rincian (material di harga modal · listrik + depresiasi mesin · buffer gagal porsi owner · test layer/QC). *Istilah "HPP" boleh tampil sebagai sub-label, tapi judul baris = "Biaya modal".*
  2. **Harga jual minimum** (label kecil "minimum"; hint opsional "di bawah ini rugi").
  3. **Rekomendasi harga jual** (angka besar, aksen) + label "margin standar (B)".
  4. **Blok terkunci in-place blur:** baris margin A/B/C, status vs pasar, per-channel muncul di posisinya tapi ter-blur, dengan satu overlay tengah: teks "Banding margin A/B/C, cek untung/rugi vs harga pasar & harga per channel" + tombol **"Login gratis untuk buka"** + sub-teks "tanpa password · link masuk via email".
  5. Footer tipis: "Simpan hasil, multi-plate, labor & settings custom → **Beli** 🔒".

**Istilah terkunci:**
- Baris 1 = **"Biaya modal"** (bukan "HPP"/"floor"). Ini titik balik-modal sesungguhnya (jual pas di sini = impas).
- Baris 2 = **"Harga jual minimum"** (bukan "floor price"/"BEP"). Sudah di atas balik-modal karena material dihitung di harga jual (margin material tertanam) + porsi buffer gagal customer; mesin memakai **mesin acuan harga** (formula §3). Istilah "BEP" **tidak** dipakai di baris ini — jika dibutuhkan konsep BEP, ia memetakan ke "Biaya modal".

**Auth:** magic-link (NextAuth v5 via Resend) — CTA selalu jujur "tanpa password · link via email". Setelah klik login & verifikasi, blok blur terbuka in-place (tetap di halaman kalkulator, input tak hilang).

---

## 6. Tier-lock UI + modal upgrade

**Badge 🔒** dipasang pada setiap kontrol fitur Beli/Sub: tombol Save, tab/aksi multi-plate, section Labor, menu Settings custom, master harga. Klik kontrol 🔒 membuka **modal upgrade**.

**Modal upgrade (banding 3 kolom):**
- Judul kontekstual sesuai pemicu (mis. "Kamu mencoba menyimpan kalkulasi 🔒").
- Kolom **Free** (Rp 0, "Paket kamu sekarang", non-aktif), **Beli** (di-highlight "paling worth", border aksen, "Rp — TBA · bayar sekali"), **Subscribe** ("Rp — TBA · /bulan").
- Tiap kolom daftar fitur ringkas; Beli menonjolkan "semua fitur inti · data lokal di device", Subscribe menonjolkan "sync · OCR · share link".
- **CTA berbayar = "Segera hadir"** (payment baru 1c).
- Baris bawah: **"Pembayaran belum dibuka. Beri tahu saya saat rilis — kami email ke akunmu."** → mekanisme **waitlist** (user sudah login, punya email) yang sekaligus sinyal demand sebelum membangun payment.

Harga & label fitur pada modal dibaca dari Config (§9).

---

## 7. Landing page — struktur

Urutan section (single page, scroll):

1. **Navbar** — wordmark `slizebiz`, link "Harga"/"FAQ", tombol **Masuk** (magic-link).
2. **Hero** — eyebrow "powered by 3D Printing Bandung", headline (mis. "Tahu harga jual produk 3D print-mu dalam hitungan detik"), sub-headline, CTA "Coba kalkulator gratis" (scroll ke teaser).
3. **Teaser kalkulator** (§5) tertanam — "coba langsung, tanpa login".
4. **3 value-prop** — mis. Harga akurat (modal/failure/listrik+depresiasi ikut dihitung) · Per channel · Simpan & kelola (Beli). *Boleh menyebut mini-POS sebagai bagian nilai Beli, ditandai "segera" (§8).*
5. **Banding tier** — Free / Beli / Subscribe (+ Add-on disebut ringkas), harga dari Config (TBA/"segera hadir").
6. **FAQ singkat** — perlu bayar untuk coba? · data aman? · cara login?
7. **Footer** — wordmark + "powered by 3D Printing Bandung" + tautan **Ketentuan Layanan · Privasi · Refund · Kontak**.

Tema: Glass UI (packages/ui, diekstrak dari `apps/dashboard/globals.css`), light/dark otomatis.

---

## 8. Aturan copy & prinsip produk

1. **Anti-menyesatkan "miliki app penuh".** Beli = "Miliki aplikasinya — **semua fitur inti**, selamanya, offline." **Wajib** dinyatakan: fitur inti berfungsi penuh **tanpa add-on**; OCR & bridge printer adalah **layanan tambahan opsional** (butuh server/hardware), bukan bagian Beli yang disunat. Hindari kata "penuh/lengkap" tanpa kualifikasi.
2. **Klaim "selamanya/offline" harus ditepati.** Beli memberi hak pakai versi mayor saat ini di device, offline. Update fitur diberikan selama produk aktif dikembangkan (min. [12] bulan sejak pembelian — angka diisi owner). App tetap berfungsi lokal meski layanan dihentikan.
3. **Offline-first (prinsip arsitektur).** Stack Beli/lokal **wajib fungsional tanpa internet**: PWA + service worker + IndexedDB. Teaser kalkulator tetap jalan setelah halaman ter-load. Desain UI tidak boleh mengasumsikan koneksi.
4. **Mini-POS = value-added roadmap.** Tidak dibangun di 1a. Boleh muncul di value-story landing/modal sebagai bagian nilai Beli (tandai "segera"). Saat dibangun, ikut aturan storage: **lokal untuk Beli, cloud untuk Subscribe**, dan mewarisi offline-first. Desain detail = sesi brainstorm & spec tersendiri.
5. **Peringatan data lokal (risiko #1 auditor).** Untuk pengguna Beli, wajib ada: nudge backup persisten in-app + **export 1-klik** + disclaimer bahwa data IndexedDB bisa hilang (clear browser/incognito/eviction) dan tidak bisa dipulihkan oleh penyedia.

---

## 9. Admin-mini / Config (sumber harga & copy)

Harga tier & copy landing/teaser **tidak hardcode** dan **tidak** diatur dari dashboard internal (menjaga pemisahan 2-deployment induk §8 — tanpa koneksi runtime lintas-deployment).

- Tabel **`Config`** di DB SaaS (key-value, mis. `price.beli`, `price.sub.owner`, `price.sub.standalone`, `copy.hero.headline`, `feature.pos.status`).
- Halaman **`/admin`** owner-only di dalam `apps/saas` untuk mengubahnya tanpa redeploy.
- Landing, modal upgrade, dan teaser membaca dari Config.

Detail skema & guard admin masuk **1a-Fondasi**. Di 1a-Funnel cukup: sumber harga/copy = Config, editable via admin-mini SaaS.

---

## 10. Draft template legal

> ⚠️ **Template, bukan nasihat hukum.** Draft di bawah harus **kamu review sendiri** (idealnya dengan penasihat hukum) sebelum dipublikasikan. Placeholder `[…]` diisi owner. Prasyarat merchant Tripay (induk §7). Hukum yang berlaku: Republik Indonesia (UU Perlindungan Konsumen, UU PDP).

### 10.1 Ketentuan Layanan (ToS) — kerangka + klausul wajib

1. **Definisi layanan & tier.** Free, Beli (sekali bayar, data lokal), Subscribe (langganan cloud), Add-on (opsional).
2. **Hak pakai Beli.** "Pembelian satu kali memberi hak pakai versi mayor saat ini di perangkat Anda, selamanya, secara offline. Update fitur diberikan selama produk aktif dikembangkan, minimal [12] bulan sejak pembelian. Aplikasi tetap berfungsi lokal meski layanan dihentikan."
3. **Fitur inti vs add-on.** "Fitur inti berfungsi penuh tanpa add-on. OCR dan bridge printer adalah layanan tambahan opsional yang memerlukan server/perangkat dan ditagih terpisah."
4. **Hubungan Beli & Subscribe.** "Langganan TIDAK menggantikan pembelian Anda. Keduanya dapat dimiliki bersamaan. Jika langganan berakhir, Anda kembali ke mode lokal dengan seluruh fitur Beli tetap aktif."
5. **Total biaya transparan (jika relevan).** Tampilkan harga sekali + harga langganan tahunan agar TCO jelas.
6. **Data & penyimpanan.** Beli = data lokal di perangkat pengguna; Subscribe = data cloud. Lihat Kebijakan Privasi.
7. **Retensi cloud saat langganan berakhir.** "Setelah langganan berakhir, data dapat dibaca & diekspor selama 90 hari (read-only); notifikasi dikirim pada hari ke-60 dan ke-83; setelah hari ke-90 data cloud dihapus permanen."
8. **Kewajiban backup lokal & batas tanggung jawab.** "Data paket Beli tersimpan HANYA di perangkat/browser Anda; kami tidak dapat memulihkan data yang hilang. Lakukan backup berkala melalui fitur ekspor."
9. **Refund.** Rujuk §10.3.
10. **Pembayaran & pajak.** Via [Tripay]. Kewajiban PPN produk digital & pencatatan omzet menjadi tanggung jawab penjual.
11. **Perubahan layanan, penghentian, hukum yang berlaku, kontak.**

### 10.2 Kebijakan Privasi — kerangka + klausul wajib

1. **Data yang dikumpulkan.** Alamat email (untuk magic-link login & notifikasi). Tidak ada password.
2. **Data lokal (Beli).** "Data kalkulasi/filamen/PO/invoice paket Beli disimpan di perangkat Anda (IndexedDB) dan tidak dikirim ke server kami."
3. **Data cloud (Subscribe).** Disimpan di server (Postgres) untuk sinkronisasi.
4. **Alur OCR (add-on).** "Gambar yang Anda unggah untuk OCR diproses di server (dan/atau penyedia OCR pihak ketiga [nama]) untuk mengekstrak teks; [kebijakan retensi gambar]." — wajib diungkap agar tidak kontradiksi dengan narasi "data lokal".
5. **Retensi & hak hapus (UU PDP).** Dasar pemrosesan, hak akses/hapus, retensi cloud 90 hari pasca-langganan.
6. **Tidak menjual data.** Pernyataan eksplisit.
7. **Cookie/analytics** (jika ada), kontak DPO/owner.

### 10.3 Kebijakan Refund — draft

- **Beli:** "Garansi 7 (tujuh) hari uang kembali sejak tanggal pembelian. Jumlah refund = harga yang dibayar dikurangi nilai kredit OCR yang sudah terpakai (dihitung pada harga satuan add-on). Kredit OCR yang belum terpakai ikut direfund."
- **Subscribe:** "Langganan prepaid tidak dapat direfund; sisa masa berjalan tidak hangus sebelum periode berakhir namun tidak dikembalikan."
- **Cara klaim & SLA:** "[Ajukan via email/kontak]; diproses via [Tripay refund / transfer manual] dalam [X] hari kerja."
- **Penempatan wajib:** ToS, halaman checkout (checkbox persetujuan sebelum bayar), dan banner login pertama.

---

## 11. Implikasi untuk spec 1a-Fondasi (input wajib)

Keputusan berikut harus diadopsi saat menulis 1a-Fondasi:

1. **Entitlement komposit** (§3.6) — bukan enum `plan` tunggal. Field disiapkan sejak awal dengan default aman.
2. **Admin-mini + tabel Config** (§9) — sumber harga & copy, `/admin` owner-only, tanpa koneksi ke DB internal.
3. **Offline-first stack** (§8.3) — PWA + service worker + IndexedDB sebagai fondasi UI kalkulator (Free teaser dan Beli).
4. **Magic-link auth** (NextAuth v5 + Resend) — reveal in-place pasca-login tanpa kehilangan state input.
5. **Waitlist** (§6) — flag/tabel minat "beri tahu saya saat rilis" untuk tier berbayar.

---

## 12. Revisi terhadap spec induk (2026-07-08)

| Induk | Semula | Direvisi menjadi |
|---|---|---|
| §2 matriks tier | Free / **Pro Lifetime** / Subscription | Free / **Beli** / Subscribe / **Add-on** (istilah "Lifetime" dibuang) |
| §2/§5 relasi tier | Lifetime & Sub sebagai tier terpisah | Beli & Subscribe **koeksis & orthogonal**; kompensasi pembeli (§3.3) |
| §5 Entitlement | `plan FREE\|LIFETIME\|SUB` enum tunggal | **Komposit** `lifetimeOwned` + `subStatus/subExpiresAt` (§3.6) |
| §7 refund | "kebijakan refund" (tak spesifik) | **7 hari**, dikurangi kredit OCR terpakai, tiga titik tampil (§3.5) |
| §1 "login wajib" | Login wajib di semua tier | **Teaser tanpa login** + Free login (§2, §4) |
| — | (tak ada POS) | **Mini-POS** value-added roadmap (§8) |

Bagian induk yang **tidak berubah**: 2 deployment terpisah total, storage lokal IndexedDB untuk Beli, cloud untuk Sub, grace read-only 90 hari, Tripay, SumoPod, drop Shopee/Spoolman/bot.

---

## 13. Di luar scope spec ini

- **Angka harga** tiap tier (ditunda — sesi terpisah).
- **Desain detail mini-POS** (modul baru — brainstorm & spec sendiri).
- **1a-Fondasi** (infra/auth/entitlement/theme/engine/deploy) — spec sendiri, memakai input §11.
- **1b (Beli/IndexedDB)** & **1c (Tripay payment)** — fase berikutnya.
- Implementasi kode apa pun — spec ini berhenti di desain; lanjut `writing-plans`.
