"""Unit tests for auto_fit_canvas() and its wiring into load_silhouette_mask()."""
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.generate_shadow_casing import (  # noqa: E402
    auto_fit_canvas,
    load_silhouette_mask,
    pad_canvas,
)


def _rgba_corner_content(size: int = 200, sq: int = 30) -> np.ndarray:
    """RGBA image with an opaque square tucked in the top-left corner."""
    img = np.zeros((size, size, 4), dtype=np.uint8)
    img[0:sq, 0:sq, 3] = 255  # opaque alpha in the corner
    img[0:sq, 0:sq, 0:3] = 0  # colour irrelevant, alpha drives content
    return img


def _grey_corner_content(size: int = 200, sq: int = 30) -> np.ndarray:
    """Grey image, white background, dark square tucked in the top-left corner."""
    img = np.full((size, size), 255, dtype=np.uint8)
    img[0:sq, 0:sq] = 0
    return img


def _content_extent(mask: np.ndarray, thresh_fn) -> tuple[float, float, float]:
    """Return (cx, cy, r_max) for content pixels found via thresh_fn(mask)-> bool array."""
    ys, xs = np.where(thresh_fn(mask))
    cy, cx = ys.mean(), xs.mean()
    r = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    return cx, cy, r.max()


class TestAutoFitCanvasRGBA:
    def test_content_fits_inscribed_circle_and_is_centered(self):
        raw = _rgba_corner_content()
        out = auto_fit_canvas(raw, margin=0.95)

        assert out.ndim == 3 and out.shape[2] == 4
        side = out.shape[0]
        assert out.shape[0] == out.shape[1]

        cx, cy, r_max = _content_extent(out, lambda m: m[:, :, 3] > 127)
        inscribed_r = side / 2.0
        assert r_max <= 0.96 * inscribed_r

        canvas_cx, canvas_cy = side / 2.0, side / 2.0
        assert abs(cx - canvas_cx) <= 2.0
        assert abs(cy - canvas_cy) <= 2.0

    def test_padding_is_transparent(self):
        raw = _rgba_corner_content()
        out = auto_fit_canvas(raw, margin=0.95)
        # A far corner of the padded canvas should be background (alpha 0)
        assert out[0, 0, 3] == 0


class TestAutoFitCanvasGrey:
    def test_content_fits_inscribed_circle_and_is_centered(self):
        raw = _grey_corner_content()
        out = auto_fit_canvas(raw, margin=0.95)

        assert out.ndim == 2
        side = out.shape[0]
        assert out.shape[0] == out.shape[1]

        cx, cy, r_max = _content_extent(out, lambda m: m < 128)
        inscribed_r = side / 2.0
        assert r_max <= 0.96 * inscribed_r

        canvas_cx, canvas_cy = side / 2.0, side / 2.0
        assert abs(cx - canvas_cx) <= 2.0
        assert abs(cy - canvas_cy) <= 2.0

    def test_background_is_white(self):
        raw = _grey_corner_content()
        out = auto_fit_canvas(raw, margin=0.95)
        assert out[0, 0] == 255


class TestAutoFitCanvasBlank:
    def test_blank_rgba_returned_unchanged(self):
        raw = np.zeros((100, 100, 4), dtype=np.uint8)  # all transparent, no content
        out = auto_fit_canvas(raw)
        assert out.shape == raw.shape
        np.testing.assert_array_equal(out, raw)

    def test_blank_grey_returned_unchanged(self):
        raw = np.full((100, 100), 255, dtype=np.uint8)  # all white, no dark content
        out = auto_fit_canvas(raw)
        assert out.shape == raw.shape
        np.testing.assert_array_equal(out, raw)


class TestPadCanvas:
    def test_no_op_at_zero_padding(self):
        raw = _grey_corner_content(size=100, sq=10)
        out = pad_canvas(raw, 0)
        assert out.shape == raw.shape
        np.testing.assert_array_equal(out, raw)

    def test_no_op_at_negative_padding(self):
        raw = _grey_corner_content(size=100, sq=10)
        out = pad_canvas(raw, -5)
        np.testing.assert_array_equal(out, raw)

    def test_grey_padding_white_borders(self):
        raw = np.full((100, 100), 0, dtype=np.uint8)  # all black content
        out = pad_canvas(raw, 10)
        assert out.shape == (120, 120)
        # 10px border on each side should be white
        assert out[0, 0] == 255
        assert out[0, -1] == 255
        assert out[-1, 0] == 255
        # original content preserved in the center
        assert out[60, 60] == 0

    def test_rgba_padding_transparent_borders(self):
        raw = np.zeros((100, 100, 4), dtype=np.uint8)
        raw[:, :, 3] = 255  # fully opaque content
        out = pad_canvas(raw, 10)
        assert out.shape == (120, 120, 4)
        assert out[0, 0, 3] == 0
        assert out[60, 60, 3] == 255

    def test_padding_amount_based_on_max_dimension(self):
        # non-square image: pad = round(max(h, w) * pct / 100) on each side
        raw = np.full((50, 100), 0, dtype=np.uint8)
        out = pad_canvas(raw, 10)  # pad = round(100 * 0.10) = 10
        assert out.shape == (70, 120)


class TestLoadSilhouetteMaskManualPadding:
    def test_padding_applied_alone(self, tmp_path):
        img = np.full((100, 100), 0, dtype=np.uint8)
        path = tmp_path / "solid.png"
        cv2.imwrite(str(path), img)

        mask = load_silhouette_mask(str(path), invert=False, padding_pct=10)
        assert mask.shape[0] == mask.shape[1] == 120

    def test_auto_fit_and_padding_combined_shrinks_content_further(self, tmp_path):
        img = _grey_corner_content(size=200, sq=30)
        path = tmp_path / "corner.png"
        cv2.imwrite(str(path), img)

        mask_auto_only = load_silhouette_mask(
            str(path), invert=False, auto_fit=True, padding_pct=0
        )
        mask_both = load_silhouette_mask(
            str(path), invert=False, auto_fit=True, padding_pct=20
        )

        def max_radius(mask):
            side = mask.shape[0]
            center = side / 2.0
            ys, xs = np.where(mask > 0)
            r = np.sqrt((xs - center) ** 2 + (ys - center) ** 2)
            return r.max() / side  # normalize by canvas size

        # Manual padding after auto-fit should shrink the content's relative
        # radius further compared to auto-fit alone.
        assert max_radius(mask_both) < max_radius(mask_auto_only)


class TestLoadSilhouetteMaskAutoFit:
    def test_corner_content_ends_up_inside_inscribed_circle(self, tmp_path):
        img = _grey_corner_content(size=200, sq=30)
        path = tmp_path / "corner.png"
        cv2.imwrite(str(path), img)

        mask = load_silhouette_mask(str(path), invert=False, auto_fit=True)
        assert mask.shape[0] == mask.shape[1]
        side = mask.shape[0]
        center = side / 2.0

        ys, xs = np.where(mask > 0)
        assert len(xs) > 0
        r = np.sqrt((xs - center) ** 2 + (ys - center) ** 2)
        assert r.max() <= 0.5 * side * 0.98
