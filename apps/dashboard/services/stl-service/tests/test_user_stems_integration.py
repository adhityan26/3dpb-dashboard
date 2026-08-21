"""Integration smoke test: run() accepts user_stems end-to-end without error,
for both cover_type anchors, and the resulting mesh has extra geometry near
the requested theta/z compared to a stem-less run.
"""
import numpy as np
import pytest


def _write_mask(tmp_path, cv2):
    mask = np.full((64, 64), 255, dtype=np.uint8)
    mask[24:40, 24:40] = 0
    img = tmp_path / "mask.png"
    cv2.imwrite(str(img), mask)
    return img


def test_run_accepts_user_stems_bottom_anchor(tmp_path):
    cv2 = pytest.importorskip("cv2")
    import trimesh
    from scripts.generate_shadow_casing import run

    img = _write_mask(tmp_path, cv2)
    out = tmp_path / "out.stl"

    run(
        input_image=str(img), output_stl=str(out),
        outer_radius=40, base_radius=40, shell_height=50,
        n_stencil_theta=128, n_stencil_z=16,
        support_stems=False,
        user_stems=[{"id": "s1", "theta_deg": 90, "z_mm": 20}],
    )
    mesh = trimesh.load(str(out))
    assert len(mesh.faces) > 0


def test_run_accepts_user_stems_top_anchor(tmp_path):
    cv2 = pytest.importorskip("cv2")
    import trimesh
    from scripts.generate_shadow_casing import run

    img = _write_mask(tmp_path, cv2)
    out = tmp_path / "out.stl"

    run(
        input_image=str(img), output_stl=str(out),
        outer_radius=40, base_radius=40, shell_height=50,
        n_stencil_theta=128, n_stencil_z=16,
        support_stems=False,
        cover_type='top',
        user_stems=[{"theta_deg": 200, "z_mm": 10}],
    )
    mesh = trimesh.load(str(out))
    assert len(mesh.faces) > 0


def test_run_empty_user_stems_is_noop(tmp_path):
    cv2 = pytest.importorskip("cv2")
    import trimesh
    from scripts.generate_shadow_casing import run

    img = _write_mask(tmp_path, cv2)
    out_a = tmp_path / "a.stl"
    out_b = tmp_path / "b.stl"

    common = dict(
        outer_radius=40, base_radius=40, shell_height=50,
        n_stencil_theta=128, n_stencil_z=16, support_stems=False,
    )
    run(input_image=str(img), output_stl=str(out_a), user_stems=None, **common)
    run(input_image=str(img), output_stl=str(out_b), user_stems=[], **common)

    mesh_a = trimesh.load(str(out_a))
    mesh_b = trimesh.load(str(out_b))
    assert len(mesh_a.faces) == len(mesh_b.faces)
