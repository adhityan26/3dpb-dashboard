"""Unit tests for island_centroids() (service/routes/check_islands.py) —
the pure centroid-computation helper factored out of the /check-islands
route, reusing the generator's shared find_floating_islands BFS.
"""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service.routes.check_islands import island_centroids  # noqa: E402


def test_grid_with_one_island_returns_one_centroid_at_expected_location():
    n_theta, n_z = 360, 101
    stencil = np.zeros((n_theta, n_z), dtype=bool)
    # small floating blob centred at theta=90 (col 90), z row 50
    stencil[88:93, 48:53] = True

    islands = island_centroids(stencil, anchor="bottom", z_min_mm=0.0, z_max_mm=100.0)
    assert len(islands) == 1
    assert islands[0]["theta_deg"] == pytest.approx(90.0, abs=1.0)
    assert islands[0]["z_mm"] == pytest.approx(50.0, abs=1.0)


def test_anchored_grid_returns_empty():
    n_theta, n_z = 40, 20
    stencil = np.zeros((n_theta, n_z), dtype=bool)
    stencil[:, 0] = True  # fully grounded to base, nothing floating
    islands = island_centroids(stencil, anchor="bottom", z_min_mm=0.0, z_max_mm=50.0)
    assert islands == []


def test_anchor_top_semantics_respected():
    n_theta, n_z = 40, 20
    stencil = np.zeros((n_theta, n_z), dtype=bool)
    stencil[:, n_z - 1] = True  # grounded to the TOP edge only
    islands_top = island_centroids(stencil, anchor="top", z_min_mm=0.0, z_max_mm=50.0)
    assert islands_top == []  # grounded from the top anchor's perspective

    islands_bottom = island_centroids(stencil, anchor="bottom", z_min_mm=0.0, z_max_mm=50.0)
    assert len(islands_bottom) == 1  # same grid is "floating" from the base's perspective
    # entirely at the top row -> z centroid should be z_max
    assert islands_bottom[0]["z_mm"] == pytest.approx(50.0, abs=0.1)


def test_multiple_islands_return_multiple_centroids():
    n_theta, n_z = 360, 101
    stencil = np.zeros((n_theta, n_z), dtype=bool)
    stencil[8:13, 8:13] = True     # island near theta=10, z low
    stencil[268:273, 68:73] = True  # island near theta=270, z high
    islands = island_centroids(stencil, anchor="bottom", z_min_mm=0.0, z_max_mm=100.0)
    assert len(islands) == 2
    thetas = sorted(i["theta_deg"] for i in islands)
    assert thetas[0] == pytest.approx(10.0, abs=1.0)
    assert thetas[1] == pytest.approx(270.0, abs=1.0)


def test_island_straddling_wrap_boundary_has_sane_centroid():
    n_theta, n_z = 360, 20
    stencil = np.zeros((n_theta, n_z), dtype=bool)
    # blob straddling 0/360: columns 358,359,0,1
    for col in (358, 359, 0, 1):
        stencil[col, 8:11] = True
    islands = island_centroids(stencil, anchor="bottom", z_min_mm=0.0, z_max_mm=50.0)
    assert len(islands) == 1
    # circular mean should land near 359.5 / -0.5, i.e. close to 0, not 179.5
    theta = islands[0]["theta_deg"]
    assert theta < 5 or theta > 355
