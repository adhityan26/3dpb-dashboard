# Fase 1b-4 — Simpan hasil kalkulasi + Riwayat (apps/saas)

**Tanggal:** 2026-07-25
**Status:** Design (disetujui via brainstorm — siap ditulis plan)
**Prasyarat:** 1b-6a + 1b-6b MERGED (katalog filament, multi-material, import 3MF). Tombol "Simpan" sudah ada sebagai placeholder disabled di `ResultPanel.tsx:104-106` ("segera").

## Tujuan

User Pro (Lifetime, `paidCore`) bisa **menyimpan** hasil kalkulasi (nama + semua input + harga saat itu) dan **melihat riwayat**-nya, lalu membuka lagi buat diedit & di-update. Free tetap seperti sekarang (kalkulator langsung, tanpa simpan).

## Keputusan terkunci (brainstorm 2026-07-25)

1. **Storage: IndexedDB lokal**, bukan Postgres/server. Alasan: kapasitas `cloud` (subscription) di `apps/saas/lib/entitlement.ts` belum bisa dibeli sama sekali sekarang (cuma lifetime "beli" yang jalan) — spec awal (`docs/superpowers/specs/2026-07-08-saas-3pb-design.md`) sendiri menaruh "cloud storage" di Fase 3, bukan sekarang. Pola persis `apps/saas/lib/store/local-settings.ts` (sudah ada, pakai `idb`) — DB `slizebiz-local` naik ke versi 2, tambah object store `kalkulasi`.
2. **Nama kalkulasi = field permanen di form** (bukan prompt pas simpan, bukan auto-generate) — selalu tampil di kalkulator (Pro-only), diisi kapan saja sebelum/sesudah menyimpan.
3. **Harga DIBEKUKAN saat simpan** (snapshot), bukan dihitung ulang tiap dibuka — kalau tarif katalog berubah belakangan, riwayat lama tetap tampil apa adanya waktu disimpan. Pola sama dashboard `KalkulasiHarga`.
4. **Halaman utama (`/`) buat Pro = Riwayat**, bukan kalkulator. Tombol besar "Hitung" buka kalkulator kosong. Free tetap seperti sekarang (langsung ke kalkulator di `/`, tak berubah sama sekali).
5. **Route terpisah** (bukan 1 halaman + state toggle) — biar back/forward browser & bookmark jalan natural:
   - `/kalkulator` — form kosong (Pro-only; Free yang akses di-redirect ke `/`).
   - `/kalkulator/[id]` — form terisi dari record itu, tombol jadi "Update" (Pro-only, redirect Free ke `/`).
6. **Klik baris riwayat → buka & edit ulang** (bukan read-only, bukan duplikat) — muat semua input balik ke form via route `/kalkulator/[id]`, bisa diubah lalu "Update" (menimpa record yang sama). **Duplikat kalkulasi TIDAK masuk scope ini** (bisa nyusul kalau diminta).
7. **Hapus = hard delete**, tanpa undo (konsisten dashboard) — dengan konfirmasi `window.confirm` di UI (baru — dashboard tak pakai ini, tapi masuk akal buat cegah kehapus tak sengaja di IndexedDB tanpa server backup).
8. **Tanpa pagination** untuk v1 (YAGNI — volume riwayat per-user kemungkinan kecil, gampang ditambah nanti kalau ternyata perlu).

## Arsitektur

### Data layer — `apps/saas/lib/store/kalkulasi-history.ts` (baru)

Pola identik `local-settings.ts`: `openDB("slizebiz-local", 2, { upgrade(d, oldVersion) { ...bikin store "settings" kalau oldVersion<1...; kalau oldVersion<2, d.createObjectStore("kalkulasi", {keyPath:"id"}).createIndex("by-userId","userId") } })`. **Penting:** upgrade callback harus tetap bikin store "settings" untuk user yang DB-nya masih versi 1 (belum pernah buka app sejak fitur ini ada) — `idb`'s `upgrade(db, oldVersion, newVersion, tx)` dipanggil sekali dgn oldVersion aktual, jadi logic-nya `if (oldVersion < 1) {...settings...} if (oldVersion < 2) { ...kalkulasi... }` (additive, bukan reset total).

