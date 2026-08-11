"""Unit tests for _apply_user_stems and find_floating_islands
(scripts/generate_shadow_casing.py) — manual stem placement + shared
island-detection helper used by both auto-bridging and /check-islands.
"""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.generate_shadow_casing import (  # noqa: E402
    _apply_user_stems,
    _bridge_floating_islands,
    find_floating_islands,
)


def _empty_stencil(n_theta=360, n_z=100):
    return np.zeros((n_theta, n_z), dtype=bool)


# ─── _apply_user_stems ────────────────────────────────────────────────────

def test_theta_zero_maps_to_column_zero():
    stencil = _empty_stencil(n_theta=360, n_z=100)
    out = _apply_user_stems(stencil, [{"theta_deg": 0, "z_mm": 50}],
                             stem_width=1, z_min_mm=0, z_max_mm=100)
    assert out[0, :].any()


def test_theta_180_maps_to_half_columns():
    n_theta = 360
    stencil = _empty_stencil(n_theta=n_theta, n_z=100)
    out = _apply_user_stems(stencil, [{"theta_deg": 180, "z_mm": 50}],
                             stem_width=1, z_min_mm=0, z_max_mm=100)
    assert out[n_theta // 2, :].any()


def test_z_maps_linearly_into_row():
    stencil = _empty_stencil(n_theta=10, n_z=101)
    out = _apply_user_stems(stencil, [{"theta_deg": 0, "z_mm": 50}],
                             stem_width=1, z_min_mm=0, z_max_mm=100, anchor='bottom')
    # z=50 in [0,100] over 101 rows -> row 50 exactly
    assert out[0, 50]
    assert not out[0, 51]


def test_z_out_of_range_clamps_low():
    stencil = _empty_stencil(n_theta=10, n_z=101)
    out = _apply_user_stems(stencil, [{"theta_deg": 0, "z_mm": -999}],
                             stem_width=1, z_min_mm=0, z_max_mm=100, anchor='bottom')
    assert out[0, 0]


def test_z_out_of_range_clamps_high():
    stencil = _empty_stencil(n_theta=10, n_z=101)
    out = _apply_user_stems(stencil, [{"theta_deg": 0, "z_mm": 999}],
                             stem_width=1, z_min_mm=0, z_max_mm=100, anchor='top')
    assert out[0, 100]


def test_anchor_bottom_fills_from_row_zero_up():
    stencil = _empty_stencil(n_theta=10, n_z=101)
    out = _apply_user_stems(stencil, [{"theta_deg": 0, "z_mm": 50}],
                             stem_width=1, z_min_mm=0, z_max_mm=100, anchor='bottom')
    assert out[0, 0]      # base filled
    assert out[0, 50]     # up to stem row
    assert not out[0, 51]  # nothing above


def test_anchor_top_fills_from_row_to_top():
    stencil = _empty_stencil(n_theta=10, n_z=101)
    out = _apply_user_stems(stencil, [{"theta_deg": 0, "z_mm": 50}],
                             stem_width=1, z_min_mm=0, z_max_mm=100, anchor='top')
    assert out[0, 100]    # top filled
    assert out[0, 50]     # stem row filled
    assert not out[0, 49]  # nothing below


def test_stem_width_centers_on_target_column():
    stencil = _empty_stencil(n_theta=360, n_z=10)
    out = _apply_user_stems(stencil, [{"theta_deg": 100, "z_mm": 5}],
                             stem_width=5, z_min_mm=0, z_max_mm=9)
    filled_cols = sorted(set(np.where(out.any(axis=1))[0].tolist()))
    assert filled_cols == [98, 99, 100, 101, 102]


def test_stem_width_wraps_at_zero_boundary():
    n_theta = 360
    stencil = _empty_stencil(n_theta=n_theta, n_z=10)
    out = _apply_user_stems(stencil, [{"theta_deg": 359, "z_mm": 5}],
                             stem_width=4, z_min_mm=0, z_max_mm=9)
    filled_cols = sorted(set(np.where(out.any(axis=1))[0].tolist()))
    # target col = round(359/360*360) % 360 = 359; half=2 -> cols 357..0
    assert filled_cols == [0, 357, 358, 359]


def test_invalid_entries_skipped():
    stencil = _empty_stencil(n_theta=10, n_z=10)
    out = _apply_user_stems(
        stencil,
        [
            {"theta_deg": "bad", "z_mm": 5},
            {"z_mm": 5},               # missing theta_deg
            {"theta_deg": 5},          # missing z_mm
            "not-a-dict",
            {"theta_deg": True, "z_mm": 5},  # bool rejected
        ],
        stem_width=1, z_min_mm=0, z_max_mm=9,
    )
    assert not out.any()


def test_empty_or_none_user_stems_is_noop():
    stencil = _empty_stencil(n_theta=10, n_z=10)
    assert not _apply_user_stems(stencil, None, 1, 0, 9).any()
    assert not _apply_user_stems(stencil, [], 1, 0, 9).any()


def test_extra_keys_ignored():
    stencil = _empty_stencil(n_theta=10, n_z=10)
    out = _apply_user_stems(
        stencil, [{"id": "abc", "theta_deg": 0, "z_mm": 5, "provenance": "manual"}],
        stem_width=1, z_min_mm=0, z_max_mm=9,
    )
    assert out.any()


# ─── find_floating_islands (shared helper) ─────────────────────────────────

def test_find_floating_islands_empty_when_none():
    stencil = _empty_stencil(n_theta=20, n_z=20)
    stencil[:, 0] = True  # fully grounded row, nothing floating
    assert find_floating_islands(stencil, anchor='bottom') == []


def test_find_floating_islands_detects_one_component():
    stencil = _empty_stencil(n_theta=20, n_z=20)
    stencil[5:8, 10:13] = True  # disconnected blob, not touching z=0
    islands = find_floating_islands(stencil, anchor='bottom')
    assert len(islands) == 1
    assert islands[0].sum() == stencil.sum()


def test_find_floating_islands_top_anchor_semantics():
    n_z = 20
    stencil = _empty_stencil(n_theta=20, n_z=n_z)
    stencil[:, n_z - 1] = True  # grounded to TOP edge
    stencil[5:8, 2:5] = True    # floating blob elsewhere
    islands_top = find_floating_islands(stencil, anchor='top')
    assert len(islands_top) == 1
    # from the bottom anchor's perspective the top-grounded ring AND the
    # blob are both floating (two disconnected components)
    islands_bottom = find_floating_islands(stencil, anchor='bottom')
    assert len(islands_bottom) == 2
    sizes = sorted(m.sum() for m in islands_bottom)
    assert sizes == [9, 20]  # blob (3x3) and the full top ring (20 cols)


def test_bridge_floating_islands_still_works_after_refactor():
    stencil = _empty_stencil(n_theta=20, n_z=20)
    stencil[5:8, 10:13] = True
    out, n = _bridge_floating_islands(stencil, stem_width=2, anchor='bottom')
    assert n == 1
    assert out[:, 0].any()  # bridged down to the base
