# Formula Kalkulator HPP — Dokumentasi & Rencana Perubahan

> **Status:** Fase 0 selesai (formula di `packages/kalkulator-core`; legacy `hitungKalkulasi` = wrapper di atas `hitungKalkulasiV2`). **Fase 0b-1 selesai** — backend v2 internal siap: tabel `KalkPrinterProfile`/`KalkMaterialProfile`/`KomponenPreset`/`LaborPreset` (+seed `db:seed-kalk-v2`), `loadSettingsV2()` (channel via Config `kalk.channel.<id>`), API CRUD di `/api/kalkulator/{printer-profiles,material-profiles,komponen-presets,labor-presets,settings-v2}`. **Fase 0b-2a selesai** — Settings UI live: card "Kalkulator v2 — Profiles & Presets" di halaman Settings (printer/material/komponen/labor/channel+margin). **Fase 0b-2b-1 selesai** — service kalkulasi jalur v2: resolusi printer/material profile, mesin acuan harga (`mesinPerJamJual` di core; flag `isPricingReference`), input diperluas (labor[]/komponen[]/printerProfileId/materialProfileId, paritas legacy terjaga via test), `KalkulasiLabor` + kolom plate v2 + `hargaChannelJson`, pagination `listKalkulasi`, script `db:migrate-kalk-v2`. Menyusul Fase 0b-2b-2: UI form/panel/history pindah v2 + total per unit + pagination UI + drop kolom legacy.

**Sumber:** `shopee-dashboard/lib/kalkulator/formula.ts` + `rates.ts` (per 2026-07-08)
**Konteks:** acuan refactor ke `packages/kalkulator-core` (Fase 0 SaaS — lihat `docs/superpowers/specs/2026-07-08-saas-3pb-design.md`)

## 1. Formula yang berjalan sekarang

### Variabel input

| Variabel | Keterangan |
|---|---|
| `plates[]` | per plate: `tipe` (FDM/SLA), `durasiJam`, `gramasi`, `hargaPerGram?` (katalog), atau `materials[]` multi-material (gramasi + hargaPerGram per entry) |
| `batch` | unit yang dihasilkan 1 run print (min 1); total biaya run dibagi batch |
| `aksesori` | `packingType` (S/M/L/XL), `gantunganType`, `switchQty`, `hasLabel`, `komponenKustom[{harga, qty}]` |
| `hargaShopeeAktual?` | harga jual aktual → penentu status |
| `customRiskPct?` | override failure rate per kalkulasi |
| `helmOptions?` | jam sanding/painting/assembly + rate preparer/finisher + consumables flat |

### Rates (tabel `Config`, key `kalk.*`)

| Rate | Default | Arti |
|---|---|---|
| `fdmHppPerGram` / `fdmJualPerGram` | 300 / 900 | modal vs basis jual material FDM per gram |
| `slaHppPerGram` / `slaJualPerGram` | 1.750 / 3.500 | idem resin |
| `mesinPerJam` | 4.000 | biaya mesin/jam — hasil hitung manual user untuk P1P (listrik + depresiasi digabung) |
| `failureRatePct` | 12 | tingkat kegagalan print |
| `failureSpreadPct` | 50 | pembagian beban failure: (1−spread) → HPP owner, spread → harga customer |
| `testLayerPct` | 5 | biaya QC test layer (material saja) |
| `adminEcommerce` | 1,2 | multiplier markup harga Shopee |
| `packing.{S,M,L,XL}` | 1.500–8.000 | biaya packing |
| `gantungan.{kew_kew,ring,rantai,tali}` | 350–900 | aksesori gantungan (3DPB-specific) |
| `switchPerPcs` / `labelPerLembar` | 2.500 / 750 | aksesori (3DPB-specific) |
| `preparerRatePerJam` / `finisherRatePerJam` | 35.000 / 75.000 | labor finishing helm |

### Urutan hitung

