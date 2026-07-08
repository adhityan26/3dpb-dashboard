"""POST /preview — fast shadow + casing-outline preview (no mesh build)."""
import json
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import ValidationError

from service.auth import require_bearer_token
from service.preview_renderer import render_shadow_preview
from service.schemas import GeneratorConfig

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
) -> Response:
    """Render and return a shadow preview PNG.

    Multipart form fields:
      - image: silhouette file (required)
      - config_json: JSON-encoded GeneratorConfig (optional, defaults to {})
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

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await image.read())
        tmp_path = tmp.name

    try:
        png_bytes = render_shadow_preview(
            tmp_path, validated.model_dump(exclude_none=True)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return Response(content=png_bytes, media_type="image/png")
