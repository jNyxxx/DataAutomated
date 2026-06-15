"""SR-03 — LangSmith PII-redaction unit tests (pure; no DB / no network)."""

from __future__ import annotations

from app.services.trace_redaction import redact_payload, redact_text


def test_redacts_email_in_text():
    out = redact_text("contact me at jane.doe@example.com please")
    assert "jane.doe@example.com" not in out
    assert "[REDACTED_EMAIL]" in out


def test_masks_sensitive_keys_wholesale():
    red = redact_payload({"credentials": {"api_key": "sk-secret"}, "content": "ok"})
    assert red["credentials"] == "[REDACTED]"
    assert red["content"] == "ok"


def test_redacts_nested_email_in_payload():
    red = redact_payload({"inputs": {"feedback": "reach me: a@b.com"}, "n": 3})
    assert "a@b.com" not in red["inputs"]["feedback"]
    assert red["n"] == 3


def test_passes_through_non_strings():
    payload = {"score": 0.15, "flag": True, "none": None}
    assert redact_payload(payload) == payload
