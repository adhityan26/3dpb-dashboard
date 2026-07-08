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

    # ── Stencil resolution ───────────────────────────────────────────────
    n_stencil_theta: Optional[int] = Field(default=None, ge=32, le=8192)
    n_stencil_z:     Optional[int] = Field(default=None, ge=8,  le=4096)

    # ── LED pillar ───────────────────────────────────────────────────────
    pillar_outer_r:    Optional[float] = Field(default=None, gt=0, le=30)
    pillar_inner_r:    Optional[float] = Field(default=None, gt=0, le=30)
    skip_led_pillar:   Optional[bool]  = None
    led_socket_height: Optional[float] = Field(default=None, ge=0, le=50)

    # ── Flooring (casing footprint) shape ────────────────────────────────
    # None / "circle" / "square" / "triangle" / "rect[:W:H]" / "oval[:W:H]" / file path
    flooring_shape: Optional[str] = None

    # ── Printability helpers ─────────────────────────────────────────────
    support_stems: Optional[bool]  = None
    stem_width:    Optional[int]   = Field(default=None, ge=1, le=10)
    min_wall_mm:   Optional[float] = Field(default=None, ge=0, le=20)
    min_bridge_mm: Optional[float] = Field(default=None, ge=0, le=20)

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
