# Top Cover Shadow Casing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Varian casing "top cover" (atas tertutup + recess LED, bawah terbuka, tanpa pillar/floor) berdampingan dengan varian pillar existing, dipilih via `cover_type`, plus expose `invert_mask` & parameter pillar di dashboard.

**Architecture:** Generator Python mendapat kwarg `cover_type: 'bottom'|'top'` — mode `top` mengganti floor plate + pillar dengan fungsi baru `build_top_cover()` (slab di atas dinding + recess bundar, dibangun dari dua extrusion 2D shapely yang di-concatenate, TANPA 3D boolean — konsisten pola floor plate existing). Service schema pass-through kwargs (sudah `model_dump(exclude_none=True)` → `run(**kwargs)`), jadi cukup satu field baru. UI `LgConfigEditor` mendapat select Cover type + switch Invert shadow + render kondisional section pillar vs recess.

**Tech Stack:** Python (trimesh, shapely, numpy), Pydantic, Next.js 16 + React, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-top-cover-shadow-casing-design.md`.
- Default `cover_type = 'bottom'` — output mode bottom HARUS identik dengan sebelum perubahan (backward compatible).
- Rumus ray-tracing stencil wall & perhitungan `z_light = wall_top + light_z_offset` TIDAK disentuh.
- Recess: radius = `pillar_outer_r`, kedalaman = `min(led_socket_height, base_thickness - 0.8)` (sisa atap minimal 0.8 mm, tidak boleh bolong tembus).
- Recess di posisi `(light_x, light_y)`.
- Mode preview (`preview_mode=True`) tidak membangun top cover (mirror perilaku `skip_led_pillar=True` existing).
- `apps/dashboard`: baca `node_modules/next/dist/docs/` sebelum menulis kode Next (aturan AGENTS.md); komentar kode & pesan commit Bahasa Inggris.
- Node 22: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum perintah pnpm.
- JANGAN `git add -A` — selalu add path spesifik.

---

### Task 1: `build_top_cover()` + unit test (Python)

**Files:**
- Modify: `apps/dashboard/services/stl-service/scripts/generate_shadow_casing.py` (tambah fungsi setelah `build_led_holder`, ~baris 1883)
- Test: `apps/dashboard/services/stl-service/tests/test_top_cover.py` (create; buat juga `tests/__init__.py` kosong)

**Interfaces:**
- Produces: `build_top_cover(wall_top: float, cover_thickness: float, recess_r: float, recess_depth: float, light_x: float, light_y: float, casing_poly, base_radius: float, n_circ: int = 96) -> trimesh.Trimesh` — dipakai Task 2. `casing_poly` = shapely Polygon atau `None` (None → lingkaran `base_radius`).

**Setup lingkungan test** (sekali, kalau belum ada venv):

```bash
cd apps/dashboard/services/stl-service
python3 -m venv .venv 2>/dev/null; source .venv/bin/activate
pip install -q -r requirements.txt pytest
```

- [ ] **Step 1: Write the failing test**

```python
# apps/dashboard/services/stl-service/tests/test_top_cover.py
"""Unit tests for build_top_cover (top-cover casing variant)."""
import sys
from pathlib import Path

import numpy as np
import pytest
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.generate_shadow_casing import build_top_cover  # noqa: E402

WALL_TOP = 50.0
THICK = 3.0
BASE_R = 40.0


def _volume(mesh: trimesh.Trimesh) -> float:
    return float(abs(mesh.volume))


def test_cover_sits_on_wall_top():
    cover = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=1.5,
        light_x=0.0, light_y=0.0,
        casing_poly=None, base_radius=BASE_R,
    )
    zmin, zmax = cover.bounds[0][2], cover.bounds[1][2]
    assert zmin == pytest.approx(WALL_TOP, abs=1e-6)
    assert zmax == pytest.approx(WALL_TOP + THICK, abs=1e-6)


def test_recess_reduces_volume():
    kwargs = dict(wall_top=WALL_TOP, cover_thickness=THICK,
                  light_x=0.0, light_y=0.0,
                  casing_poly=None, base_radius=BASE_R)
    solid = build_top_cover(recess_r=4.0, recess_depth=0.0, **kwargs)
    recessed = build_top_cover(recess_r=4.0, recess_depth=1.5, **kwargs)
    # expected removed volume = pi*r^2*depth
    expected = np.pi * 4.0**2 * 1.5
    assert _volume(solid) - _volume(recessed) == pytest.approx(expected, rel=0.05)


