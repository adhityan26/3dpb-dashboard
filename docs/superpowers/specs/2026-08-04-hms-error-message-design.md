# Pesan Error Manusiawi (HMS) di Payload MQTT `3dpb/printers`

## Latar belakang

CYD firmware menampilkan notifikasi "perlu perhatian" untuk printer berstatus ERROR, tapi field `error_msg` yang dikirim lewat MQTT topic `3dpb/printers` berisi string diagnostik mentah, mis. `print_error=0 | mc_print_error_code=0` -- tak bermakna buat pengguna awam. `packages/printer-monitor-core` sudah punya `HmsLookup` (tabel `hms-codes.json`) yang menerjemahkan kode HMS Bambu Lab jadi deskripsi manusiawi, tapi saat ini hanya dipakai untuk notifier Pushover/Telegram (`engine.ts`), tidak pernah disimpan atau dipublish ke payload status.

Bagian dari redesign notifikasi CYD yang lebih besar (lihat juga sub-project B, firmware, spec terpisah menyusul). Sub-project ini murni backend: menambahkan field baru `error_message` yang manusiawi ke payload, TANPA mengubah field `error_msg` lama (dipakai konsumen lain, mis. dashboard debug).

## Perubahan

### 1. `packages/printer-monitor-core/src/hms.ts`

Tambah fungsi baru `describeError(hms, printError, lookup)`:

```ts
const MAX_ERROR_MESSAGE_LEN = 120

export function describeError(hms: HmsEntry[], printError: number, lookup: HmsLookup): string {
  const translated = lookup.translate(hms)
  const raw = translated[0] ?? (printError !== 0 ? `Print error (kode ${printError})` : 'Print error')
  return raw.length > MAX_ERROR_MESSAGE_LEN ? raw.slice(0, MAX_ERROR_MESSAGE_LEN - 1) + '…' : raw
}
```

- Ambil entri HMS **pertama** saja kalau ada lebih dari satu (paling relevan/kritis biasanya duluan di array) -- bukan digabung semua, biar tetap ringkas & buffer firmware kecil.
- Fallback `"Print error (kode {printError})"` kalau tak ada entri HMS tapi `printError != 0` (Bambu tanpa HMS spesifik).
- Fallback generik `"Print error"` kalau HMS kosong DAN printError 0 -- ini kasus Moonraker/Klipper hari ini (`normalize-moonraker.ts` selalu set `hms: [], printError: 0`, belum ambil `print_stats.message` dari Klipper). Diketahui sebagai keterbatasan, di luar scope sub-project ini.
- Dipotong ke 120 karakter + ellipsis kalau lebih panjang.

### 2. `packages/printer-monitor-core/src/types.ts`

- `StoredState`: tambah `last_error_message: string`.
- `PrinterRow` (kontrak CYD): tambah `error_message: string` -- **additive**, field lama TIDAK diubah (pola sama seperti `nozzle_temp`/`bed_temp` sebelumnya).

### 3. `packages/printer-monitor-core/src/state-store.ts`

- `StateStore` constructor menerima `HmsLookup` (default `new HmsLookup()` kalau tak dikasih, biar `new StateStore()` di test lama tetap jalan tanpa ubahan):
  ```ts
  constructor(private hms: HmsLookup = new HmsLookup()) {}
  ```
- `upsertFromStatus()` mengisi:
  ```ts
  last_error_message: s.state === 'error' ? describeError(s.hms, s.printError, this.hms) : '',
  ```

### 4. `packages/printer-monitor-core/src/payload.ts`

- `buildPrintersPayload()` map `error_message: r?.last_error_message ?? ''` ke tiap `PrinterRow`.

### 5. `packages/printer-monitor-core/src/engine.ts` (cleanup kecil, seiring perubahan)

Saat ini `this.opts.hms ?? new HmsLookup()` di-resolve ulang tiap event di `handleStatus()`, dan `store` di-instansiasi tanpa hms sama sekali (field initializer, sebelum constructor body jalan). Disatukan: resolve SEKALI di constructor, dipakai bareng oleh notifier hmsText dan StateStore, supaya kalau test/`apps/agent` inject `HmsLookup` custom, keduanya konsisten pakai tabel yang sama:

```ts
export class Engine {
  private hms: HmsLookup
  private store: StateStore
  private timer: ReturnType<typeof setInterval> | null = null
  private deviceById: Map<string, DeviceConfig>
  constructor(private opts: EngineOpts) {
    this.deviceById = new Map(opts.devices.map((d) => [d.id, d]))
    this.hms = opts.hms ?? new HmsLookup()
    this.store = new StateStore(this.hms)
  }
  // handleStatus(): const hmsText = this.hms.translate(s.hms)  -- ganti dari (this.opts.hms ?? new HmsLookup())
  ...
}
```

`apps/agent/src/main/engine-manager.ts` tidak perlu diubah -- sudah inject `hms: new HmsLookup(hmsTable)` lewat `EngineOpts`, otomatis dipakai bareng oleh `StateStore` lewat perubahan di atas.

## Testing

Perluas `packages/printer-monitor-core/src/__tests__/payload.test.ts` (atau tambah test baru di `hms.test.ts` untuk `describeError` secara terisolasi):

1. State error dengan entri HMS -> `error_message` = `"[key] deskripsi"` dari tabel (pola sama seperti test `hms.test.ts` yang sudah ada, inject custom table).
2. State error, HMS kosong, `printError != 0` -> `error_message` = `"Print error (kode {N})"`.
3. State error Moonraker (HMS kosong, printError 0) -> `error_message` = `"Print error"`.
4. State bukan error (finish/running/dll) -> `error_message` = `""`.
5. Deskripsi HMS lebih dari 120 karakter -> terpotong + `"…"`, panjang total <= 120.
6. `error_msg` (field lama) tidak berubah nilainya sama sekali di semua kasus di atas.

## Di luar scope

- Moonraker/Klipper belum mengambil `print_stats.message` asli dari API -- tetap fallback generik "Print error" untuk sub-project ini. Bisa jadi backlog terpisah kalau dibutuhkan nanti.
- Konsumsi field baru ini di firmware CYD (boot-time suppression utk notif finish, warna header, ukuran card notif error) -- sub-project B, spec terpisah, dikerjakan SETELAH sub-project ini selesai & payload asli terverifikasi di MQTT.
