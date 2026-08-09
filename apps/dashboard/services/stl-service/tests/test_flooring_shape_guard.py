"""Tests for the flooring_shape / flooring_image upload guard in service/schemas.py."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service.schemas import (  # noqa: E402
    assert_flooring_shape_has_upload,
    is_basic_flooring_shape,
)


@pytest.mark.parametrize(
    "shape",
    [None, "", "circle", "square", "triangle", "rect", "oval",
     "rect:3:4", "oval:16:9", "Circle", "SQUARE:1:1"],
)
def test_basic_shapes_are_recognized(shape):
    assert is_basic_flooring_shape(shape) is True


@pytest.mark.parametrize(
    "shape",
    ["/etc/passwd", "../../secret.png", "flooring.png", "custom", "some/path.jpg"],
)
def test_path_like_shapes_are_not_basic(shape):
    assert is_basic_flooring_shape(shape) is False


@pytest.mark.parametrize("shape", [None, "", "circle", "rect:3:4", "oval"])
def test_basic_shapes_pass_through_without_upload(shape):
    # Should not raise regardless of whether a file was uploaded.
    assert_flooring_shape_has_upload(shape, has_flooring_image=False)
    assert_flooring_shape_has_upload(shape, has_flooring_image=True)


def test_path_like_shape_without_upload_is_rejected():
    with pytest.raises(ValueError, match="flooring_image"):
        assert_flooring_shape_has_upload("/etc/passwd", has_flooring_image=False)


def test_path_like_shape_with_upload_is_allowed():
    # The route will override flooring_shape with the uploaded file's path,
    # so a path-like value combined with an actual upload is fine.
    assert_flooring_shape_has_upload("custom", has_flooring_image=True)