```ts
export interface KalkulasiRecord {
  id: string;
  userId: string;
  nama: string;
  createdAt: string;   // ISO — diisi sekali saat create, tak berubah lagi
  updatedAt: string;   // ISO — diupdate tiap simpan/update
  input: {
    plates: PlateRow[];
    batch: string;
    komponen: KomponenRow[];
    labor: LaborRow[];
    packing?: { nama: string; harga: number };
    channel: string;
    tier: MarginTier;
  };
  snapshot: {
    biayaModal: number;
    hargaJualMinimum: number;
    rekomendasi: number;
    status: HasilKalkulasiV2["status"];
    strategi: Strategi;   // dari compute.ts FullView — matrix channel×tier lengkap
  };
}

export async function listKalkulasi(userId: string): Promise<KalkulasiRecord[]>;   // urut updatedAt desc
export async function getKalkulasi(userId: string, id: string): Promise<KalkulasiRecord | null>;
export async function putKalkulasi(record: KalkulasiRecord): Promise<void>;         // create ATAU update (put by id)
export async function deleteKalkulasi(userId: string, id: string): Promise<void>;
```

`listKalkulasi`/`getKalkulasi`/`deleteKalkulasi` semua **cek `userId` cocok** sebelum mengembalikan/menghapus row (pertahanan client-side — IndexedDB per-browser jadi risiko cross-user kecil, tapi tetap dijaga konsisten sama pola scoping di server).

### `Calculator.tsx` — prop baru `kalkulasiId?: string`

- State baru: `nama` (string, default `""`), `savedId` (string | undefined — id record yang lagi aktif; `undefined` = belum pernah disimpan), `createdAt` (string | undefined — diisi dari `record.createdAt` saat load, atau di-set ke `new Date().toISOString()` pas simpan pertama kali), `loadingRecord` (boolean, `true` kalau `kalkulasiId` di-pass dan belum selesai fetch).
- `useEffect` saat mount: kalau `kalkulasiId` ada → `getKalkulasi(userId, kalkulasiId)`; kalau ketemu → isi SEMUA state (plates/batch/komponen/labor/packing/channel/tier/nama/createdAt) dari `record.input` + `record.nama` + `record.createdAt`, set `savedId=record.id`; kalau tak ketemu → tampilkan pesan "Kalkulasi tidak ditemukan" + link balik ke `/` (bukan redirect keras, karena fetch-nya client-side async). Selesai fetch → `loadingRecord=false`.
- Selagi `loadingRecord`, render pesan loading singkat, JANGAN render form (cegah flash form kosong/default sebelum data asli termuat, dan cegah user keburu ubah state sebelum overwrite dari fetch).
- Handler `handleSave` (di-pass ke `ResultPanel` sbg `onSave` HANYA kalau `paidCore` — `{paidCore ? handleSave : undefined}` — jadi Free tak pernah bisa memicunya sama sekali, bukan cuma tombolnya disembunyikan):
  1. Hitung `view` (FullView, sudah ada di komponen) — kalau `null` (input belum valid), jangan simpan, tampilkan pesan singkat "Isi berat & durasi dulu" (re-use style pesan yang sudah ada utk view null).
  2. `id = savedId ?? newId()`; `finalNama = nama.trim() || "Kalkulasi " + new Date().toLocaleDateString("id-ID")` (nama kosong tak bikin baris riwayat tanpa judul); `finalCreatedAt = createdAt ?? new Date().toISOString()`.
  3. `putKalkulasi({id, userId, nama: finalNama, createdAt: finalCreatedAt, updatedAt: new Date().toISOString(), input: {...semua state...}, snapshot: {...dari view...}})`.
  4. Update state lokal: `setSavedId(id)`, `setCreatedAt(finalCreatedAt)`, `setNama(finalNama)` (biar field nama ikut ke-normalize kalau tadi kosong).
  5. Kalau ini SIMPAN PERTAMA (`savedId` sebelumnya `undefined`): `router.push(\`/kalkulator/${id}\`)` (pakai `useRouter` dari `next/navigation`) — URL pindah, tombol berikutnya otomatis jadi "Update" karena `kalkulasiId` prop sekarang ada dari route. Kalau sudah editing (`savedId` sudah ada sebelum handler jalan): tetap di halaman yang sama, tak ada navigasi.
