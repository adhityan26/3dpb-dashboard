# Agent File Manager + Print-from-SD (Bambu, v1)

Status: draft, menunggu review user
Tanggal: 2026-08-20
Scope: `apps/agent` (Slizebiz Agent, Electron)

## Latar belakang

`apps/agent` sekarang hanya memonitor status printer (via `engine-manager.ts` + koneksi MQTT ke Bambu / Moonraker). User ingin bisa mengelola file di storage printer (SD card Bambu) langsung dari Agent — browse, upload, download, delete, rename — dan langsung trigger print dari file yang dipilih, termasuk memilih plate & override AMS mapping untuk file multi-plate/multi-filament.

Referensi riset format metadata Bambu `.3mf`/`.gcode.3mf` (struktur plate, filament map, AMS slot) sudah dipindah ke vault OK: `integrations/bambu-3mf-gcode-metadata` (project `3dprintingbandung`).

## Keputusan yang sudah difinalkan (hasil brainstorming)

| Topik | Keputusan |
|---|---|
| Scope operasi | Full CRUD: browse, upload, download, delete, rename |
| Prioritas platform | **Bambu (FTPS) dulu**. Moonraker (REST) fase berikutnya, interface dibuat generik dari awal supaya tinggal diimplementasi |
| UX entry point | Tab/panel baru di dalam halaman device yang sudah ada (bukan halaman terpisah), dengan tombol "Browse Files" |
| Limit ukuran file | Soft warning >500MB, hard block ≥4GB (limit filesystem FAT32 di SD card Bambu) |
| Error handling | Fail fast — tidak ada retry otomatis. Gagal → tampilkan error, user retry manual |
| Kredensial | Pakai ulang kredensial device yang sudah tersimpan (`credential-store.ts`) — tidak ada re-auth terpisah |
| Print-start | Masuk v1, dengan dialog konfirmasi sebelum eksekusi |
| Plate & AMS picker | **Opsi C (full)**: user bisa pilih plate + override AMS mapping — didukung riset metadata 3mf yang sudah ada |
| AMS override → command MQTT | **BELUM diriset formatnya** — v1 print-start hanya support pilih plate; override AMS mapping ditunda ke fase berikutnya sampai payload command MQTT terkonfirmasi |
| Drag-and-drop | Drop file `.gcode.3mf`/`.gcode` ke halaman device → auto upload + parse + langsung buka print dialog, tanpa harus buka tab File Manager manual |

## Arsitektur

### Main process (`apps/agent/src/main/`)

```
file-manager/
  types.ts               # interface PrinterFileClient — generik, dipakai Bambu sekarang, Moonraker nanti
  bambu-ftps-client.ts    # basic-ftp, secure:"implicit" (port 990), connect-per-operation
  threemf-parser.ts       # jszip + parser XML/JSON → daftar plate + filament_map default
  print-trigger.ts        # kirim command MQTT project_file, numpang koneksi engine-manager yang sudah ada
```

`ipc.ts` — tambah handler:
- `file:list(deviceId, path)`
- `file:upload(deviceId, localPath, remotePath)`
- `file:download(deviceId, remotePath, localPath)`
- `file:delete(deviceId, remotePath)`
- `file:rename(deviceId, oldPath, newPath)`
- `file:parse-3mf(deviceId, remotePath)` — download ke temp, parse dengan `threemf-parser.ts`, return daftar plate + filament map
- `file:start-print(deviceId, remotePath, plateIndex)` — kirim command via `print-trigger.ts`

### Renderer (`apps/agent/src/renderer/`)

- `screens/DashboardScreen.tsx` — tambah drop-zone di level halaman (overlay saat file di-drag masuk)
- `components/PrinterControls.tsx` (atau komponen device card yang setara) — tambah tab/panel baru: `FileManagerPanel.tsx`
- Komponen baru:
  - `components/FileManagerPanel.tsx` — list file, tombol upload/download/delete/rename, tombol "Browse Files"
  - `components/PrintStartDialog.tsx` — plate picker (kalau multi-plate) + dialog konfirmasi print

## Data flow

### Browse & CRUD

