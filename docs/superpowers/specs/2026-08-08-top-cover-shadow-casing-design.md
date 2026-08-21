# Top Cover Shadow Casing + Invert Shadow — Design

## Problem

Generator shadow casing (`apps/dashboard/services/stl-service/scripts/generate_shadow_casing.py`) saat ini hanya menghasilkan satu konfigurasi mekanis: floor plate di bawah + pillar tabung di tengah tempat LED puck bertengger di atasnya, bagian atas casing terbuka. User ingin varian kedua — casing dibalik jadi **tudung/kap**: atas tertutup (top cover), bawah terbuka, LED puck nempel di sisi dalam tutup menghadap ke bawah via recess. Fisika bayangan (lampu di atas, nembak ke bawah lewat lubang dinding stensil, siluet jatuh di meja/lantai) tidak berubah — hanya dudukan mekanisnya.

Sekalian: parameter pillar (`pillar_outer_r`, `pillar_inner_r`, `led_socket_height`) dan `invert_mask` (sudah ada di Python tapi tidak ter-expose) belum bisa diatur dari dashboard.

## Scope & keputusan

- **Dua varian berdampingan**, dipilih via parameter `cover_type: 'bottom' | 'top'` (default `bottom` = perilaku sekarang, backward compatible).
- **`invert_shadow`** di-expose sebagai parameter baru (memetakan ke `invert_mask` yang sudah ada di Python — tidak ada logic baru).
- Ukuran recess top cover **memakai parameter pillar yang sama**: radius recess = `pillar_outer_r`, kedalaman recess = `led_socket_height`.
- Mounting LED ke recess di luar scope — user membuat mounting terpisah; recess cukup rongga bundar polos (press-fit/double tape).
- Rumus ray-tracing stencil wall **tidak disentuh** — `z_light` tetap dihitung `wall_top + light_z_offset` di kedua mode.

## Architecture

### 1. Script Python — `generate_shadow_casing.py`

Parameter baru `cover_type` (CLI `--cover-type`, default `bottom`):

- **`bottom`** (existing): floor plate + lubang kabel + `build_led_holder()` pillar. Tidak ada perubahan perilaku.
- **`top`** (baru): floor plate, lubang kabel, dan pillar semuanya di-skip. Fungsi baru `build_top_cover()` menghasilkan:
  - Piringan solid setebal `base_thickness` di atas dinding stensil: z = `wall_top` → `wall_top + base_thickness`, bentuk mengikuti `casing_poly` (custom shape) atau lingkaran `base_radius` — logika bentuk sama persis dengan floor plate sekarang.
  - **Recess bundar** di sisi bawah tutup, di posisi `(light_x, light_y)`: radius = `pillar_outer_r`, kedalaman = `min(led_socket_height, base_thickness - 0.8)` — dicap supaya tersisa minimal 0.8 mm dinding atas dan tutup tidak bolong tembus. Implementasi: extrude annulus/difference silinder dari slab (pola boolean yang sama dengan lubang kabel floor plate sekarang).
  - Bagian bawah casing terbuka (tidak ada floor plate).
- `invert_mask` yang sudah ada di-expose sebagai CLI arg `--invert-shadow` (boolean flag).
- Mesh gabungan mode `top` = `[wall_mesh, top_cover]`; tetap lewat `validate_mesh` seperti sekarang.

### 2. Service schema — `stl-service/service/schemas.py`

Field baru di request schema: `cover_type` (default `"bottom"`), `invert_shadow` (default `false`), plus `pillar_outer_r`, `pillar_inner_r`, `led_socket_height` (default mengikuti konstanta Python: 4.0 / 2.5 / 10.0). Diteruskan ke pemanggilan generator.

### 3. Dashboard config — `lib/light-generator/types.ts`

`LgConfigJson` nambah field (dengan default di `DEFAULT_LG_CONFIG`):

| Field | Type | Default |
|---|---|---|
| `cover_type` | `'bottom' \| 'top'` | `'bottom'` |
| `invert_shadow` | `boolean` | `false` |
| `pillar_outer_r` | `number` | `4.0` |
| `pillar_inner_r` | `number` | `2.5` |
| `led_socket_height` | `number` | `10.0` |

Config lama tanpa field ini tetap valid (semua field baru punya default → backward compatible).

### 4. UI form light-generator

Dua kontrol baru:
- Dropdown/toggle **"Tipe cover"**: `Bottom cover (pillar)` / `Top cover (recess)`.
- Checkbox **"Invert shadow"**.

Tampilan kondisional:
- `bottom` → grup **"Parameter pillar"**: diameter luar, diameter dalam (lubang kabel), tinggi socket LED.
- `top` → grup **"Parameter recess"**: diameter recess (nilai = `pillar_outer_r`), kedalaman recess (nilai = `led_socket_height`). `pillar_inner_r` disembunyikan (tidak ada lubang kabel di mode top).

Service call (`lib/light-generator/service.ts`) meneruskan field baru ke stl-service. Preview mode tetap `skip_led_pillar=True` untuk kedua mode (preview hanya butuh dinding stensil).

## Error handling

- `cover_type` tidak dikenal → schema validation error di service (enum).
- `led_socket_height` ≥ `base_thickness` di mode top → kedalaman recess otomatis dicap (lihat §1), bukan error — generate tetap jalan, kedalaman efektif dicetak di log generator.
- Config lama tanpa field baru → default berlaku, output identik dengan sebelum perubahan.

## Testing

- **Python** (mode `top`, satu mask contoh):
  - Mesh lolos `validate_mesh` (watertight/manifold).
  - Bbox: ada geometri slab di atas `wall_top`; tidak ada floor plate (tidak ada slab solid di `floor_z`).
  - Recess terbentuk: volume top cover < volume slab solid tanpa recess.
  - Mode `bottom` tanpa arg baru → output identik dengan sebelum perubahan (regresi).
- **Dashboard**:
  - Unit test form: pilih `top` → grup recess muncul, grup pillar hilang; sebaliknya untuk `bottom`.
  - Test service call meneruskan `cover_type`, `invert_shadow`, dan parameter pillar ke request stl-service.

## Out of scope

- Mounting/holder LED di dalam recess (user buat terpisah).
- Perubahan rumus ray-tracing / posisi `z_light`.
- Mode "flat mount radial" (LED di lantai nembak ke segala arah) — dibatalkan setelah klarifikasi.
- Ventilasi panas LED di top cover.

## Addendum 2026-08-09: Bottom frame

Band stencil solid setinggi `bottom_frame_height` mm di dasar dinding, mengikuti bentuk footprint apa pun (diterapkan di ruang stencil (θ,z), dirender via `r_wall_arr`). Tujuan: menangkap island dekat dasar supaya nyatu ke dinding utama. Parameter: `bottom_frame: bool` (default false), `bottom_frame_height: float` mm (default 5). Diterapkan SEBELUM `_bridge_floating_islands` supaya BFS memperhitungkan frame. Berlaku kedua cover type. UI: switch + slider tinggi di section Cover. Trade-off terdokumentasi: memblokir cahaya zona bawah dinding (siluet terjauh terpotong).
