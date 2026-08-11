"""Tests for the /preview `preview_view="wall"` mode: unwrap of the (θ,z)
stencil grid itself, the placement surface for manual stems in the v2 editor.
"""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service.preview_renderer import _render_wall_unwrap, render_shadow_preview  # noqa: E402


def _make_silhouette(tmp_path, cv2):
    # black square silhouette on white background
    mask = np.full((64, 64), 255, dtype=np.uint8)
    mask[20:44, 20:44] = 0
    img = tmp_path / "mask.png"
    cv2.imwrite(str(img), mask)
    return img


def test_wall_view_returns_valid_png(tmp_path):
    cv2 = pytest.importorskip("cv2")
    img = _make_silhouette(tmp_path, cv2)

    png = render_shadow_preview(str(img), {
        "outer_radius": 40, "base_radius": 40,
        "n_stencil_theta": 128, "n_stencil_z": 32,
        "support_stems": False,
        "preview_view": "wall",
    })
    arr = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
    assert arr is not None
    assert arr.shape[1] == 1024  # fixed width
    assert 128 <= arr.shape[0] <= 1024


def test_wall_view_user_stem_produces_dark_column(tmp_path):
    cv2 = pytest.importorskip("cv2")
    img = _make_silhouette(tmp_path, cv2)

    # A stem at theta=90 -> around x = width/4 (90/360 * 1024 = 256)
    png = render_shadow_preview(str(img), {
        "outer_radius": 40, "base_radius": 40,
        "n_stencil_theta": 128, "n_stencil_z": 32,
        "support_stems": False,
        "preview_view": "wall",
        "stem_width": 4,
        "user_stems": [{"theta_deg": 90, "z_mm": 5}],
    })
    arr = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
    width = arr.shape[1]
    target_x = int(round(90 / 360 * width))
    band = arr[:, max(0, target_x - 8): target_x + 8]
    assert band.min() < 60  # solid stem cells render dark


def test_wall_view_solid_is_dark_holes_bright():
    n_theta, n_z = 20, 10
    stencil = np.zeros((n_theta, n_z), dtype=bool)
    stencil[:, :] = True  # fully solid stencil
    png = _render_wall_unwrap(stencil, z_min_mm=0, z_max_mm=50, r_wall_arr=np.full(n_theta, 40.0))
    import cv2 as _cv2
    arr = _cv2.imdecode(np.frombuffer(png, np.uint8), _cv2.IMREAD_GRAYSCALE)
    # mostly-solid mask -> mostly-dark image
    assert (arr < 60).mean() > 0.9

    stencil_holes = np.zeros((n_theta, n_z), dtype=bool)  # all holes
    png2 = _render_wall_unwrap(stencil_holes, z_min_mm=0, z_max_mm=50, r_wall_arr=np.full(n_theta, 40.0))
    arr2 = _cv2.imdecode(np.frombuffer(png2, np.uint8), _cv2.IMREAD_GRAYSCALE)
    assert (arr2 > 200).mean() > 0.9


def test_wall_view_row0_is_top_z_max():
    n_theta, n_z = 10, 4
    stencil = np.zeros((n_theta, n_z), dtype=bool)
    stencil[:, -1] = True  # solid only at the top row (z_max)
    png = _render_wall_unwrap(stencil, z_min_mm=0, z_max_mm=30, r_wall_arr=np.full(n_theta, 40.0))
    import cv2 as _cv2
    arr = _cv2.imdecode(np.frombuffer(png, np.uint8), _cv2.IMREAD_GRAYSCALE)
    # row 0 of the image should be dark (solid, at z_max), last row bright
    assert arr[0, :].mean() < 60
    assert arr[-1, :].mean() > 200
