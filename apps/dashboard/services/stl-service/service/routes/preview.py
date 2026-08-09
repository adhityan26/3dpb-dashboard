"""POST /preview — fast shadow + casing-outline preview (no mesh build)."""
import json
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import ValidationError

from service.auth import require_bearer_token
from service.preview_renderer import render_shadow_preview
from service.schemas import GeneratorConfig, assert_flooring_shape_has_upload

router = APIRouter()


@router.post(
    "/preview",
    dependencies=[Depends(require_bearer_token)],
    responses={
        200: {"content": {"image/png": {}}, "description": "Shadow PNG with casing outline"},
        400: {"description": "Invalid input"},
        401: {"description": "Missing or invalid bearer token"},
    },
)
async def preview(
    image: UploadFile = File(..., description="Silhouette image (PNG/JPG)"),
    config_json: str = Form("{}", description="GeneratorConfig fields as JSON"),
    flooring_image: UploadFile | None = File(
        default=None,
        description="Optional B&W footprint image (black = casing footprint)",
    ),
) -> Response:
    """Render and return a shadow preview PNG.

    Multipart form fields:
      - image: silhouette file (required)
      - config_json: JSON-encoded GeneratorConfig (optional, defaults to {})
      - flooring_image: optional B&W footprint image; overrides config.flooring_shape
    """
    # ── Validate config ──────────────────────────────────────────────────
    try:
        config_dict = json.loads(config_json) if config_json else {}
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"config_json is not valid JSON: {e}",
        )

    try:
        validated = GeneratorConfig(**config_dict)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid config: {e.errors()}",
        )

    # ── Persist upload to a temp file (cv2 needs a path) ─────────────────
    suffix = Path(image.filename or "input.png").suffix.lower() or ".png"
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type: {suffix}",
        )

    flooring_suffix = None
    if flooring_image is not None:
        flooring_suffix = Path(flooring_image.filename or "flooring.png").suffix.lower() or ".png"
        if flooring_suffix not in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported flooring_image type: {flooring_suffix}",
            )

    try:
        assert_flooring_shape_has_upload(validated.flooring_shape, flooring_image is not None)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await image.read())
        tmp_path = tmp.name

    flooring_tmp_path = None
    if flooring_image is not None:
        with tempfile.NamedTemporaryFile(suffix=flooring_suffix, delete=False) as ftmp:
            ftmp.write(await flooring_image.read())
            flooring_tmp_path = ftmp.name

    config = validated.model_dump(exclude_none=True)
    if flooring_tmp_path is not None:
        config['flooring_shape'] = flooring_tmp_path

    try:
        png_bytes = render_shadow_preview(tmp_path, config)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)
        if flooring_tmp_path is not None:
            Path(flooring_tmp_path).unlink(missing_ok=True)

    return Response(content=png_bytes, media_type="image/png")
