"""POST /check-islands — quickly detect whether a silhouette has floating
components (islands) that would need support stems to print reliably.

Uses the same stencil logic as the full generator but skips mesh building,
so it runs in ~1s even on complex images.
"""
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from service.auth import require_bearer_token
from service.schemas import GeneratorConfig

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from generate_shadow_casing import (  # noqa: E402
    find_floating_islands,
    load_silhouette_mask,
    prepare_sdf_mask,
    resolve_flooring_shape,
)

router = APIRouter()


def island_centroids(
    stencil: np.ndarray,
    anchor: str,
    z_min_mm: float,
    z_max_mm: float,
) -> list[dict]:
    """Centroid (theta_deg, z_mm) of each floating island in `stencil`.

    Uses the same `find_floating_islands` BFS the generator's auto-bridging
    relies on, so this route and the mesh builder can never disagree about
    what counts as floating. Returns [] when the stencil is fully grounded
    to the anchor edge (or empty).

    theta centroid is the circular mean (average unit vector, then atan2)
    rather than a raw index average, so an island straddling the 0/360° wrap
    doesn't collapse to a bogus mid-circle angle.
    """
    n_theta, n_z = stencil.shape
    islands = find_floating_islands(stencil, anchor=anchor)
    z_span = z_max_mm - z_min_mm

    out = []
    for mask in islands:
        i_idx, j_idx = np.where(mask)
        angles = i_idx.astype(np.float64) / n_theta * 2.0 * np.pi
        mean_x = float(np.mean(np.cos(angles)))
        mean_y = float(np.mean(np.sin(angles)))
        theta_centroid = float(np.degrees(np.arctan2(mean_y, mean_x)) % 360.0)

        j_centroid = float(np.mean(j_idx))
        if n_z > 1 and z_span != 0:
            z_centroid = z_min_mm + (j_centroid / (n_z - 1)) * z_span
        else:
            z_centroid = z_min_mm
        out.append({"theta_deg": theta_centroid, "z_mm": float(z_centroid)})

    return out


@router.post(
    "/check-islands",
    dependencies=[Depends(require_bearer_token)],
    responses={
        200: {"description": "Island detection result"},
        400: {"description": "Invalid input"},
        401: {"description": "Missing or invalid bearer token"},
    },
)
async def check_islands(
    image: UploadFile = File(...),
    config_json: str = Form("{}"),
) -> JSONResponse:
    """Detect floating islands in the projected silhouette stencil.

    Returns: {has_floating_islands: bool, islands: [{theta_deg, z_mm}, ...]}
    (plus has_islands/island_count, kept for backward compatibility).
    A "floating island" is a solid stencil component unreachable from the
    wall's structural anchor edge (base for cover_type='bottom', top for
    cover_type='top') — same definition the generator's auto-bridging uses,
    via the shared `find_floating_islands` helper.
    """
    try:
        config_dict = json.loads(config_json) if config_json else {}
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"config_json is not valid JSON: {e}",
        )
    try:
        validated = GeneratorConfig(**config_dict)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid config: {e}",
        )

    suffix = Path(image.filename or "input.png").suffix.lower() or ".png"
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type: {suffix}",
        )

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await image.read())
        tmp_path = tmp.name

    try:
        cfg = validated.model_dump(exclude_none=True)

        # Defaults (mirror preview_renderer)
        outer_radius = cfg.get("outer_radius", 100.0)
        shell_height = cfg.get("shell_height", 50.0)
        base_thickness = cfg.get("base_thickness", 2.0)
        casing_lift = cfg.get("casing_lift", 0.0)
        floor_half = cfg.get("floor_half_size", 600.0)
        light_x = cfg.get("light_x", 0.0)
        light_y = cfg.get("light_y", 0.0)
        light_z_offset = cfg.get("light_z_offset", 10.0)
        edge_smooth_sigma = cfg.get("edge_smooth_sigma", 2.0)
        shadow_threshold = cfg.get("shadow_threshold", 0.0)
        mask_upsample = cfg.get("mask_upsample", 4)
        invert_mask = cfg.get("invert_mask", False)
        n_theta = cfg.get("n_stencil_theta", 512)
        n_z = cfg.get("n_stencil_z", 128)
        flooring_shape = cfg.get("flooring_shape")
        shadow_offset_x = cfg.get("shadow_offset_x", 0.0)
        shadow_offset_y = cfg.get("shadow_offset_y", 0.0)

        raw_mask = load_silhouette_mask(tmp_path, invert=bool(invert_mask))
        smooth_mask, _sdf = prepare_sdf_mask(
            raw_mask, edge_smooth_sigma, shadow_threshold, upsample=int(mask_upsample)
        )
        r_wall_arr, _, _ = resolve_flooring_shape(flooring_shape, outer_radius, int(n_theta))

        floor_z = float(casing_lift)
        base_z = floor_z + float(base_thickness)
        wall_top = floor_z + float(shell_height)
        z_light = wall_top + float(light_z_offset)

        h_mask, w_mask = smooth_mask.shape
        cx, cy = w_mask / 2.0, h_mask / 2.0
        half_px = max(h_mask, w_mask) / 2.0

        r_min = r_wall_arr.min()
        z_max_s = min(wall_top, z_light * (1.0 - r_min / floor_half))
        if z_max_s <= base_z:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="floor_half_size too small for this geometry",
            )

        thetas = np.linspace(0, 2 * np.pi, int(n_theta), endpoint=False)
        z_cents = np.linspace(base_z, z_max_s, int(n_z))

        T_g, Z_g = np.meshgrid(thetas, z_cents, indexing="ij")
        R_wall_2d = r_wall_arr[:, np.newaxis]
        WX = R_wall_2d * np.cos(T_g)
        WY = R_wall_2d * np.sin(T_g)

        denom = np.maximum(z_light - Z_g, 1e-9)
        t_v = z_light / denom
        FX = light_x + t_v * (WX - light_x)
        FY = light_y + t_v * (WY - light_y)
        R_fl = np.sqrt(FX ** 2 + FY ** 2)

        r_scale = half_px / floor_half
        PX = np.clip(
            (cx + (FX - shadow_offset_x) * r_scale + 0.5).astype(np.int32),
            0, w_mask - 1,
        )
        PY = np.clip(
            (cy - (FY - shadow_offset_y) * r_scale + 0.5).astype(np.int32),
            0, h_mask - 1,
        )

        stencil = (smooth_mask[PY, PX] > 0)
        stencil[R_fl > floor_half * 1.02] = False

        # Same BFS-from-anchor-edge labeling the generator uses to decide
        # what needs an auto stem — reusing it means bridging and reporting
        # can never disagree about what counts as "floating". cover_type
        # 'top' anchors to the wall's top edge instead of the base, same as
        # run()'s stem_anchor.
        cover_type = cfg.get("cover_type", "bottom")
        anchor = "top" if cover_type == "top" else "bottom"
        islands = island_centroids(stencil, anchor, base_z, z_max_s)

        return JSONResponse(
            {
                "has_floating_islands": len(islands) > 0,
                "islands": islands,
                # kept for backward compatibility with any existing caller
                "has_islands": len(islands) > 0,
                "island_count": len(islands),
            }
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)
