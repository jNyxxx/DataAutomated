"""
Unit tests for the tolerant LLM-JSON parser (app/services/llm_json.py).

This is the regression guard for the systemic bug found during live E2E: gpt-4o
wraps JSON in ```json fences, so a direct json.loads failed at char 0 and
silently dropped NLP batches / agent classifications. No DB, no LLM — pure unit.
"""

from __future__ import annotations

import json

import pytest

from app.services.llm_json import loads_tolerant

_ARR = '[{"a": 1}, {"b": 2}]'
_OBJ = '{"recommendations": [{"r": 1}], "narrative": "ok"}'


class TestLoadsTolerant:
    def test_plain_array(self):
        assert loads_tolerant(_ARR) == [{"a": 1}, {"b": 2}]

    def test_plain_object(self):
        assert loads_tolerant(_OBJ)["narrative"] == "ok"

    def test_fenced_array(self):
        assert loads_tolerant(f"```json\n{_ARR}\n```") == [{"a": 1}, {"b": 2}]

    def test_fenced_object(self):
        """A fenced top-level object must come back as the object, not its inner array."""
        parsed = loads_tolerant(f"```json\n{_OBJ}\n```")
        assert isinstance(parsed, dict)
        assert parsed["recommendations"] == [{"r": 1}]

    def test_bare_fence_no_language_tag(self):
        assert loads_tolerant(f"```\n{_ARR}\n```") == [{"a": 1}, {"b": 2}]

    def test_prose_wrapped(self):
        assert loads_tolerant(f"Sure! Here is the data:\n{_ARR}\nHope that helps.") == [
            {"a": 1},
            {"b": 2},
        ]

    def test_empty_raises(self):
        with pytest.raises(json.JSONDecodeError):
            loads_tolerant("")

    def test_no_json_raises(self):
        with pytest.raises(json.JSONDecodeError):
            loads_tolerant("I could not complete that request.")