1. User buka tab File Manager di panel device → renderer panggil IPC `file:list`
2. Main process ambil kredensial dari `credential-store.ts` → buka FTPS baru → list dir → tutup koneksi → return
3. Tiap aksi lain (upload/download/delete/rename): pola sama — connect → aksi → disconnect. Tidak ada koneksi FTPS persisten yang di-reuse.
4. Upload: validasi ukuran di renderer dulu (soft warn >500MB, hard block ≥4GB) sebelum kirim IPC.

### Print-start (via file browser)

1. User klik "Print" pada file `.gcode.3mf` → IPC `file:parse-3mf`: download file ke temp lokal, buka sebagai ZIP (`jszip`), baca `Metadata/slice_info.config` (daftar plate + filament per plate) dan `Metadata/project_settings.config` (filament_map default)
2. Renderer render `PrintStartDialog`: pilih plate (kalau multi-plate); AMS mapping ditampilkan read-only (ikut default file, TIDAK bisa di-override di v1 — lihat catatan di atas)
3. User konfirmasi ("Yakin mulai print `X` di `[printer]`, plate N?") → IPC `file:start-print`
4. Main process kirim command MQTT `project_file` (dengan `plate_idx` terpilih) lewat koneksi MQTT yang sudah dipegang `engine-manager.ts` untuk device tsb — bukan koneksi baru
5. Tunggu ACK beberapa detik; kalau tidak dapat konfirmasi dari printer → tampilkan status "tidak yakin apakah print dimulai, cek langsung ke printer" (jangan klaim sukses tanpa bukti)

### Drag-and-drop (shortcut)

1. User drag file `.gcode.3mf`/`.gcode` dari luar Agent → drop ke halaman device di `DashboardScreen.tsx`
2. Validasi ekstensi + ukuran (rule sama seperti upload manual)
3. Auto `file:upload` (FTPS) → auto `file:parse-3mf` → langsung buka `PrintStartDialog` (skip langkah buka tab File Manager & pilih file manual)
4. Kalau upload gagal (printer offline dll) → error di overlay, tidak lanjut ke parse/dialog
5. File `.gcode` plain (bukan `.gcode.3mf`, tanpa metadata plate/AMS) → tetap bisa di-drop untuk upload, tapi skip parsing — langsung dialog konfirmasi print sederhana tanpa plate picker

Drop-zone level halaman dan tombol manual di `FileManagerPanel` sama-sama berakhir di `PrintStartDialog` yang sama — tidak ada logic ganda.

## Error handling

- FTPS gagal connect (timeout / access-code salah) → error spesifik di panel, tombol "Coba lagi" manual, tanpa auto-retry
- Print-start tanpa ACK dari printer → status ambigu ditampilkan jelas ke user, bukan asumsi sukses
- Parse 3mf gagal (file corrupt / bukan format Bambu) → tombol print di-disable, pesan jelas; download/delete file tetap bisa jalan
- Upload file > 4GB → block di renderer sebelum IPC dipanggil sama sekali (hard block, bukan error dari server)

## Testing

- Unit test `threemf-parser.ts` — fixture pakai sample file nyata dari `custom nama/minecraft_name_Custom_*.gcode.3mf` (sudah ada beberapa contoh multi-plate)
- Unit test `bambu-ftps-client.ts` — mock FTP server / interface abstraction, tidak butuh printer fisik
- E2E manual wajib dengan printer fisik untuk verifikasi print-trigger sungguhan (sama seperti pola verifikasi Agent lain — tidak bisa diotomasi dari sesi ini)

## Out of scope (v1)

- Moonraker/Fluidd file management (fase berikutnya, interface `PrinterFileClient` sudah disiapkan generik supaya tinggal diimplementasi)
- Override AMS mapping saat print-start (payload command MQTT belum diriset — v1 cuma pilih plate)
- Retry otomatis pada kegagalan koneksi/transfer
- Resume partial upload FTPS
- Deep-link ke Bambu Studio/Handy untuk kasus advanced plate/AMS

## Referensi

- Riset metadata 3mf: vault OK `3dprintingbandung/integrations/bambu-3mf-gcode-metadata`
- Memory: [project_go_public_readiness_audit.md](~/.claude/projects/-Users-adhityatangahu-Documents-shopee-analysis/memory/project_go_public_readiness_audit.md) — status keamanan `apps/agent` terkini (broker-auth PIN sudah live, relevan kalau file-manager ini nanti butuh expose lewat broker juga — saat ini tidak, FTPS langsung ke printer, tidak lewat broker lokal Agent)