def test_recess_depth_capped_leaves_roof():
    # depth request exceeds thickness → capped at thickness - 0.8
    cover = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=99.0,
        light_x=0.0, light_y=0.0,
        casing_poly=None, base_radius=BASE_R,
    )
    solid = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=0.0,
        light_x=0.0, light_y=0.0,
        casing_poly=None, base_radius=BASE_R,
    )
    removed = _volume(solid) - _volume(cover)
    expected = np.pi * 4.0**2 * (THICK - 0.8)
    assert removed == pytest.approx(expected, rel=0.05)
    # roof still closes the top: zmax unchanged
    assert cover.bounds[1][2] == pytest.approx(WALL_TOP + THICK, abs=1e-6)


def test_recess_follows_light_position():
    cover = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=1.5,
        light_x=10.0, light_y=-5.0,
        casing_poly=None, base_radius=BASE_R,
    )
    # ray straight up from recess centre must first hit the roof (above
    # wall_top + eff_depth), not the bottom face of the slab
    hits = cover.ray.intersects_location(
        ray_origins=[[10.0, -5.0, WALL_TOP - 1.0]],
        ray_directions=[[0.0, 0.0, 1.0]],
    )[0]
    zs = sorted(p[2] for p in hits)
    assert zs[0] == pytest.approx(WALL_TOP + 1.5, abs=0.01)


def test_custom_casing_poly_shape():
    from shapely.geometry import Polygon
    square = Polygon([(-30, -30), (30, -30), (30, 30), (-30, 30)])
    cover = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=1.5,
        light_x=0.0, light_y=0.0,
        casing_poly=square, base_radius=BASE_R,
    )
    b = cover.bounds
    assert b[0][0] == pytest.approx(-30, abs=1e-6)
    assert b[1][0] == pytest.approx(30, abs=1e-6)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard/services/stl-service && source .venv/bin/activate && python -m pytest tests/test_top_cover.py -v`
Expected: FAIL / ERROR dengan `ImportError: cannot import name 'build_top_cover'`

- [ ] **Step 3: Write minimal implementation**

Tambahkan setelah `build_led_holder` (setelah ~baris 1882) di `generate_shadow_casing.py`:

```python
# ────────────────────────────────────────────────────────────────────────────
def build_top_cover(
    wall_top: float,
    cover_thickness: float,
    recess_r: float,
    recess_depth: float,
    light_x: float,
    light_y: float,
    casing_poly,
    base_radius: float,
    n_circ: int = 96,
) -> trimesh.Trimesh:
    """
    Solid cover plate closing the TOP of the stencil wall ('top' cover mode).

    The LED puck sits in a circular blind recess on the underside, centred on
    the light position, so the light hangs from the cover shining down — same
    optics as the pillar variant, different mechanical mount. Built from two
    stacked 2D extrusions (ring layer + roof layer) so no 3D boolean engine
    is needed; the coplanar interface is handled by concatenate, same pattern
    as the floor-plate + pillar join.
    """
    from shapely.geometry import Polygon as _ShapelyPoly

    MIN_ROOF_MM = 0.8   # never let the recess punch through the roof
    eff_depth = max(0.0, min(recess_depth, cover_thickness - MIN_ROOF_MM))

    if casing_poly is not None:
        slab_poly = casing_poly
    else:
        _a = np.linspace(0, 2 * np.pi, n_circ, endpoint=False)
        slab_poly = _ShapelyPoly(list(zip(base_radius * np.cos(_a),
                                          base_radius * np.sin(_a))))

    parts = []
    if eff_depth > 0:
        _a = np.linspace(0, 2 * np.pi, n_circ, endpoint=False)
        recess_poly = _ShapelyPoly(list(zip(light_x + recess_r * np.cos(_a),
                                            light_y + recess_r * np.sin(_a))))
        ring_poly = slab_poly.difference(recess_poly)
        if not ring_poly.is_valid:
            ring_poly = ring_poly.buffer(0)
        ring = trimesh.creation.extrude_polygon(ring_poly, eff_depth)
        ring.apply_translation([0.0, 0.0, wall_top])
        trimesh.repair.fix_normals(ring)
        parts.append(ring)

        roof = trimesh.creation.extrude_polygon(slab_poly,
                                                cover_thickness - eff_depth)
        roof.apply_translation([0.0, 0.0, wall_top + eff_depth])
        trimesh.repair.fix_normals(roof)
        parts.append(roof)
    else:
        slab = trimesh.creation.extrude_polygon(slab_poly, cover_thickness)
        slab.apply_translation([0.0, 0.0, wall_top])
        trimesh.repair.fix_normals(slab)
        parts.append(slab)

    cover = trimesh.util.concatenate(parts) if len(parts) > 1 else parts[0]
    print(f'  [C] top cover    — recess ∅{recess_r*2:.1f}mm × {eff_depth:.1f}mm '
          f'at ({light_x:.1f},{light_y:.1f})  z={wall_top:.1f}→'
          f'{wall_top + cover_thickness:.1f}mm  faces={len(cover.faces)}')
    return cover
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_top_cover.py -v`
Expected: 5 PASS. (Kalau `test_recess_follows_light_position` gagal karena ray-casting butuh `rtree`/`pyembree`: `pip install rtree` lalu ulangi.)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/services/stl-service/scripts/generate_shadow_casing.py apps/dashboard/services/stl-service/tests/test_top_cover.py apps/dashboard/services/stl-service/tests/__init__.py
git commit -m "feat(stl-service): add build_top_cover for top-cover casing variant"
```

