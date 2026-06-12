"""
generate_shadow_casing.py — Anamorphic shadow-lamp casing generator (v4)

Physical model
──────────────
  • Light source : point at (LIGHT_X, LIGHT_Y, z_light)
  • Floor plane  : z = 0
  • Casing       : cylindrical STENCIL WALL at OUTER_RADIUS + solid base disk

Stencil wall — how shadow forms
────────────────────────────────
The cylindrical wall at OUTER_RADIUS holds the shadow pattern as a stencil.

For a floor point (fx, fy, 0), the ray from light (lx, ly, lz) hits the wall at:
  t    = lz / (lz − z_wall)
  wall angle  θ  = atan2(lx + t·(cos·r − lx),  ly + t·(sin·r − ly))
  wall height z  = lz·(1 − outer_r/r_floor)   [centred light only]

Solid brick at (θ, z)  →  ray BLOCKED  →  floor DARK
Absent cell  at (θ, z)  →  ray passes   →  floor LIT

Shadow mapping (from cat mask):
  mask pixel DARK (255)  →  solid brick  (cat body → dark on floor)
  mask pixel LIT  (  0)  →  no brick     (background / eyes → lit on floor)

Smoothness approach (v4 improvement)
──────────────────────────────────────
1. Signed Distance Field (SDF) replaces binary threshold
   - SDF > 0 inside cat, < 0 outside, = 0 at boundary
   - Gaussian blur on SDF → smooth anti-aliased boundary
2. Column merging: consecutive solid z-cells in a column → one tall pillar
   - 50–100× fewer mesh faces vs individual bricks
   - eliminates staircase artifacts along wall height

All distances in millimetres.
"""

import os
import numpy as np
import cv2
import trimesh
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import warnings
warnings.filterwarnings("ignore")

# ─── USER PARAMETERS ─────────────────────────────────────────────────────────
INPUT_IMAGE          = "input/joyboy.jpg"
OUTPUT_STL           = "output/shadow_casing.stl"
OUTPUT_DEBUG         = "output/debug_stencil.png"
OUTPUT_MESH_PREVIEW  = "output/mesh_preview.png"
OUTPUT_SHADOW_COMP   = "output/shadow_comparison.png"

# Casing geometry
OUTER_RADIUS         = 40.0    # outer radius of stencil wall (mm)
SHELL_HEIGHT         = 30.0    # height of stencil wall (mm)
SHELL_THICKNESS      = 1.8     # radial wall thickness of each brick / pillar (mm)
BASE_RADIUS          = 45.0    # base disk radius — can be ≥ OUTER_RADIUS for a flange (mm)
BASE_THICKNESS       = 2.0     # base disk height (mm)

# Projection geometry
FLOOR_HALF_SIZE      = 150.0   # half-width of target shadow on floor (mm)
LIGHT_X              = 0.0     # light X position (mm; 0 = centred)
LIGHT_Y              = 0.0     # light Y position (mm; 0 = centred)
LIGHT_Z_OFFSET       = 5.0     # z above shell top → z_light = SHELL_HEIGHT + LIGHT_Z_OFFSET
SHADOW_OFFSET_X      = 0.0     # shift shadow centre on floor in X (mm) without distortion
SHADOW_OFFSET_Y      = 0.0     # shift shadow centre on floor in Y (mm) without distortion
SUPPORT_STEMS        = True    # auto-ground floating wall islands with thin base stems

# Smoothness (SDF + Gaussian)
EDGE_SMOOTH_SIGMA    = 2.0     # Gaussian σ on SDF (image pixels); lowered from 5.0 — high σ erodes thin strokes
SHADOW_THRESHOLD     = 0.0     # SDF threshold (0 = exact boundary; + erodes; − dilates)
MASK_UPSAMPLE        = 4       # upsample factor before SDF (higher = finer SDF; 4 recommended)

# Flooring / casing shape (optional)
FLOORING_SHAPE       = None    # None/"circle" = circular
                                # "triangle", "square", "rect", "rect:W:H",
                                # "oval", "oval:W:H"  — built-in parametric shapes
                                # Or a path to a B&W image (black pixels = footprint)

# LED holder pillar
PILLAR_OUTER_R       = 4.0     # outer radius of LED holder pillar (mm)
PILLAR_INNER_R       = 2.5     # inner radius = cable channel (mm)

# Casing lift (compensation for externally-printed electronics chamber)
CASING_LIFT          = 0.0     # floats the casing floor above z=0 (mm)

# Stencil resolution
N_STENCIL_THETA      = 512     # angular segments (higher = finer angular detail)
N_STENCIL_Z          = 512     # height layers    (higher = finer radial shadow detail)
N_CIRC               = 64      # circular primitive sections (base disk)

# ── Geometry smoothness (v5) ──────────────────────────────────────────────────
# SMOOTH_BUILDER uses a shared cylindrical vertex grid instead of independent
# pillars.  Outer/inner surfaces are continuous — no fins between adjacent solid
# columns — which eliminates the ribbed look on the printed part.
# Set to False to revert to the legacy pillar builder.
SMOOTH_BUILDER       = True    # continuous surface builder (no ribs)  [recommended]

# Taubin post-process smoothing applied to the stencil wall after building.
# Volume-preserving (no shrinkage), reduces small-scale faceting.
# 0 = disabled.  Typical useful range: 5–20 iterations.
TAUBIN_ITERATIONS    = 0       # smoothing passes  (0 = off)
TAUBIN_LAMBDA        = 0.5     # positive shrink step  (0 < λ < 1)
TAUBIN_NU            = -0.53   # negative expand step  (−λ/(1−λ·κ) ≈ −0.53)

GENERATOR_VERSION = "2.0.0"


PREVIEW_MODE_OVERRIDES = {
    "n_stencil_theta": 128,
    "n_stencil_z": 128,
    "shell_thickness": 1.0,      # intentionally too thin for production print
    "support_stems": False,
    "taubin_iterations": 0,
    "skip_led_pillar": True,
    "add_watermark": True,
    "min_wall_mm": 0.0,          # skip morphological opening
}


def apply_preview_mode_overrides(params: dict) -> dict:
    """
    Return a copy of `params` with preview-mode overrides applied.

    Used to produce degraded, unprintable meshes for customer preview
    distribution while keeping the production STL path unchanged.
    """
    out = dict(params)
    for key, value in PREVIEW_MODE_OVERRIDES.items():
        if key in ("n_stencil_theta", "n_stencil_z"):
            out[key] = min(out.get(key, value), value)
        else:
            out[key] = value
    return out


# ─── MASK PREPROCESSING (SDF-BASED) ──────────────────────────────────────────

def load_silhouette_mask(image_path: str, invert: bool = False) -> np.ndarray:
    """Load image → raw binary mask (255 = solid wall / blocks light, 0 = hole).

    Handles two cases:
      • RGBA image — uses the alpha channel directly. When invert=False (default),
                     opaque → 255 (solid), transparent → 0 (hole). When invert=True,
                     the alpha interpretation flips.
      • RGB / grey — when invert=False (default), uses THRESH_BINARY_INV so dark
                     pixels → 255 (solid). When invert=True, uses THRESH_BINARY
                     so light pixels → 255 (solid) — matches typical white-on-black
                     silhouette expectations.

    Parameters
    ----------
    image_path : str
        Path to input image.
    invert : bool, default False
        If True, flip the mask polarity so that LIGHT pixels become solid.
        Useful for standard white-silhouette-on-black-background inputs where
        the customer expects the white shape to cast the shadow.
    """
    raw = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if raw is None:
        raise FileNotFoundError(f"Cannot open: {image_path}")

    if raw.ndim == 3 and raw.shape[2] == 4:
        # RGBA: use alpha channel as the mask
        alpha = raw[:, :, 3]
        binary = np.where(alpha > 127, np.uint8(255), np.uint8(0))
        if invert:
            binary = 255 - binary
    else:
        gray = cv2.cvtColor(raw, cv2.COLOR_BGR2GRAY) if raw.ndim == 3 else raw
        threshold_mode = cv2.THRESH_BINARY if invert else cv2.THRESH_BINARY_INV
        _, binary = cv2.threshold(
            gray, 0, 255, threshold_mode + cv2.THRESH_OTSU
        )

    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, k, iterations=2)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, k, iterations=1)
    return binary


def prepare_sdf_mask(mask: np.ndarray,
                      smooth_sigma: float,
                      threshold: float,
                      upsample: int = 1) -> tuple[np.ndarray, np.ndarray]:
    """
    Convert binary mask → smooth SDF-based mask.

    Steps:
      1. Optional upsample (improves SDF accuracy near boundaries)
      2. Compute SDF: dist_inside − dist_outside (positive inside cat)
      3. Gaussian blur on SDF for anti-aliased, smooth boundary
      4. Threshold SDF → refined binary mask

    Returns:
      smooth_mask : uint8 (255 = shadow, 0 = lit) with smooth boundary
      sdf         : float32 SDF (before thresholding, for debug)
    """
    h, w = mask.shape
    if upsample > 1:
        up_mask = cv2.resize(mask, (w * upsample, h * upsample),
                              interpolation=cv2.INTER_NEAREST)
    else:
        up_mask = mask.copy()

    fg = up_mask.astype(np.uint8)
    bg = cv2.bitwise_not(fg)

    dist_in  = cv2.distanceTransform(fg, cv2.DIST_L2, 5).astype(np.float32)
    dist_out = cv2.distanceTransform(bg, cv2.DIST_L2, 5).astype(np.float32)
    sdf = dist_in - dist_out

    if smooth_sigma > 0:
        sdf_blur = cv2.GaussianBlur(sdf, (0, 0), smooth_sigma * upsample)
        # Preserve thin strokes: blur smooths boundaries but must not sink solid ridges below 0
        sdf_smooth = np.where(sdf > 0, np.maximum(sdf_blur, sdf * 0.5), sdf_blur)
    else:
        sdf_smooth = sdf

    smooth_mask = ((sdf_smooth > threshold) * 255).astype(np.uint8)
    return smooth_mask, sdf_smooth


# ─── FLOORING / CASING SHAPE ─────────────────────────────────────────────────

_SHAPE_KEYWORDS = {'circle', 'square', 'triangle', 'rect', 'oval'}


def _parse_flooring_spec(spec: str) -> tuple[str, float, float]:
    """
    Parse flooring shape spec string.

    Accepted forms:
      "circle"           → ('circle', 1, 1)
      "square"           → ('rect',   1, 1)
      "triangle"         → ('triangle', 1, 1)
      "rect"             → ('rect',   1, 1)
      "rect:3:4"         → ('rect',   3, 4)
      "oval"             → ('oval',   1, 1)
      "oval:16:9"        → ('oval',  16, 9)

    Returns (shape_type, ratio_x, ratio_y).
    Raises ValueError for unknown keywords.
    """
    parts = spec.strip().lower().split(':')
    name  = parts[0]

    if name == 'square':
        return ('rect', 1.0, 1.0)

    if name not in _SHAPE_KEYWORDS:
        raise ValueError(f"Unknown shape keyword '{name}'. "
                         f"Valid keywords: {sorted(_SHAPE_KEYWORDS)}")

    if len(parts) == 3:
        try:
            rx, ry = float(parts[1]), float(parts[2])
        except ValueError:
            raise ValueError(f"Bad ratio in '{spec}' — expected 'shape:W:H' with numbers")
        if rx <= 0 or ry <= 0:
            raise ValueError(f"Ratios must be positive, got {rx}:{ry}")
    else:
        rx, ry = 1.0, 1.0

    return (name, rx, ry)


def _make_parametric_shape(shape_type: str, rx: float, ry: float,
                            outer_radius: float,
                            n_theta: int) -> tuple[np.ndarray, object]:
    """
    Build r_wall_arr and Shapely polygon for a named parametric shape.

    outer_radius is the *maximum* radial extent of the shape.

    Supported shape_type: 'circle', 'oval', 'rect', 'triangle'
    rx, ry: aspect ratio (used by 'oval' and 'rect').
    """
    from shapely.geometry import Polygon as ShapelyPolygon

    thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)

    if shape_type == 'circle':
        r_wall_arr = np.full(n_theta, outer_radius)

    elif shape_type == 'oval':
        # Ellipse: semi-axes scaled so max radius = outer_radius
        if rx >= ry:
            semi_x, semi_y = outer_radius, outer_radius * ry / rx
        else:
            semi_x, semi_y = outer_radius * rx / ry, outer_radius
        # Polar form of ellipse: r = semi_x·semi_y / √((semi_y·cosθ)² + (semi_x·sinθ)²)
        denom      = np.sqrt((semi_y * np.cos(thetas))**2 +
                              (semi_x * np.sin(thetas))**2)
        r_wall_arr = (semi_x * semi_y) / denom

    elif shape_type == 'rect':
        # Rectangle: half-sides a,b with corners at outer_radius
        # sqrt(a²+b²) = outer_radius, a/b = rx/ry
        norm = np.sqrt(rx**2 + ry**2)
        a    = outer_radius * rx / norm   # half-width  (x-axis)
        b    = outer_radius * ry / norm   # half-height (y-axis)
        cos_t = np.cos(thetas)
        sin_t = np.sin(thetas)
        with np.errstate(divide='ignore', invalid='ignore'):
            r_x = np.where(np.abs(cos_t) > 1e-9, np.abs(a / cos_t), np.inf)
            r_y = np.where(np.abs(sin_t) > 1e-9, np.abs(b / sin_t), np.inf)
        r_wall_arr = np.minimum(r_x, r_y)

    elif shape_type == 'triangle':
        # Equilateral triangle, circumradius = outer_radius, apex pointing up (90°)
        n_sides  = 3
        period   = 2 * np.pi / n_sides
        offset   = np.pi / 2        # rotate so apex is at top
        t_mod    = (thetas - offset) % (2 * np.pi) % period - period / 2
        r_wall_arr = outer_radius * np.cos(np.pi / n_sides) / np.cos(t_mod)

    else:
        raise ValueError(f"Unknown shape type: {shape_type}")

    # Build Shapely polygon from the polar profile
    pts_mm      = np.column_stack([r_wall_arr * np.cos(thetas),
                                    r_wall_arr * np.sin(thetas)])
    casing_poly = ShapelyPolygon(pts_mm)
    if not casing_poly.is_valid:
        casing_poly = casing_poly.buffer(0)

    return r_wall_arr, casing_poly


def _load_shape_from_image(image_path: str, outer_radius: float,
                            n_theta: int) -> tuple[np.ndarray, object]:
    """
    Load a B&W image and use BLACK pixels as the casing footprint outline.
    Scales the extracted shape so its maximum radius = outer_radius.
    """
    from shapely.geometry import Polygon as ShapelyPolygon
    from scipy.ndimage import gaussian_filter1d as gf1d

    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(f"Cannot open flooring shape image: {image_path}")

    # Black pixels (dark) = casing footprint → invert so they become 255
    _, casing_mask = cv2.threshold(img, 127, 255, cv2.THRESH_BINARY_INV)

    h, w   = casing_mask.shape
    cx, cy = w / 2.0, h / 2.0

    # Largest external contour
    contours, _ = cv2.findContours(casing_mask, cv2.RETR_EXTERNAL,
                                    cv2.CHAIN_APPROX_NONE)
    if not contours:
        raise RuntimeError(f"No black shape found in flooring image: {image_path}")
    contour = max(contours, key=cv2.contourArea)

    # Convert to polar (relative to image centre; flip y for math coords)
    pts      = contour.reshape(-1, 2).astype(float)
    dx       = pts[:, 0] - cx
    dy       = -(pts[:, 1] - cy)
    c_angles = np.arctan2(dy, dx) % (2 * np.pi)
    c_radii  = np.sqrt(dx**2 + dy**2)

    # Sample at n_theta angles — max radius per bin
    thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    dtheta = 2 * np.pi / n_theta
    r_px   = np.zeros(n_theta)

    for i, t in enumerate(thetas):
        lo  = (t - dtheta / 2) % (2 * np.pi)
        hi  = (t + dtheta / 2) % (2 * np.pi)
        sel = ((c_angles >= lo) & (c_angles < hi)) if lo < hi \
              else ((c_angles >= lo) | (c_angles < hi))
        if sel.any():
            r_px[i] = c_radii[sel].max()

    # Fill empty bins + smooth
    zero = r_px == 0
    if zero.any() and not zero.all():
        idx        = np.arange(n_theta)
        r_px[zero] = np.interp(idx[zero], idx[~zero], r_px[~zero], period=n_theta)
    r_px = gf1d(r_px, sigma=2.0, mode='wrap')

    r_wall_arr = r_px / r_px.max() * outer_radius

    pts_mm      = np.column_stack([r_wall_arr * np.cos(thetas),
                                    r_wall_arr * np.sin(thetas)])
    casing_poly = ShapelyPolygon(pts_mm)
    if not casing_poly.is_valid:
        casing_poly = casing_poly.buffer(0)

    print(f'  [flooring] loaded from image: {image_path}')
    print(f'  [flooring] r  min={r_wall_arr.min():.1f} mm  '
          f'max={r_wall_arr.max():.1f} mm')
    return r_wall_arr, casing_poly


