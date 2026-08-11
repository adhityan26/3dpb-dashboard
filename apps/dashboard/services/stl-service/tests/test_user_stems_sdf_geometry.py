"""Regression test: manual user_stems must produce actual mesh geometry in
the SDF-based wall builders (build_stencil_wall_sdf_surface and
build_stencil_wall_marching_cubes), even when support_stems=False (auto
bridging disabled).

Root cause being guarded against: these builders derive mesh thickness from
a continuous `thickness_frac` field (from the SDF), not directly from the
binary `stencil`. The code that forces `thickness_frac` to full thickness
for stem cells (`stem_cells = stencil & (thickness_frac < 0.5)`) previously
lived INSIDE `if support_stems:`, so when a caller supplies only manual
user_stems with support_stems=False, the stem cells got flipped on in the
binary `stencil` (for shadow-simulation purposes) but their thickness_frac
stayed ~0 — the mesh builder saw no solid content there and emitted no
faces at all for that column, silently dropping the user's stem.
"""
import numpy as np


def test_sdf_surface_user_stem_produces_geometry_without_support_stems():
    from scripts.generate_shadow_casing import build_stencil_wall_sdf_surface

    n_theta, n_z = 32, 32
    floor_half = 50.0
    h_mask = w_mask = 128

    # Entirely "hole" mask/SDF — nothing solid anywhere except what the
    # manual stem adds. This isolates the stem's contribution to the mesh.
    smooth_mask = np.zeros((h_mask, w_mask), dtype=np.uint8)
    sdf_float = np.full((h_mask, w_mask), -50.0, dtype=np.float64)

    r_wall_arr = np.full(n_theta, 30.0)
    wall_t = 3.0
    base_z = 0.0
    shell_height = 40.0
    light_pos = (0.0, 0.0, 120.0)

    # Single manual stem at theta=0deg, spanning from the bottom anchor up
    # to z_mm=20 — support_stems=False so no auto-bridging happens.
    user_stems = [{"theta_deg": 0.0, "z_mm": 20.0}]

    mesh, stencil, z_cents = build_stencil_wall_sdf_surface(
        smooth_mask=smooth_mask,
        sdf_float=sdf_float,
        light_pos=light_pos,
        r_wall_arr=r_wall_arr,
        wall_t=wall_t,
        base_z=base_z,
        shell_height=shell_height,
        floor_half=floor_half,
        n_theta=n_theta,
        n_z=n_z,
        support_stems=False,
        stem_width=2,
        stem_anchor='bottom',
        user_stems=user_stems,
    )

    # The mesh must contain actual faces for the user stem — this is the
    # symptom the user reported ("no geometry at all").
    assert len(mesh.faces) > 0, "user stem produced zero mesh faces"

    # And it must have vertices with inner-wall thickness (radius pulled in
    # from the outer wall radius) near theta=0, spanning up toward z=20mm —
    # i.e. real 3D geometry, not just a stencil-bit flip.
    r_outer = r_wall_arr[0]
    verts = mesh.vertices
    radii = np.sqrt(verts[:, 0] ** 2 + verts[:, 1] ** 2)
    thetas = np.arctan2(verts[:, 1], verts[:, 0])
    near_theta0 = np.abs(thetas) < np.radians(15)
    has_thickness = radii < (r_outer - 1.0)
    band = verts[near_theta0 & has_thickness]
    assert band.shape[0] > 0, "no thick-wall vertices found near stem theta band"
    assert band[:, 2].max() >= 15.0, "stem geometry doesn't reach expected z"
