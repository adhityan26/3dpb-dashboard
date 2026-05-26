"""POST /generate — full STL build (synchronous, ~10-60 seconds)."""
import contextlib
import io
import json
import os
import sys
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import ValidationError

from service.auth import require_bearer_token
from service.schemas import GeneratorConfig

# scripts/ is not a package — add it to sys.path before import
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from generate_shadow_casing import run as generator_run  # noqa: E402

router = APIRouter()


@router.post(
    "/generate",
    dependencies=[Depends(require_bearer_token)],
    responses={
        200: {
            "content": {"application/octet-stream": {}},
            "description": "Binary STL file",
        },
        400: {"description": "Invalid input"},
        401: {"description": "Missing or invalid bearer token"},
        500: {"description": "Generator failed"},
    },
)
async def generate(
    image: UploadFile = File(..., description="Silhouette image (PNG/JPG)"),
    config_json: str = Form("{}", description="GeneratorConfig fields as JSON"),
) -> Response:
    """Run the full mesh build and return the STL bytes.

    Synchronous: blocks until the generator finishes (typically 10-60s
    depending on resolution + decimation settings).
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

    suffix = Path(image.filename or "input.png").suffix.lower() or ".png"
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type: {suffix}",
        )

    image_bytes = await image.read()

    # ── Run the generator inside a temp dir, capture stdout ─────────────
    log_buf = io.StringIO()
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        input_path = tmp / f"input{suffix}"
        input_path.write_bytes(image_bytes)

        out_stl = tmp / "casing.stl"
        out_debug = tmp / "debug.png"
        out_mesh_prev = tmp / "mesh_preview.png"
        out_shadow_comp = tmp / "shadow_comparison.png"

        # The generator writes to ./output by default. Force it into our
        # temp dir by chdir-ing — generator's `os.makedirs('output', ...)`
        # then creates the dir inside our tmpdir, not the project root.
        prev_cwd = Path.cwd()
        try:
            os.chdir(tmp)
            with contextlib.redirect_stdout(log_buf):
                # Build kwargs from the validated config. The config may
                # already include merged_builder, so we set it as a
                # default that the config can override.
                gen_kwargs = {
                    'merged_builder': True,
                    **validated.model_dump(exclude_none=True),
                }
                generator_run(
                    input_image        = str(input_path),
                    output_stl         = str(out_stl),
                    output_debug       = str(out_debug),
                    output_mesh_prev   = str(out_mesh_prev),
                    output_shadow_comp = str(out_shadow_comp),
                    **gen_kwargs,
                )
        except (ValueError, RuntimeError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Generator rejected input: {e}",
            )
        except Exception as e:  # pragma: no cover - unexpected
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Generator crashed: {e}",
            )
        finally:
            os.chdir(prev_cwd)

        if not out_stl.exists():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Generator finished without producing an STL file",
            )

        stl_bytes = out_stl.read_bytes()

    return Response(
        content=stl_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="casing.stl"'},
    )