def resolve_flooring_shape(flooring_shape, outer_radius: float,
                            n_theta: int) -> tuple[np.ndarray, object, str]:
    """
    Resolve --flooring-shape to (r_wall_arr, casing_poly, label).

    flooring_shape may be:
      None / "circle"       → perfect circle
      "square"              → square (rect 1:1)
      "triangle"            → equilateral triangle
      "rect" / "rect:W:H"  → rectangle, corners at outer_radius
      "oval" / "oval:W:H"  → ellipse, max axis = outer_radius
      <file path>           → B&W image, black pixels = footprint
    """
    # Default / explicit circle
    if not flooring_shape or flooring_shape.strip().lower() == 'circle':
        r_wall_arr  = np.full(n_theta, outer_radius)
        casing_poly = None
        label       = f'circle  r={outer_radius:.1f} mm'
        return r_wall_arr, casing_poly, label

    # Check if it looks like a shape keyword (or keyword:ratio)
    base = flooring_shape.strip().lower().split(':')[0]
    if base in _SHAPE_KEYWORDS:
        shape_type, rx, ry = _parse_flooring_spec(flooring_shape)
        r_wall_arr, casing_poly = _make_parametric_shape(
            shape_type, rx, ry, outer_radius, n_theta)
        ratio_str = f' {rx:.3g}:{ry:.3g}' if (rx != 1 or ry != 1) else ''
        label     = f'{flooring_shape.strip().lower()}  r_max={outer_radius:.1f} mm'
        print(f'  [flooring] parametric shape: {label}')
        print(f'  [flooring] r  min={r_wall_arr.min():.1f} mm  '
              f'max={r_wall_arr.max():.1f} mm')
        return r_wall_arr, casing_poly, label

    # Otherwise treat as image file path
    r_wall_arr, casing_poly = _load_shape_from_image(
        flooring_shape, outer_radius, n_theta)
    label = f'image ({flooring_shape})'
    return r_wall_arr, casing_poly, label


# ─── STENCIL WALL ────────────────────────────────────────────────────────────

def _bridge_floating_islands(stencil: np.ndarray,
                              stem_width: int = 2) -> tuple[np.ndarray, int]:
    """
    Find solid cells that are NOT reachable from z=0 via 4-connected BFS
    (θ wraps around), label them as connected components, and add one narrow
    vertical stem (stem_width columns wide) from z=0 to each island's bottom.

    Why BFS instead of a per-column check:
      A column can be solid at z=0 (background) yet have a disconnected island
      higher up (e.g. the counter of 'O' inside a white letter stroke).
      Per-column checks miss those; BFS from z=0 finds all unreachable cells.

    Returns (modified_stencil, n_islands).
    """
    from collections import deque

    n_theta, n_z = stencil.shape

    # ── Step 1: BFS from every solid z=0 cell ────────────────────────────
    connected = np.zeros_like(stencil, dtype=bool)
    q: deque = deque()
    for i in range(n_theta):
        if stencil[i, 0]:
            connected[i, 0] = True
            q.append((i, 0))
    while q:
        i, j = q.popleft()
        for di, dj in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ni = (i + di) % n_theta
            nj = j + dj
            if 0 <= nj < n_z and stencil[ni, nj] and not connected[ni, nj]:
                connected[ni, nj] = True
                q.append((ni, nj))

    floating = stencil & ~connected
    if not floating.any():
        return stencil, 0

    # ── Step 2: Label connected components of floating cells ─────────────
    labeled  = np.zeros(stencil.shape, dtype=np.int32)
    n_island = 0
    # only iterate over the (usually few) floating coords
    for si, sj in zip(*np.where(floating)):
        si, sj = int(si), int(sj)
        if labeled[si, sj]:
            continue
        n_island += 1
        q = deque([(si, sj)])
        labeled[si, sj] = n_island
        while q:
            i, j = q.popleft()
            for di, dj in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ni = (i + di) % n_theta
                nj = j + dj
                if 0 <= nj < n_z and floating[ni, nj] and not labeled[ni, nj]:
                    labeled[ni, nj] = n_island
                    q.append((ni, nj))

    # ── Step 3: One narrow stem per island ────────────────────────────────
    modified = stencil.copy()
    for c in range(1, n_island + 1):
        mask  = labeled == c
        j_min = int(np.where(mask.any(axis=0))[0][0])   # lowest z of island
        # pick the θ column with the most island cells (thickest = best anchor)
        best_i = int(mask.sum(axis=1).argmax())
        half   = stem_width // 2
        for k in range(stem_width):
            bi = (best_i - half + k) % n_theta
            modified[bi, :j_min] = True   # fill gap from z=0 up to island

    return modified, n_island


def _merge_column_runs(col: np.ndarray) -> list[tuple[int, int]]:
    """Return list of (start_idx, end_idx_inclusive) for runs of True in col."""
    padded = np.concatenate([[False], col, [False]])
    diffs  = np.diff(padded.astype(np.int8))
    starts = np.where(diffs ==  1)[0]   # first True index in each run
    ends   = np.where(diffs == -1)[0]   # first False after each run → last True = ends-1
    return list(zip(starts.tolist(), (ends - 1).tolist()))


def build_stencil_wall(smooth_mask: np.ndarray,
                        light_pos: tuple[float, float, float],
                        r_wall_arr: np.ndarray,
                        wall_t: float,
                        base_z: float,
                        shell_height: float,
                        floor_half: float,
                        n_theta: int,
                        n_z: int,
                        shadow_offset_x: float = 0.0,
                        shadow_offset_y: float = 0.0,
                        support_stems: bool = True,
                        stem_width: int = 2,
                        ) -> tuple[trimesh.Trimesh, np.ndarray, np.ndarray]:
    """
    Build a perforated wall from the smooth SDF mask.

    r_wall_arr  : (n_theta,) wall radius at each angle — circle if uniform,
                  custom shape if varying.
    Supports arbitrary light position (lx, ly, lz).

    shadow_offset_x/y : translate where on the floor the silhouette appears (mm).
      Positive X  → shadow moves right.  Positive Y → shadow moves up.
      Unlike light_x/y, this is a pure translation with no distortion.

    support_stems : when True, any angular column whose solid cells don't reach
      z_idx=0 (the base plate) gets a thin downward stem so there are no
      floating / disconnected islands in the printed part.
      Stem cells project onto the floor right at the casing footprint (already
      dark), so they are invisible in the cast shadow.

    For each wall cell (θ_i, z_j):
      • Wall point = (r_wall_arr[i]·cosθ, r_wall_arr[i]·sinθ, z_j)
      • Trace ray from light through wall point → floor position (fx, fy)
      • Subtract shadow offset → sample smooth_mask at shifted coords
      • solid if mask > 0, absent if mask = 0

    Adjacent z-cells in the same θ column are MERGED into one tall pillar.

    Returns:
      mesh    : trimesh of the stencil wall
      stencil : (n_theta, n_z) bool array
      z_cents : (n_z,) z-centres of stencil layers
    """
    lx, ly, lz = light_pos
    h_mask, w_mask = smooth_mask.shape
    cx, cy     = w_mask / 2.0, h_mask / 2.0
    half_px    = max(h_mask, w_mask) / 2.0

    # z range: base to where r_wall_min ray reaches floor_half
    # Using min r_wall so the stencil covers all angles fully
    r_min = r_wall_arr.min()
    # Start 0.5mm below base top so the wall interpenetrates the base plate —
    # a coplanar butt-join makes the combined STL non-manifold and risks
    # wall/base separation during slicing.
    z_min_s = max(base_z - 0.5, 0.0)
    z_max_s = min(shell_height, lz * (1.0 - r_min / floor_half))
    if z_max_s <= z_min_s:
        raise ValueError(
            f"floor_half={floor_half:.0f} too small or lz too low — "
            f"z range [{z_min_s:.1f}, {z_max_s:.1f}] is degenerate")

    thetas  = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    dtheta  = 2 * np.pi / n_theta
    z_cents = np.linspace(z_min_s, z_max_s, n_z)
    dz      = (z_max_s - z_min_s) / max(n_z - 1, 1)

    # ── Vectorised stencil look-up ────────────────────────────────────
    T_g, Z_g = np.meshgrid(thetas, z_cents, indexing='ij')   # (n_θ, n_z)

    # Wall points use per-angle radius
    R_wall_2d = r_wall_arr[:, np.newaxis]            # (n_θ, 1) → broadcasts
    WX = R_wall_2d * np.cos(T_g)
    WY = R_wall_2d * np.sin(T_g)

    # t such that ray from (lx,ly,lz) through (WX,WY,Z_g) reaches z=0
    denom = np.maximum(lz - Z_g, 1e-9)
    t_v   = lz / denom

    FX = lx + t_v * (WX - lx)   # floor x (mm)
    FY = ly + t_v * (WY - ly)   # floor y (mm)
    R_fl = np.sqrt(FX**2 + FY**2)

    # Apply shadow offset: shift where we sample the mask without moving the light.
    # Subtracting offset from FX/FY before the pixel lookup shifts the shadow
    # pattern by (+shadow_offset_x, +shadow_offset_y) on the floor.
    r_scale = half_px / floor_half
    PX = np.clip((cx + (FX - shadow_offset_x) * r_scale + 0.5).astype(np.int32), 0, w_mask - 1)
    PY = np.clip((cy - (FY - shadow_offset_y) * r_scale + 0.5).astype(np.int32), 0, h_mask - 1)

    stencil = (smooth_mask[PY, PX] > 0)            # (n_θ, n_z) bool
    stencil[R_fl > floor_half * 1.02] = False       # beyond target area → absent

    n_solid = int(stencil.sum())
    print(f"  [stencil] grid {n_theta}×{n_z},  solid {n_solid}/{n_theta*n_z} "
          f"({100*n_solid/(n_theta*n_z):.0f}%)")
    if n_solid == 0:
        raise RuntimeError("Stencil is empty — check mask or parameters")

    # ── Support stems: bridge floating islands to the base ───────────
    # Uses BFS from z=0 to find solid cells that are truly unreachable
    # (not just columns that happen to lack a z=0 cell), then adds the
    # minimum number of stems needed — one narrow stem per island.
    if support_stems:
        stencil, n_islands = _bridge_floating_islands(stencil, stem_width)
        if n_islands:
            print(f"  [stencil] bridged {n_islands} floating island(s) "
                  f"with {stem_width}-column stems")
        else:
            print(f"  [stencil] no floating islands detected")

    # ── Column merging: consecutive solid z-cells → one tall pillar ──
    pillar_ti   = []   # theta index
    pillar_z_lo = []   # z low edge
    pillar_z_hi = []   # z high edge

    for i in range(n_theta):
        runs = _merge_column_runs(stencil[i])
        for s, e in runs:
            pillar_ti.append(i)
            pillar_z_lo.append(max(z_cents[s] - dz / 2.0, base_z))
            pillar_z_hi.append(min(z_cents[e] + dz / 2.0, shell_height))

    N = len(pillar_ti)
    print(f"  [stencil] {N} pillars  (merged from {n_solid} cells, "
          f"{n_solid/N:.1f}× compression)")
    if N == 0:
        raise RuntimeError("No pillars generated")

    ti_arr   = np.array(pillar_ti,   dtype=np.int64)
    z_lo_arr = np.array(pillar_z_lo, dtype=np.float64)
    z_hi_arr = np.array(pillar_z_hi, dtype=np.float64)

    t_lo = thetas[ti_arr] - dtheta / 2.0
    t_hi = thetas[ti_arr] + dtheta / 2.0

    c0, s0 = np.cos(t_lo), np.sin(t_lo)
    c1, s1 = np.cos(t_hi), np.sin(t_hi)

    # Per-pillar outer and inner radii (supports non-circular casing)
    r_out = r_wall_arr[ti_arr]
    r_in  = np.maximum(r_out - wall_t, 0.5)

    # 8 vertices per pillar
    #  0: (inner, θ_lo, z_lo)    4: (inner, θ_lo, z_hi)
    #  1: (outer, θ_lo, z_lo)    5: (outer, θ_lo, z_hi)
    #  2: (outer, θ_hi, z_lo)    6: (outer, θ_hi, z_hi)
    #  3: (inner, θ_hi, z_lo)    7: (inner, θ_hi, z_hi)
    verts = np.empty((N * 8, 3))
    verts[0::8] = np.c_[r_in *c0, r_in *s0, z_lo_arr]
    verts[1::8] = np.c_[r_out*c0, r_out*s0, z_lo_arr]
    verts[2::8] = np.c_[r_out*c1, r_out*s1, z_lo_arr]
    verts[3::8] = np.c_[r_in *c1, r_in *s1, z_lo_arr]
    verts[4::8] = np.c_[r_in *c0, r_in *s0, z_hi_arr]
    verts[5::8] = np.c_[r_out*c0, r_out*s0, z_hi_arr]
    verts[6::8] = np.c_[r_out*c1, r_out*s1, z_hi_arr]
    verts[7::8] = np.c_[r_in *c1, r_in *s1, z_hi_arr]

    tpl = np.array([
        [0, 2, 3], [0, 1, 2],   # bottom  (−z)
        [4, 7, 6], [4, 6, 5],   # top     (+z)
        [1, 5, 6], [1, 6, 2],   # outer   (+r)
        [0, 3, 7], [0, 7, 4],   # inner   (−r)
        [0, 4, 5], [0, 5, 1],   # left    (−θ)
        [2, 6, 7], [2, 7, 3],   # right   (+θ)
    ], dtype=np.int32)

    off   = (np.arange(N, dtype=np.int64) * 8)[:, None, None]
    faces = (tpl[None] + off).reshape(-1, 3).astype(np.int32)

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    trimesh.repair.fix_normals(mesh)
    return mesh, stencil, z_cents


# ─── MARCHING-CUBES WALL BUILDER ─────────────────────────────────────────────

