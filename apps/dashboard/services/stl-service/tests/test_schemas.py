import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service.schemas import GeneratorConfig  # noqa: E402


def test_cover_type_accepts_top_and_bottom():
    assert GeneratorConfig(cover_type="top").cover_type == "top"
    assert GeneratorConfig(cover_type="bottom").cover_type == "bottom"
    assert GeneratorConfig().cover_type is None  # omitted → generator default


def test_cover_type_rejects_unknown():
    with pytest.raises(ValidationError):
        GeneratorConfig(cover_type="sideways")


def test_cover_type_in_dump_when_set():
    dumped = GeneratorConfig(cover_type="top").model_dump(exclude_none=True)
    assert dumped == {"cover_type": "top"}
