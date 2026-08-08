"""Unit tests for build_top_cover (top-cover casing variant)."""
import sys
from pathlib import Path

import numpy as np
import pytest
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.generate_shadow_casing import build_top_cover  # noqa: E402

WALL_TOP = 50.0
THICK = 3.0
BASE_R = 40.0


def _volume(mesh: trimesh.Trimesh) -> float:
    return float(abs(mesh.volume))


def test_cover_sits_on_wall_top():
    cover = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=1.5,
        light_x=0.0, light_y=0.0,
        casing_poly=None, base_radius=BASE_R,
    )
    zmin, zmax = cover.bounds[0][2], cover.bounds[1][2]
    assert zmin == pytest.approx(WALL_TOP, abs=1e-6)
    assert zmax == pytest.approx(WALL_TOP + THICK, abs=1e-6)


def test_recess_reduces_volume():
    kwargs = dict(wall_top=WALL_TOP, cover_thickness=THICK,
                  light_x=0.0, light_y=0.0,
                  casing_poly=None, base_radius=BASE_R)
    solid = build_top_cover(recess_r=4.0, recess_depth=0.0, **kwargs)
    recessed = build_top_cover(recess_r=4.0, recess_depth=1.5, **kwargs)
    # expected removed volume = pi*r^2*depth
    expected = np.pi * 4.0**2 * 1.5
    assert _volume(solid) - _volume(recessed) == pytest.approx(expected, rel=0.05)


def test_recess_depth_capped_leaves_roof():
    # depth request exceeds thickness → capped at thickness - 0.8
    cover = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=99.0,
        light_x=0.0, light_y=0.0,
        casing_poly=None, base_radius=BASE_R,
    )
    solid = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=0.0,
        light_x=0.0, light_y=0.0,
        casing_poly=None, base_radius=BASE_R,
    )
    removed = _volume(solid) - _volume(cover)
    expected = np.pi * 4.0**2 * (THICK - 0.8)
    assert removed == pytest.approx(expected, rel=0.05)
    # roof still closes the top: zmax unchanged
    assert cover.bounds[1][2] == pytest.approx(WALL_TOP + THICK, abs=1e-6)


def test_recess_follows_light_position():
    cover = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=1.5,
        light_x=10.0, light_y=-5.0,
        casing_poly=None, base_radius=BASE_R,
    )
    # ray straight up from recess centre must first hit the roof (above
    # wall_top + eff_depth), not the bottom face of the slab
    hits = cover.ray.intersects_location(
        ray_origins=[[10.0, -5.0, WALL_TOP - 1.0]],
        ray_directions=[[0.0, 0.0, 1.0]],
    )[0]
    zs = sorted(p[2] for p in hits)
    assert zs[0] == pytest.approx(WALL_TOP + 1.5, abs=0.01)


def test_custom_casing_poly_shape():
    from shapely.geometry import Polygon
    square = Polygon([(-30, -30), (30, -30), (30, 30), (-30, 30)])
    cover = build_top_cover(
        wall_top=WALL_TOP, cover_thickness=THICK,
        recess_r=4.0, recess_depth=1.5,
        light_x=0.0, light_y=0.0,
        casing_poly=square, base_radius=BASE_R,
    )
    b = cover.bounds
    assert b[0][0] == pytest.approx(-30, abs=1e-6)
    assert b[1][0] == pytest.approx(30, abs=1e-6)


def test_run_top_mode_smoke(tmp_path):
    """End-to-end smoke: top mode produces STL with cover slab, no floor plate."""
    cv2 = pytest.importorskip("cv2")
    from scripts.generate_shadow_casing import run

    # tiny silhouette mask: white bg, black square in the middle
    mask = np.full((64, 64), 255, dtype=np.uint8)
    mask[24:40, 24:40] = 0
    img = tmp_path / "mask.png"
    cv2.imwrite(str(img), mask)
    out = tmp_path / "out.stl"

    run(
        input_image=str(img), output_stl=str(out),
        outer_radius=40, base_radius=40, shell_height=50,
        n_stencil_theta=128, n_stencil_z=16,
        support_stems=False,
        cover_type='top',
    )
    mesh = trimesh.load(str(out))
    zmax = mesh.bounds[1][2]
    # cover slab present above the wall (wall_top ≈ 50 + base_thickness 2)
    assert zmax > 50.0
    # no floor plate: no vertices near z=0 inside r < 20 (wall sits at r≈40)
    v = mesh.vertices
    low_centre = v[(v[:, 2] < 1.0) & (np.hypot(v[:, 0], v[:, 1]) < 20.0)]
    assert len(low_centre) == 0