def build_stencil_wall_marching_cubes(
        smooth_mask: np.ndarray,
        sdf_float: np.ndarray,
        light_pos: tuple[float, float, float],
        r_wall_arr: np.ndarray,
        wall_t: float,
        base_z: float,
        shell_height: float,
        floor_half: float,
        n_theta: int,
        n_z: int,
        shadow_offset_x: float = 0.0,
        shadow_offset_y: float = 0.0,
        n_radial: int = 10,
        blur_sigma: float = 1.5,
        transition_width: float = 3.0,
        support_stems: bool = True,
        stem_width: int = 2,
) -> tuple[trimesh.Trimesh, np.ndarray, np.ndarray]:
    """
    Build stencil wall using marching cubes on a 3D volume field.

    Completely different from all previous builders — instead of constructing
    geometry from angular sectors, this creates a continuous 3D scalar field
    representing the wall, blurs it for smooth edges, then extracts the
    isosurface via marching cubes.

    Result: guaranteed smooth edges, watertight mesh, no staircase at any
    resolution. The Gaussian blur smooths ALL boundaries (angular, vertical,
    radial) uniformly.

    Parameters
    ----------
    smooth_mask : np.ndarray
        Binary mask for stencil (used for shadow simulation stencil output).
    sdf_float : np.ndarray
        Float SDF — drives wall thickness (positive = solid, negative = hole).
    light_pos : (lx, ly, lz)
    r_wall_arr : np.ndarray (n_theta,)
        Per-angle outer wall radius.
    wall_t : float
        Wall thickness in mm.
    base_z, shell_height : float
        Z range for the wall.
    floor_half : float
        Shadow projection half-size.
    n_theta, n_z : int
        Angular and vertical resolution of the stencil sampling grid.
    n_radial : int
        Number of voxels across the wall thickness (radial direction).
        8-12 is usually sufficient.
    blur_sigma : float
        Gaussian blur sigma in voxels applied to the volume field before
        marching cubes. Higher = smoother edges. 1.0-2.0 recommended.
    transition_width : float
        SDF-to-thickness mapping width.
    support_stems : bool
        Bridge floating islands.
    stem_width : int
        Stem column width.

    Returns
    -------
    mesh : trimesh.Trimesh
        Smooth watertight wall mesh.
    stencil : np.ndarray (bool, n_theta × n_z)
        Binary stencil for shadow simulation.
    z_cents : np.ndarray (n_z,)
    """
    from skimage.measure import marching_cubes
    from scipy.ndimage import gaussian_filter, map_coordinates

    lx, ly, lz = light_pos
    h_mask, w_mask = sdf_float.shape
    cx, cy = w_mask / 2.0, h_mask / 2.0
    half_px = max(h_mask, w_mask) / 2.0
    r_scale = half_px / floor_half

    r_min_wall = r_wall_arr.min()
    z_min_s = base_z
    z_max_s = min(shell_height, lz * (1.0 - r_min_wall / floor_half))
    if z_max_s <= z_min_s:
        raise ValueError(f"floor_half={floor_half:.0f} too small or lz too low")

    thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    z_cents = np.linspace(z_min_s, z_max_s, n_z)

    # ── Sample SDF at each (theta, z) ──
    T_g, Z_g = np.meshgrid(thetas, z_cents, indexing='ij')
    R_wall_2d = r_wall_arr[:, np.newaxis]
    WX = R_wall_2d * np.cos(T_g)
    WY = R_wall_2d * np.sin(T_g)
    denom = np.maximum(lz - Z_g, 1e-9)
    t_v = lz / denom
    FX = lx + t_v * (WX - lx)
    FY = ly + t_v * (WY - ly)
    R_fl = np.sqrt(FX**2 + FY**2)

    PX_c = np.clip(cx + (FX - shadow_offset_x) * r_scale, 0, w_mask - 1)
    PY_c = np.clip(cy - (FY - shadow_offset_y) * r_scale, 0, h_mask - 1)

    sdf_grid = map_coordinates(
        sdf_float.astype(np.float64),
        [PY_c.ravel(), PX_c.ravel()],
        order=1, mode='nearest',
    ).reshape(n_theta, n_z)
    sdf_grid[R_fl > floor_half * 1.02] = -9999.0

    thickness_frac = np.clip(sdf_grid / max(transition_width, 0.1), 0.0, 1.0)

    # Binary stencil for shadow simulation
    PX_i = PX_c.astype(np.int32)
    PY_i = PY_c.astype(np.int32)
    stencil = (smooth_mask[PY_i, PX_i] > 0)
    stencil[R_fl > floor_half * 1.02] = False
    if support_stems:
        stencil, n_isl = _bridge_floating_islands(stencil, stem_width)
        if n_isl:
            print(f"  [stencil] bridged {n_isl} floating island(s)")
        stem_cells = stencil & (thickness_frac < 0.5)
        thickness_frac[stem_cells] = 1.0

    n_solid = int((thickness_frac > 0.01).sum())
    print(f"  [stencil] grid {n_theta}×{n_z},  solid {n_solid}/{n_theta*n_z} "
          f"({100*n_solid/(n_theta*n_z):.0f}%)")

    # ── Build 3D volume in cylindrical (theta, z, r) ──
    # Pad theta for wraparound (marching cubes needs continuous data at the seam)
    pad = max(3, int(np.ceil(blur_sigma * 3)))

    tf_padded = np.concatenate([
        thickness_frac[-pad:, :],
        thickness_frac,
        thickness_frac[:pad, :],
    ], axis=0)  # (n_theta + 2*pad, n_z)

    rw_padded = np.concatenate([
        r_wall_arr[-pad:],
        r_wall_arr,
        r_wall_arr[:pad],
    ])  # (n_theta + 2*pad,)

    n_tp = n_theta + 2 * pad

    # ── Smooth the 2D thickness field BEFORE building 3D volume ──
    # This is the key: blur the hole boundaries in (theta, z) space to
    # eliminate staircase. Then build the 3D volume from the already-smooth
    # thickness → marching cubes extracts smooth edges.
    # DO NOT blur the 3D volume — even theta/z blur in 3D mixes the thin
    # wall's positive field with neighboring hole cells' negative field,
    # destroying the wall.
    try:
        tf_smooth = gaussian_filter(
            tf_padded, sigma=blur_sigma, mode=['wrap', 'nearest'],
        )
    except (TypeError, ValueError):
        tf_smooth = gaussian_filter(tf_padded, sigma=blur_sigma, mode='nearest')

    # Radial range: cover from slightly inside inner wall to slightly outside outer wall
    r_margin = wall_t * 0.3
    r_lo = r_wall_arr.min() - wall_t - r_margin
    r_hi = r_wall_arr.max() + r_margin
    radial_span = r_hi - r_lo
    min_n_radial = max(n_radial, int(np.ceil(radial_span / wall_t * 3)))
    n_radial = min_n_radial
    r_vals = np.linspace(r_lo, r_hi, n_radial)

    # Build volume from the SMOOTHED 2D thickness
    R_out_3d = rw_padded[:, np.newaxis, np.newaxis]
    TF_3d = tf_smooth[:, :, np.newaxis]                        # smoothed!
    R_in_3d = R_out_3d - wall_t * TF_3d
    R_3d = r_vals[np.newaxis, np.newaxis, :]

    field_blurred = np.minimum(R_out_3d - R_3d, R_3d - R_in_3d)

    print(f"  [marching] volume {n_tp}×{n_z}×{n_radial} = "
          f"{n_tp*n_z*n_radial/1e6:.1f}M voxels")

    # ── Run marching cubes ──
    # Spacing: physical size per voxel in each dimension
    d_theta = 2 * np.pi / n_theta  # angular step (same as original grid)
    d_z = (z_max_s - z_min_s) / max(n_z - 1, 1)
    d_r = (r_hi - r_lo) / max(n_radial - 1, 1)

    try:
        verts_grid, faces, normals, _ = marching_cubes(
            field_blurred, level=0.0,
            spacing=(d_theta, d_z, d_r),
        )
    except (ValueError, RuntimeError) as e:
        raise RuntimeError(f"Marching cubes failed: {e}")

    print(f"  [marching] extracted {len(faces)} faces, {len(verts_grid)} verts")

    # ── Map from grid coords to cylindrical, then to Cartesian ──
    # verts_grid columns: (theta_scaled, z_scaled, r_scaled) from marching cubes
    # theta_scaled = grid_index * d_theta (starting from padded grid origin)
    v_theta = verts_grid[:, 0] - pad * d_theta  # remove padding offset
    v_z = verts_grid[:, 1] + z_min_s
    v_r = verts_grid[:, 2] + r_lo

    # Wrap theta to [0, 2π)
    v_theta = v_theta % (2 * np.pi)

    # For non-circular casings, r_wall varies with theta.
    # The marching cubes field was built with the correct per-theta r_wall,
    # so the extracted surface already accounts for the varying radius.
    # We just need to map (theta, z, r) → (x, y, z):
    verts_xyz = np.column_stack([
        v_r * np.cos(v_theta),
        v_r * np.sin(v_theta),
        v_z,
    ])

    mesh = trimesh.Trimesh(vertices=verts_xyz, faces=faces, process=True)
    trimesh.repair.fix_normals(mesh)

    print(f"  [marching] final mesh: {len(mesh.faces)} faces  "
          f"{len(mesh.vertices)} verts  watertight={mesh.is_watertight}")

    return mesh, stencil, z_cents


# ─── SDF-BASED CONTINUOUS SURFACE WALL (v2) ──────────────────────────────────

def build_stencil_wall_sdf_surface(
        smooth_mask: np.ndarray,
        sdf_float: np.ndarray,
        light_pos: tuple[float, float, float],
        r_wall_arr: np.ndarray,
        wall_t: float,
        base_z: float,
        shell_height: float,
        floor_half: float,
        n_theta: int,
        n_z: int,
        shadow_offset_x: float = 0.0,
        shadow_offset_y: float = 0.0,
        transition_width: float = 3.0,
        edge_blur_sigma: float = 0.0,   # 0=off. Higher smooths hole edges but loses detail.
        min_bridge_mm: float = 0.0,     # 0=off. Dilate solid regions to ensure thin bridges survive printing.
        support_stems: bool = True,
        stem_width: int = 2,
) -> tuple[trimesh.Trimesh, np.ndarray, np.ndarray]:
    """
    Build stencil wall as a continuous surface with SDF-based thickness.

    The outer surface is a cylinder at r_out (per-angle via r_wall_arr).
    The inner surface varies continuously: full wall thickness where solid
    (SDF >> 0), tapering to zero where hole (SDF << 0). The transition is
    smooth — no staircase artifacts.

    Grid topology (n_theta × n_z) ensures manifold mesh.
    Cells with zero thickness in all 4 corners are skipped → reasonable file size.

    Parameters
    ----------
    smooth_mask : np.ndarray
        Binary mask (used only to produce the binary stencil for shadow simulation).
    sdf_float : np.ndarray
        Float SDF from prepare_sdf_mask — positive inside solid, negative outside.
        This drives the continuous thickness interpolation.
    light_pos : tuple
        (lx, ly, lz) light position in mm.
    r_wall_arr : np.ndarray shape (n_theta,)
        Per-angle outer wall radius.
    wall_t : float
        Maximum wall thickness in mm (where SDF is deep positive).
    base_z : float
        Minimum z of the stencil wall.
    shell_height : float
        Maximum z of the stencil wall (absolute).
    floor_half : float
        Half-width of shadow on floor (mm).
    n_theta, n_z : int
        Grid resolution.
    shadow_offset_x, shadow_offset_y : float
        Shadow translation offsets.
    transition_width : float
        SDF units for the solid→hole taper. Larger = smoother edge, wider taper.
        Default 3.0 gives a smooth ~1-2mm taper at typical resolutions.
    support_stems : bool
        Whether to bridge floating islands (applied to the binary stencil).
    stem_width : int
        Stem width for floating island bridges.

    Returns
    -------
    mesh : trimesh.Trimesh
        Manifold mesh of the stencil wall.
    stencil : np.ndarray (bool)
        Binary stencil (for shadow simulation compatibility).
    z_cents : np.ndarray
        Z center values.
    """
    from scipy.ndimage import map_coordinates

    lx, ly, lz = light_pos
    h_mask, w_mask = sdf_float.shape
    cx, cy = w_mask / 2.0, h_mask / 2.0
    half_px = max(h_mask, w_mask) / 2.0
    r_scale = half_px / floor_half

    r_min = r_wall_arr.min()
    # Start 0.5mm below base top so the wall interpenetrates the base plate —
    # a coplanar butt-join makes the combined STL non-manifold and risks
    # wall/base separation during slicing.
    z_min_s = max(base_z - 0.5, 0.0)
    z_max_s = min(shell_height, lz * (1.0 - r_min / floor_half))
    if z_max_s <= z_min_s:
        raise ValueError(
            f"floor_half={floor_half:.0f} too small or lz too low — "
            f"z range [{z_min_s:.1f}, {z_max_s:.1f}] is degenerate")

    thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    z_cents = np.linspace(z_min_s, z_max_s, n_z)

    # ── Project each (theta, z) grid point to floor → sample SDF bilinearly ──
    T_g, Z_g = np.meshgrid(thetas, z_cents, indexing='ij')  # (n_theta, n_z)
    R_wall_2d = r_wall_arr[:, np.newaxis]
    WX = R_wall_2d * np.cos(T_g)
    WY = R_wall_2d * np.sin(T_g)
    denom = np.maximum(lz - Z_g, 1e-9)
    t_v = lz / denom
    FX = lx + t_v * (WX - lx)
    FY = ly + t_v * (WY - ly)
    R_fl = np.sqrt(FX**2 + FY**2)

    # Continuous image coordinates for bilinear SDF sampling
    PX_c = np.clip(cx + (FX - shadow_offset_x) * r_scale, 0, w_mask - 1)
    PY_c = np.clip(cy - (FY - shadow_offset_y) * r_scale, 0, h_mask - 1)

    # Sample SDF bilinearly at every grid point
    sdf_grid = map_coordinates(
        sdf_float.astype(np.float64),
        [PY_c.ravel(), PX_c.ravel()],
        order=1, mode='nearest',
    ).reshape(n_theta, n_z)

    # Mark out-of-range projections as "hole"
    sdf_grid[R_fl > floor_half * 1.02] = -9999.0

    # ── Optional dilation for thin bridges (Zoro sword fix) ──
    # Shifts SDF threshold into negative territory, effectively growing all
    # solid regions outward by `dilation_px` pixels. Thin cantilever features
    # get proportionally thicker while wide features barely change.
    # SDF is in upsampled-mask pixel units. Convert mm → SDF pixels:
    #   mask spans 2*floor_half mm across max(h_mask, w_mask) * upsample pixels
    #   → mm_per_sdf_pixel = floor_half / half_px  (since r_scale = half_px/floor_half)
    if min_bridge_mm > 0:
        # min_bridge_mm is the desired MINIMUM feature WIDTH — we need HALF
        # width as the dilation radius (a feature of width W needs SDF > -W/2
        # at its thinnest point to survive).
        mm_per_px = floor_half / half_px
        dilation_px = (min_bridge_mm / 2.0) / mm_per_px
        sdf_grid = sdf_grid + dilation_px
        print(f"  [stencil] bridge dilation: +{dilation_px:.2f} px "
              f"(={min_bridge_mm/2:.2f} mm half-width)")

    # ── Compute thickness fraction: 0 (hole) to 1 (solid) ──
    thickness_frac = np.clip(sdf_grid / max(transition_width, 0.1), 0.0, 1.0)
    # Enforce minimum radial thickness for solid cells — thin strokes get full wall depth
    # without this, a narrow stroke (SDF peak < transition_width) tapers to near-zero radial thickness
    _MIN_THICK_FRAC = 0.7  # at least 70% of shell_thickness (e.g. 2.1mm of 3.0mm)
    solid_mask = sdf_grid > 0
    thickness_frac[solid_mask] = np.maximum(thickness_frac[solid_mask], _MIN_THICK_FRAC)

    # ── Also compute binary stencil for shadow simulation ──
    PX_i = PX_c.astype(np.int32)
    PY_i = PY_c.astype(np.int32)
    stencil = (smooth_mask[PY_i, PX_i] > 0)
    stencil[R_fl > floor_half * 1.02] = False

    if support_stems:
        stencil, n_islands = _bridge_floating_islands(stencil, stem_width)
        if n_islands:
            print(f"  [stencil] bridged {n_islands} floating island(s)")
        stem_cells = stencil & (thickness_frac < 0.5)
        thickness_frac[stem_cells] = 1.0

    # ── 2D Gaussian blur on thickness field → smooth hole edges ──
    # This is the key to eliminating staircase WITHOUT increasing n_theta.
    # Blurs the solid/hole boundary across multiple cells, creating a gradual
    # taper instead of a sharp step at each angular cell boundary.
    # Only affects the MESH thickness — shadow stencil stays binary.
    if edge_blur_sigma > 0:
        from scipy.ndimage import gaussian_filter
        try:
            thickness_frac = gaussian_filter(
                thickness_frac, sigma=edge_blur_sigma,
                mode=['wrap', 'nearest'],  # wrap theta, clamp z
            )
        except (TypeError, ValueError):
            thickness_frac = gaussian_filter(
                thickness_frac, sigma=edge_blur_sigma, mode='nearest',
            )
        thickness_frac = np.clip(thickness_frac, 0.0, 1.0)
        print(f"  [stencil] edge blur sigma={edge_blur_sigma:.1f} applied")

    n_solid = int((thickness_frac > 0.01).sum())
    print(f"  [stencil] grid {n_theta}×{n_z},  solid {n_solid}/{n_theta*n_z} "
          f"({100*n_solid/(n_theta*n_z):.0f}%)")

    # ── Build vertex grids ──
    cos_t = np.cos(thetas)
    sin_t = np.sin(thetas)

    # Outer vertices: always at r_wall_arr (per-angle radius)
    r_outer = r_wall_arr[:, np.newaxis] * np.ones((1, n_z))  # (n_theta, n_z)
    # Inner vertices: tapered based on thickness_frac
    r_inner = r_outer - wall_t * thickness_frac  # (n_theta, n_z)

    # 3D positions
    cos_2d = cos_t[:, np.newaxis]  # (n_theta, 1) → broadcasts to (n_theta, n_z)
    sin_2d = sin_t[:, np.newaxis]
    z_2d = np.broadcast_to(z_cents[np.newaxis, :], (n_theta, n_z))

    outer_verts = np.column_stack([
        (r_outer * cos_2d).ravel(),
        (r_outer * sin_2d).ravel(),
        z_2d.ravel(),
    ])
    inner_verts = np.column_stack([
        (r_inner * cos_2d).ravel(),
        (r_inner * sin_2d).ravel(),
        z_2d.ravel(),
    ])
    all_verts = np.vstack([outer_verts, inner_verts])
    n_verts_surface = n_theta * n_z  # vertices per surface

    # ── Build faces (vectorized) ──
    # For each cell (i, j) to (i+1, j+1): emit outer + inner quad if has solid content
    I, J = np.meshgrid(np.arange(n_theta), np.arange(n_z - 1), indexing='ij')
    I_next = (I + 1) % n_theta

    # Check which cells have any solid content (any corner with thickness > eps)
    eps = 0.01
    cell_solid = (
        np.maximum(
            np.maximum(thickness_frac[I, J], thickness_frac[I_next, J]),
            np.maximum(thickness_frac[I, J + 1], thickness_frac[I_next, J + 1])
        ) > eps
    )

    # Vertex indices for solid cells
    si = I[cell_solid]
    sj = J[cell_solid]
    si_n = I_next[cell_solid]

    # Outer surface vertex indices
    o00 = si * n_z + sj
    o10 = si_n * n_z + sj
    o01 = si * n_z + (sj + 1)
    o11 = si_n * n_z + (sj + 1)

    # Inner surface vertex indices (offset by n_verts_surface)
    n_off = n_verts_surface
    i00 = o00 + n_off
    i10 = o10 + n_off
    i01 = o01 + n_off
    i11 = o11 + n_off

    # Outer faces: CCW from outside → normal points outward (+r)
    outer_f1 = np.column_stack([o00, o10, o11])
    outer_f2 = np.column_stack([o00, o11, o01])
    # Inner faces: CW from outside → normal points inward (-r)
    inner_f1 = np.column_stack([i00, i11, i10])
    inner_f2 = np.column_stack([i00, i01, i11])

    face_parts = [outer_f1, outer_f2, inner_f1, inner_f2]

    # ── Cap faces at z_min and z_max (connecting outer ↔ inner) ──
    # Bottom cap (z = z_min, j=0): for solid cells
    j = 0
    bot_solid = np.maximum(thickness_frac[:, j], thickness_frac[np.roll(np.arange(n_theta), -1), j]) > eps
    bi = np.where(bot_solid)[0]
    bi_n = (bi + 1) % n_theta
    bo_a = bi * n_z + j
    bo_b = bi_n * n_z + j
    bi_a = bo_a + n_off
    bi_b = bo_b + n_off
    # Bottom normal: -z → winding CW from below
    bot_f1 = np.column_stack([bo_a, bi_a, bi_b])
    bot_f2 = np.column_stack([bo_a, bi_b, bo_b])
    face_parts.extend([bot_f1, bot_f2])

    # Top cap (z = z_max, j=n_z-1): same but reversed winding
    j = n_z - 1
    top_solid = np.maximum(thickness_frac[:, j], thickness_frac[np.roll(np.arange(n_theta), -1), j]) > eps
    ti = np.where(top_solid)[0]
    ti_n = (ti + 1) % n_theta
    to_a = ti * n_z + j
    to_b = ti_n * n_z + j
    ti_a = to_a + n_off
    ti_b = to_b + n_off
    # Top normal: +z → winding CCW from above
    top_f1 = np.column_stack([to_a, to_b, ti_b])
    top_f2 = np.column_stack([to_a, ti_b, ti_a])
    face_parts.extend([top_f1, top_f2])

    all_faces = np.vstack(face_parts).astype(np.int32)

    mesh = trimesh.Trimesh(vertices=all_verts, faces=all_faces, process=True)
    trimesh.repair.fix_normals(mesh)

    print(f"  [stencil] SDF surface mesh: {len(mesh.faces)} faces  "
          f"{len(mesh.vertices)} verts  watertight={mesh.is_watertight}")
    return mesh, stencil, z_cents


