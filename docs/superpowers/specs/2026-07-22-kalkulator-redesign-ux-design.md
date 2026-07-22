# Redesign UX Kalkulator Harga Jual (apps/saas Slizebiz)

**Tanggal:** 2026-07-22
**Status:** Design disetujui, siap plan
**Worktree:** `feat/saas-calc-redesign`
**Sumber:** prompt refactor UX user (15 bagian) + audit sesi.

## Ringkasan

Halaman kalkulator (`apps/saas` `/`) sekarang menumpuk Produksi/komponen/labor/packing dalam satu kartu panjang tanpa hierarki, panel hasil datar (banyak angka bobot sama, tanpa laba/margin), dan kontrol beda-perilaku tampak seragam. Redesign ini menata form jadi **section bertahap sesuai alur kerja**, memperjelas tiap input, dan menjadikan panel hasil **satu rekomendasi dominan** dengan laba & margin.

**Batasan keras:** formula bisnis di `@3pb/kalkulator-core` **tidak diubah** (14 golden test tetap hijau). Perubahan angka hanya di lapisan **tampilan** (pembulatan, laba/margin turunan). Fitur lama tak dihapus. Tema dark purple dipertahankan, kontras & hierarki dirapikan.

## Keputusan brainstorming

| Keputusan | Pilihan |
|---|---|
| Action "Simpan kalkulasi" | **Tunda ke Fase 1b-4.** Sekarang "Salin harga jual" + "Reset" aktif; "Simpan" tampil disabled berlabel "segera" |
| Format input angka (35000→35.000, koma desimal) | **Tunda** ke polish pass terpisah. Redesign pakai input `type=number` native (unit suffix sudah ada). Format ribuan **hanya di angka hasil & subtotal** |
| Pembulatan harga jual tampil | **Bulat ke atas kelipatan 500**: `Math.ceil(x/500)*500` (187.155→187.500, 54.721→55.000). Angka eksak tetap di Rincian |
| Laba & margin | Turunan tampilan: `net = harga/fee`, `laba = net − modal`, `margin% = laba/net`. Bukan ubah formula |

## Arsitektur komponen

Pecah `KomponenLaborInput` & isi `Calculator` jadi komponen fokus (satu tanggung jawab, mudah ditest):

| File | Aksi | Tanggung jawab |
|---|---|---|
| `apps/saas/lib/kalkulator/format.ts` | Create | `rupiah(n)`, `ceil500(n)` |
| `apps/saas/lib/kalkulator/compute.ts` | Modify | `fullView` tambah field additive `strategi` (§ View) |
| `apps/saas/components/CalcSection.tsx` | Create | Kartu section collapsible (badge nomor + judul + subtotal; ringkasan saat collapse) |
| `apps/saas/components/PlateInput.tsx` | Modify | Section Produksi: label permanen, "Hasil sekali cetak", subtotal per-proses & per-produk |
| `apps/saas/components/KomponenInput.tsx` | Create (pecah) | Komponen: checkbox-chip → baris ringkas + stepper qty + custom |
| `apps/saas/components/LaborInput.tsx` | Create (pecah) | Finishing: segmented metode waktu/flat, preset, custom |
| `apps/saas/components/PackingInput.tsx` | Create (pecah) | Packing: radio card + "Tanpa packing" |
| `apps/saas/components/KomponenLaborInput.tsx` | Delete | Digantikan tiga komponen di atas |
| `apps/saas/components/ResultPanel.tsx` | Create | Panel hasil: channel, strategi, laba/margin, rincian, aksi; sticky desktop + bottom-sheet mobile |
| `apps/saas/components/RincianPanel.tsx` | Modify/absorb | Rincian per section baru (produksi/komponen/finishing/packing/total); dipindah ke dalam ResultPanel |
| `apps/saas/components/Calculator.tsx` | Modify | Orkestrasi: state + urutan section + ResultPanel |

## Perluasan `fullView` (additive, tanpa ubah formula)

Field lama `fullView` **dipertahankan** (biayaModal, hargaJualMinimum, rekomendasi, channels[], status, rincian) agar seluruh test compute lama hijau. Tambah:

