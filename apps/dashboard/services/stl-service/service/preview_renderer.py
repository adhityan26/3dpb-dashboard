"""
Fast shadow-only preview renderer for the STL microservice.

Wraps the lightweight pipeline already proven in `preview.py`:
  1. Load + smooth the mask
  2. Build the stencil grid by projecting the mask through the light cone
  3. Simulate the floor shadow
  4. Draw the casing footprint outline (cyan polyline) on top

Crucially: this does NOT build a 3D mesh. Sub-second on a typical input.
The full mesh build is reserved for /generate.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

# scripts/ is not a package — add it to sys.path so we can import the module.
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from generate_shadow_casing import (  # noqa: E402
    _bridge_floating_islands,
    load_silhouette_mask,
    prepare_sdf_mask,
    resolve_flooring_shape,
    simulate_shadow,
)


# ─── Defaults (mirror generate_shadow_casing.run() defaults) ────────────────

_PREVIEW_DEFAULTS: dict = {
    "outer_radius":      100.0,
    "shell_thickness":   3.0,
    "base_thickness":    2.0,
    "casing_lift":       0.0,
    "floor_half_size":   600.0,
    "shadow_offset_x":   0.0,
    "shadow_offset_y":   0.0,
    "light_x":           0.0,
    "light_y":           0.0,
    "light_z_offset":    10.0,
    # These MUST mirror generate_shadow_casing.run() defaults — a preview rendered
    # with different smoothing/stems/dilation misleads the operator about exactly
    # the artifacts they need to judge (thin-line survival, stem visibility).
    "edge_smooth_sigma": 2.0,
    "shadow_threshold":  0.0,
    "mask_upsample":     4,
    "invert_mask":       False,
    "n_stencil_theta":   512,
    "n_stencil_z":       128,
    "flooring_shape":    None,
    "support_stems":     True,
    "stem_width":        2,
    "min_bridge_mm":     1.2,
    "shadow_res":        512,
}


def _draw_casing_outline(
    shadow_gray: np.ndarray,
    r_wall_arr: np.ndarray,
    floor_half: float,
) -> np.ndarray:
    """Overlay a cyan polyline of the casing footprint on the shadow image.

    Returns a BGR image (3-channel uint8) ready for PNG encoding.
    """
    bgr = cv2.cvtColor(shadow_gray, cv2.COLOR_GRAY2BGR)

    res = bgr.shape[0]
    n_theta = len(r_wall_arr)
    thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    pix_per_mm = res / (2.0 * floor_half)
    cx_img = res // 2

    out_x = np.round(cx_img + r_wall_arr * np.cos(thetas) * pix_per_mm).astype(np.int32)
    out_y = np.round(cx_img - r_wall_arr * np.sin(thetas) * pix_per_mm).astype(np.int32)
    pts = np.column_stack([out_x, out_y]).reshape((-1, 1, 2))

    cv2.polylines(bgr, [pts], isClosed=True, color=(255, 255, 0), thickness=2)
    cv2.drawMarker(
        bgr, (cx_img, cx_img),
        color=(0, 200, 255),
        markerType=cv2.MARKER_CROSS,
        markerSize=10,
        thickness=2,
    )
    return bgr


def render_shadow_preview(image_path: str, config: dict | None = None) -> bytes:
    """Render a shadow + casing-outline preview as PNG bytes.

    Parameters
    ----------
    image_path : str
        Path to the silhouette input image (PNG/JPG).
    config : dict, optional
        Override any of the keys in `_PREVIEW_DEFAULTS`. Unknown keys are
        ignored (the schema layer is responsible for rejecting typos before
        calling this function).

    Returns
    -------
    bytes
        PNG-encoded BGR image.

    Raises
    ------
    ValueError
        If `floor_half_size` is too small for the requested geometry, or if
        the input image cannot be loaded.
    """
    p = {**_PREVIEW_DEFAULTS, **(config or {})}

    # Auto-derive shell_height if not provided
    if "shell_height" not in p or p["shell_height"] is None:
        p["shell_height"] = float(p["light_z_offset"]) * (float(p["floor_half_size"]) / float(p["outer_radius"]) - 1)

    raw_mask = load_silhouette_mask(image_path, invert=bool(p["invert_mask"]))
    if raw_mask is None or raw_mask.size == 0:
        raise ValueError(f"Could not load silhouette image: {image_path}")

    smooth_mask, sdf = prepare_sdf_mask(
        raw_mask,
        p["edge_smooth_sigma"],
        p["shadow_threshold"],
        upsample=int(p["mask_upsample"]),
    )

    r_wall_arr, _casing_poly, _label = resolve_flooring_shape(
        p["flooring_shape"], p["outer_radius"], int(p["n_stencil_theta"])
    )

    floor_z = float(p["casing_lift"])
    base_z = floor_z + float(p["base_thickness"])
    wall_top = floor_z + float(p["shell_height"])
    z_light = wall_top + float(p["light_z_offset"])
    light_pos = (float(p["light_x"]), float(p["light_y"]), z_light)
    floor_half = float(p["floor_half_size"])

    # Build the stencil grid by inverse-projecting from each (theta, z) wall
    # cell down to the floor and sampling the silhouette mask at the
    # corresponding point.
    h_mask, w_mask = smooth_mask.shape
    cx, cy = w_mask / 2.0, h_mask / 2.0
    half_px = max(h_mask, w_mask) / 2.0

    lz = z_light
    r_min = r_wall_arr.min()
    z_min_s = base_z
    z_max_s = min(wall_top, lz * (1.0 - r_min / floor_half))
    if z_max_s <= z_min_s:
        raise ValueError(
            "floor_half_size is too small for the chosen geometry — "
            "z range would collapse. Increase floor_half_size or reduce outer_radius."
        )

    n_theta = int(p["n_stencil_theta"])
    n_z = int(p["n_stencil_z"])
    thetas = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    z_cents = np.linspace(z_min_s, z_max_s, n_z)

    T_g, Z_g = np.meshgrid(thetas, z_cents, indexing="ij")
    R_wall_2d = r_wall_arr[:, np.newaxis]
    WX = R_wall_2d * np.cos(T_g)
    WY = R_wall_2d * np.sin(T_g)

    denom = np.maximum(lz - Z_g, 1e-9)
    t_v = lz / denom
    FX = float(p["light_x"]) + t_v * (WX - float(p["light_x"]))
    FY = float(p["light_y"]) + t_v * (WY - float(p["light_y"]))
    R_fl = np.sqrt(FX ** 2 + FY ** 2)

    r_scale = half_px / floor_half
    PX = np.clip(
        (cx + (FX - float(p["shadow_offset_x"])) * r_scale + 0.5).astype(np.int32),
        0, w_mask - 1,
    )
    PY = np.clip(
        (cy - (FY - float(p["shadow_offset_y"])) * r_scale + 0.5).astype(np.int32),
        0, h_mask - 1,
    )

    # Sample the SDF and apply the same min_bridge_mm dilation the mesh builder
    # uses, so the preview shows the stroke widths that will actually print.
    min_bridge_mm = float(p.get("min_bridge_mm", 0.0))
    if min_bridge_mm > 0:
        mm_per_px = floor_half / half_px
        dilation_px = (min_bridge_mm / 2.0) / mm_per_px
        stencil = (sdf[PY, PX] + dilation_px) > 0
    else:
        stencil = (smooth_mask[PY, PX] > 0)
    stencil[R_fl > floor_half * 1.02] = False

    if bool(p["support_stems"]):
        stencil, _n_islands = _bridge_floating_islands(stencil, int(p["stem_width"]))

    shadow_gray = simulate_shadow(
        stencil, z_cents, light_pos, r_wall_arr, floor_half, res=int(p["shadow_res"])
    )

    bgr = _draw_casing_outline(shadow_gray, r_wall_arr, floor_half)

    ok, buf = cv2.imencode(".png", bgr)
    if not ok:
        raise RuntimeError("PNG encoding failed")
    return bytes(buf)
