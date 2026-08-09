"""Preview must render with physical polarity: shadow dark, lit floor bright."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service.preview_renderer import _to_physical_polarity  # noqa: E402


def test_polarity_remap():
    raw = np.array([[0, 128, 255]], dtype=np.uint8)
    out = _to_physical_polarity(raw)
    lit, footprint, shadow = int(out[0, 0]), int(out[0, 1]), int(out[0, 2])
    assert shadow < footprint < lit          # shadow darkest, lit brightest
    assert lit > 200 and shadow < 60


def test_preview_renders_shadow_dark(tmp_path):
    cv2 = pytest.importorskip("cv2")
    from service.preview_renderer import render_shadow_preview

    # black square silhouette on white background → square is solid → shadow
    mask = np.full((64, 64), 255, dtype=np.uint8)
    mask[20:44, 20:44] = 0
    img = tmp_path / "mask.png"
    cv2.imwrite(str(img), mask)

    png = render_shadow_preview(str(img), {
        "outer_radius": 40, "base_radius": 40,
        "n_stencil_theta": 128, "n_stencil_z": 32,
        "shadow_res": 256, "support_stems": False,
    })
    arr = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
    # outside the casing but inside floor: mix of lit (bright) and shadow (dark)
    # → the darkest projected pixels must be darker than the lit background
    vals = arr[arr.shape[0] // 2, :]
    assert vals.min() < 60          # shadow present and dark
    assert (vals > 200).sum() > 10  # lit floor is bright