```ts
// Per channel per tier: harga TAMPIL (dibulatkan ceil500), laba, margin%
strategi: Record<string /*channelId*/, Record<"A"|"B"|"C", {
  harga: number;      // ceil500(channel[tier])
  laba: number;       // round(net − hppTotal), net = channel[tier]/feeMultiplier
  marginPct: number;  // round1((laba/net)*100)
}>>;
```

- `feeMultiplier` diambil dari `toSettingsV2(ls).channels`. Untuk offline fee=1 → net=harga. Untuk Shopee fee=1.2 → net=harga/1.2.
- Laba/margin dihitung dari harga **yang sudah dibulatkan** (konsisten dengan yang ditampilkan).
- `hargaJualMinimum` di panel ditampilkan `ceil500`; nilai eksak tetap di rincian.

## Section kiri (urutan sesuai alur kerja)

Tiap section = `CalcSection` collapsible. Header: badge nomor + judul + subtotal (kanan). Saat collapse tampil ringkasan singkat. Default: semua terbuka di desktop.

### 1. Produksi (`PlateInput`)
- Label permanen di atas tiap field: **Metode cetak · Berat filament · Durasi cetak** (Pro multi-plate) — Free tetap layout berlabel yang sudah ada.
- Ganti "Batch (pcs sekali cetak)" → **"Hasil sekali cetak"** + helper "Berapa produk yang dihasilkan dari sekali proses cetak?". Nilai minimal 1.
- Tampilkan: **Biaya produksi per produk** = `rincian.produksi` (core sudah membagi dengan hasil sekali cetak) & **Biaya produksi per proses** = `rincian.produksi × hasilSekaliCetak`. Kalau hasil >1, per-produk harus jelas terlihat lebih kecil.
- Istilah tombol konsisten: **"Tambah plate"**.
- Subtotal section = biaya produksi (per produk) = `rincian.produksi`.

### 2. Komponen tambahan (`KomponenInput`)
- Preset = **checkbox-chip**: klik → langsung jadi baris ringkas; klik lagi (chip aktif, bercentang) → hapus baris. Cegah item preset sama dobel (klik kedua = toggle off).
- Baris ringkas: `✓ Nama · Rp<harga> × [− <qty> +] = Rp<subtotal> · [hapus]`. Qty via stepper − / + (min 1). Harga satuan tetap bisa diedit (field angka).
- Tombol "+ manual" → **"+ Tambah komponen custom"** (baris kosong, bukan preset).
- Subtotal komponen sendiri (TIDAK digabung packing).

### 3. Finishing & tenaga kerja (`LaborInput`)
- Tiap baris punya **segmented control metode: [Berdasarkan waktu] [Biaya flat]**.
  - Waktu → tampil `Durasi [0,5 jam] × Tarif [Rp35.000/jam] = Rp17.500`. Field flat disembunyikan.
  - Flat → tampil `Biaya pekerjaan [Rp17.500]`. Field jam & rate disembunyikan.
  - Metode awal baris: "waktu" jika ada jam/rate, "flat" jika hanya flat (deteksi dari data preset).
- Preset "Mask Minimal/Medium/Heavy" diberi heading **"Preset pengerjaan mask"** (mereka spesifik produk mask). Nama & isi preset dari settings tak diubah.
- Tombol "+ manual" → **"+ Tambah pekerjaan custom"**.
- Tiap baris tampil total biaya baris. Subtotal finishing = `rincian.labor`.

### 4. Packing (`PackingInput`)
- **Radio card** single-select: `○ Tanpa packing` + satu card per preset (`● Packing S · Rp1.500`). State aktif jelas.
- "Tanpa packing" → `packing = undefined`.
- Subtotal packing sendiri = `rincian.packing`.

## Panel hasil kanan (`ResultPanel`)