# ─── MERGED STENCIL WALL (v7 — column merging + shared vertices) ─────────────

def build_stencil_wall_merged(
        stencil: np.ndarray,
        z_cents: np.ndarray,
        r_wall_arr: np.ndarray,
        wall_t: float,
        base_z: float,
        shell_height: float,
        n_theta: int,
        n_z: int,
        support_stems: bool = True,
        stem_width: int = 2,
) -> tuple[trimesh.Trimesh, np.ndarray, np.ndarray]:
    """
    Best-of-both-worlds stencil wall builder: column merging (small file)
    with shared vertices (smooth surface, no ribs).

    Expects a pre-computed binary stencil (n_theta, n_z).

    Combines:
      - Column merging → consecutive solid z-cells become one tall pillar
        → 20-50× fewer faces than per-cell smooth builder
      - Selective face generation → only boundary faces emitted
      - process=True → adjacent runs share theta boundary → no ribs

    Returns (mesh, stencil, z_cents).
    """
    thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    dtheta = 2 * np.pi / n_theta
    dz = (z_cents[-1] - z_cents[0]) / max(n_z - 1, 1)

    n_solid = int(stencil.sum())
    print(f"  [stencil] grid {n_theta}×{n_z},  solid {n_solid}/{n_theta*n_z} "
          f"({100*n_solid/(n_theta*n_z):.0f}%)")
    if n_solid == 0:
        raise RuntimeError("Stencil is empty — check mask or parameters")

    # Bridge floating islands
    if support_stems:
        stencil, n_islands = _bridge_floating_islands(stencil, stem_width)
        if n_islands:
            print(f"  [stencil] bridged {n_islands} floating island(s)")

    # z-bounds for vertex positions
    z_bounds = np.empty(n_z + 1)
    z_bounds[0] = max(z_cents[0] - dz / 2.0, base_z)
    for j in range(n_z):
        z_bounds[j + 1] = min(z_cents[j] + dz / 2.0, shell_height)

    # Face templates — winding reversed vs smooth builder (v5) because
    # we use process=False (no fix_normals). v5 has wrong winding but
    # fix_normals corrects it; here we need correct winding by construction.
    # Outward normals: outer→+r, inner→-r, top→+z, bot→-z, left→-θ, right→+θ
    _tpl_bot   = np.array([[0, 3, 2], [0, 2, 1]], dtype=np.int32)   # -z
    _tpl_top   = np.array([[4, 6, 7], [4, 5, 6]], dtype=np.int32)   # +z
    _tpl_outer = np.array([[1, 6, 5], [1, 2, 6]], dtype=np.int32)   # +r
    _tpl_inner = np.array([[0, 7, 3], [0, 4, 7]], dtype=np.int32)   # -r
    _tpl_left  = np.array([[0, 5, 4], [0, 1, 5]], dtype=np.int32)   # -θ
    _tpl_right = np.array([[2, 7, 6], [2, 3, 7]], dtype=np.int32)   # +θ

    # Collect merged runs
    run_list = []
    for i in range(n_theta):
        for (s, e) in _merge_column_runs(stencil[i]):
            run_list.append((i, s, e))

    N = len(run_list)
    print(f"  [stencil] {N} merged runs  (from {n_solid} cells, "
          f"{n_solid/max(N,1):.1f}× compression)")
    if N == 0:
        raise RuntimeError("No runs generated")

    # Build vertices: 8 per merged run
    verts = np.empty((N * 8, 3), dtype=np.float64)
    face_parts = []

    for idx, (i, s, e) in enumerate(run_list):
        theta_lo = thetas[i] - dtheta / 2.0
        theta_hi = thetas[i] + dtheta / 2.0
        z_lo = z_bounds[s]
        z_hi = z_bounds[e + 1] if e + 1 < len(z_bounds) else z_bounds[-1]
        r_out = r_wall_arr[i]
        r_in = max(r_out - wall_t, 0.5)

        c_L, s_L = np.cos(theta_lo), np.sin(theta_lo)
        c_R, s_R = np.cos(theta_hi), np.sin(theta_hi)

        base = idx * 8
        verts[base + 0] = [r_in  * c_L, r_in  * s_L, z_lo]
        verts[base + 1] = [r_out * c_L, r_out * s_L, z_lo]
        verts[base + 2] = [r_out * c_R, r_out * s_R, z_lo]
        verts[base + 3] = [r_in  * c_R, r_in  * s_R, z_lo]
        verts[base + 4] = [r_in  * c_L, r_in  * s_L, z_hi]
        verts[base + 5] = [r_out * c_L, r_out * s_L, z_hi]
        verts[base + 6] = [r_out * c_R, r_out * s_R, z_hi]
        verts[base + 7] = [r_in  * c_R, r_in  * s_R, z_hi]

        off = base

        # ALWAYS: outer and inner faces
        face_parts.append(_tpl_outer + off)
        face_parts.append(_tpl_inner + off)

        # Bottom cap: if run bottom borders empty
        if s == 0 or not stencil[i, s - 1]:
            face_parts.append(_tpl_bot + off)

        # Top cap: if run top borders empty
        if e >= n_z - 1 or not stencil[i, e + 1]:
            face_parts.append(_tpl_top + off)

        # Left theta wall: if adjacent left column has ANY empty cell in this z range
        i_L = (i - 1 + n_theta) % n_theta
        if not stencil[i_L, s:e+1].all():
            face_parts.append(_tpl_left + off)

        # Right theta wall: same for right neighbor
        i_R = (i + 1) % n_theta
        if not stencil[i_R, s:e+1].all():
            face_parts.append(_tpl_right + off)

    faces = np.vstack(face_parts).astype(np.int32)

    # process=False to avoid trimesh's aggressive vertex merging which
    # collapses thin faces at high n_theta (0.3mm wide quads get destroyed).
    # Do NOT call fix_normals — with process=False the mesh is non-manifold
    # (each run is an isolated component), so fix_normals can't reliably
    # determine "outside" and randomly flips faces → transparent walls in slicer.
    # Instead trust the face template winding which is correct by construction:
    #   outer→ +r, inner→ -r, top→ +z, bottom→ -z, left→ -θ, right→ +θ
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)

    print(f"  [stencil] merged mesh: {len(mesh.faces)} faces  "
          f"{len(mesh.vertices)} verts")
    return mesh, stencil, z_cents


# ─── SMOOTH STENCIL WALL (v5) ─────────────────────────────────────────────────

def build_stencil_wall_smooth(
        smooth_mask: np.ndarray,
        light_pos: tuple[float, float, float],
        r_wall_arr: np.ndarray,
        wall_t: float,
        base_z: float,
        shell_height: float,
        floor_half: float,
        n_theta: int,
        n_z: int,
        shadow_offset_x: float = 0.0,
        shadow_offset_y: float = 0.0,
        support_stems: bool = True,
        stem_width: int = 2,
) -> tuple[trimesh.Trimesh, np.ndarray, np.ndarray]:
    """
    Drop-in replacement for build_stencil_wall() that generates a smooth surface.

    Key difference — shared cylindrical vertex grid
    ────────────────────────────────────────────────
    The original builder creates N independent pillar boxes (8 verts each, all
    12 face-quads present).  Adjacent solid columns get θ-side walls between
    them, which show up as visible fins / ribs on the outer surface.

    This builder instead creates:
      • One outer cylinder vertex grid  — (n_theta+1) × (n_z+1) vertices
      • One inner cylinder vertex grid  — same count
      • Outer / inner faces for every solid cell — shared between neighbors
        → continuous, rib-free cylindrical surface
      • Top / bottom caps only where a solid cell borders an empty cell in z
      • Left / right θ-walls only where a solid cell borders an empty cell in θ

    Shadow stencil computation is identical to build_stencil_wall().
    Return signature is identical: (mesh, stencil, z_cents).
    """
    lx, ly, lz = light_pos
    h_mask, w_mask = smooth_mask.shape
    cx, cy     = w_mask / 2.0, h_mask / 2.0
    half_px    = max(h_mask, w_mask) / 2.0

    r_min   = r_wall_arr.min()
    z_min_s = base_z
    z_max_s = min(shell_height, lz * (1.0 - r_min / floor_half))
    if z_max_s <= z_min_s:
        raise ValueError(
            f"floor_half={floor_half:.0f} too small or lz too low — "
            f"z range [{z_min_s:.1f}, {z_max_s:.1f}] is degenerate")

    thetas  = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    dtheta  = 2 * np.pi / n_theta
    z_cents = np.linspace(z_min_s, z_max_s, n_z)
    dz      = (z_max_s - z_min_s) / max(n_z - 1, 1)

    # ── Vectorised stencil lookup (identical to build_stencil_wall) ──
    T_g, Z_g   = np.meshgrid(thetas, z_cents, indexing='ij')
    R_wall_2d  = r_wall_arr[:, np.newaxis]
    WX = R_wall_2d * np.cos(T_g)
    WY = R_wall_2d * np.sin(T_g)
    denom      = np.maximum(lz - Z_g, 1e-9)
    t_v        = lz / denom
    FX = lx + t_v * (WX - lx)
    FY = ly + t_v * (WY - ly)
    R_fl       = np.sqrt(FX**2 + FY**2)

    r_scale = half_px / floor_half
    PX = np.clip((cx + (FX - shadow_offset_x) * r_scale + 0.5).astype(np.int32),
                 0, w_mask - 1)
    PY = np.clip((cy - (FY - shadow_offset_y) * r_scale + 0.5).astype(np.int32),
                 0, h_mask - 1)

    stencil                      = (smooth_mask[PY, PX] > 0)
    stencil[R_fl > floor_half * 1.02] = False

    n_solid = int(stencil.sum())
    print(f"  [stencil] grid {n_theta}×{n_z},  solid {n_solid}/{n_theta*n_z} "
          f"({100*n_solid/(n_theta*n_z):.0f}%)")
    if n_solid == 0:
        raise RuntimeError("Stencil is empty — check mask or parameters")

    if support_stems:
        stencil, n_islands = _bridge_floating_islands(stencil, stem_width)
        if n_islands:
            print(f"  [stencil] bridged {n_islands} floating island(s) "
                  f"with {stem_width}-column stems")
        else:
            print(f"  [stencil] no floating islands detected")

    # ── Shared vertex grid ────────────────────────────────────────────
    # n_theta+1 angle vertices: indices 0..n_theta
    #   (index n_theta has the same XY position as index 0, closing the seam)
    # n_z+1     height vertices: indices 0..n_z  (cell boundary edges)
    n_tv = n_theta + 1
    n_zv = n_z + 1

    # Height boundary array (n_zv values)
    z_bounds    = np.empty(n_zv)
    z_bounds[0] = max(z_cents[0] - dz / 2.0, base_z)
    for _j in range(n_z):
        z_bounds[_j + 1] = min(z_cents[_j] + dz / 2.0, shell_height)

    # Angle boundary array — left edge of each cell, plus seam
    theta_v              = np.empty(n_tv)
    theta_v[:n_theta]    = thetas - dtheta / 2.0
    theta_v[n_theta]     = theta_v[0] + 2.0 * np.pi   # seam closure

    # Per-vertex-angle outer / inner radii
    r_out_v              = np.empty(n_tv)
    r_out_v[:n_theta]    = r_wall_arr
    r_out_v[n_theta]     = r_wall_arr[0]               # seam
    r_in_v               = np.maximum(r_out_v - wall_t, 0.5)

    # Build flat vertex arrays via broadcasting  (n_tv × n_zv each)
    iv_rep  = np.repeat(np.arange(n_tv), n_zv)   # angle-vertex index repeated
    jv_til  = np.tile(np.arange(n_zv), n_tv)      # height-vertex index tiled
    cos_v   = np.cos(theta_v)
    sin_v   = np.sin(theta_v)

    all_outer = np.column_stack([
        r_out_v[iv_rep] * cos_v[iv_rep],
        r_out_v[iv_rep] * sin_v[iv_rep],
        z_bounds[jv_til],
    ])
    all_inner = np.column_stack([
        r_in_v[iv_rep] * cos_v[iv_rep],
        r_in_v[iv_rep] * sin_v[iv_rep],
        z_bounds[jv_til],
    ])
    all_verts = np.vstack([all_outer, all_inner])  # (2·n_tv·n_zv, 3)
    off       = n_tv * n_zv                        # index offset: outer→inner

    # Inline vectorised vertex-index helpers (work on scalar or array)
    def Ov(iv_, jv_): return iv_ * n_zv + jv_           # outer vertex index
    def Iv(iv_, jv_): return off + iv_ * n_zv + jv_     # inner vertex index

    # ── Solid cell index arrays ───────────────────────────────────────
    si, sj = np.where(stencil)   # shape (N,)
    N      = len(si)

    iva  = si          # left  angle-vertex of cell i  (= i itself)
    ivb  = si + 1      # right angle-vertex  (for i=n_theta-1: = n_theta, the seam)
    jva  = sj          # bottom height-vertex
    jvb  = sj + 1      # top    height-vertex

    # ── Neighbour masks ───────────────────────────────────────────────
    si_prev  = (si - 1 + n_theta) % n_theta
    si_next  = (si + 1) % n_theta
    sj_above = np.clip(sj + 1, 0, n_z - 1)
    sj_below = np.clip(sj - 1, 0, n_z - 1)

    # True when the neighbouring cell exists AND is solid
    above = stencil[si, sj_above] & (sj < n_z - 1)
    below = stencil[si, sj_below] & (sj > 0)
    left  = stencil[si_prev, sj]
    right = stencil[si_next, sj]

    need_top   = ~above
    need_bot   = ~below
    need_left  = ~left
    need_right = ~right

    # ── Vectorised face generation ────────────────────────────────────
    # Winding convention: CCW when viewed from the face's outward normal.
    #   Outer (+r): [Ov(iva,jva), Ov(ivb,jva), Ov(ivb,jvb)]  +  [Ov(iva,jva), Ov(ivb,jvb), Ov(iva,jvb)]
    #   Inner (−r): reversed  [Iv(iva,jva), Iv(ivb,jvb), Iv(ivb,jva)]  +  ...
    #   Top   (+z): [Ov(iva,jvb), Ov(ivb,jvb), Iv(ivb,jvb)]  +  [Ov(iva,jvb), Iv(ivb,jvb), Iv(iva,jvb)]
    #   Bottom(−z): [Ov(iva,jva), Iv(ivb,jva), Ov(ivb,jva)]  +  [Ov(iva,jva), Iv(iva,jva), Iv(ivb,jva)]
    #   Left  (−θ): [Ov(iva,jva), Iv(iva,jvb), Iv(iva,jva)]  +  [Ov(iva,jva), Ov(iva,jvb), Iv(iva,jvb)]
    #   Right (+θ): [Ov(ivb,jva), Iv(ivb,jva), Iv(ivb,jvb)]  +  [Ov(ivb,jva), Iv(ivb,jvb), Ov(ivb,jvb)]

    f_o1 = np.c_[Ov(iva, jva), Ov(ivb, jva), Ov(ivb, jvb)]
    f_o2 = np.c_[Ov(iva, jva), Ov(ivb, jvb), Ov(iva, jvb)]

    f_i1 = np.c_[Iv(iva, jva), Iv(ivb, jvb), Iv(ivb, jva)]
    f_i2 = np.c_[Iv(iva, jva), Iv(iva, jvb), Iv(ivb, jvb)]

    # Conditional faces — subset of solid cells
    def _cond_faces(mask, f1_expr, f2_expr):
        idx = np.where(mask)[0]
        if len(idx) == 0:
            return np.empty((0, 3), dtype=np.int64), np.empty((0, 3), dtype=np.int64)
        return f1_expr(idx), f2_expr(idx)

    ti, tivb, tjvb = si[need_top], si[need_top] + 1, sj[need_top] + 1
    f_t1 = np.c_[Ov(si[need_top], tjvb), Ov(tivb, tjvb), Iv(tivb, tjvb)]
    f_t2 = np.c_[Ov(si[need_top], tjvb), Iv(tivb, tjvb), Iv(si[need_top], tjvb)]

    bi, bivb, bjva = si[need_bot], si[need_bot] + 1, sj[need_bot]
    f_b1 = np.c_[Ov(bi, bjva), Iv(bivb, bjva), Ov(bivb, bjva)]
    f_b2 = np.c_[Ov(bi, bjva), Iv(bi,   bjva), Iv(bivb, bjva)]

    li, ljva, ljvb = si[need_left], sj[need_left], sj[need_left] + 1
    f_l1 = np.c_[Ov(li, ljva), Iv(li, ljvb), Iv(li, ljva)]
    f_l2 = np.c_[Ov(li, ljva), Ov(li, ljvb), Iv(li, ljvb)]

    ri, rivb, rjva, rjvb = si[need_right], si[need_right] + 1, sj[need_right], sj[need_right] + 1
    f_r1 = np.c_[Ov(rivb, rjva), Iv(rivb, rjva), Iv(rivb, rjvb)]
    f_r2 = np.c_[Ov(rivb, rjva), Iv(rivb, rjvb), Ov(rivb, rjvb)]

    parts = [f_o1, f_o2, f_i1, f_i2]
    for _arr in [f_t1, f_t2, f_b1, f_b2, f_l1, f_l2, f_r1, f_r2]:
        if len(_arr):
            parts.append(_arr)

    faces = np.vstack(parts).astype(np.int32)
    mesh  = trimesh.Trimesh(vertices=all_verts, faces=faces, process=False)
    trimesh.repair.fix_normals(mesh)

    print(f"  [stencil] smooth mesh: {len(faces)} faces  "
          f"{len(all_verts)} verts  {N} solid cells")
    return mesh, stencil, z_cents