---

### Task 2: Wiring `cover_type` di `run()` + CLI + schema service

**Files:**
- Modify: `apps/dashboard/services/stl-service/scripts/generate_shadow_casing.py` — signature `run()` (~baris 2611 area kwargs baru), bagian floor plate/pillar (~baris 2868–2912), argparse (~baris 2968+) dan pemanggilan `run()` di `__main__` (~baris 3050+)
- Modify: `apps/dashboard/services/stl-service/service/schemas.py:54-57` (section LED pillar)
- Test: `apps/dashboard/services/stl-service/tests/test_top_cover.py` (append), `apps/dashboard/services/stl-service/tests/test_schemas.py` (create)

**Interfaces:**
- Consumes: `build_top_cover(...)` dari Task 1.
- Produces: kwarg `run(cover_type='bottom')` menerima `'bottom'|'top'`; field Pydantic `GeneratorConfig.cover_type: Optional[Literal["bottom","top"]]`. Dashboard (Task 3) mengirim key JSON `cover_type` dengan nilai string ini.

- [ ] **Step 1: Write the failing tests**

Append ke `tests/test_top_cover.py`:

```python
def test_run_top_mode_smoke(tmp_path):
    """End-to-end smoke: top mode produces STL with cover slab, no floor plate."""
    cv2 = pytest.importorskip("cv2")
    from scripts.generate_shadow_casing import run

    # tiny silhouette mask: white bg, black square in the middle
    mask = np.full((64, 64), 255, dtype=np.uint8)
    mask[24:40, 24:40] = 0
    img = tmp_path / "mask.png"
    cv2.imwrite(str(img), mask)
    out = tmp_path / "out.stl"

    run(
        input_image=str(img), output_stl=str(out),
        outer_radius=40, base_radius=40, shell_height=50,
        n_stencil_theta=128, n_stencil_z=16,
        support_stems=False,
        cover_type='top',
    )
    mesh = trimesh.load(str(out))
    zmax = mesh.bounds[1][2]
    # cover slab present above the wall (wall_top ≈ 50 + base_thickness 2)
    assert zmax > 50.0
    # no floor plate: no vertices near z=0 inside r < 20 (wall sits at r≈40)
    v = mesh.vertices
    low_centre = v[(v[:, 2] < 1.0) & (np.hypot(v[:, 0], v[:, 1]) < 20.0)]
    assert len(low_centre) == 0
```

Create `tests/test_schemas.py`:

```python
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service.schemas import GeneratorConfig  # noqa: E402


def test_cover_type_accepts_top_and_bottom():
    assert GeneratorConfig(cover_type="top").cover_type == "top"
    assert GeneratorConfig(cover_type="bottom").cover_type == "bottom"
    assert GeneratorConfig().cover_type is None  # omitted → generator default


def test_cover_type_rejects_unknown():
    with pytest.raises(ValidationError):
        GeneratorConfig(cover_type="sideways")


def test_cover_type_in_dump_when_set():
    dumped = GeneratorConfig(cover_type="top").model_dump(exclude_none=True)
    assert dumped == {"cover_type": "top"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_top_cover.py::test_run_top_mode_smoke tests/test_schemas.py -v`