Desktop: sticky (tetap terlihat saat form panjang). Struktur atas-ke-bawah:
1. **Channel penjualan** — segmented `[Offline] [Shopee]` (state `selectedChannel`, default "offline").
2. **3 strategy card** `[Kompetitif] [Standard] [Premium]` (=A/B/C). Tiap card: harga (ceil500) + laba Rp + margin %. Card aktif sangat jelas (border/aksen). Default **Standard (B)**. Card terpilih → `selectedTier`.
3. **REKOMENDASI HARGA JUAL** — dominan (font terbesar/bold aksen) = `strategi[channel][tier].harga`. Subteks: `<Strategi> · <Channel>` + "Estimasi laba Rp… · Margin …%".
4. **Biaya modal** (sekunder) = `rincian.biayaModal`.
5. **Harga aman minimum** = `ceil500(hargaJualMinimum)` + helper "Sudah menutup modal, overhead, dan margin minimum." (rename dari "Harga jual minimum").
6. Caveat marketplace bila `selectedChannel==="shopee"`: "Harga sudah termasuk perkiraan biaya admin marketplace, tapi **belum** termasuk voucher, subsidi ongkir, atau iklan."
7. **Rincian biaya** (angka eksak, `rincian`): Produksi · Komponen · Finishing & tenaga kerja · Packing · **Total modal** (bold). Baris nol disembunyikan. Hapus baris "Rekomendasi (Standard)" lama (sekarang jadi headline).
8. **Aksi**: `[Salin harga jual]` (copy harga rekomendasi ke clipboard, feedback "Tersalin"), `[Reset]` (kembalikan semua input ke default awal), `[Simpan]` disabled + badge "segera" (→ 1b-4).
9. Status (AMAN/BAWAH_REKM/RUGI) tetap dari `view.status` bila relevan (map ke kalimat manusia; TIDAK_DISET disembunyikan — perilaku existing).
10. **Penjelasan akurat** (opsional, collapsible "Tentang perhitungan"): kalimat singkat yang BENAR — "Margin = laba ÷ harga jual" dan "Harga aman minimum sudah menutup modal, overhead, dan margin minimum". **JANGAN** tampilkan rumus `Harga Jual = Modal / (1 − Margin)` (bukan formula app: app pakai `(material-jual + mesin-jual) × margin × fee`) dan **jangan** sebut angka margin-minimum spesifik yang tidak diturunkan dari perhitungan (mis. "20%" karangan). Istilah teknis lain cukup lewat tooltip ℹ.

### Gating
Halaman ini **wajib login** (`page.tsx` redirect ke `/login`), jadi `authenticated` selalu true — channel & strategi **tampil untuk semua user login** (Free & Pro), sama seperti sekarang. Yang di-gate Pro (`paidCore`) tetap: komponen, finishing/labor, packing, multi-plate & batch (section-nya menampilkan blok 🔒 + CTA `/beli` untuk Free, pola existing). `LockedBlock` yang lama (`locked={!authenticated}`) efektif selalu terbuka; boleh dihapus/disederhanakan saat merakit ResultPanel.

## Mobile / Responsive

- **Desktop (≥ md)**: form kiri, ResultPanel sticky kanan (2 kolom).
- **Tablet**: 2 kolom bila muat; jika sempit, ResultPanel pindah ke bawah / sticky summary.
- **Mobile (< md)**: section 1 kolom. ResultPanel jadi **sticky bottom bar**: `Modal Rp… · Harga jual Rp… · [Lihat rincian]`. Tombol "Lihat rincian" buka **bottom sheet** berisi ResultPanel penuh. Sticky bar tak menutupi field terakhir (padding-bottom pada konten). Target sentuh ≥ 44px. Chip tak overflow (fix `min-w-0` sudah ada).

## Visual hierarchy

- **Kontras**: naikkan keterbacaan label/helper/subtotal/angka rincian — hindari abu terlalu redup di atas ungu gelap (pakai tingkat `g-t2`/`g-t3` bukan `g-t4`/`g-t5` untuk info penting). Manfaatkan token light-theme yang sudah diperbaiki.
- **Typography**: jenjang jelas — Judul halaman > Judul section > Label field > Isi > Helper > Subtotal; **Rekomendasi harga = elemen paling dominan**.
- **Spacing**: konsisten; kurangi kartu-dalam-kartu berlebih & border ganda; whitespace pemisah kelompok.
- **State**: default/hover/focus/active/disabled/error jelas; **focus ring** terlihat untuk keyboard.

## Kontrol per perilaku (§10)

- **Radio card** → Packing (single).
- **Checkbox-chip** → preset Komponen (multi).
- **Segmented control** → metode labor (waktu/flat) & channel penjualan.
- **Button** → aksi tambah item.
- **Stepper − / +** → qty komponen.
- **Input field** → data angka.

