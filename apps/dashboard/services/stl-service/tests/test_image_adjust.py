"""Unit tests for adjust_image() and its wiring into load_silhouette_mask()."""
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.generate_shadow_casing import adjust_image  # noqa: E402


def _color_bgr(size: int = 40) -> np.ndarray:
    """Mid-tone colored BGR image (not fully saturated, not fully grey)."""
    img = np.full((size, size, 3), 127, dtype=np.uint8)
    img[:, :, 0] = 180  # B
    img[:, :, 1] = 100  # G
    img[:, :, 2] = 60   # R
    return img


def _color_bgra(size: int = 40) -> np.ndarray:
    img = np.zeros((size, size, 4), dtype=np.uint8)
    img[:, :, 0] = 180
    img[:, :, 1] = 100
    img[:, :, 2] = 60
    img[:, :, 3] = np.tile(np.linspace(0, 255, size).astype(np.uint8), (size, 1))
    return img


def _grey(size: int = 40) -> np.ndarray:
    img = np.full((size, size), 128, dtype=np.uint8)
    img[0:10, 0:10] = 40
    return img


class TestDefaultsNoOp:
    def test_bgr_defaults_are_noop(self):
        img = _color_bgr()
        out = adjust_image(img)
        assert np.array_equal(out, img)

    def test_bgra_defaults_are_noop(self):
        img = _color_bgra()
        out = adjust_image(img)
        assert np.array_equal(out, img)

    def test_grey_defaults_are_noop(self):
        img = _grey()
        out = adjust_image(img)
        assert np.array_equal(out, img)


class TestBrightness:
    def test_positive_brightness_increases_mean(self):
        img = _color_bgr()
        out = adjust_image(img, brightness=100.0)
        assert out.astype(np.float64).mean() > img.astype(np.float64).mean()

    def test_negative_brightness_decreases_mean(self):
        img = _color_bgr()
        out = adjust_image(img, brightness=-100.0)
        assert out.astype(np.float64).mean() < img.astype(np.float64).mean()


class TestContrast:
    def test_extreme_contrast_pushes_toward_poles(self):
        img = _color_bgr()
        out = adjust_image(img, contrast=100.0)
        # Extreme contrast (gain=2 around mid-gray) should push each channel
        # further from 127 (toward 0/255) than the original values were.
        orig_dist = np.abs(img.astype(np.int32) - 127)
        out_dist = np.abs(out.astype(np.int32) - 127)
        assert (out_dist >= orig_dist).all()
        assert (out_dist > orig_dist).any()


class TestSaturation:
    def test_zero_saturation_equalizes_channels(self):
        img = _color_bgr()
        out = adjust_image(img, saturation=0.0)
        spread_before = int(img.max()) - int(img.min())
        spread_after = int(out.max()) - int(out.min())
        assert spread_after < spread_before

    def test_grayscale_input_unaffected_by_saturation(self):
        img = _grey()
        out = adjust_image(img, saturation=0.0)
        assert np.array_equal(out, img)


class TestAlphaPreservation:
    def test_bgra_alpha_channel_byte_identical(self):
        img = _color_bgra()
        out = adjust_image(img, brightness=50.0, contrast=30.0, saturation=0.0)
        assert np.array_equal(out[:, :, 3], img[:, :, 3])
        # Color channels should have changed
        assert not np.array_equal(out[:, :, :3], img[:, :, :3])
