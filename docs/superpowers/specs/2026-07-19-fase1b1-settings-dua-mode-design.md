# Slizebiz — Fase 1b-1: Panel Setting Dua-Mode + Storage Lokal Design

**Tanggal:** 2026-07-19
**Status:** Draft (brainstorming, menunggu review user)
**Scope:** Panel `/settings` **dua-mode** untuk `apps/saas` Slizebiz (live homelab :3300) — Free lihat setting **read-only + 🔒** (preview apa yang dibuka Beli), Beli **edit + simpan lokal (IndexedDB)** dan kalkulator langsung pakai setting custom-nya. **Bukan** implementasi; output = masukan `writing-plans`.

**Konteks fase:** 1b (Beli — mengisi nilai yang dibuka 1c) dipecah: **1b-1 (spec ini)** = setting parametrik dua-mode + storage lokal · **1b-2** = komponen/labor preset + multi-plate/labor input + save hasil · **1b-3** = PWA/offline · account-linking = track auth terpisah. Payment Beli (1c) sudah flip `lifetimeOwned`; `capabilities().paidCore = lifetimeOwned || subActive`.

---

## 1. Keputusan (decision log)

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Panel setting **SATU** kali, dua mode by kapabilitas (`paidCore`). Free read-only+🔒, Beli editable. | Upsell jujur (Free lihat apa yang dibuka Beli) — prinsip funnel "fitur terkunci tetap kelihatan". Bukan UI teaser terpisah. |
| 2 | Tier Beli = data **lokal** → setting custom di **IndexedDB** (lib `idb`), per `userId`. | Keputusan tier: Beli=lokal (Sub=cloud, nanti). Per-userId biar ganti akun di browser sama tak ketuker. |
| 3 | Scope 1b-1 = **setting parametrik** saja: material FDM/SLA (hpp/jual/failure), `mesinPerJam` tunggal, failureSpread, testLayer, margin A/B/C, fee channel (offline/shopee). | Yang langsung nge-tune angka single-plate. Komponen/labor preset & CRUD banyak-profil = 1b-2/nanti. |
| 4 | Kalkulator pakai setting custom **hanya bila `paidCore`** (turunan entitlement server). | Pertahanan: Free yang iseng nulis IndexedDB tetap dapat angka default. |
| 5 | Angka Free **identik** dengan sekarang (default konstanta). Dijaga test parity. | Tak boleh regresi kalkulator Free. |

---

## 2. Storage lokal & bentuk data

**`LocalSettings` (tipe, superset yang dipakai kalkulator):**
```ts
export interface LocalSettings {
  material: {
    FDM: { hppPerGram: number; jualPerGram: number; failureRatePct: number };
    SLA: { hppPerGram: number; jualPerGram: number; failureRatePct: number };
  };
  mesinPerJam: number;
  failureSpreadPct: number;
  testLayerPct: number;
  margin: { A: number; B: number; C: number };
  resellerBulkMultiplier: number;
  channels: { offline: number; shopee: number }; // feeMultiplier
}
```
`DEFAULT_LOCAL_SETTINGS` = dari konstanta existing (`DEFAULT_MATERIAL` FDM 300/900/12 · SLA 1750/3500/12; `DEFAULT_MESIN_PER_JAM` 4000; `defaultSettings` failureSpread 50, testLayer 5, margin 1.1/1.5/2.0, resellerBulk 1.05, channel offline 1.0/shopee 1.2). Semua field di atas **editable** untuk Beli.

**Scope material/mesin = ubah-angka (opsi A), BUKAN CRUD banyak profil:** field material tetap 2 jenis tetap (FDM & SLA, tiap-tiap 3 angka), mesin = **satu** `mesinPerJam`. "Tambah/hapus profil material/printer sendiri + pilih per-plate" = 1b-2 (bareng multi-plate).

**Modul `lib/store/local-settings.ts`** (client-only, `idb`):
- `loadSettings(userId: string): Promise<LocalSettings>` — baca record `userId` dari object store `settings`; tak ada / error / IndexedDB absen → return `DEFAULT_LOCAL_SETTINGS` (kalkulator tetap jalan).
- `saveSettings(userId: string, s: LocalSettings): Promise<void>` — upsert. Throw bila gagal (caller tampil pesan).
- `resetSettings(userId: string): Promise<void>` — hapus record `userId` (→ balik default).
- DB name `slizebiz-local`, store `settings` (keyPath `userId`).

**Modul `lib/kalkulator/local-settings.ts`** (isomorphic, no idb): `DEFAULT_LOCAL_SETTINGS` + `toSettingsV2(ls): SettingsV2` (map `failureSpreadPct`/`testLayerPct`/`margin`→`marginMultipliers`/`resellerBulkMultiplier: ls.resellerBulkMultiplier`/`channels:[{id:"offline",nama:"Offline",feeMultiplier:ls.channels.offline},{id:"shopee",nama:"Shopee",feeMultiplier:ls.channels.shopee}]`) + `validateLocalSettings(ls): string[]` (daftar error, kosong = valid).

---

## 3. Panel `/settings` dua-mode

**Server page `app/settings/page.tsx`** (login wajib): `auth()` → tak login → `redirect("/login")`; `getEntitlement(userId)` → `paidCore = capabilities(ent).paidCore`; render `<SettingsPanel editable={paidCore} userId={userId} />`.