```
# 1. Per plate
mesin       = durasiJam × mesinPerJam
matHpp      = Σ gramasi × (hargaPerGram ?? basisHpp)        # modal riil
matJual     = Σ gramasi × MAX(basisJual, hargaPerGram)      # basis floor price
failureCost = (matHpp + mesin) × failureRate
testCost    = matHpp × testLayerPct
plateHPP    = matHpp  + mesin + failureCost × (1 − spread) + testCost
plateJual   = matJual + mesin + failureCost × spread

# 2. Batch
hppProduksi = Σ plateHPP  / batch
jualBase    = Σ plateJual / batch

# 3. Komponen aksesori
hppKomponen = packing + gantungan + switch×qty + label + Σ(kustom.harga × qty)

# 4. Finishing (mode HELM)
hppFinishing = (jamSanding + jamAssembly) × preparerRate
             + jamPainting × finisherRate + flatConsumables

# 5. Total
hppTotal   = hppProduksi + hppKomponen + hppFinishing
floorPrice = jualBase    + hppKomponen + hppFinishing

# 6. Harga rekomendasi
offlineA/B/C = floorPrice × {1,1 / 1,5 / 2,0}               # hardcoded
shopeeA/B/C  = offline × adminEcommerce
resellerStd  = offlineA
resellerBulk = floorPrice × 1,05                            # hardcoded

# 7. Status vs hargaShopeeAktual
≥ shopeeA → AMAN | ≥ floorPrice → BAWAH_REKM | else → RUGI
```

Konsep penting:
- **Dua jalur harga material**: HPP memakai harga modal; floor price memakai harga jual per gram (min. basis jual). Margin sudah tertanam di level material, lalu multiplier margin diterapkan lagi di atasnya.
- **Failure spread**: biaya kegagalan dibelah — porsi owner masuk HPP, porsi customer masuk floor price.

## 2. Temuan review (2026-07-08)

1. **Bug laten**: plate SLA dengan `materials[]` memakai fallback rate FDM (`formula.ts:38-44`) — cabang multi-material tidak cek `tipe === 'SLA'`.
2. **Dead parameter**: `marginTier` diterima fungsi tapi tidak pernah dipakai (semua tier dihitung).
3. **Hardcoded**: multiplier margin A/B/C (1,1/1,5/2,0) dan reseller bulk (1,05) di kode, bukan setting.
4. `adminEcommerce` flat 1,2 terlalu kasar untuk SaaS multi-channel.
5. Aksesori 3DPB-specific (gantungan kew_kew, switch, label) tertanam di formula & rates.
6. `mesinPerJam` menggabungkan listrik + depresiasi; tiap printer nilainya beda.
7. `plateCost()` dipanggil 2× per plate (inefisiensi minor).

## 3. Perubahan yang disepakati (untuk `kalkulator-core`)

Keputusan user 2026-07-08:

1. **Komponen tambahan generik** — gantungan/switch/label **dihapus dari formula & rates**. Semua biaya non-print jadi `komponen[{nama, harga, qty}]`. Preset komponen tersimpan di settings (internal: migrasi gantungan/switch/label existing jadi preset; SaaS: murni preset buatan user, tier Pro). Packing tetap preset bawaan yang bisa diubah. `hppKomponen = Σ(komponen.harga × qty)`.
2. **Printer profile** — `mesinPerJam` bukan lagi satu angka global. Per printer profile: `nama, mesinPerJam` dengan kalkulator bantu: `mesinPerJam = (watt/1000 × tarifListrikPerKwh) + (hargaPrinter / umurPakaiJam) + maintenancePerJam?`. Tiap plate memilih printer profile-nya. Free tier: 1 profil default; Pro: multi-profil tersimpan. (Angka 4.000 existing = hasil hitung manual user untuk P1P.)
3. **Material profile** — per jenis filament (PLA/PETG/ABS/ASA/TPU/…): harga modal & jual default per gram + **failure rate per jenis**. Failure rate efektif plate = weighted average berdasarkan gramasi. `customRiskPct` tetap sebagai override manual.
4. **Labor cost generik** menggantikan mode HELM — komponen labor `{nama, jam, ratePerJam}` atau flat; helm tiers existing (sanding/painting/assembly MINIMAL–HEAVY) jadi preset bawaan; data internal dimigrasi.
5. **Channel fee** menggantikan `adminEcommerce` — daftar channel `{nama, feeMultiplier}` (Shopee, Tokopedia, TikTok Shop, offline, …); harga rekomendasi dihitung per channel.
6. **Margin multiplier A/B/C dan reseller bulk jadi setting**, bukan konstanta.
7. Perbaikan teknis: bug SLA multi-material, hapus dead param `marginTier`, single-pass `plateCost`.

