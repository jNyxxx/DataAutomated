"""
Tolerant JSON parsing for LLM responses (CLAUDE.md §7 — shared by the VoC NLP
service and all three agents).

Despite explicit "return ONLY JSON" instructions, gpt-4o frequently wraps output
in ```json ... ``` fences or adds incidental prose. A direct json.loads then fails
at char 0 (the leading backtick), which silently dropped whole NLP batches and
produced empty insights / classifications / recommendations.

loads_tolerant() returns the parsed JSON value of ANY type (list OR object — the
journey agent consumes {"recommendations": [...]}):
  1. json.loads the stripped text (the happy path for well-behaved responses);
  2. on failure, slice the OUTERMOST JSON structure — the bracket that opens first
     ([ or {) through its last matching close — and parse that. The earliest-
     opening bracket is the top-level structure, so a top-level object containing
     an inner array is recovered as the object, not the inner array.
Raises json.JSONDecodeError if no JSON can be recovered; callers log and skip.
"""

from __future__ import annotations

import json
from typing import Any


def loads_tolerant(raw: str) -> Any:
    """Parse an LLM response string into JSON, tolerating code fences / prose."""
    text = (raw or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        candidates = [
            (text.find(open_ch), close_ch)
            for open_ch, close_ch in (("[", "]"), ("{", "}"))
            if text.find(open_ch) != -1
        ]
        if candidates:
            start, close_ch = min(candidates)  # earliest-opening bracket = outermost
            end = text.rfind(close_ch)
            if end > start:
                return json.loads(text[start : end + 1])
        raise
