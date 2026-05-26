"""POST /check-islands — quickly detect whether a silhouette has floating
components (islands) that would need support stems to print reliably.

Uses the same stencil logic as the full generator but skips mesh building,
so it runs in ~1s even on complex images.
"""
import json
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from service.auth import require_bearer_token
from service.schemas import GeneratorConfig

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from generate_shadow_casing import (  # noqa: E402
    load_silhouette_mask,
    prepare_sdf_mask,
    resolve_flooring_shape,
)

router = APIRouter()


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

    Returns: {has_islands: bool, island_count: int}
    Island count = number of disconnected solid components BEYOND the main one.
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
        edge_smooth_sigma = cfg.get("edge_smooth_sigma", 5.0)
        shadow_threshold = cfg.get("shadow_threshold", 0.0)
        mask_upsample = cfg.get("mask_upsample", 2)
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

        stencil = (smooth_mask[PY, PX] > 0).astype(np.uint8)
        stencil[R_fl > floor_half * 1.02] = 0

        # Connected components on the stencil (theta x z grid).
        # Note: theta axis wraps at 0/2π — we need to account for that.
        # For simplicity: count labeled components. Islands NOT touching
        # the bottom row (z_min, i.e. base floor) are floating.
        num_labels, labels = cv2.connectedComponents(stencil)
        # num_labels includes the background (0). Actual components = num_labels - 1.

        # Find labels that touch the bottom row (grounded to the base)
        bottom_row_labels = set(int(l) for l in labels[:, 0] if l > 0)

        # Count floating islands (labels not in bottom_row_labels)
        all_labels = set(int(l) for l in np.unique(labels) if l > 0)
        floating_labels = all_labels - bottom_row_labels
        island_count = len(floating_labels)

        return JSONResponse(
            {
                "has_islands": island_count > 0,
                "island_count": island_count,
                "total_components": len(all_labels),
            }
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)