# ─── POST-PROCESS SMOOTHER ────────────────────────────────────────────────────

def smooth_mesh_postprocess(
        mesh: trimesh.Trimesh,
        taubin_iterations: int = 5,
        taubin_lambda: float = 0.5,
        taubin_nu: float = -0.53,
) -> trimesh.Trimesh:
    """
    Optional Taubin post-processing to further reduce surface roughness.

    Volume-preserving iterative Laplacian smoothing.  Each iteration applies
    one λ-step (shrink) followed by one μ-step (expand), keeping volume roughly
    constant.  Reduces small-scale faceting on the continuous-surface mesh.
    Typical useful range: 5–20 iterations.

    Parameters
    ----------
    taubin_iterations : int
        Taubin passes  (0 = skip).
    taubin_lambda : float
        Positive shrink factor λ  (0 < λ < 1).
    taubin_nu : float
        Negative expand factor μ  (≈ −0.53).
    """
    result = mesh.copy()

    if taubin_iterations > 0:
        print(f"  [smooth] Taubin  iter={taubin_iterations}  "
              f"λ={taubin_lambda:.2f}  μ={taubin_nu:.3f} …", end=' ', flush=True)
        try:
            import trimesh.smoothing as _tsmooth
            # filter_taubin modifies the mesh in-place in most trimesh versions.
            # The return value may be the mesh itself or None depending on version.
            _tsmooth.filter_taubin(result, lamb=taubin_lambda,
                                   nu=taubin_nu, iterations=taubin_iterations)
            trimesh.repair.fix_normals(result)
            print("done")
        except Exception as _e:
            print(f"FAILED ({_e}) — skipping Taubin smoothing")

    return result


# ─── SHADOW SIMULATION ───────────────────────────────────────────────────────

def simulate_shadow(stencil: np.ndarray,
                    z_cents: np.ndarray,
                    light_pos: tuple[float, float, float],
                    r_wall_arr: np.ndarray,
                    floor_half: float,
                    res: int = 512) -> np.ndarray:
    """
    Forward-project the stencil onto the floor (z = 0).

    r_wall_arr : (n_theta,) per-angle wall radius — circular or custom shape.
    Supports off-centre lights via the full ray formula.

    Returns uint8 image (255 = shadow, 0 = lit).
    """
    lx, ly, lz = light_pos
    n_theta, n_z = stencil.shape
    thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)

    T_g, Z_g = np.meshgrid(thetas, z_cents, indexing='ij')
    WX = r_wall_arr[:, np.newaxis] * np.cos(T_g)
    WY = r_wall_arr[:, np.newaxis] * np.sin(T_g)

    t_v = lz / np.maximum(lz - Z_g, 1e-9)
    FX  = lx + t_v * (WX - lx)
    FY  = ly + t_v * (WY - ly)

    pix_per_mm = res / (2.0 * floor_half)
    cx_img     = res // 2

    PX = np.clip(np.round(cx_img + FX * pix_per_mm).astype(np.int32), 0, res - 1)
    PY = np.clip(np.round(cx_img - FY * pix_per_mm).astype(np.int32), 0, res - 1)

    in_range = (np.abs(FX) < floor_half * 1.05) & (np.abs(FY) < floor_half * 1.05)
    draw     = stencil & in_range

    shadow = np.zeros((res, res), dtype=np.uint8)
    np.maximum.at(shadow, (PY[draw], PX[draw]), 255)

    # Light dilation to fill tiny gaps between projected pixels
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    shadow = cv2.dilate(shadow, kernel, iterations=1)

    # Casing footprint — use gray 128 so it's distinguishable from
    # the projected shadow (255). Beyond floor_half → 0 (lit).
    pix1d  = (np.arange(res, dtype=float) - cx_img) * 2 * floor_half / res
    Xg, Yg = np.meshgrid(pix1d, -pix1d)
    Rg     = np.sqrt(Xg**2 + Yg**2)
    Tg     = np.arctan2(Yg, Xg) % (2 * np.pi)
    dtheta = 2 * np.pi / n_theta
    i_g    = (Tg / dtheta + 0.5).astype(np.int32) % n_theta
    casing_mask = Rg < r_wall_arr[i_g]
    # Only overwrite cells that weren't already hit by a projected shadow
    shadow[casing_mask & (shadow == 0)] = 128
    shadow[Rg > floor_half] = 0

    return shadow


def save_shadow_comparison(simulated: np.ndarray,
                            original_mask: np.ndarray,
                            smooth_mask: np.ndarray,
                            path: str,
                            r_wall_arr: np.ndarray = None,
                            floor_half: float = None) -> None:
    """Save 4-panel comparison: Original | SDF-smooth | Simulated shadow | Difference.

    If r_wall_arr and floor_half are provided, draws the casing footprint
    outline as a cyan contour on the Simulated shadow panel so the user
    can see where the casing blocks the shadow.
    """
    res = simulated.shape[0]

    orig_r  = cv2.resize(original_mask, (res, res))
    smth_r  = cv2.resize(smooth_mask,   (res, res))
    diff    = cv2.absdiff(orig_r, simulated)
    diff_c  = cv2.applyColorMap(diff, cv2.COLORMAP_HOT)

    def to_bgr(g): return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
    sim_bgr = to_bgr(simulated)

    # Draw casing outline on the simulated shadow panel
    if r_wall_arr is not None and floor_half is not None:
        n_theta = len(r_wall_arr)
        thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
        pix_per_mm = res / (2.0 * floor_half)
        cx_img = res // 2
        # Compute outline points in pixel coords
        out_x = np.round(cx_img + r_wall_arr * np.cos(thetas) * pix_per_mm).astype(np.int32)
        out_y = np.round(cx_img - r_wall_arr * np.sin(thetas) * pix_per_mm).astype(np.int32)
        pts = np.column_stack([out_x, out_y]).reshape((-1, 1, 2))
        cv2.polylines(sim_bgr, [pts], isClosed=True, color=(255, 255, 0), thickness=2)
        # Also draw a crosshair at the center (light position)
        cv2.drawMarker(sim_bgr, (cx_img, cx_img), (0, 200, 255),
                       markerType=cv2.MARKER_CROSS, markerSize=10, thickness=2)

    row = np.hstack([to_bgr(orig_r), to_bgr(smth_r), sim_bgr, diff_c])

    font = cv2.FONT_HERSHEY_SIMPLEX
    labels = ["Original mask", "SDF-smooth mask", "Simulated shadow", "Difference"]
    for k, lbl in enumerate(labels):
        cv2.putText(row, lbl, (k * res + 8, 24), font, 0.65, (0, 230, 0), 2)

    # Add casing outline legend on sim panel
    if r_wall_arr is not None:
        cv2.putText(row, "cyan = casing outline",
                    (2 * res + 8, res - 12), font, 0.45, (255, 255, 0), 1)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv2.imwrite(path, row)
    print(f"[generator] saved shadow comparison → {path}")


# ─── DEBUG VISUALISATION ─────────────────────────────────────────────────────

def save_debug_stencil(stencil: np.ndarray, z_cents: np.ndarray,
                        sdf: np.ndarray,
                        light_pos: tuple, r_wall_arr: np.ndarray,
                        floor_half: float, path: str) -> None:
    """4-panel debug: SDF heatmap | stencil unwrapped | top-down | cross-section."""
    n_theta, n_z = stencil.shape
    lx, ly, lz = light_pos
    thetas  = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    outer_r = r_wall_arr.max()

    fig, axes = plt.subplots(1, 4, figsize=(22, 5))

    # 1 ── SDF heatmap ─────────────────────────────────────────────────
    ax = axes[0]
    h_s = min(sdf.shape[0], 512)
    sdf_disp = cv2.resize(sdf, (h_s, h_s))
    im = ax.imshow(sdf_disp, cmap='RdBu', origin='upper',
                   vmin=-30, vmax=30)
    plt.colorbar(im, ax=ax, label='SDF (px)')
    ax.set_title('SDF (smoothed)\nBlue=inside cat, Red=outside')
    ax.axis('off')

    # 2 ── Stencil unwrapped (θ vs z) ──────────────────────────────────
    ax = axes[1]
    ax.imshow(stencil.T, origin='lower', aspect='auto',
              extent=[0, 360, z_cents[0], z_cents[-1]],
              cmap='gray', vmin=0, vmax=1)
    ax.set_xlabel('Angle θ (°)')
    ax.set_ylabel('Wall height z (mm)')
    ax.set_title('Stencil (unwrapped)\nWhite=solid wall  Black=hole')

    # 3 ── Top-down: solid cells on casing outline ─────────────────────
    ax = axes[2]
    ax.set_aspect('equal')
    ax.set_title('Top-down stencil\nColour = wall height (mm)')
    si, sj = np.where(stencil)
    ax.scatter(r_wall_arr[si] * np.cos(thetas[si]),
               r_wall_arr[si] * np.sin(thetas[si]),
               c=z_cents[sj], cmap='hot', s=1.5,
               vmin=z_cents[0], vmax=z_cents[-1])
    lim = outer_r * 1.3
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim)
    # Draw casing outline (handles both circle and custom shape)
    outline_x = np.append(r_wall_arr * np.cos(thetas), r_wall_arr[0] * np.cos(thetas[0]))
    outline_y = np.append(r_wall_arr * np.sin(thetas), r_wall_arr[0] * np.sin(thetas[0]))
    ax.plot(outline_x, outline_y, 'gray', linestyle='--', lw=0.8, label='Casing outline')
    ax.plot(lx, ly, 'y*', ms=12, label=f'Light ({lx:.0f},{ly:.0f})')
    ax.legend(fontsize=7)
    ax.set_xlabel('X (mm)'); ax.set_ylabel('Y (mm)')

    # 4 ── Side cross-section ──────────────────────────────────────────
    ax = axes[3]
    ax.set_title(f'Side cross-section\nLight ({lx:.0f},{ly:.0f},{lz:.0f})mm')
    ax.axhline(0, color='tan', lw=3, label='Floor z=0')

    # Draw stencil profile at θ=0 (index 0)
    col_0   = stencil[0]
    r_at_0  = r_wall_arr[0]
    for j in range(n_z):
        if col_0[j]:
            z0 = z_cents[j] - (z_cents[1] - z_cents[0]) / 2
            z1 = z_cents[j] + (z_cents[1] - z_cents[0]) / 2
            ax.fill_betweenx([z0, z1], [r_at_0, r_at_0],
                             [r_at_0 + SHELL_THICKNESS]*2,
                             color='steelblue', alpha=0.9)
    ax.fill_betweenx([0, BASE_THICKNESS], [-outer_r]*2, [outer_r]*2,
                     color='steelblue', alpha=0.3, label='Base')
    ax.plot(lx, lz, 'yo', ms=12, label=f'Light z={lz:.0f}mm')

    for r_t in np.linspace(outer_r * 1.2, floor_half * 0.85, 5):
        ax.annotate('', xy=(r_t, 0), xytext=(lx, lz),
                    arrowprops=dict(arrowstyle='->', color='gold', lw=0.7, alpha=0.5))

    ax.set_xlim(-outer_r * 0.3, floor_half * 0.65)
    ax.set_ylim(-3, lz * 1.15)
    ax.set_xlabel('Radial dist (mm)'); ax.set_ylabel('z (mm)')
    ax.legend(fontsize=7, loc='upper right')

    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
    print(f"[generator] saved stencil debug     → {path}")