**Client `components/SettingsPanel.tsx`:**
- On-mount: `editable` → `loadSettings(userId)`; else `DEFAULT_LOCAL_SETTINGS`. Simpan ke state.
- Grup field (semua angka): **Material** (FDM & SLA: hpp/jual/failure), **Mesin** (`mesinPerJam`), **Failure & prototype** (`failureSpreadPct`, `testLayerPct`), **Margin** (Kompetitif=A / Standard=B / Premium=C via `MARGIN_TIER_LABEL` + **Reseller bulk** = `resellerBulkMultiplier`), **Fee channel** (offline, shopee).
- **Free (read-only):** input `disabled`, tiap grup badge **🔒** + tombol/link **"Edit di Beli →"** ke `/beli`. Header: "Ini setting default. Beli untuk mengubah & pakai di kalkulatormu."
- **Beli (editable):** input aktif; tombol **Simpan** (`validateLocalSettings` → bila ada error tampil hint & batal; else `saveSettings` → "Tersimpan.") + **"Reset ke default"** (`resetSettings` → muat ulang default).
- Kalkulator dapat link **⚙ Setting** ke `/settings` (di header, saat login).

---

## 4. Kalkulator pakai setting custom

**`lib/kalkulator/compute.ts` diperluas** (backward-compatible):
- `buildInputV2(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): KalkulasiInputV2` — material dari `ls.material[c.tipe]`, `mesinPerJam`/`mesinPerJamJual` dari `ls.mesinPerJam`.
- `fullView(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): FullView` — `hitungKalkulasiV2(buildInputV2(c, ls), toSettingsV2(ls))`; nama channel dari `toSettingsV2(ls).channels`.
- `compute(c, ls?)` sama pola. Ekspor `defaultSettings` lama tetap ada (derive dari `toSettingsV2(DEFAULT_LOCAL_SETTINGS)`) agar test 1a-1 tak putus.

**`components/Calculator.tsx`:** terima props tambahan **opsional** `paidCore?: boolean` (default `false`) + `userId?: string | null` (default `null`) — biar test 1a-1 existing (`<Calculator authenticated=.../>`) tetap lulus tanpa ubah. On-mount bila `paidCore && userId` → `loadSettings(userId)` → simpan ke state `settings` (default `DEFAULT_LOCAL_SETTINGS`). `fullView(input, settings)`. `app/page.tsx` (server) hitung `paidCore` (`getEntitlement`+`capabilities`) + `userId`, teruskan. Free/anon → `settings` tetap default → **angka identik sekarang**.

---

## 5. Error handling

- **IndexedDB absen/gagal** (mode privat, browser lawas): `loadSettings` → default (kalkulator & panel tetap render); `saveSettings` gagal → pesan "Gagal simpan, coba lagi" (non-fatal, data lama tak hilang).
- **Nilai invalid** (`validateLocalSettings`): hpp/jual/mesin ≤ 0, failure di luar 0–100, margin ≤ 0, resellerBulk ≤ 0, feeMultiplier < 1 → Simpan ditolak + hint field mana.
- **Free defense:** kalkulator terapkan custom hanya bila `paidCore`; panel Free input disabled (nggak bisa Simpan). Setting custom di IndexedDB milik user Free (mis. sisa dari pernah Beli lalu refund) diabaikan kalkulator selama `!paidCore`.
- **Parity Free:** `fullView(c)` == `fullView(c, DEFAULT_LOCAL_SETTINGS)` == angka lama.

---

## 6. Testing (TDD)

- **`lib/kalkulator/local-settings.ts`**: `toSettingsV2(DEFAULT_LOCAL_SETTINGS)` == `defaultSettings` lama (parity); `toSettingsV2(custom)` reflect (ubah `margin.A`/`channels.shopee`/`failureSpreadPct` → SettingsV2 ikut); `validateLocalSettings` tangkap tiap kelas error.
- **`compute.ts`**: `fullView(c)` == `fullView(c, DEFAULT_LOCAL_SETTINGS)` (parity, tak regresi); `fullView(c, custom)` beda sesuai custom (mis. naikkan `margin.A` → `channels[offline].A`/rekomendasi ikut naik); material FDM vs SLA dari `ls.material`.
- **`lib/store/local-settings.ts`** (pakai `fake-indexeddb`): save→load roundtrip; load tanpa record → default; reset → default; dua userId terpisah.
- **`SettingsPanel`** (jsdom): Free → input `disabled` + ada teks/lock + link Beli; Beli → input aktif + Simpan panggil `saveSettings` + Reset panggil `resetSettings`; nilai invalid → tak panggil save + tampil hint.
- **`Calculator`** gating: `paidCore=false` → pakai default walau store punya custom (mock store); `paidCore=true` → pakai loaded custom.
- Regresi test 1a-1/1a-2/1c existing tetap hijau.

---

## 7. Batas scope & deploy

| IN (1b-1) | Ditunda |
|---|---|
| Storage lokal IndexedDB, `/settings` dua-mode (material/mesin/failure-spread/test-layer/margin/fee channel), kalkulator pakai custom saat Beli, reset default, link ⚙ Setting | **komponen/labor preset + multi-plate/labor input + save hasil** (1b-2); **CRUD banyak profil** printer/material; **PWA/offline** (1b-3); **account linking** (track auth); **cloud sync** (Subscribe) |

- **Deploy homelab :3300** (`bash apps/saas/deploy.sh`) — **tak ada perubahan skema DB** (setting Beli murni client IndexedDB; Prisma tak disentuh). Gated (izin user).
- Dep baru: `idb` + `fake-indexeddb` (dev). Dashboard tak pakai, tambah ke `@3pb/saas`.
- **Di luar scope:** implementasi kode — spec berhenti di desain; lanjut `writing-plans`.