- Field "Nama kalkulasi" (Pro-only, `{paidCore && (...)}`): `GlassInput` simpel (placeholder "Nama kalkulasi (opsional)"), ditaruh di baris kecil bareng link "← Riwayat" (`Link href="/"`), di atas `CalcSection n={1}` (baris baru sebelum `<div className="flex flex-col gap-4 min-w-0">` yang sudah ada, atau sebagai child pertama di dalamnya).
- **Tombol "🔄 Refresh tarif" (Pro-only, baris sama)**: panggil ulang `loadSettings(userId)` → `setSettings(...)`. Kegunaan: kalau user ubah katalog filament/tarif di halaman Setting (tab lain atau sebelum masuk ke kalkulasi lama ini), `settings` yang ke-load cuma sekali saat mount (`useEffect` dgn dep `[paidCore, userId]`) jadi basi — tombol ini nyegarkan tanpa reload halaman penuh (yang akan bikin `plates`/`nama`/state form lain yg belum disimpan hilang). Tampil independen dari `kalkulasiId` (berguna juga di `/kalkulator` form baru, bukan cuma edit).

### `ResultPanel.tsx` — aktifkan tombol Simpan yang sudah ada

Ganti blok disabled (`ResultPanel.tsx:104-106`) jadi tombol aktif, props baru: `onSave?: () => void`, `isEditing?: boolean` (label "Update" vs "Simpan"). Kalau `onSave` tak di-pass (Free, `paidCore=false` — `Calculator.tsx` tak mem-passing prop ini), tombol tetap tak dirender sama sekali (bukan cuma disabled) — konsisten pola "sembunyikan buat Free, jangan cuma disable" yang sudah dipakai fitur Pro lain (multi-plate, import 3MF).

### Halaman baru

**`apps/saas/app/kalkulator/page.tsx`** (baru):
```tsx
export default async function KalkulatorBaruPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  if (!capabilities(ent).paidCore) redirect("/");   // Pro-only, Free balik ke "/"
  return (
    <PageShell title="Kalkulator harga jual" current="kalkulator" owner={isOwner(session.user.email)} userLabel={session.user.email ?? undefined}>
      <Calculator paidCore userId={session.user.id} />
    </PageShell>
  );
}
```

**`apps/saas/app/kalkulator/[id]/page.tsx`** (baru) — sama seperti di atas, plus `const { id } = await params;` (Next 16 App Router: `params` adalah Promise), pass `kalkulasiId={id}` ke `<Calculator>`.

**`apps/saas/app/page.tsx`** (ubah) — cabang render:
```tsx
{capabilities(ent).paidCore
  ? <RiwayatList userId={session.user.id} />
  : <Calculator paidCore={false} userId={session.user.id} />}
```
Title/description bisa tetap sama ("Kalkulator harga jual") atau disesuaikan jadi "Riwayat kalkulasi" pas Pro — pilih tetap sama supaya tak ada flicker judul pas kondisi entitlement berubah (mis. abis beli Pro) — detail kecil, keputusan implementer.

### `RiwayatList.tsx` (baru, client component)

- `useEffect` load `listKalkulasi(userId)` saat mount → state `records`.
- Empty state: "Belum ada riwayat, mulai hitung pertama kamu" + tombol besar **"Hitung"** (`Link href="/kalkulator"`).
- Kalau ada records: tombol "Hitung" tetap tampil (kecil, di atas atau di header list — bukan cuma pas kosong), lalu list baris: nama, tanggal (format pendek, mis. relative "2 hari lalu" atau tanggal biasa — pilih simpel: `toLocaleDateString("id-ID")`), harga rekomendasi (`Rp` + `snapshot.rekomendasi`), tombol 🗑️ Hapus (dgn `window.confirm` sebelum `deleteKalkulasi` + refresh list).
- **Tombol "🔄 Refresh" di header list** (sejajar tombol "Hitung", tampil baik pas kosong maupun ada isi): panggil ulang fungsi load (`listKalkulasi(userId)` → `setRecords(...)`) — buat nyegarkan list tanpa reload halaman, kalau ada perubahan dari luar (mis. hapus/simpan dari tab lain yg masih kebuka).
- Baris (bukan tombol hapus) → `Link href={\`/kalkulator/${record.id}\`}`.