def save_mesh_preview(mesh, path):
    try:
        fig = plt.figure(figsize=(10, 8))
        ax  = fig.add_subplot(111, projection='3d')
        v   = mesh.vertices
        stride = max(1, len(mesh.faces) // 5000)
        f   = mesh.faces[::stride]
        ax.plot_trisurf(v[:, 0], v[:, 1], v[:, 2],
                        triangles=f, alpha=0.6, color='steelblue', shade=True)
        ax.set_xlabel('X (mm)'); ax.set_ylabel('Y (mm)'); ax.set_zlabel('Z (mm)')
        ax.set_title('Shadow Casing — Mesh Preview')
        fig.tight_layout()
        fig.savefig(path, dpi=100)
        plt.close(fig)
        print(f"[generator] saved mesh preview      → {path}")
    except Exception as e:
        print(f"[generator] mesh preview skipped: {e}")


def validate_mesh(mesh):
    print('\n── Mesh validation ──────────────────────────────────────────────')
    print(f'  Vertices     : {len(mesh.vertices)}')
    print(f'  Faces        : {len(mesh.faces)}')
    bb = mesh.bounding_box.extents
    print(f'  Bounding box : {bb[0]:.1f} × {bb[1]:.1f} × {bb[2]:.1f} mm')
    print(f'  Watertight   : {mesh.is_watertight}')
    if mesh.is_watertight:
        print(f'  Volume       : {mesh.volume:.1f} mm³')
    else:
        e = np.sort(mesh.edges, axis=1)
        _, cnt = np.unique(e, axis=0, return_counts=True)
        print(f'  Open edges   : {(cnt == 1).sum()}')
        print(f'  Non-manifold : {(cnt >= 3).sum()} edges (3+ users)')
    if len(mesh.vertices) == 0:
        raise RuntimeError('Mesh is empty!')
    print('─────────────────────────────────────────────────────────────────\n')


# ─── LED HOLDER ──────────────────────────────────────────────────────────────

def build_led_holder(start_z: float,
                     z_light: float,
                     pillar_outer_r: float,
                     pillar_inner_r: float,
                     n_circ: int = 64) -> trimesh.Trimesh:
    """
    Hollow pillar that holds the LED at z_light.
    Cable routes up through the inner hole (pillar_inner_r).
    Attach your own LED cap / diffuser after printing.
    """
    from shapely.geometry import Polygon as ShapelyPolygon

    angles = np.linspace(0, 2 * np.pi, n_circ, endpoint=False)
    cos_a  = np.cos(angles)
    sin_a  = np.sin(angles)

    pillar_h = z_light - start_z
    if pillar_h <= 0:
        raise ValueError(
            f"z_light ({z_light:.1f}) must be above start_z ({start_z:.1f})")

    outer   = ShapelyPolygon(zip(pillar_outer_r * cos_a, pillar_outer_r * sin_a))
    inner   = ShapelyPolygon(zip(pillar_inner_r * cos_a, pillar_inner_r * sin_a))
    annulus = outer.difference(inner)
    if not annulus.is_valid:
        annulus = annulus.buffer(0)

    pillar = trimesh.creation.extrude_polygon(annulus, pillar_h)
    pillar.apply_translation([0.0, 0.0, start_z])
    trimesh.repair.fix_normals(pillar)

    print(f'  [C] LED pillar   — ∅{pillar_inner_r*2:.0f}mm cable / '
          f'∅{pillar_outer_r*2:.0f}mm outer  '
          f'z={start_z:.1f}→{z_light:.1f}mm  faces={len(pillar.faces)}')
    return pillar


def enforce_min_wall_thickness(
    stencil: np.ndarray,
    r_mean: float,
    z_range_mm: float,
    min_wall_mm: float,
) -> np.ndarray:
    """
    Apply morphological opening to remove wall features narrower than
    `min_wall_mm` in either the theta or z direction.

    The kernel is an elliptical structuring element sized in stencil cells.
    The cell-to-mm ratio in theta uses the mean radius so the kernel is
    roughly isotropic in physical space regardless of non-circular shapes.

    Parameters
    ----------
    stencil : np.ndarray (bool, shape (n_theta, n_z))
        Binary stencil where True = solid wall, False = hole.
    r_mean : float
        Mean casing radius in mm (used to convert dtheta cell → arc length).
    z_range_mm : float
        Total z span covered by the stencil (mm).
    min_wall_mm : float
        Minimum physical wall feature size in mm. Features thinner than this
        (in either direction) are removed.

    Returns
    -------
    np.ndarray (bool, same shape)
        Opened stencil.
    """
    if min_wall_mm <= 0:
        return stencil

    if r_mean <= 0:
        raise ValueError(
            f"r_mean must be > 0 to compute theta cell size, got {r_mean}"
        )

    n_theta, n_z = stencil.shape
    mm_per_theta_cell = (2 * np.pi * r_mean) / n_theta
    mm_per_z_cell = z_range_mm / max(n_z - 1, 1)

    ksize_theta = max(1, int(np.ceil(min_wall_mm / mm_per_theta_cell)))
    ksize_z = max(1, int(np.ceil(min_wall_mm / mm_per_z_cell)))

    # Ensure odd kernel size for cv2
    if ksize_theta % 2 == 0:
        ksize_theta += 1
    if ksize_z % 2 == 0:
        ksize_z += 1

    # Use rectangular kernel (not elliptical): cv2.MORPH_ELLIPSE degenerates
    # to a single center pixel when either dimension is 1, which makes
    # opening a no-op for non-square stencils with very fine cells on one
    # axis. MORPH_RECT correctly handles all kernel shapes and matches the
    # "thin in either direction → removed" semantic exactly (a feature
    # survives MORPH_OPEN iff it contains a full ksize_theta × ksize_z
    # rectangle, i.e., is thick enough in both directions).
    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (ksize_z, ksize_theta)
    )
    # cv2 expects (width, height) == (n_z, n_theta) in image coords
    stencil_u8 = stencil.astype(np.uint8)
    opened = cv2.morphologyEx(stencil_u8, cv2.MORPH_OPEN, kernel)
    return opened > 0


def extract_stencil_contours(
    stencil: np.ndarray,
    upsample: int = 4,
    blur_sigma: float = 0.5,
) -> list[np.ndarray]:
    """
    Extract smooth boundary contours from a binary stencil grid.

    Uses marching squares (skimage.measure.find_contours) at an upsampled,
    lightly blurred copy of the stencil, producing piecewise-linear curves
    that approximate the solid/hole boundary with sub-cell precision.

    Parameters
    ----------
    stencil : np.ndarray (bool, shape (n_theta, n_z))
        Binary stencil. True = solid, False = hole.
    upsample : int
        Upsample factor applied before contour finding. Higher = smoother
        contours but more vertices. Default 4.
    blur_sigma : float
        Gaussian blur sigma (in upsampled pixels) applied before thresholding
        the stencil for contour finding. Smooths the solid/hole boundary.

    Returns
    -------
    list[np.ndarray]
        List of contour arrays. Each array has shape (N, 2) with columns
        (row, col) — expressed in ORIGINAL (pre-upsample) grid coordinates.
        Contours are returned at level 0.5.
    """
    from skimage.measure import find_contours
    from scipy.ndimage import gaussian_filter, zoom

    if stencil.dtype != bool:
        stencil = stencil.astype(bool)

    # Upsample (nearest) then blur to create sub-cell boundaries
    if upsample > 1:
        zoomed = zoom(stencil.astype(np.float32), upsample, order=0)
    else:
        zoomed = stencil.astype(np.float32)

    if blur_sigma > 0:
        zoomed = gaussian_filter(zoomed, sigma=blur_sigma)

    raw_contours = find_contours(zoomed, 0.5)

    # Convert from upsampled coords to original grid coords
    if upsample > 1:
        scale = 1.0 / upsample
        contours = [c * scale for c in raw_contours]
    else:
        contours = raw_contours

    return contours


def build_solid_polygon_tz(
    stencil: np.ndarray,
    theta_range: tuple[float, float],
    z_range: tuple[float, float],
    upsample: int = 4,
    blur_sigma: float = 0.5,
):
    """
    Build a single Shapely polygon representing the solid region of the
    stencil in (theta, z) space.

    Returns None if the stencil has no solid cells.

    Strategy:
      1. If nothing solid → return None.
      2. If everything solid → return the full bounding rectangle.
      3. Otherwise:
           a. Extract contours (sub-cell smooth curves).
           b. Convert each contour from grid coordinates to (theta, z).
           c. Build candidate Shapely polygons.
           d. Compute solid = union of polygons containing solid cells,
              minus union of polygons containing hole cells.

    Limitations (addressed by callers in sub-task 5.D):
      - Theta wraparound: this function treats the stencil as a flat
        rectangle in (theta, z). Features that wrap across θ = 0 / 2π
        will appear as disconnected polygons with a gap along the seam.
        The wall builder in 5.D pads the stencil with a wrap column
        before calling this function to stitch the seam.
      - Boundary-touching features: contours that reach the stencil's
        (theta, z) boundary are closed by joining their own endpoints
        rather than snapping to the bbox edge. For features that should
        extend all the way to the boundary, the 5.D wrapper pads the
        stencil to push features off the edge before extraction.
      - Nested hole topology: holes-inside-solids-inside-holes are
        classified flat rather than hierarchically. Simple non-nested
        topologies (most silhouette inputs) work correctly.

    Parameters
    ----------
    stencil : np.ndarray (bool, shape (n_theta, n_z))
    theta_range : (theta_min, theta_max) in radians
    z_range : (z_min, z_max) in mm
    upsample : int
        Forwarded to extract_stencil_contours.
    blur_sigma : float
        Forwarded to extract_stencil_contours.

    Returns
    -------
    shapely.geometry.Polygon or MultiPolygon, or None
    """
    from shapely.geometry import Polygon, box
    from shapely.ops import unary_union
    import shapely.errors

    if not stencil.any():
        return None

    n_theta, n_z = stencil.shape
    theta_min, theta_max = theta_range
    z_min, z_max = z_range
    full_bbox = box(theta_min, z_min, theta_max, z_max)

    if stencil.all():
        return full_bbox

    def grid_to_tz(pt: np.ndarray) -> tuple[float, float]:
        """(row, col) grid coord → (theta, z)."""
        theta = theta_min + (pt[0] / n_theta) * (theta_max - theta_min)
        z = z_min + (pt[1] / max(n_z - 1, 1)) * (z_max - z_min)
        return (theta, z)

    contours = extract_stencil_contours(stencil, upsample=upsample, blur_sigma=blur_sigma)

    # Convert each contour into a Shapely polygon in theta-z space.
    # Contours are closed by joining their endpoints to themselves. Open
    # contours (hitting the stencil edge) thus form a chord across the
    # open side rather than following the bbox edge — the 5.D wrapper
    # pads the stencil to avoid producing open contours in the first place.
    polygons = []
    for c in contours:
        if len(c) < 3:
            continue
        pts = [grid_to_tz(p) for p in c]
        # Ensure closure
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        try:
            poly = Polygon(pts)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_empty:
                continue
            polygons.append(poly)
        except (ValueError, shapely.errors.GEOSException) as _e:
            # Degenerate polygon (e.g. < 3 unique points after float
            # rounding) — skip and continue with the next contour.
            continue

    if not polygons:
        return None

    # Filter to polygons whose interior corresponds to SOLID cells.
    # Heuristic: sample the polygon centroid back to stencil coord and check.
    def centroid_is_solid(poly) -> bool:
        cx_tz = poly.representative_point()
        theta_c, z_c = cx_tz.x, cx_tz.y
        row = int(round((theta_c - theta_min) / (theta_max - theta_min) * n_theta))
        col = int(round((z_c - z_min) / (z_max - z_min) * max(n_z - 1, 1)))
        row = max(0, min(n_theta - 1, row))
        col = max(0, min(n_z - 1, col))
        return bool(stencil[row, col])

    solid_polys = [p for p in polygons if centroid_is_solid(p)]
    hole_polys = [p for p in polygons if not centroid_is_solid(p)]

    if solid_polys:
        solid_union = unary_union(solid_polys)
    else:
        # Fall back: treat hole polys as subtractions from full bbox
        solid_union = full_bbox

    if hole_polys:
        holes_union = unary_union(hole_polys)
        solid_union = solid_union.difference(holes_union)

    # Clip to the bbox in case upsample bleed pushed boundaries out
    solid_union = solid_union.intersection(full_bbox)

    if solid_union.is_empty:
        return None
    return solid_union