Formula inti (failure spread, test layer, batch, dua jalur harga material, status) **tidak berubah**.

### Keputusan tambahan 2026-07-12 (untuk Fase 0b-2b): mesin acuan harga

Output print bersifat fungible — customer tidak tahu/tidak peduli mesin mana yang mencetak. Maka:

- **HPP memakai printer profile AKTUAL** yang dipilih per plate → mencerminkan biaya produksi riil, dipakai untuk membandingkan produktivitas/profitabilitas antar mesin.
- **Floor price (dan semua rekomendasi harga jual) memakai printer profile ACUAN HARGA** — satu profil yang di-set manual oleh user (flag `isPricingReference` / badge "acuan harga" di samping badge "default"; lazimnya mesin termahal). Harga jual jadi stabil, tidak ikut turun saat produksi pindah ke mesin yang lebih murah/lunas; mesin mana pun dijamin tidak rugi.
- **Failure buffer tetap dihitung dari biaya aktual** (buffer biaya, bukan komponen harga).
- Konsekuensi UI 0b-2b: HasilPanel bisa menampilkan perbandingan margin per printer profile untuk job yang sama.
- Menggantikan ide `jualPerJam` per printer (dibatalkan).

### Permintaan UI kalkulator untuk Fase 0b-2b (2026-07-12)

1. **Total per unit di baris TOTAL part/plate**: selain total gram & durasi seluruh part, tampilkan juga hasil bagi per unit (`total gram ÷ batch`, `total durasi ÷ batch`). Kebutuhan: membandingkan mekanisme produksi batch vs satuan — gram/waktu per unit berbeda antara print sekaligus vs print satuan, dan angka ini jadi penentu mekanisme akhir. Contoh: batch 26, total 317,5 g / 11j53m → per unit 12,2 g / ±27 m.
2. **Pagination di list history kalkulasi** (KalkulasiHistory) — data sudah banyak; tambahkan pagination (page size ±10) di UI + dukungan `page/limit` di API/service `listKalkulasi` (✅ backend selesai di 0b-2b-1; UI menyusul).
3. **Panel "Rincian Perhitungan" (debug trace)** — user perlu bisa membaca perhitungan langkah demi langkah untuk debugging. Desain:
   - **Core**: `hitungKalkulasiV2` mengembalikan field opsional tambahan `rincian` — per plate: setiap material entry (`gramasi × hppPerGram = matHpp`, idem jual), `mesin = durasiJam × mesinPerJam`, `mesinJual` (bila beda), `failureRatePct` efektif + `failureCost` + pembagiannya (owner/customer via spread), `testCost`, subtotal `plateHpp/plateJual`. Additive — golden test tak tersentuh.
   - **Resolve (app)**: lampirkan metadata sumber tiap angka — printer profile mana (nama, aktual vs acuan), sumber harga material (override manual / katalog FilamentHarga / material profile / default rates), sumber failure rate.
   - **UI**: seksi collapsible di HasilPanel (atau modal 🔍) menampilkan trace dengan formula terisi angka nyata, urut: per plate → agregasi ÷ batch (sekalian total per-unit dari poin sebelumnya) → komponen rows → labor rows → floor → margin A/B/C → fee per channel → status. Live di form (client-side) dan tersedia juga untuk kalkulasi tersimpan.

## 4. Hasil implementasi (AFTER — merged ke master `d74affb`, 2026-07-08)

### Lokasi & konsumsi

- Formula hidup di **`packages/kalkulator-core`** (source TS, tanpa build step; export dari `src/index.ts`).
- Dikonsumsi app via dependency `"@3pb/kalkulator-core": "workspace:*"` + `transpilePackages` di `next.config.ts`.
- Test: 30 test di package (`pnpm --filter @3pb/kalkulator-core test`); CI menjalankan `pnpm turbo test`.