Expected: `test_run_top_mode_smoke` FAIL (`run() got an unexpected keyword argument 'cover_type'`), schema tests FAIL (`ValidationError: extra_forbidden` / attribute error).

- [ ] **Step 3: Implement — `run()` signature**

Di signature `run()` (dekat `skip_led_pillar = False,` ~baris 2609), tambahkan:

```python
    cover_type           = 'bottom',  # 'bottom' = floor plate + pillar (default), 'top' = closed top cover with LED recess, open bottom
```

- [ ] **Step 4: Implement — ganti bagian floor plate + pillar**

Bagian `# ── 4. Raised floor plate with cable hole ──` sampai `# ── 6. Combine ──` (~baris 2868–2912) direstrukturisasi. Bungkus blok floor-plate & pillar existing dalam `if cover_type != 'top':`, tambahkan cabang top, dan generalisasi daftar parts:

```python
    # ── 4/5. Mount geometry — bottom (floor plate + pillar) or top cover ──
    base       = None
    led_holder = None
    top_cover  = None

    if cover_type == 'top':
        # Open bottom, closed top: LED puck hangs from a recess in the cover.
        if not preview_mode:
            top_cover = build_top_cover(
                wall_top        = wall_top,
                cover_thickness = base_thickness,
                recess_r        = pillar_outer_r,
                recess_depth    = led_socket_height,
                light_x         = light_x,
                light_y         = light_y,
                casing_poly     = casing_poly,
                base_radius     = base_radius,
                n_circ          = n_circ,
            )
    else:
        # ── existing floor-plate block, UNCHANGED, indented one level ──
        from shapely.geometry import Polygon as _ShapelyPoly
        _hole_a    = np.linspace(0, 2 * np.pi, n_circ, endpoint=False)
        _hole_poly = _ShapelyPoly(list(zip(pillar_inner_r * np.cos(_hole_a),
                                            pillar_inner_r * np.sin(_hole_a))))
        if casing_poly is not None:
            _base_poly = casing_poly.difference(_hole_poly)
            base_desc  = 'custom shape'
        else:
            _outer_a    = np.linspace(0, 2 * np.pi, n_circ, endpoint=False)
            _outer_poly = _ShapelyPoly(list(zip(base_radius * np.cos(_outer_a),
                                                 base_radius * np.sin(_outer_a))))
            _base_poly  = _outer_poly.difference(_hole_poly)
            base_desc   = f'circle r={base_radius:.1f}mm'
        if not _base_poly.is_valid:
            _base_poly = _base_poly.buffer(0)
        base = trimesh.creation.extrude_polygon(_base_poly, base_thickness)
        base.apply_translation([0.0, 0.0, floor_z])
        trimesh.repair.fix_normals(base)
        print(f'  [B] floor plate  — {base_desc} + cable hole ∅{pillar_inner_r*2:.1f}mm'
              f'  z={floor_z:.1f}→{base_z:.1f}mm  faces={len(base.faces)}')

        # ── existing LED pillar block, UNCHANGED, indented one level ──
        if not skip_led_pillar:
            led_holder = build_led_holder(
                start_z        = max(base_z - 0.5, 0.0),
                z_light        = z_light - led_socket_height,
                pillar_outer_r = pillar_outer_r,
                pillar_inner_r = pillar_inner_r,
                n_circ         = n_circ,
            )

    # ── 6. Combine ────────────────────────────────────────────────────
    parts = [wall_mesh] + [m for m in (base, led_holder, top_cover) if m is not None]
    combined = trimesh.util.concatenate(parts)
```

(Isi blok existing tidak diubah — hanya indentasi + `if skip_led_pillar: led_holder = None / else:` disederhanakan jadi `if not skip_led_pillar:` karena `led_holder` sudah diinisialisasi `None`.)

- [ ] **Step 5: Implement — CLI args**

Setelah blok `# LED holder` di argparse (~baris 3029), tambahkan:

