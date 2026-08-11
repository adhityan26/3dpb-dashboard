"""
Pydantic schemas for the STL microservice.

`GeneratorConfig` mirrors the keyword arguments of
`scripts.generate_shadow_casing.run()`. All fields are optional — if a field
is not supplied, run() falls back to its own default.

The route handler dumps the model with `model_dump(exclude_none=True)` and
passes the result as **kwargs to run(), so the generator stays the source of
truth for default values.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class GeneratorConfig(BaseModel):
    """User-tunable generator parameters.

    Service-controlled fields (input/output paths) are NOT here — those are
    set by the route handler from the uploaded file and a temp directory.
    """

    model_config = ConfigDict(extra="forbid")

    # ── Casing geometry ──────────────────────────────────────────────────
    outer_radius:    Optional[float] = Field(default=None, gt=0, le=300)
    base_radius:     Optional[float] = Field(default=None, gt=0, le=300)
    shell_height:    Optional[float] = Field(default=None, gt=0, le=300)
    shell_thickness: Optional[float] = Field(default=None, gt=0, le=20)
    base_thickness:  Optional[float] = Field(default=None, gt=0, le=20)
    casing_lift:     Optional[float] = Field(default=None, ge=0, le=200)

    # ── Shadow projection ────────────────────────────────────────────────
    floor_half_size: Optional[float] = Field(default=None, gt=0, le=2000)
    shadow_offset_x: Optional[float] = Field(default=None)
    shadow_offset_y: Optional[float] = Field(default=None)

    # ── Light position ───────────────────────────────────────────────────
    light_x:        Optional[float] = Field(default=None)
    light_y:        Optional[float] = Field(default=None)
    light_z_offset: Optional[float] = Field(default=None, ge=0, le=200)

    # ── Mask processing ──────────────────────────────────────────────────
    edge_smooth_sigma: Optional[float] = Field(default=None, ge=0, le=50)
    shadow_threshold:  Optional[float] = Field(default=None)
    mask_upsample:     Optional[int]   = Field(default=None, ge=1, le=8)
    invert_mask:       Optional[bool]  = None
    auto_fit_mask:     Optional[bool]  = None
    mask_padding_pct:  Optional[float] = Field(default=None, ge=0, le=100)
    img_brightness:    Optional[float] = Field(default=None, ge=-100, le=100)
    img_contrast:      Optional[float] = Field(default=None, ge=-100, le=100)
    img_saturation:    Optional[float] = Field(default=None, ge=0, le=200)

    # ── Stencil resolution ───────────────────────────────────────────────
    n_stencil_theta: Optional[int] = Field(default=None, ge=32, le=8192)
    n_stencil_z:     Optional[int] = Field(default=None, ge=8,  le=4096)

    # ── LED pillar ───────────────────────────────────────────────────────
    pillar_outer_r:    Optional[float] = Field(default=None, gt=0, le=30)
    pillar_inner_r:    Optional[float] = Field(default=None, gt=0, le=30)
    skip_led_pillar:   Optional[bool]  = None
    led_socket_height: Optional[float] = Field(default=None, ge=0, le=50)
    cover_type:        Optional[Literal["bottom", "top"]] = None
    bottom_frame:        Optional[bool]  = None
    bottom_frame_height: Optional[float] = Field(default=None, ge=0, le=50)

    # ── Flooring (casing footprint) shape ────────────────────────────────
    # None / "circle" / "square" / "triangle" / "rect[:W:H]" / "oval[:W:H]" / file path
    flooring_shape: Optional[str] = None

    # ── Printability helpers ─────────────────────────────────────────────
    support_stems: Optional[bool]  = None
    stem_width:    Optional[int]   = Field(default=None, ge=1, le=10)
    min_wall_mm:   Optional[float] = Field(default=None, ge=0, le=20)
    min_bridge_mm: Optional[float] = Field(default=None, ge=0, le=20)

    # ── Manual stems (v2 editor) ─────────────────────────────────────────
    # List of {"theta_deg": float, "z_mm": float, ...}. Deliberately loose
    # (list[dict], not a nested model with extra="forbid") so UI-side fields
    # like "id"/"provenance" pass through without a schema change on either
    # side; the generator's _apply_user_stems() reads only theta_deg/z_mm and
    # clamps out-of-range values server-side rather than rejecting the
    # request — mid-session edits shouldn't 400 on a stale param window.
    user_stems: Optional[list[dict]] = None

    # ── Preview mode selector (v2 editor's Wall tab) ─────────────────────
    # /preview only: "floor" (default, existing radial shadow) or "wall"
    # (unwrap of the (θ,z) stencil grid itself — see preview_renderer.py).
    # Popped by render_shadow_preview()/preview.py, never reaches the mesh
    # builders, so it's declared here purely so the route doesn't 400 on it.
    preview_view: Optional[Literal["floor", "wall"]] = None

    # ── Wall builder selection ───────────────────────────────────────────
    smooth_builder:  Optional[bool] = None
    contour_builder: Optional[bool] = None
    merged_builder:  Optional[bool] = None

    # ── Mesh post-processing ─────────────────────────────────────────────
    taubin_iterations: Optional[int]   = Field(default=None, ge=0, le=100)
    taubin_lambda:     Optional[float] = None
    taubin_nu:         Optional[float] = None
    decimate_ratio:    Optional[float] = Field(default=None, ge=0, lt=1)

    # ── Mode flags ───────────────────────────────────────────────────────
    preview_mode:  Optional[bool] = None
    add_watermark: Optional[bool] = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["stl-service"]
    version: str


# Parametric shape keywords accepted by resolve_flooring_shape() in
# scripts/generate_shadow_casing.py (base name before any ":ratio" suffix).
_BASIC_FLOORING_SHAPES = {"circle", "square", "triangle", "rect", "oval"}


def is_basic_flooring_shape(flooring_shape: Optional[str]) -> bool:
    """True if flooring_shape is empty/None or one of the parametric keywords
    (optionally with a ":W:H" ratio suffix), i.e. it does NOT look like a file path."""
    if not flooring_shape or not flooring_shape.strip():
        return True
    base = flooring_shape.strip().lower().split(":")[0]
    return base in _BASIC_FLOORING_SHAPES


def assert_flooring_shape_has_upload(
    flooring_shape: Optional[str], has_flooring_image: bool
) -> None:
    """Guard against path injection / dangling paths: a non-basic flooring_shape
    (i.e. something that looks like a file path) is only valid when the caller
    also uploaded a flooring_image file — the route overrides flooring_shape
    with the path to that upload. Raises ValueError if the guard is violated."""
    if not is_basic_flooring_shape(flooring_shape) and not has_flooring_image:
        raise ValueError(
            "config.flooring_shape is not a basic shape "
            "(circle/square/triangle/rect[:W:H]/oval[:W:H]) and no flooring_image "
            "file was uploaded — refusing to use it as a path"
        )
