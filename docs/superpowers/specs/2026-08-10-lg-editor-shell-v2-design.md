# Light Generator Editor Shell v2 — Design

Hasil konvergensi diskusi dua desainer eksternal (Kimi K3 × GLM 5.2, 2 ronde: proposal independen → kritik-silang) + koreksi teknis internal. Goal user: halaman order light-generator jadi editor "interaktif, realtime, very user friendly" — bukan tumpukan form.

## Keputusan kunci

- **v1 dipertahankan.** Halaman existing `/light-generator/[id]` tidak disentuh. v2 hidup di `/light-generator/[id]/v2`; kedua halaman punya link switcher satu sama lain ("Coba editor v2" / "Kembali ke v1"). v1 baru dihapus setelah user menyatakan v2 lebih baik.
- **Satu config object = single source of truth**, aliran data satu arah (UI → config → semua renderer). Tidak ada state bayangan di canvas.
- **STL tidak pernah auto-generate** (10–60 s). Perubahan config apa pun → badge "STL stale" (perbandingan hash config saat generate vs sekarang).
- **Penempatan stem di ruang (θ,z) dulu (2D), 3D menyusul** sebagai editor sekunder dengan model data yang sama.
- **Koreksi penting:** preview PNG existing adalah tampilan lantai (radial), BUKAN unwrap dinding. Placement surface yang benar = **unwrap stencil (θ,z)** yang sudah dihasilkan generator (`debug_stencil.png`) — di-expose sebagai endpoint/mode preview baru.

## Layout (editor shell)

```
┌──────────────────────────────────────────────────────────────┐
│ ◀ #ID · customer · status ▾ · Saved ✓ · [Generate STL] stale │ top bar sticky
├─────────┬─────────────────────────────────────┬──────────────┤
│ ORDER   │ CANVAS  [Shadow | Wall (θ,z) | 3D]  │ INSPECTOR    │
│ rail    │ + toolbar: stem-mode·padding·full   │ search param │
│ 260px   │ overlay: ring padding, pin stems,   │ accordions   │
│ collaps │ island merah, shimmer stale         │ (8 section)  │
│         │                                     │ + Stems list │
│         │                                     │ + JSON (col) │
├─────────┴─────────────────────────────────────┴──────────────┤
│ preview 1.2s · islands ✓/✗ · STL 14:02 stale · ~48 g PLA    │ status strip
└──────────────────────────────────────────────────────────────┘
```

- **Top bar:** back, order id, customer, status (dropdown inline), indikator autosave ("Saving… / Saved HH:MM"), tombol primer [Generate STL] + badge stale, link "Kembali ke v1".
- **Rail kiri** (~260 px, collapse ke icon rail): ringkasan customer/order, thumbnail silhouette & floor-insert (klik → tampil di canvas), tombol status.
- **Canvas tengah**, tab:
  - **Shadow** — preview PNG lantai (polaritas fisik) + overlay padding + marker island.
  - **Wall (θ,z)** — unwrap stencil; permukaan penempatan stem.
  - **3D** — viewer react-three-fiber (increment terakhir); fullscreen; stems termirror.
- **Inspector kanan** (~340 px): 8 section existing jadi accordion + **search filter param** (ketik nama → section menyempit); section **Stems** berisi list (θ/z, provenance, hapus) + tombol "Anchor all islands"; raw JSON editor collapsed di bawah (fitur paste yang sudah ada dipertahankan).
- **Status strip bawah:** latency preview terakhir, verdict islands, timestamp STL + stale, estimasi filament live (client-side, sudah ada di `LgGeneratePanel`).

## Stems manual

