# Formula Kalkulator HPP — Dokumentasi & Rencana Perubahan

> **Status:** Fase 0 selesai — formula sudah di `packages/kalkulator-core` (legacy `hitungKalkulasi` = wrapper di atas `hitungKalkulasiV2`). Adopsi penuh v2 di dashboard internal (UI settings, migrasi DB helm→labor) menyusul di plan Fase 0b.

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