```python
    p.add_argument('--led-socket-height', type=float, default=10.0,
                   help='LED socket height above pillar top (bottom mode) / recess depth (top mode) (mm)')
    p.add_argument('--cover-type', choices=['bottom', 'top'], default='bottom',
                   help='bottom = floor plate + LED pillar (default); '
                        'top = closed top cover with LED recess, open bottom')
    p.add_argument('--invert-shadow', action='store_true', default=False,
                   help='Invert the silhouette mask (swap solid/hole regions)')
```

Dan di pemanggilan `run()` dalam `__main__` tambahkan tiga baris:

```python
        led_socket_height    = a.led_socket_height,
        cover_type           = a.cover_type,
        invert_mask          = a.invert_shadow,
```

- [ ] **Step 6: Implement — schema service**

Di `service/schemas.py` section `# ── LED pillar ──` (setelah `led_socket_height`, baris ~57), tambahkan:

```python
    cover_type:        Optional[Literal["bottom", "top"]] = None
```

(`Literal` sudah di-import di baris 12.)

- [ ] **Step 7: Run all Python tests**

Run: `python -m pytest tests/ -v`
Expected: semua PASS (5 unit Task 1 + 1 smoke + 3 schema).

- [ ] **Step 8: Regression check mode bottom**

Run: `python -c "
import sys; sys.path.insert(0, '.')
import inspect
from scripts.generate_shadow_casing import run
sig = inspect.signature(run)
assert sig.parameters['cover_type'].default == 'bottom'
print('default bottom OK')
"`
Expected: `default bottom OK`

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/services/stl-service/scripts/generate_shadow_casing.py apps/dashboard/services/stl-service/service/schemas.py apps/dashboard/services/stl-service/tests/test_top_cover.py apps/dashboard/services/stl-service/tests/test_schemas.py
git commit -m "feat(stl-service): cover_type bottom|top wiring in run(), CLI, and service schema"
```

---

### Task 3: Dashboard — defaults, cover-type select, invert switch, conditional sections

**Files:**
- Modify: `apps/dashboard/lib/light-generator/types.ts:67-88` (`DEFAULT_LG_CONFIG`)
- Modify: `apps/dashboard/components/light-generator/LgConfigEditor.tsx`
- Test: `apps/dashboard/components/light-generator/__tests__/LgConfigEditor.test.tsx` (create)

**Interfaces:**
- Consumes: key JSON `cover_type: 'bottom'|'top'`, `invert_mask: boolean` — diteruskan apa adanya via `configJsonOperator` → route generate → `GeneratorConfig` (Task 2). Tidak ada perubahan di route API (config sudah pass-through).
- Produces: —

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/components/light-generator/__tests__/LgConfigEditor.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LgConfigEditor } from '../LgConfigEditor'

function render(config: Record<string, unknown>) {
  return renderToStaticMarkup(
    <LgConfigEditor orderId="test" customerConfig={config} operatorConfig={null} />
  )
}

describe('LgConfigEditor cover type', () => {
  it('bottom (default): renders pillar section, hides recess section', () => {
    const html = render({})
    expect(html).toContain('Cover type')
    expect(html).toContain('Pillar outer radius')
    expect(html).toContain('Invert shadow')
    expect(html).not.toContain('Recess radius')
  })

  it('top: renders recess section, hides pillar section', () => {
    const html = render({ cover_type: 'top' })
    expect(html).toContain('Recess radius')
    expect(html).toContain('Recess depth')
    expect(html).not.toContain('Pillar outer radius')
    expect(html).not.toContain('Cable channel radius')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter shopee-dashboard exec vitest run components/light-generator/__tests__/LgConfigEditor.test.tsx
```
Expected: FAIL — `Cover type` / `Recess radius` tidak ditemukan di markup.

- [ ] **Step 3: Implement — `DEFAULT_LG_CONFIG`**

Di `types.ts`, tambahkan ke object `DEFAULT_LG_CONFIG` (sebelum `} as const`):

```ts
  cover_type: "bottom",
  invert_mask: false,
  pillar_outer_r: 4,
  pillar_inner_r: 2.5,
  led_socket_height: 10,
```

- [ ] **Step 4: Implement — editor**

Di `LgConfigEditor.tsx`:

**(a)** Tambahkan konstanta setelah `SHAPE_OPTIONS` (~baris 49):