def triangulate_polygon_tz_to_3d(
    poly,
    r_wall_arr: np.ndarray,
    wall_t: float,
    n_theta: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Triangulate a Shapely polygon in (theta, z) space and map each vertex to
    3D positions on both the outer and inner cylindrical surfaces.

    Handles arbitrary shapes (circle, rect, oval, triangle) via r_wall_arr
    that varies per angle.

    Parameters
    ----------
    poly : shapely.geometry.Polygon or MultiPolygon
        The solid region in (theta, z) space.
    r_wall_arr : np.ndarray shape (n_theta,)
        Per-angle wall radius in mm.
    wall_t : float
        Radial wall thickness in mm.
    n_theta : int
        Angular resolution (used to index r_wall_arr from theta).

    Returns
    -------
    verts_outer : np.ndarray shape (V, 3)
        3D positions on the outer cylindrical surface.
    verts_inner : np.ndarray shape (V, 3)
        3D positions on the inner cylindrical surface. Parallel to
        verts_outer (same index order, same length).
    faces : np.ndarray shape (F, 3)
        Triangle vertex indices. Winding is counter-clockwise when viewed
        from OUTSIDE the cylinder, which gives outward-pointing normals
        for the OUTER surface.

        IMPORTANT: if you build mesh faces on the INNER surface using the
        same indices, you MUST flip the winding via `faces[:, ::-1]` to
        get outward-pointing normals (from the cavity). The 5.D wall
        builder does this when combining outer and inner surfaces into
        a single watertight mesh.
    """
    import mapbox_earcut as earcut
    from shapely.geometry import Polygon, MultiPolygon

    if isinstance(poly, MultiPolygon):
        polys_to_triangulate = list(poly.geoms)
    else:
        polys_to_triangulate = [poly]

    verts_tz: list[tuple[float, float]] = []
    faces: list[tuple[int, int, int]] = []

    def _add_polygon(p: Polygon):
        exterior = np.array(p.exterior.coords)[:-1]  # drop closing duplicate
        holes = [np.array(h.coords)[:-1] for h in p.interiors]

        # Build earcut input: concatenate exterior + holes, record ring end indices.
        # The installed mapbox_earcut API expects cumulative END indices of
        # every ring (exterior first, then each hole), not hole start indices.
        rings = [exterior] + holes
        coords = np.concatenate(rings).astype(np.float64)
        ring_ends = []
        offset = 0
        for r in rings:
            offset += len(r)
            ring_ends.append(offset)

        # earcut triangulate
        # Installed mapbox_earcut expects coords as ndarray shape (*, 2)
        # (not flattened) and ring end indices as uint32 array.
        tri = earcut.triangulate_float64(
            coords,
            np.array(ring_ends, dtype=np.uint32),
        )
        tri = np.asarray(tri, dtype=np.int64).reshape(-1, 3)

        base = len(verts_tz)
        for (tx, tz) in coords:
            verts_tz.append((float(tx), float(tz)))
        for (a, b, c) in tri:
            faces.append((int(a + base), int(b + base), int(c + base)))

    for p in polys_to_triangulate:
        if p.is_empty or not p.is_valid:
            continue
        _add_polygon(p)

    if not verts_tz:
        return (
            np.empty((0, 3)),
            np.empty((0, 3)),
            np.empty((0, 3), dtype=np.int64),
        )

    verts_tz_arr = np.array(verts_tz, dtype=np.float64)  # (V, 2) -> (theta, z)
    theta_vals = verts_tz_arr[:, 0]
    z_vals = verts_tz_arr[:, 1]

    # Look up per-vertex radius from r_wall_arr using nearest-theta index
    dtheta = (2 * np.pi) / n_theta
    idx = np.mod(np.round(theta_vals / dtheta).astype(np.int64), n_theta)
    r_outer = r_wall_arr[idx]
    # Safety floor: clamp inner radius to 0.5mm to avoid a degenerate or
    # inverted inner surface when wall_t exceeds the local outer radius.
    # If this clamp fires for production geometry, the wall is thicker
    # than the lamp's smallest radius — callers should validate inputs.
    r_inner = np.maximum(r_outer - wall_t, 0.5)

    cos_t = np.cos(theta_vals)
    sin_t = np.sin(theta_vals)

    verts_outer = np.column_stack([r_outer * cos_t, r_outer * sin_t, z_vals])
    verts_inner = np.column_stack([r_inner * cos_t, r_inner * sin_t, z_vals])

    faces_arr = np.array(faces, dtype=np.int64)
    return verts_outer, verts_inner, faces_arr


def build_stencil_wall_contour(
    stencil: np.ndarray,
    z_cents: np.ndarray,
    r_wall_arr: np.ndarray,
    wall_t: float,
    base_z: float,
    shell_height: float,
    upsample: int = 4,
    blur_sigma: float = 0.5,
) -> trimesh.Trimesh:
    """
    Build a smooth cylindrical stencil wall from a binary stencil grid using
    the contour + triangulation pipeline.

    This replaces the per-cell pillar builder. Hole edges are smooth curves
    (via marching squares on the stencil), the solid region is triangulated
    as a 2D polygon in (theta, z) space, then mapped to 3D on both inner and
    outer cylindrical surfaces. Edge faces are added along the polygon
    boundary to connect inner and outer surfaces into a watertight shell.

    Supports non-circular casings through the varying r_wall_arr.

    Parameters
    ----------
    stencil : np.ndarray (bool, shape (n_theta, n_z))
        Binary stencil. Should already be cleaned (morphological opening
        for min wall thickness applied upstream).
    z_cents : np.ndarray shape (n_z,)
        Z centre of each stencil layer (mm).
    r_wall_arr : np.ndarray shape (n_theta,)
        Per-angle outer wall radius (mm).
    wall_t : float
        Radial wall thickness (mm).
    base_z : float
        Minimum z of the stencil wall (mm).
    shell_height : float
        Maximum z of the stencil wall (mm).
    upsample : int
        Contour extraction upsample factor.
    blur_sigma : float
        Contour extraction blur sigma.

    Returns
    -------
    trimesh.Trimesh
        The assembled stencil wall mesh. Watertight when inputs are
        well-formed (no theta wraparound, no features touching the stencil
        boundary — those are known limitations of the current pipeline).
    """
    from shapely.geometry import MultiPolygon, Polygon

    n_theta, n_z = stencil.shape
    theta_range = (0.0, 2 * np.pi)
    # Use the caller-supplied wall height range, not z_cents. z_cents only
    # drives densification spacing (dz below); the absolute z range comes
    # from base_z/shell_height so the mesh wall honors the caller's intent
    # even if z_cents is computed with a slight offset.
    z_range = (float(base_z), float(shell_height))

    # Step 1: Solid polygon in theta-z space
    solid_poly = build_solid_polygon_tz(
        stencil, theta_range, z_range, upsample=upsample, blur_sigma=blur_sigma
    )
    if solid_poly is None or solid_poly.is_empty:
        return trimesh.Trimesh()

    # Normalize ring orientation: exterior CCW (sign=+1) and interiors CW.
    # Shapely operations (buffer/union/difference/intersection) generally
    # canonicalize but do not guarantee it across GEOS versions. The edge-
    # face winding below assumes canonical orientation to produce outward
    # normals — reversed rings would flip the normals and break watertightness.
    from shapely.geometry.polygon import orient as _orient
    if isinstance(solid_poly, MultiPolygon):
        solid_poly = MultiPolygon([_orient(g, sign=1.0) for g in solid_poly.geoms])
    elif hasattr(solid_poly, "exterior"):
        solid_poly = _orient(solid_poly, sign=1.0)

    # Step 1b: Densify every ring so that long segments (in particular the
    # z-constant top/bottom bbox edges, and long theta-constant edges) are
    # broken into enough sub-segments to form proper cylindrical ring
    # geometry in 3D. Without this the fully-solid case would be only the
    # 4-corner bbox → 2 outer triangles → not a cylinder at all.
    # We resample along theta with step = 2pi/n_theta, and along z with
    # step = (z_max - z_min) / (n_z - 1).
    dtheta = (theta_range[1] - theta_range[0]) / n_theta
    # Densification step in z comes from the z_cents grid spacing, not from
    # z_range. These are conceptually decoupled: z_cents defines the stencil
    # sampling resolution (how fine to subdivide segments), while z_range
    # (base_z..shell_height) defines the absolute mesh bounds.
    dz = (float(z_cents[-1]) - float(z_cents[0])) / max(n_z - 1, 1)

    def _densify_ring(coords: np.ndarray) -> np.ndarray:
        """Insert points along each segment so no segment is longer than
        dtheta in theta or dz in z. Returns closed ring coords."""
        out: list[tuple[float, float]] = []
        n = len(coords)
        for i in range(n - 1):
            a = coords[i]
            b = coords[i + 1]
            out.append((float(a[0]), float(a[1])))
            dth = b[0] - a[0]
            dzz = b[1] - a[1]
            # Number of subdivisions based on whichever axis needs more.
            n_th = int(np.ceil(abs(dth) / dtheta)) if dtheta > 0 else 1
            n_zz = int(np.ceil(abs(dzz) / dz)) if dz > 0 else 1
            n_sub = max(n_th, n_zz, 1)
            for k in range(1, n_sub):
                t = k / n_sub
                out.append((float(a[0] + dth * t), float(a[1] + dzz * t)))
        out.append((float(coords[-1][0]), float(coords[-1][1])))
        return np.array(out)

    def _densify_poly(p: Polygon) -> Polygon:
        ext = _densify_ring(np.array(p.exterior.coords))
        holes = [_densify_ring(np.array(h.coords)) for h in p.interiors]
        return Polygon(ext, holes=holes)

    if isinstance(solid_poly, MultiPolygon):
        solid_poly = MultiPolygon([_densify_poly(g) for g in solid_poly.geoms])
    else:
        solid_poly = _densify_poly(solid_poly)

    # Step 2: Triangulate and get inner/outer 3D vertices + faces.
    # NOTE: faces from triangulate are wound CCW from the outside-cylinder
    # viewpoint, which is correct for the outer surface. The inner surface
    # needs winding flipped (see code below).
    verts_outer, verts_inner, outer_faces = triangulate_polygon_tz_to_3d(
        solid_poly, r_wall_arr, wall_t, n_theta
    )
    if len(verts_outer) == 0:
        return trimesh.Trimesh()

    # Combine into a single vertex array:
    #   [0 .. V-1]          outer surface vertices
    #   [V .. 2V-1]         inner surface vertices (parallel index order)
    V = len(verts_outer)
    all_verts = np.vstack([verts_outer, verts_inner])

    # Outer faces as-is. Inner faces use reversed winding + shifted indices.
    inner_faces = outer_faces[:, ::-1] + V
    all_faces = [outer_faces.copy(), inner_faces]

    # Step 3: Build a direct (theta, z) → vertex_index lookup by walking the
    # polygon rings in the same order as triangulate_polygon_tz_to_3d
    # processes them. This avoids floating-point reconstruction drift.
    if isinstance(solid_poly, MultiPolygon):
        polys = list(solid_poly.geoms)
    else:
        polys = [solid_poly]

    coord_to_vert: dict[tuple[float, float], int] = {}
    next_idx = 0
    # We also remember ring groups so we can emit edge faces per-ring.
    # rings is a list of lists of (theta, z) tuples (each ring's coords in
    # order, without the closing duplicate).
    rings: list[list[tuple[float, float]]] = []

    for p in polys:
        if p.is_empty or not p.is_valid:
            continue
        # Exterior
        ext_coords = np.array(p.exterior.coords)[:-1]  # drop closing dup
        ring_verts: list[tuple[float, float]] = []
        for (tx, tz) in ext_coords:
            key = (float(tx), float(tz))
            coord_to_vert[key] = next_idx
            ring_verts.append(key)
            next_idx += 1
        rings.append(ring_verts)

        # Interiors (holes)
        for interior in p.interiors:
            int_coords = np.array(interior.coords)[:-1]
            ring_verts = []
            for (tx, tz) in int_coords:
                key = (float(tx), float(tz))
                coord_to_vert[key] = next_idx
                ring_verts.append(key)
                next_idx += 1
            rings.append(ring_verts)

    # Sanity: the lookup should have exactly V entries (one per triangulated
    # vertex). If not, something is off in the walk order vs. triangulate's
    # internal order.
    if next_idx != V:
        raise RuntimeError(
            f"contour wall vertex walk mismatch: {next_idx} vs {V} "
            f"(triangulate produced a different number of vertices than the "
            f"ring walk visited)"
        )

    # Step 4: Emit edge faces along each ring, connecting outer and inner
    # surfaces. For each edge (a, b) in a ring, produce two triangles forming
    # a quad between outer[ai], outer[bi], inner[bi], inner[ai].
    #
    # Winding: the quad's outward normal points radially outward along the
    # ring's tangent. We use the same CCW convention as the outer surface,
    # so the triangles are:
    #     T1: outer[ai], inner[ai], inner[bi]
    #     T2: outer[ai], inner[bi], outer[bi]
    # (This winding makes the edge-face quad's normal point "outward" — away
    # from the solid region — which keeps the mesh manifold.)
    # Edges that lie ON the theta=0 or theta=2pi seam are NOT real boundary
    # edges in 3D — after vertex merging, the theta=0 and theta=2pi vertices
    # collapse to the same XY positions, stitching the cylinder together. So
    # we skip edge faces along seam edges to avoid creating overlapping /
    # non-manifold geometry.
    theta_min, theta_max = theta_range
    seam_eps = 1e-9

    def _is_seam_edge(a: tuple[float, float], b: tuple[float, float]) -> bool:
        ta, _ = a
        tb, _ = b
        on_left = abs(ta - theta_min) < seam_eps and abs(tb - theta_min) < seam_eps
        on_right = abs(ta - theta_max) < seam_eps and abs(tb - theta_max) < seam_eps
        return on_left or on_right

    edge_faces_list: list[tuple[int, int, int]] = []
    for ring in rings:
        K = len(ring)
        if K < 3:
            continue
        for i in range(K):
            a = ring[i]
            b = ring[(i + 1) % K]
            if _is_seam_edge(a, b):
                continue
            ai = coord_to_vert[a]
            bi = coord_to_vert[b]
            edge_faces_list.append((ai, ai + V, bi + V))
            edge_faces_list.append((ai, bi + V, bi))

    if edge_faces_list:
        edge_faces = np.array(edge_faces_list, dtype=np.int64)
        all_faces.append(edge_faces)

    faces_combined = np.vstack(all_faces).astype(np.int64)

    mesh = trimesh.Trimesh(vertices=all_verts, faces=faces_combined, process=True)
    trimesh.repair.fix_normals(mesh)
    return mesh


def compute_auto_resolution(
    user_n_theta: int,
    user_n_z: int,
    r_max: float,
    z_range_mm: float,
    target_arc_step_mm: float = 0.3,
    target_z_step_mm: float = 0.3,
    max_n_theta: int = 2048,
    max_n_z: int = 1024,
) -> tuple[int, int]:
    """
    Compute effective stencil resolution based on physical step targets.

    The user-supplied values act as floors; auto-scaling only increases them.
    This guarantees that at any lamp size, the angular step on the wall
    remains below a target (default 0.3 mm) and the vertical step stays
    at or below a typical FDM layer height (0.3 mm).

    Resolution is capped at max_n_theta / max_n_z to prevent file size
    explosion for large radii. The smooth builder face count scales roughly
    as n_theta × n_z × solid_fraction × 4, so uncapped resolution at
    large radii can produce multi-hundred-MB STL files.

    Parameters
    ----------
    user_n_theta : int
        User-supplied minimum angular resolution.
    user_n_z : int
        User-supplied minimum z resolution.
    r_max : float
        Maximum outer radius of the casing wall (mm).
    z_range_mm : float
        Total height of the stencil region (mm).
    target_arc_step_mm : float
        Target arc length per angular step (default 0.3 mm).
    target_z_step_mm : float
        Target distance per z step (default 0.3 mm = typical layer height).
    max_n_theta : int
        Hard cap on angular resolution (default 2048). Prevents file
        size explosion.
    max_n_z : int
        Hard cap on z resolution (default 1024).

    Returns
    -------
    (n_theta, n_z) : tuple[int, int]
        Final resolution: max(user, auto) capped at max values.
    """
    min_theta_auto = int(np.ceil(2 * np.pi * r_max / target_arc_step_mm))
    # Fence-post: the stencil is N_z samples along the z-axis, giving N_z - 1
    # gaps between adjacent samples. To guarantee that each gap is <= target,
    # we need ceil(z_range / target) + 1 samples. Theta does not need this
    # correction because it wraps (N_theta samples = N_theta gaps).
    min_z_auto = int(np.ceil(z_range_mm / target_z_step_mm)) + 1
    n_theta = min(max(user_n_theta, min_theta_auto), max_n_theta)
    n_z = min(max(user_n_z, min_z_auto), max_n_z)
    return n_theta, n_z


# ─── MAIN ────────────────────────────────────────────────────────────────────

def run(
    input_image          = INPUT_IMAGE,
    output_stl           = OUTPUT_STL,
    output_debug         = OUTPUT_DEBUG,
    output_mesh_prev     = OUTPUT_MESH_PREVIEW,
    output_shadow_comp   = OUTPUT_SHADOW_COMP,
    outer_radius         = OUTER_RADIUS,
    shell_height         = None,
    shell_thickness      = 3.0,              # bumped from 1.8mm for printability
    base_radius          = BASE_RADIUS,
    base_thickness       = BASE_THICKNESS,
    floor_half_size      = FLOOR_HALF_SIZE,
    light_x              = LIGHT_X,
    light_y              = LIGHT_Y,
    light_z_offset       = LIGHT_Z_OFFSET,
    shadow_offset_x      = SHADOW_OFFSET_X,
    shadow_offset_y      = SHADOW_OFFSET_Y,
    support_stems        = SUPPORT_STEMS,
    stem_width           = 2,
    edge_smooth_sigma    = EDGE_SMOOTH_SIGMA,
    shadow_threshold     = SHADOW_THRESHOLD,
    mask_upsample        = MASK_UPSAMPLE,
    n_stencil_theta      = N_STENCIL_THETA,
    n_stencil_z          = N_STENCIL_Z,
    n_circ               = N_CIRC,
    flooring_shape       = FLOORING_SHAPE,
    pillar_outer_r       = PILLAR_OUTER_R,
    pillar_inner_r       = PILLAR_INNER_R,
    casing_lift          = CASING_LIFT,
    # ── Geometry smoothness (v5) ──────────────────────────────────────
    smooth_builder       = SMOOTH_BUILDER,
    taubin_iterations    = TAUBIN_ITERATIONS,
    taubin_lambda        = TAUBIN_LAMBDA,
    taubin_nu            = TAUBIN_NU,
    # NEW parameters for refactored pipeline
    invert_mask          = False,
    preview_mode         = False,
    contour_builder      = False,   # disabled: contour pipeline loses detail on complex silhouettes
    merged_builder       = False,  # v2: column merging + correct normals, small files
    min_wall_mm          = 0.0,    # disabled: 3mm was too aggressive, removed fine features
    skip_led_pillar      = False,
    add_watermark        = False,
    decimate_ratio       = 0.0,    # 0=off, 0.8=keep 20% of faces (quadric decimation)
    led_socket_height    = 10.0,    # mm — height of LED mount above pillar top
    min_bridge_mm        = 1.2,    # minimum feature width on FLOOR plane (mm); guarantees ~0.3mm wall after anamorphic compression
    edge_blur_sigma      = 1.0,    # grid-cell blur on thickness field; smooths the staircase introduced by the min-thickness floor
):
    """
    Build shadow casing — three components:
      A — Stencil wall        : perforated wall whose hole pattern = shadow image
      B — Raised floor plate  : solid disk at floor_z
      C — LED holder pillar   : hollow tube; LED mounts at top, cable through center

    The electronics chamber is printed separately. `casing_lift` floats the
    whole casing above z=0 so the separately-printed chamber can slot under it.

    flooring_shape:
      None / "circle"      → circular casing at outer_radius (default)
      "square"             → square footprint
      "triangle"           → equilateral triangle footprint
      "rect" / "rect:W:H" → rectangle (corners at outer_radius)
      "oval" / "oval:W:H" → ellipse (max axis = outer_radius)
      <file path>          → B&W image; BLACK pixels define the footprint
    """
    # ── Apply preview-mode overrides ─────────────────────────────
    if preview_mode:
        overrides = apply_preview_mode_overrides({
            "n_stencil_theta": n_stencil_theta,
            "n_stencil_z": n_stencil_z,
            "shell_thickness": shell_thickness,
            "support_stems": support_stems,
            "taubin_iterations": taubin_iterations,
            "skip_led_pillar": skip_led_pillar,
            "add_watermark": add_watermark,
            "min_wall_mm": min_wall_mm,
        })
        n_stencil_theta = overrides["n_stencil_theta"]
        n_stencil_z = overrides["n_stencil_z"]
        shell_thickness = overrides["shell_thickness"]
        support_stems = overrides["support_stems"]
        taubin_iterations = overrides["taubin_iterations"]
        skip_led_pillar = overrides["skip_led_pillar"]
        add_watermark = overrides["add_watermark"]
        min_wall_mm = overrides["min_wall_mm"]

    # Create parent dirs for all output paths (no chdir needed by callers)
    for _out in (output_stl, output_debug, output_mesh_prev, output_shadow_comp):
        _d = os.path.dirname(str(_out))
        if _d:
            os.makedirs(_d, exist_ok=True)

    # floor_z = bottom of the raised floor plate.
    # casing_lift floats the whole casing above z=0 to leave room for the
    # separately-printed electronics chamber underneath.
    floor_z   = casing_lift

    if shell_height is None:
        shell_height = light_z_offset * (floor_half_size / outer_radius - 1)
        print(f'[generator] shell_height auto-derived: {shell_height:.2f} mm')

    base_z    = floor_z + base_thickness          # bottom of stencil wall
    wall_top  = floor_z + shell_height            # top of stencil wall (absolute)
    z_light   = wall_top + light_z_offset
    light_pos = (light_x, light_y, z_light)

    # ── 1. Resolve flooring/casing shape → r_wall_arr ────────────────
    print(f'[generator] resolving flooring shape: {flooring_shape!r}')
    r_wall_arr, casing_poly, casing_label = resolve_flooring_shape(
        flooring_shape, outer_radius, n_stencil_theta)

    r_min = r_wall_arr.min()
    r_max = r_wall_arr.max()
    z_max_stencil = z_light * (1.0 - r_min / floor_half_size)
    r_at_top = r_min / (1.0 - min(z_max_stencil, wall_top) / z_light)

    # ── Parameter summary ─────────────────────────────────────────────
    print('── Parameter summary ────────────────────────────────────────────')
    print(f'  Shadow image         : {input_image}')
    print(f'  Casing shape         : {casing_label}')
    print(f'  Outer radius (max)   : {r_max:.1f} mm')
    print(f'  Shell height         : {shell_height:.1f} mm')
    print(f'  Wall thickness       : {shell_thickness:.1f} mm')
    print(f'  Base thickness       : {base_thickness:.1f} mm  (raised floor plate)')
    if casing_poly is None:
        print(f'  Base radius          : {base_radius:.1f} mm')
    print(f'  Casing lift          : {casing_lift:.1f} mm  (gap for external electronics chamber)')
    print(f'  Light position       : ({light_x:.1f}, {light_y:.1f}, {z_light:.1f}) mm')
    if shadow_offset_x or shadow_offset_y:
        print(f'  Shadow offset        : ({shadow_offset_x:+.1f}, {shadow_offset_y:+.1f}) mm  (floor translation)')
    print(f'  Floor half-size      : {floor_half_size:.0f} mm  (shadow scale)')
    print(f'  Shadow zone on floor : {r_max:.0f} – {r_at_top:.0f} mm')
    print(f'  Stencil z range      : [{base_z:.1f}, {z_max_stencil:.1f}] mm')
    print(f'  Stencil grid         : {n_stencil_theta} × {n_stencil_z}')
    print(f'  SDF smooth σ         : {edge_smooth_sigma:.1f} px  (×{mask_upsample} upsample)')
    print(f'  SDF threshold        : {shadow_threshold:.1f}')
    print(f'  LED pillar           : ∅{pillar_inner_r*2:.0f}mm cable / '
          f'∅{pillar_outer_r*2:.0f}mm outer  z={base_z:.1f}→{z_light:.1f}mm')
    _summary_builder = 'contour' if contour_builder else ('continuous (smooth)' if smooth_builder else 'legacy pillar')
    print(f'  Mesh builder         : {_summary_builder}')
    if taubin_iterations > 0:
        print(f'  Taubin smoothing     : {taubin_iterations} iter  λ={taubin_lambda}  μ={taubin_nu}')
    print('─────────────────────────────────────────────────────────────────')

    # ── 2. Load + smooth shadow mask via SDF ─────────────────────────
    print('\n[generator] loading and smoothing silhouette mask …')
    raw_mask = load_silhouette_mask(input_image, invert=invert_mask)
    smooth_mask, sdf = prepare_sdf_mask(raw_mask, edge_smooth_sigma,
                                         shadow_threshold, mask_upsample)
    raw_pct    = 100 * (raw_mask    > 0).mean()
    smooth_pct = 100 * (smooth_mask > 0).mean()
    print(f'[generator] raw mask coverage    = {raw_pct:.0f}%')
    print(f'[generator] smooth mask coverage = {smooth_pct:.0f}%')

    # ── Auto-scale resolution (Fix 4) ────────────────────────────
    # Skip for SDF surface builder (merged_builder) — SDF gives smooth edges
    # at any resolution, so user's n_theta is used as-is. Auto-scaling is
    # only needed for the grid-based smooth/legacy builders where staircase
    # artifacts are proportional to angular step size.
    if not merged_builder:
        z_range_for_scaling = max(z_max_stencil - base_z, 1.0)
        n_stencil_theta, n_stencil_z = compute_auto_resolution(
            user_n_theta=n_stencil_theta,
            user_n_z=n_stencil_z,
            r_max=r_max,
            z_range_mm=z_range_for_scaling,
        )
    print(f"  [auto-res] n_theta={n_stencil_theta}, n_z={n_stencil_z}"
          f"{'  (skipped for SDF builder)' if merged_builder else ''}")

    # Re-resolve flooring shape if auto-res changed n_stencil_theta
    if len(r_wall_arr) != n_stencil_theta:
        r_wall_arr, casing_poly, casing_label = resolve_flooring_shape(
            flooring_shape, outer_radius, n_stencil_theta)

    # ── 3. Build stencil wall ─────────────────────────────────────────
    _builder_lbl = ('contour' if contour_builder
                    else 'merged-v7' if merged_builder
                    else 'smooth-v5' if smooth_builder
                    else 'legacy')
    print(f'[generator] building stencil wall ({_builder_lbl}) …')

    if contour_builder:
        # Compute the raw stencil binary from the smooth mask
        lx, ly, lz = light_pos
        h_mask, w_mask = smooth_mask.shape
        cx, cy = w_mask / 2.0, h_mask / 2.0
        half_px = max(h_mask, w_mask) / 2.0
        r_scale = half_px / floor_half_size

        r_min_local = r_wall_arr.min()
        z_min_s = base_z
        z_max_s = min(wall_top, lz * (1.0 - r_min_local / floor_half_size))
        if z_max_s <= z_min_s:
            raise ValueError(
                f"floor_half={floor_half_size:.0f} too small or lz too low"
            )

        thetas_s = np.linspace(0, 2 * np.pi, n_stencil_theta, endpoint=False)
        z_cents_s = np.linspace(z_min_s, z_max_s, n_stencil_z)
        T_g, Z_g = np.meshgrid(thetas_s, z_cents_s, indexing="ij")
        R_wall_2d = r_wall_arr[:, np.newaxis]
        WX = R_wall_2d * np.cos(T_g)
        WY = R_wall_2d * np.sin(T_g)
        denom = np.maximum(lz - Z_g, 1e-9)
        t_v = lz / denom
        FX = lx + t_v * (WX - lx)
        FY = ly + t_v * (WY - ly)
        R_fl = np.sqrt(FX ** 2 + FY ** 2)

        PX_c = np.clip(cx + (FX - shadow_offset_x) * r_scale, 0, w_mask - 1)
        PY_c = np.clip(cy - (FY - shadow_offset_y) * r_scale, 0, h_mask - 1)
        stencil_raw = (smooth_mask[PY_c.astype(np.int32), PX_c.astype(np.int32)] > 0)
        stencil_raw[R_fl > floor_half_size * 1.02] = False

        n_solid = int(stencil_raw.sum())
        print(f"  [stencil] grid {n_stencil_theta}×{n_stencil_z},  solid {n_solid}/{n_stencil_theta*n_stencil_z} "
              f"({100*n_solid/(n_stencil_theta*n_stencil_z):.0f}%)")
        if n_solid == 0:
            raise RuntimeError("Stencil is empty — check mask or parameters")

        # Apply minimum wall thickness enforcement (Fix 2)
        stencil_cleaned = enforce_min_wall_thickness(
            stencil_raw,
            r_mean=float(r_wall_arr.mean()),
            z_range_mm=z_max_s - z_min_s,
            min_wall_mm=min_wall_mm,
        )

        # Bridge floating islands if requested
        if support_stems:
            stencil_cleaned, n_islands = _bridge_floating_islands(
                stencil_cleaned, stem_width=stem_width
            )
            if n_islands:
                print(f"  [stencil] bridged {n_islands} floating island(s)")

        wall_mesh = build_stencil_wall_contour(
            stencil=stencil_cleaned,
            z_cents=z_cents_s,
            r_wall_arr=r_wall_arr,
            wall_t=shell_thickness,
            base_z=base_z,
            shell_height=wall_top,
        )
        stencil = stencil_cleaned
        z_cents = z_cents_s
    elif merged_builder:
        # ── SDF SURFACE BUILDER (v2) — continuous thickness ──
        wall_mesh, stencil, z_cents = build_stencil_wall_sdf_surface(
            smooth_mask=smooth_mask,
            sdf_float=sdf,
            light_pos=light_pos,
            r_wall_arr=r_wall_arr,
            wall_t=shell_thickness,
            base_z=base_z,
            shell_height=wall_top,
            floor_half=floor_half_size,
            n_theta=n_stencil_theta,
            n_z=n_stencil_z,
            shadow_offset_x=shadow_offset_x,
            shadow_offset_y=shadow_offset_y,
            min_bridge_mm=min_bridge_mm,
            edge_blur_sigma=edge_blur_sigma,
            support_stems=support_stems,
            stem_width=stem_width,
        )
    elif smooth_builder:
        # ── SMOOTH BUILDER (v5) — per-cell, large files, reliable ──
        wall_mesh, stencil, z_cents = build_stencil_wall_smooth(
            smooth_mask, light_pos, r_wall_arr, shell_thickness,
            base_z, wall_top, floor_half_size,
            n_stencil_theta, n_stencil_z,
            shadow_offset_x=shadow_offset_x,
            shadow_offset_y=shadow_offset_y,
            support_stems=support_stems,
            stem_width=stem_width,
        )
    else:
        wall_mesh, stencil, z_cents = build_stencil_wall(
            smooth_mask, light_pos, r_wall_arr, shell_thickness,
            base_z, wall_top, floor_half_size,
            n_stencil_theta, n_stencil_z,
            shadow_offset_x=shadow_offset_x,
            shadow_offset_y=shadow_offset_y,
            support_stems=support_stems,
            stem_width=stem_width,
        )
    print(f'  [A] stencil wall — faces: {len(wall_mesh.faces)}')

    # ── 3b. Optional Taubin post-processing ──────────────────────────
    if taubin_iterations > 0:
        print('[generator] Taubin post-processing stencil wall …')
        wall_mesh = smooth_mesh_postprocess(
            wall_mesh,
            taubin_iterations=taubin_iterations,
            taubin_lambda=taubin_lambda,
            taubin_nu=taubin_nu,
        )
        print(f'  [A] after Taubin — faces: {len(wall_mesh.faces)}')

    # ── 4. Raised floor plate with cable hole ────────────────────────
    # Punch a hole of pillar_inner_r through the base plate centre so the
    # LED cable can pass from the electronics chamber up into the pillar.
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

    # ── 5. LED holder pillar ──────────────────────────────────────────
    if skip_led_pillar:
        led_holder = None
    else:
        led_holder = build_led_holder(
            start_z        = max(base_z - 0.5, 0.0),  # interpenetrate base for manifold join
            z_light        = z_light - led_socket_height,
            pillar_outer_r = pillar_outer_r,
            pillar_inner_r = pillar_inner_r,
            n_circ         = n_circ,
        )

    # ── 6. Combine ────────────────────────────────────────────────────
    parts = [wall_mesh, base]
    if led_holder is not None:
        parts.append(led_holder)
    combined = trimesh.util.concatenate(parts)
    print('\n[generator] combined mesh:')
    validate_mesh(combined)

    # ── 7. Shadow simulation & comparison ────────────────────────────
    print('[generator] simulating floor shadow …')
    sim = simulate_shadow(stencil, z_cents, light_pos, r_wall_arr,
                          floor_half_size, res=512)
    save_shadow_comparison(sim, raw_mask, smooth_mask, output_shadow_comp,
                            r_wall_arr=r_wall_arr, floor_half=floor_half_size)

    # ── 8. Debug image ────────────────────────────────────────────────
    save_debug_stencil(stencil, z_cents, sdf, light_pos, r_wall_arr,
                       floor_half_size, output_debug)

    # ── 9. Mesh preview + export ──────────────────────────────────────
    save_mesh_preview(combined, output_mesh_prev)

    # ── 9b. Optional mesh decimation ─────────────────────────────────
    if decimate_ratio > 0:
        orig_faces = len(combined.faces)
        try:
            combined = combined.simplify_quadric_decimation(percent=decimate_ratio)
            print(f'[generator] decimated: {orig_faces} → {len(combined.faces)} faces '
                  f'(kept {100*(1-decimate_ratio):.0f}%)')
        except Exception as e:
            print(f'[generator] decimation skipped: {e}')

    print(f'[generator] exporting → {output_stl}')
    combined.export(output_stl)
    kb = os.path.getsize(output_stl) / 1024
    print(f'[generator] STL: {kb:.1f} kB\n')

    # ── Blender setup ─────────────────────────────────────────────────
    print('── Blender setup ─────────────────────────────────────────────────')
    print(f'  1. Import shadow_casing.stl  (units = mm, base at z = 0)')
    print(f'  2. Point light at  ({light_x:.1f}, {light_y:.1f}, {z_light:.1f}) mm')
    print(f'  3. Floor plane at  z = 0')
    print(f'  4. Camera: above, looking DOWN, orthographic')
    print(f'  5. Casing material: Principled BSDF opaque black, Cycles render')
    print(f'')
    print(f'  Shadow on floor:  {r_max:.0f} – {r_at_top:.0f} mm radius')
    print('─────────────────────────────────────────────────────────────────\n')
    print('[generator] done.')
    return combined


if __name__ == '__main__':
    import argparse

    p = argparse.ArgumentParser(
        description='Generate anamorphic shadow-lamp casing STL',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    # I/O
    p.add_argument('--input',          default=INPUT_IMAGE,        help='Input silhouette image')
    p.add_argument('--output',         default=OUTPUT_STL,         help='Output STL file')

    # Size / scale
    p.add_argument('--outer-radius',   type=float, default=OUTER_RADIUS,
                   help='Casing wall outer radius (mm)')
    p.add_argument('--base-radius',    type=float, default=BASE_RADIUS,
                   help='Base disk radius — can be larger than outer-radius for a flange (mm)')
    p.add_argument('--shell-height',   type=float, default=SHELL_HEIGHT,
                   help='Height of the stencil wall (mm)')
    p.add_argument('--wall-thickness', type=float, default=SHELL_THICKNESS,
                   help='Radial wall thickness of each pillar (mm)')
    p.add_argument('--base-thickness', type=float, default=BASE_THICKNESS,
                   help='Base disk height (mm)')

    # Shadow / projection scale
    p.add_argument('--floor-half',     type=float, default=FLOOR_HALF_SIZE,
                   help='Half-width of the target shadow on the floor (mm) — scales the projection')

    # Light position
    p.add_argument('--light-x',        type=float, default=LIGHT_X,
                   help='Light X offset from centre (mm)')
    p.add_argument('--light-y',        type=float, default=LIGHT_Y,
                   help='Light Y offset from centre (mm)')
    p.add_argument('--light-z-offset', type=float, default=LIGHT_Z_OFFSET,
                   help='Light height above shell top (mm)  →  z_light = shell-height + this')
    p.add_argument('--shadow-x',         type=float, default=SHADOW_OFFSET_X,
                   help='Shift shadow centre on floor in X (mm) — pure translation, no distortion')
    p.add_argument('--shadow-y',         type=float, default=SHADOW_OFFSET_Y,
                   help='Shift shadow centre on floor in Y (mm) — pure translation, no distortion')
    p.add_argument('--no-support-stems', action='store_true', default=False,
                   help='Disable automatic support stems for floating wall islands')
    p.add_argument('--stem-width',       type=int,   default=2,
                   help='Number of angular columns per support stem (default 2 ≈ 1 mm at r=40mm)')

    # Smoothness — SDF
    p.add_argument('--smooth-sigma',   type=float, default=EDGE_SMOOTH_SIGMA,
                   help='Gaussian σ on SDF (px); higher = smoother edges')
    p.add_argument('--threshold',      type=float, default=SHADOW_THRESHOLD,
                   help='SDF threshold (0 = exact boundary; + erodes cat; − dilates cat)')

    # Geometry quality (v5)
    p.add_argument('--legacy-builder', action='store_true', default=False,
                   help='Use legacy pillar builder instead of the continuous surface builder')
    p.add_argument('--taubin-iter',    type=int,   default=TAUBIN_ITERATIONS,
                   help='Taubin post-process smoothing passes (0 = off; try 10)')
    p.add_argument('--taubin-lambda',  type=float, default=TAUBIN_LAMBDA,
                   help='Taubin λ positive shrink factor (default 0.5)')
    p.add_argument('--taubin-nu',      type=float, default=TAUBIN_NU,
                   help='Taubin μ negative expand factor (default −0.53)')

    # Resolution (advanced)
    p.add_argument('--n-theta',        type=int,   default=N_STENCIL_THETA,
                   help='Angular stencil segments')
    p.add_argument('--n-z',            type=int,   default=N_STENCIL_Z,
                   help='Height stencil layers')

    # LED holder
    p.add_argument('--pillar-outer-r', type=float, default=PILLAR_OUTER_R,
                   help='Outer radius of LED holder pillar (mm)')
    p.add_argument('--pillar-inner-r', type=float, default=PILLAR_INNER_R,
                   help='Inner radius of pillar = cable channel (mm)')

    # Casing lift (compensation for external electronics chamber)
    p.add_argument('--casing-lift', type=float, default=CASING_LIFT,
                   help='Float the casing above z=0 by this many mm '
                        '(leaves room for a separately-printed electronics chamber)')

    # Flooring shape
    p.add_argument('--flooring-shape', default=FLOORING_SHAPE,
                   help=(
                       'Casing footprint shape. Options:\n'
                       '  circle      — default perfect circle\n'
                       '  square      — square (alias for rect 1:1)\n'
                       '  triangle    — equilateral triangle\n'
                       '  rect        — square (1:1); rect:W:H for custom ratio\n'
                       '  oval        — circle (1:1); oval:W:H for custom ratio\n'
                       '  <file.png>  — B&W image, black pixels = footprint'
                   ))

    a = p.parse_args()

    run(
        input_image          = a.input,
        output_stl           = a.output,
        outer_radius         = a.outer_radius,
        base_radius          = a.base_radius,
        shell_height         = a.shell_height,
        shell_thickness      = a.wall_thickness,
        base_thickness       = a.base_thickness,
        floor_half_size      = a.floor_half,
        light_x              = a.light_x,
        light_y              = a.light_y,
        light_z_offset       = a.light_z_offset,
        shadow_offset_x      = a.shadow_x,
        shadow_offset_y      = a.shadow_y,
        support_stems        = not a.no_support_stems,
        stem_width           = a.stem_width,
        edge_smooth_sigma    = a.smooth_sigma,
        shadow_threshold     = a.threshold,
        n_stencil_theta      = a.n_theta,
        n_stencil_z          = a.n_z,
        flooring_shape       = a.flooring_shape,
        pillar_outer_r       = a.pillar_outer_r,
        pillar_inner_r       = a.pillar_inner_r,
        casing_lift          = a.casing_lift,
        smooth_builder       = not a.legacy_builder,
        taubin_iterations    = a.taubin_iter,
        taubin_lambda        = a.taubin_lambda,
        taubin_nu            = a.taubin_nu,
    )