| File | Isi |
|---|---|
| `src/types.ts` | tipe legacy (PlateInput, KalkulatorRates, HasilKalkulasi, dst.) + tipe v2 (MaterialProfile, PrinterProfile/PrinterCostInput, KomponenItem, LaborItem, ChannelDef, SettingsV2, MaterialUsageV2, PlateInputV2, KalkulasiInputV2, HargaChannelV2, HasilKalkulasiV2) |
| `src/formula.ts` | `hitungKalkulasi(...)` **legacy = wrapper** — adapter → v2 → presenter pembulatan lama |
| `src/formula-v2.ts` | `hitungKalkulasiV2(input, settings)` — formula inti, **tanpa pembulatan** |
| `src/adapter.ts` | `legacyPlateToV2`, `legacyKomponenToV2`, `helmToLabor`, `legacySettingsToV2`, tipe `LegacyAksesori` |
| `src/printer.ts` | `hitungMesinPerJam({watt, tarifPerKwh, hargaPrinter, umurPakaiJam, maintenancePerJam?})` |

### API

```ts
// Legacy (dipakai dashboard internal sekarang) — output identik pra-refactor
hitungKalkulasi(plates, aksesori, batch, rates, hargaShopeeAktual?, customRiskPct?, helmOptions?)
// ⚠ BERUBAH dari pra-refactor: param ke-5 `marginTier` DIHAPUS (dead param).
// Field marginTier di KalkulasiInput/DB tetap ada — hanya untuk memilih tampilan tier.

// V2 (dipakai SaaS Fase 1 + internal setelah Fase 0b)
hitungKalkulasiV2(input: KalkulasiInputV2, settings: SettingsV2): HasilKalkulasiV2
```

Semantik v2 vs legacy:
- **Material per entry** membawa `hppPerGram/jualPerGram/failureRatePct` sendiri (resolved dari material profile); failure rate plate = **weighted average by gramasi**; `customRiskPct` meng-override semua.
- **Mesin per plate** (`mesinPerJam` dari printer profile), bukan angka global.
- **Komponen & labor generik** (`KomponenItem[]`, `LaborItem[]` = jam×rate + flat) menggantikan packing/gantungan/switch/label & mode HELM.
- **Harga per channel**: `floorPrice × marginMultiplier × feeMultiplier`; margin dihitung dari net (A ÷ fee); status dibanding `hargaAktual {channelId, harga}`.
- Hasil v2 **tidak dibulatkan** — pembulatan urusan presenter.

### Rates baru (Config keys)

`kalk.margin.a/b/c` (default 1.1/1.5/2.0) dan `kalk.resellerBulk.multiplier` (1.05) → `rates.marginMultipliers` & `rates.resellerBulkMultiplier`. Multiplier tidak lagi hardcoded.

### Catatan paritas wrapper (penting saat menyentuh adapter/wrapper)

1. `hppFinishing = Math.round(v2.hppLabor)` **sebelum** dijumlahkan ke hppTotal/floorPrice (reproduksi pembulatan lama).
2. Wrapper meneruskan `customRiskPct ?? rates.failureRatePct` sebagai `customRiskPct` v2 — failure rate jalur legacy selalu konstan, sehingga **failure buffer tetap kena biaya mesin meski total gramasi 0** (ada regression test-nya).
3. V2 meng-clamp `jual = max(jualPerGram, hppPerGram)` per material — floor price tidak pernah di bawah modal. Beda halus dari legacy hanya jika user set jual < hpp.
4. 14 golden test legacy di `formula.test.ts` adalah kontrak paritas — **jangan diedit** untuk meloloskan perubahan wrapper/adapter.

### Perubahan perilaku yang disengaja (satu-satunya)

Plate **SLA multi-material** kini memakai rate SLA (dulu bug: fallback FDM, 300/g vs 1.750/g).

### Belum berubah (menunggu Fase 0b)

Dashboard internal masih memanggil wrapper legacy dengan field gantungan/switch/label & mode HELM. Fase 0b: migrasi DB + UI ke v2 (settings printer/material profile, komponen preset, labor cost).