```tsx
const COVER_OPTIONS = [
  { value: "bottom", label: "Bottom cover (pillar)" },
  { value: "top",    label: "Top cover (recess)" },
]

// Same underlying keys as the LED Pillar section — relabeled for top-cover
// mode where they define the puck recess instead of the pillar.
const RECESS_PARAMS: ParamDef[] = [
  { key: "pillar_outer_r",    label: "Recess radius (mm)", help: "Radius of the LED puck recess under the top cover", type: "number", min: 1, max: 30, step: 0.5 },
  { key: "led_socket_height", label: "Recess depth (mm)",  help: "Depth of the recess; capped so the roof stays closed", type: "number", min: 0, max: 50, step: 0.5 },
]
```

**(b)** Dalam komponen, setelah `const needsRatio = ...` (~baris 142):

```tsx
  const coverType = values.cover_type === "top" ? "top" : "bottom"
```

**(c)** `notifyChange` dan `buildCurrentConfig` menyertakan key baru. Di KEDUA fungsi, setelah loop `for (const section of SECTIONS)`, tambahkan (pakai `nextValues` di `notifyChange`, `values` di `buildCurrentConfig`):

```tsx
    config.cover_type = nextValues.cover_type === "top" ? "top" : "bottom"
    config.invert_mask = !!nextValues.invert_mask
```

**(d)** UI: di dalam `<div>` section "Casing Shape" (atau section baru "Cover" setelahnya, sebelum `{SECTIONS.map(...)}`), tambahkan:

```tsx
        {/* Cover section */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold border-b pb-2">Cover</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Cover type</Label>
              <Select
                value={coverType}
                onValueChange={(v) => { if (v) setValue("cover_type", v) }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COVER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-[11px]">
                Bottom: floor plate + LED pillar, open top. Top: closed cover with LED recess, open bottom.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Invert shadow</Label>
                <p className="text-muted-foreground text-[11px]">Swap solid/hole regions of the silhouette</p>
              </div>
              <Switch checked={getBool("invert_mask")} onCheckedChange={(c) => setValue("invert_mask", c)} />
            </div>
          </div>
        </div>
```

**(e)** Render kondisional: ganti `{SECTIONS.map((section) => (` menjadi filter + injeksi section recess:

```tsx
        {SECTIONS
          .filter((section) => !(coverType === "top" && section.title === "LED Pillar"))
          .map((section) => (
```

dan setelah penutup `.map(...)` section existing (setelah `))}` ~baris 367), tambahkan blok section recess (render hanya saat `top`, markup identik dengan renderer section number existing — copy pola yang sama):

```tsx
        {coverType === "top" && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold border-b pb-2">LED Recess</h4>
            <div className="grid gap-5 sm:grid-cols-2">
              {RECESS_PARAMS.map((p) => (
                <div key={p.key} className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-sm">{p.label}</Label>
                    <span className="text-muted-foreground text-xs tabular-nums">{getNum(p.key)}</span>
                  </div>
                  <Slider
                    value={[getNum(p.key)]}
                    min={p.min} max={p.max} step={p.step}
                    onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : (val as number); if (v !== undefined) setValue(p.key, v) }}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={getNum(p.key)}
                      min={p.min} max={p.max} step={p.step}
                      onChange={(e) => setValue(p.key, e.currentTarget.value)}
                      className="h-8 w-24 text-sm"
                    />
                    <p className="text-muted-foreground text-[11px] flex-1">{p.help}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
```

Catatan: `RECESS_PARAMS` memakai key yang SAMA dengan section "LED Pillar" (`pillar_outer_r`, `led_socket_height`) — nilainya satu sumber, cuma label yang beda per mode. `pillar_inner_r` dan `skip_led_pillar` otomatis tersembunyi di mode top (section-nya di-filter), tapi tetap terserialisasi oleh loop `SECTIONS` di `buildCurrentConfig` — itu tidak apa-apa, generator mode top mengabaikannya.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter shopee-dashboard exec vitest run components/light-generator/__tests__/LgConfigEditor.test.tsx
```
Expected: 2 PASS.

- [ ] **Step 6: Run full dashboard test suite**

```bash
pnpm --filter shopee-dashboard test
```
Expected: semua PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/lib/light-generator/types.ts apps/dashboard/components/light-generator/LgConfigEditor.tsx "apps/dashboard/components/light-generator/__tests__/LgConfigEditor.test.tsx"
git commit -m "feat(dashboard): cover type select + invert shadow + conditional pillar/recess params in LG config editor"
```
