"""POST /convert-stl-to-3mf — convert uploaded STL bytes to 3MF bytes."""
import io
import sys
from pathlib import Path

import trimesh
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from service.auth import require_bearer_token

# Ensure scripts/ on sys.path (not strictly needed here but consistent)
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

router = APIRouter()


@router.post(
    "/convert-stl-to-3mf",
    dependencies=[Depends(require_bearer_token)],
    responses={
        200: {
            "content": {"model/3mf": {}},
            "description": "Binary 3MF file",
        },
        400: {"description": "Invalid STL"},
        401: {"description": "Missing or invalid bearer token"},
    },
)
async def convert_stl_to_3mf(stl: UploadFile = File(...)) -> Response:
    """Load an STL file and re-export as 3MF (Bambu Studio native format)."""
    stl_bytes = await stl.read()
    if not stl_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="empty STL upload",
        )

    try:
        mesh = trimesh.load(
            io.BytesIO(stl_bytes),
            file_type="stl",
            process=True,  # merge duplicate vertices, fix winding
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid STL: {e}",
        )

    # Ensure outward-facing normals — Bambu Studio interprets flipped
    # normals as "negative volume" and generates only support structures.
    try:
        trimesh.repair.fix_normals(mesh)
        trimesh.repair.fix_winding(mesh)
        trimesh.repair.fix_inversion(mesh)
    except Exception:
        # Best-effort; keep going even if some repair step fails
        pass

    try:
        out_bytes = mesh.export(file_type="3mf")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"3MF export failed: {e}",
        )

    return Response(
        content=out_bytes,
        media_type="model/3mf",
        headers={"Content-Disposition": 'attachment; filename="casing.3mf"'},
    )