- **Skema config:** `user_stems: [{ id: string, theta_deg: number, z_mm: number }]` (array kosong = default). Generator menggabung stem otomatis ∪ manual: manual stem diterjemahkan ke kolom stencil ((θ→kolom, z→row) — stem manual mengisi dari anchor (sesuai cover_type) sampai z_mm), dedupe bila jarak angular < lebar stem.
- **Interaksi (tab Wall):** toggle Stem mode (toolbar, hotkey S) → klik = tambah (optimistic, marker langsung muncul), drag = pindah (snap 1° / 0.5 mm, tooltip readout), klik-kanan / Del = hapus, Esc keluar mode. Marker menampilkan lebar angular stem beneran (`stem_width`/`n_stencil_theta`×360°).
- **Provenance visual:** pin solid = manual (persisted), pin hollow = auto (dari respons server terakhir, read-only).
- **Server:** `POST /preview` mendukung mode `view=wall` (return unwrap stencil PNG + metadata mapping px↔(θ,z)); `/check-islands` di-extend return **centroid island** `[{theta_deg, z_mm}]` (bukan cuma boolean) → tombol **"Anchor all islands"** = drop satu stem manual per centroid, satu klik.
- **Efek:** perubahan stems → debounced preview + re-check islands; STL stale.

## Padding interaktif

- Overlay di tab Shadow: **lingkaran dashed + 4 handle kardinal**; area di luar margin di-dim; readout tengah konversi % → mm live (client math).
- **Auto-fit default:** outline tipis + badge "Auto · x%", handle ghosted. **Drag handle mana pun → flip otomatis ke Manual** (nilai tulis ke `mask_padding_pct`, `auto_fit_mask` off). Tap chip [Auto] → balik ke auto-fit. Tanpa dialog.
- Setelah respons server, kalau ring ≠ hasil aktual, ring dianimasikan ke kebenaran server.

## Strategi realtime

1. **Instant (client):** semua overlay (stems, ring padding, marker island), nilai slider, estimasi filament.
2. **Debounce 500 ms → `/preview`:** semua param yang memengaruhi shadow/geometri. In-flight request di-abort; guard request-id buang respons basi. Canvas shimmer "updating…", tidak pernah blok.
3. **Chained:** `/check-islands` otomatis setelah preview sukses.
4. **Explicit:** `/generate` via tombol; elapsed timer; edit selama generate tetap boleh (queue); selesai → STL baru, hash reset.
5. **Autosave** config (~1 s debounce) + indikator; tombol Save/Reset diganti "Revert to last generated config". (Hanya di v2 — v1 tetap manual save.)

## Backend changes (stl-service + dashboard API)

| Perubahan | Endpoint/file |
|---|---|
| `user_stems` diterima & digabung | `GeneratorConfig` + `run()` + builder stencil |
| Preview mode `view=wall` (unwrap PNG + mapping) | `/preview` + `preview_renderer.py` |
| `/check-islands` return centroids | `check_islands.py` + `stl-service.ts` |
| Autosave & revert | route PATCH existing (configJsonOperator) — dipakai lebih sering saja |

## Shipping order (6 increment, tiap increment deployable)

1. **Shell v2**: route `/v2`, top bar + rail + inspector (accordion + search) + status strip + tab stub; switcher v1↔v2; autosave.
2. **Canvas 2D + pipeline**: tab Shadow dengan preview, debounce 500 ms + abort + request-id, shimmer, filament live, hash stale.
3. **Padding ring** interaktif (auto/manual flip).
4. **Stems v1**: mode `view=wall` server, tab Wall, place/move/remove, `user_stems` di generator, provenance pin.
5. **Islands**: centroids dari `/check-islands`, marker merah, "Anchor all islands", saran penempatan.
6. **3D tab**: react-three-fiber (ganti iframe di v2 saja), fullscreen, stems mirror; wireframe scene ringan (dinding + gizmo stem + disc LED). Tanpa parametric slider-proxy.

## Testing

- Python: unit test merge auto∪user stems (dedupe, anchor per cover_type), test centroids `/check-islands`, test mode `view=wall`.
- Dashboard: vitest per increment (render shell, tab switching, stems list CRUD dari state, padding mode flip logic sebagai fungsi murni, hash-stale util). Interaksi kompleks (drag) diuji sebagai fungsi murni px↔(θ,z) / px↔%.
- v1 regression: test existing tidak berubah (v1 tidak disentuh).

## Out of scope

- Undo/history multi-step (cukup Revert to last generated).
- Mobile layout (desktop-first, tablet = drawer).
- Menghapus v1 (nunggu keputusan user).
- Parametric 3D proxy yang merespons slider (dinilai over-engineering oleh kedua desainer).
