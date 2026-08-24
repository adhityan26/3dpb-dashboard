# Ring Resizer + Engraver — Design Spec

**Tanggal:** 2026-08-25 · **Status:** draft untuk review
**Lokasi:** modul baru `ring-resizer` di `apps/dashboard` (3PB Ops), seksi "3D Tools" pertama.

## 1. Ringkasan

Tool internal untuk memproses STL cincin multi-part per order customer:

1. **Setup (sekali per model cincin):** import semua part STL sebuah model cincin (band, frame, stone, …), kasih nama, lalu di viewer 3D klik permukaan tiap part untuk menaruh **anchor engrave** (posisi + orientasi text). Anchor ditaruh di permukaan tersembunyi (dalam band, dalam frame/stone) supaya tak terlihat customer tapi memudahkan matching part saat assembly. Tersimpan permanen — bisa diedit kapan pun.
2. **Produksi (per order):** pilih model → input ukuran customer (US size / diameter / keliling + opsi kelonggaran +0.3 mm) → input text engrave (default label ukuran, bisa ditimpa kode order) → server men-scale semua part **uniform & exact**, meng-engrave text di semua anchor, lalu kasih download ZIP berisi STL siap slice.

Kasus pertama: Green Lantern Ring 2026 (#LS2713, Do3D) — 4 part, base bore 23.871 mm, band 1.74 jt triangle. Desain harus multi-model sejak awal.

## 2. Konteks & fakta teknis

- Kalkulator existing (`Green Lantern Ring 2026 - Resize Calculator.html` di folder Do3D) memakai rumus: `keliling = 2.55 × US + 36.5`, `diameter = keliling ÷ π`, `scale = (diameter + kelonggaran) ÷ baseBore`. Rumus ini dipindah ke modul (scale exact, TANPA pembulatan slicer).
- STL sculpt Do3D besar (21–83 MB per part; 0.4–1.7 jt triangle) dan belum tentu watertight/manifold — pipeline boolean harus punya jalur fallback.
- Engrave dilakukan **setelah** scaling supaya kedalaman (~0.5 mm) & tinggi huruf konstan di semua ukuran — tetap terbaca dan printable.
- Dashboard: Next.js 16, Node 22, Prisma + PostgreSQL (DB existing dashboard, migrasi baru ditambah), Glass UI, `PageShell` wajib, deploy Docker ke homelab :3100 via `apps/dashboard/deploy.sh` (hanya saat diminta user).

## 3. Arsitektur

Pola modul standar dashboard:

```
apps/dashboard/
  lib/ring-resizer/            → logika: sizing math, mesh pipeline, storage
    sizing.ts                  → konversi US/diameter/keliling → scale factor
    mesh/                      → load STL, scale, text solid, boolean engrave, export
    storage.ts                 → path file STL model di RING_STORAGE_DIR
    __tests__/
  app/api/ring-resizer/        → REST endpoints (lihat §6)
  app/(dashboard)/ring-resizer/ → halaman Setup + Produksi (tab Produk aktif)
  components/ring-resizer/     → viewer 3D, form, list model
```

- **Mesh processing di server (API route Node):** `manifold-3d` (WASM) untuk boolean + `opentype.js` untuk glyph → polygon → extrude. Browser hanya untuk viewer & penempatan anchor.
- **Viewer 3D:** three.js via `@react-three/fiber` + `@react-three/drei` (pola sama dengan proyek stl-cutter). STLLoader stream dari API file part.
- **Font tunggal** (satu TTF di repo, mis. Inter/Roboto Bold) dipakai server untuk engrave DAN client untuk preview — preview = hasil.

### Data model (Prisma, ikut DB dashboard)

```
RingModel   id, name, baseBoreMm, createdAt
RingPart    id, modelId→RingModel, name, fileName, sizeBytes, triCount
RingAnchor  id, partId→RingPart, posX/Y/Z, normX/Y/Z, upX/Y/Z (orientasi),
            textHeightMm (default 3), depthMm (default 0.5)
```

Koordinat anchor disimpan di **koordinat base STL** (skala 100%); saat produksi, posisi anchor ikut dikalikan scale factor (tetap menempel di permukaan), sedangkan `textHeightMm`/`depthMm` TIDAK di-scale.

File STL part disimpan di disk: `RING_STORAGE_DIR/<modelId>/<partId>.stl` (env, default `./data/ring-models`; di container = volume mount). Metadata di DB, file di volume — DB tidak menyimpan blob.

## 4. Halaman Setup (`/ring-resizer` → tab "Setup Model")

- List model cincin (card): nama, jumlah part, base bore, tombol edit/hapus.
- **Buat/edit model:** form nama + base bore (mm) → upload beberapa STL (drag & drop, per file bisa dinamai: band/frame/…).
- **Editor anchor per part:** viewer 3D (orbit, zoom); klik permukaan → raycast menghasilkan titik + normal → anchor baru di situ. Preview text 3D langsung dirender di posisi itu (ukuran & kedalaman real, teks contoh "US 8"). Kontrol: rotasi text di bidang permukaan (slider), tinggi huruf, kedalaman, hapus anchor. Satu part boleh >1 anchor.
- Simpan → POST ke API. Bisa dibuka lagi untuk geser/edit.

## 5. Halaman Produksi (`/ring-resizer` → tab "Produksi")

- Pilih model → input ukuran (segmented: US / diameter mm / keliling mm — UX meniru calculator existing) + checkbox kelonggaran +0.3 mm.
- Text engrave: default otomatis `US 8` (mengikuti input), bisa ditimpa (mis. `#1234 US8`). Validasi: max ~20 char, charset yang ada di font.
- Ringkasan sebelum proses: scale % exact, diameter target, daftar part + jumlah anchor.
- Submit → progress per part → selesai: download **ZIP** `GL2026_US8_#1234.zip` berisi `band_US8.stl`, dst. Part yang engrave-nya gagal tetap disertakan (scaled-only) + warning jelas di UI.

## 6. API

| Method & path | Fungsi |
|---|---|
| `GET/POST /api/ring-resizer/models` | list / create model |
| `PATCH/DELETE /api/ring-resizer/models/[id]` | edit meta / hapus (hapus file juga) |
| `POST /api/ring-resizer/models/[id]/parts` | upload STL part (stream ke disk, validasi binary STL, simpan triCount) |
| `GET /api/ring-resizer/parts/[id]/file` | serve STL untuk viewer (range/stream) |
| `PUT /api/ring-resizer/parts/[id]/anchors` | replace daftar anchor part |
| `POST /api/ring-resizer/process` | body: modelId, sizeInput {mode, value, clearance}, text → proses semua part → response ZIP (streaming) |

Proses ~10–60 dtk untuk mesh 1.7 jt tri: request sinkron dengan streaming response (internal LAN, tanpa job queue — YAGNI; kalau kelak timeout jadi masalah nyata baru dibuat polling).

## 7. Pipeline mesh (server)

1. Load binary STL part → positions/indices (dedup vertex dengan hash toleransi).
2. `scale = (targetDia + clearance) / baseBoreMm` → kalikan semua vertex (uniform, pivot origin — konsisten antar part sehingga posisi relatif part tetap nyambung).
3. Text solid: `opentype.js` glyph path → polygon (earcut) → extrude setebal `depthMm + 0.6 mm` (menembus permukaan) → transform ke anchor (posisi × scale, orientasi dari normal+up, tenggelam `depthMm` ke dalam permukaan).
4. Boolean difference, tangga fallback per part:
   a. `manifold-3d`: `Mesh.merge()` lalu `Manifold` — kalau mesh valid, hasil dijamin watertight.
   b. Kalau (a) melempar not-manifold: fallback `three-bvh-csg` (toleran triangle soup).
   c. Kalau (b) gagal juga: part keluar **scaled-only**, respon menyertakan warning per part.
5. Export binary STL → masukkan ZIP (fflate/archiver, streaming).

## 8. Nav & UI

- Entry: item baru di sidebar seksi **Produk** (`SectionSidebar`), icon 💍, label "Ring Resizer", roles OWNER + ADMIN. (Kalau maintainer lebih suka tab lain, cukup pindah satu entri.)
- Halaman pakai `PageShell` (title wajib), token Glass (`g-t*`), dites light & dark — sesuai `docs/ui-page-layout.md`. Viewer 3D dalam `glass-card` dengan background canvas mengikuti tema.

## 9. Testing

- `lib/ring-resizer/sizing.ts`: unit test konversi US/dia/keliling ↔ scale (termasuk paritas angka dengan calculator existing: US 8 + 0.3 → dia 18.4 mm).
- Pipeline mesh: fixture STL kecil (kubus/torus ratusan triangle, committed) → test scale exact, penempatan text, boolean menghasilkan mesh dengan volume berkurang, fallback path saat mesh sengaja dirusak.
- API: test upload validasi STL, process end-to-end dengan fixture.
- Ikut `pnpm turbo test`; TIDAK menyentuh 14 golden test kalkulator-core.

## 10. Di luar scope (YAGNI)

- Akses customer / publik, auth tambahan, multi-font, emboss (engrave saja dulu), editing mesh lain, preview hasil boolean di browser (preview = text placement saja), job queue, format selain STL, auto-deteksi base bore.

## 11. Deployment

- Volume baru di container `shopee-dashboard` untuk `RING_STORAGE_DIR` (STL model bisa ratusan MB — pantau disk host yang sering penuh; path host jelas mis. `/opt/shopee-dashboard/ring-models`).
- Memory proses boolean mesh 1.7 jt tri: ratusan MB puncak — masih aman untuk host, tapi dicatat di deploy notes.
- Deploy pakai `apps/dashboard/deploy.sh` existing, **hanya saat diminta user**.
