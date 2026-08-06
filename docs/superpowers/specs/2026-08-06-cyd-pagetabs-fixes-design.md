# PageTabs editor CYD: fix klik, samain nama default, tambah rename

Tanggal: 2026-08-06
Status: disetujui, siap dibuat plan implementasi

## 1. Masalah

User melaporkan 3 masalah di editor layout CYD (`/printer`, komponen `PageTabs.tsx`), semuanya
SUDAH ADA sejak commit porting 2026-07-28 (`9e67c265`) -- bukan regresi dari kerja sesi ini
(headerText, 2026-08-05):

1. Tab halaman tak bisa diklik -- cuma bisa lihat halaman 1, tak bisa pindah ke halaman lain.
2. Halaman tak bisa di-rename.
3. Inkonsisten: halaman pertama default `"page-1"` (Inggris), tapi tombol "+ Halaman" bikin
   halaman baru `"hal-N"` (Indonesia).

## 2. Bug #1 -- tab tak bisa diklik

File: `apps/saas/components/printer/layout-editor/PageTabs.tsx:85`.

Root cause: `PointerSensor` di komponen ini dipakai TANPA `activationConstraint`. Tanpa itu, drag
mulai pada gerakan sekecil apa pun dan menelan event `onClick` -- persis bug yang SUDAH pernah
diperbaiki di `LayoutEditor.tsx:127-129` (komentar di situ menjelaskan bug ini persis), tapi lupa
diterapkan juga di sensor `PageTabs.tsx` sendiri (2 `DndContext` terpisah, 2 sensor terpisah).

Fix: tambah `activationConstraint: { distance: 4 }`, sama persis `LayoutEditor.tsx`.

## 3. Bug #3 -- nama default halaman pertama tak konsisten

File: `apps/saas/components/printer/LayoutEditor.tsx:26` (fungsi `defaultConfig()`).

Fix: `id: "page-1"` -> `id: "hal-1"`. `nextPageNumberRef` (`LayoutEditor.tsx:98`) tetap start dari
`2` secara independen (tidak diturunkan dari string default) -- halaman baru tetap konsisten jadi
`hal-2`, `hal-3`, dst tanpa perlu ubah logic lain.

## 4. Bug #2 -- tambah kemampuan rename halaman

File: `apps/saas/components/printer/layout-editor/PageTabs.tsx`, `apps/saas/components/printer/LayoutEditor.tsx`.

### 4.1 Trigger UI

Ikon pensil kecil di tiap tab, di sebelah ikon ✕ hapus yang sudah ada (`PageTabs.tsx:50-65`) --
gaya visual & pola `stopPropagation` sama (klik pensil tak ikut men-select tab). Selalu tampil
(tidak digating seperti `canRemove`, karena rename tak punya batasan "minimal 1 halaman" seperti
hapus).

Klik pensil -> label `<span>{page.id}</span>` (`PageTabs.tsx:49`) berubah jadi `<input>` inline,
mengikuti pola PERSIS `DeviceList.tsx`'s "Ubah nama" (`DeviceList.tsx:61-79,170-182`): state lokal
`editingPageId`/`draftId`, `autoFocus`, commit di `onBlur`/Enter, batal di Escape.

### 4.2 Validasi saat commit (bukan saat mengetik)

Mengetik: bebas, tanpa batas -- TIDAK meniru pola `LabelTextField`/`HeaderTextField` (yang punya
counter/warning-saat-mengetik) karena batas panjang (`LAYOUT_LIMITS.maxPageIdLength=15`) SUDAH
tertangkap di `findLayoutProblem()` (`LayoutEditor.tsx:56-57`, tombol Simpan) -- pola existing yang
sudah cukup, tak perlu duplikasi validasi.

Commit (blur/Enter) -- DUA pemeriksaan baru yang WAJIB (beda dari panjang, ini breaking secara
LANGSUNG bukan cuma ditolak server):

1. **String kosong setelah trim** -> revert ke id lama, batal commit (halaman wajib punya id, sudah
   jadi aturan `validateLayoutConfig` server-side, konsisten dicegah di client juga).
2. **Duplikat dengan page id lain di config yang sama** (perbandingan case-sensitive, exact match,
   exclude diri sendiri) -> revert ke id lama, batal commit, tampilkan pesan singkat
   ("Nama halaman sudah dipakai") di bawah input SEBELUM revert (state `renameError`, style
   `text-red-500 text-[10px]`, sama seperti pola error kecil di komponen lain).

   Kenapa ini WAJIB baru (beda dari sebelum ada rename): sebelum ini, keunikan `page.id` DIJAMIN
   struktural oleh `nextPageNumberRef` (komentar `LayoutEditor.tsx:97`: "counter monoton... tak
   pernah dipakai ulang... tak bisa bentrok"). Begitu rename bebas diizinkan, jaminan itu hilang --
   id duplikat akan merusak `SortableContext items={pages.map(p=>p.id)}` (dnd-kit butuh id unik)
   dan React `key={p.id}` (reconciliation salah render). Ini BUKAN sekadar validasi kosmetik.

### 4.3 Wiring state

`PageTabs.tsx` pegang state lokal (`editingPageId: string | null`, `draftId: string`,
`renameError: string | null`), sama seperti `DeviceList.tsx` pegang `editingId`/`draftLabel` sendiri
(bukan lifted ke parent) -- pola sudah established.

Prop baru: `onRename: (index: number, newId: string) => void`, dipanggil `PageTabs` ke
`LayoutEditor` HANYA saat commit valid (validasi §4.2 sudah lolos). `LayoutEditor.tsx` implementasi:

```tsx
function renamePage(index: number, newId: string) {
  setConfig((cfg) => ({ ...cfg, pages: cfg.pages.map((p, i) => (i === index ? { ...p, id: newId } : p)) }));
}
```

(Pola sama persis `updateActivePage`/`removePage` yang sudah ada -- murni update `config.pages[i].id`
via `setConfig`, tak ada state lain yang mereferensikan `page.id` sehingga tak ada efek samping ke
`selectedCellIndex`/`activePageIndex`/dll.)

## 5. Testing

- `apps/saas/components/printer/layout-editor/PageTabs.test.tsx` (BARU -- dicek, belum ada file test
  untuk komponen ini sama sekali, cuma dites tak langsung lewat `LayoutEditor.test.tsx`): klik tab memanggil `onSelect`
  dengan index benar (menutup bug #1 -- test yang REPRODUCE bug ini dulu sebelum fix, pastikan
  gagal, baru fix); klik pensil masuk mode edit; commit rename via Enter memanggil `onRename` dengan
  id baru; commit id kosong TIDAK memanggil `onRename` (revert); commit id duplikat TIDAK memanggil
  `onRename`, `renameError` muncul; Escape membatalkan tanpa memanggil `onRename`.
- `LayoutEditor.test.tsx`: halaman pertama defaultnya `"hal-1"` bukan `"page-1"` (menutup bug #3).

## 6. Di luar cakupan

- Validasi panjang id saat mengetik (counter/warning real-time) -- sudah cukup ditangkap
  `findLayoutProblem()` saat Simpan, pola existing tak diubah.
- Rename lewat cara lain (double-click label, dll) -- ikon pensil eksplisit sudah cukup & konsisten
  dgn pola tombol "Ubah nama" `DeviceList.tsx`.
- Perubahan `PointerSensor` di `LayoutEditor.tsx` sendiri -- itu sudah benar dari awal, cuma
  `PageTabs.tsx` yang kurang.