## Validasi

- Berat ≥ 0, Durasi ≥ 0, Hasil sekali cetak ≥ 1, Qty ≥ 1, harga komponen & tarif labor ≥ 0.
- Pesan error tampil dekat field terkait (bukan hanya invalidasi diam). Kalkulasi realtime tetap: input invalid → hasil disembunyikan/di-hold, bukan crash.

## Testing (TDD, formula tak diubah)

- **`format.test.ts`**: `ceil500` (187155→187500, 54721→55000, kelipatan pas tetap, 0→0), `rupiah` format id-ID.
- **`compute.test.ts`** (additive): `fullView.strategi` — harga = ceil500(channel tier); laba = round(net−modal); margin konsisten; offline fee=1 (net=harga) vs shopee fee=1.2 (net=harga/1.2); field lama tetap ada (test lama hijau).
- **`CalcSection.test.tsx`**: render judul+subtotal; toggle collapse menyembunyikan body & menampilkan ringkasan.
- **`KomponenInput.test.tsx`**: chip toggle on→baris, off→hapus; stepper qty +/− (min 1); custom tambah baris kosong; subtotal.
- **`LaborInput.test.tsx`**: segmented waktu↔flat menyembunyikan field lawan; preset mask heading; total baris; subtotal.
- **`PackingInput.test.tsx`**: radio single-select; "Tanpa packing" → undefined; state aktif.
- **`ResultPanel.test.tsx`**: pilih channel & strategi mengubah headline; laba/margin tampil; Salin memanggil clipboard; Reset memanggil handler; Simpan disabled.
- **`calculator.test.tsx`** (perluas): Free single-plate parity angka; Pro section + panel terpasang; ganti channel/strategi ubah headline; tambah/hapus komponen & labor; ganti packing; ganti hasil-sekali-cetak; regresi crypto `newId` tetap.
- Semua id baris pakai `newId()` (bukan `crypto.randomUUID`). Seluruh test 1a/1b existing hijau.

## Global Constraints

- **Bahasa Indonesia** semua label/microcopy/komentar.
- **Nol perubahan formula** `@3pb/kalkulator-core` (14 golden + test v2 hijau). Perubahan angka hanya tampilan (pembulatan, laba/margin turunan).
- **`newId()`** untuk id baris klien — jangan `crypto.randomUUID()`.
- Tier disebut **"Pro"** (bukan "Beli"); Kompetitif/Standard/Premium untuk strategi.
- Halaman wajib pakai `PageShell` (sudah), tema Glass dark/light (`docs/ui-page-layout.md`, `glass-ui-theme`).
- Aksesibilitas keyboard & screen reader dijaga; focus ring jelas; touch target ≥44px mobile.
- Tanpa dependency baru; pakai primitives `@3pb/ui` & pola existing.
- Kerja hanya di worktree `feat/saas-calc-redesign`; commit path spesifik, jangan `git add -A`.
- Deploy homelab :3300 gated.

## Referensi visual

Mockup user (2026-07-22) = acuan visual/tata letak target: header + aksi (Salin/Reset/Simpan), 4 section bernomor, panel kanan (channel → 3 strategy card laba/margin → rekomendasi dominan → biaya modal → harga aman minimum → rincian), sticky bottom summary. Implementasi memakai sistem Glass existing (senada, tak harus pixel-identik). **Guardrail dari review mockup**: pembulatan tetap ceil-500 (headline Rp187.500, bukan eksak); tanpa rumus `Modal/(1−margin)` & tanpa "margin minimum 20%" karangan; tombol Simpan disabled ("segera").

## Di luar scope (follow-up)

- **Simpan kalkulasi + history + muat ulang** = Fase 1b-4.
- **Catatan (opsional) per kalkulasi** = Fase 1b-4 (digarap bareng Simpan supaya tak jadi field yatim tanpa persistensi).
- **Format input angka live** (35000→35.000 saat mengetik, koma desimal) = polish pass terpisah.
- Subtotal Rp per-plate detail & material/printer profile per-plate = tetap di luar (dari 1b-3).
- Deskripsi teks per preset packing ("Kantong OPP + bubble wrap") = butuh field baru di Setting; di luar scope (preset saat ini hanya nama+harga).