## Backward-compat & paritas

- `Calculator.tsx` tanpa `kalkulasiId` prop (dipanggil dari `/kalkulator` ATAU dari `/` buat Free) berperilaku PERSIS seperti sekarang — prop opsional, default tak ada, `loadingRecord` default `false`.
- Formula core (`packages/kalkulator-core`) TIDAK berubah — `snapshot` cuma menyalin field yang sudah dihasilkan `compute.ts`'s `fullView()`, bukan logic baru.
- Free tier: nol perubahan perilaku — `/` mereka tetap kalkulator langsung, tak ada nama field, tak ada tombol simpan (disembunyikan total).

## Di luar scope

- **Duplikat kalkulasi** (salin jadi record baru) — ditolak eksplisit di brainstorm, bisa nyusul kalau diminta nanti.
- **Cloud/Postgres storage** (`cloud` capability) — nunggu Fase 3, subscription belum bisa dibeli.
- **Pagination** riwayat — nunggu kalau volume ternyata jadi masalah nyata.
- **Soft-delete/undo** hapus riwayat.
- **Search/filter** di halaman Riwayat.
- **Dropdown Profil material** (PETG/ABS/TPU rate override) — item terpisah, sudah dicatat di sesi sebelumnya, tak terkait 1b-4.

## Testing

- `kalkulasi-history.test.ts`: put→get roundtrip, list urut `updatedAt` desc, delete beneran hilang, scoping `userId` (record user lain tak ke-return/ke-delete), DB upgrade dari versi 1 (store "settings" sudah ada) tetap nambah store "kalkulasi" tanpa merusak data settings lama.
- `Calculator.test.tsx` (tambahan): render tanpa `kalkulasiId` = perilaku lama utuh (regresi); dengan `kalkulasiId` → mock `getKalkulasi` mengisi state form dari record; `handleSave` pertama kali → `putKalkulasi` dipanggil + `router.push` ke `/kalkulator/[id baru]`; save kedua (sudah ada `savedId`) → `putKalkulasi` dgn id sama, TANPA push lagi; field Nama muncul cuma pas `paidCore`; klik "🔄 Refresh tarif" → `loadSettings` terpanggil lagi (mock hitung ulang jumlah panggilan).
- `ResultPanel.test.tsx` (tambahan): tombol Simpan/Update muncul cuma kalau `onSave` di-pass, label berubah sesuai `isEditing`.
- `RiwayatList.test.tsx` (baru): render list dari mock `listKalkulasi`; empty state + tombol Hitung; klik baris → link ke `/kalkulator/[id]`; klik Hapus → confirm dulu, batal kalau `confirm()` false, panggil `deleteKalkulasi` + refresh list kalau true; klik "🔄 Refresh" → `listKalkulasi` terpanggil lagi.
- Regresi crypto (`newId()` bukan `crypto.randomUUID()`) — pola wajib tiap ada id baru, cek konsisten dgn test pattern yg sudah ada di `PlateInput.test.tsx`.

## File tersentuh (perkiraan)

**Baru:** `apps/saas/lib/store/kalkulasi-history.ts` (+ `.test.ts`), `apps/saas/components/RiwayatList.tsx` (+ `.test.tsx`), `apps/saas/app/kalkulator/page.tsx`, `apps/saas/app/kalkulator/[id]/page.tsx`.
**Diubah:** `apps/saas/app/page.tsx`, `apps/saas/components/Calculator.tsx` (+ `.test.tsx`), `apps/saas/components/ResultPanel.tsx` (+ `.test.tsx`).
