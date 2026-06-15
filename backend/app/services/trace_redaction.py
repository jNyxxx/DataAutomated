"""
LangSmith trace redaction (SR-03 / P3-05).

Resolution of the audit's "disable LangSmith in production" request: CLAUDE.md §2 makes
"LangSmith tracing on every agent run in every environment" a NON-NEGOTIABLE, and §16's
QA exit bar ("0 failed runs in 48h") depends on it. So tracing stays ON everywhere —
instead we strip PII from run inputs/outputs *before* they leave the process.

Mechanism: a LangSmith `Client` configured with `hide_inputs`/`hide_outputs` callables.
The three agents pass this client to their `@traceable` entry point; nested runs (the
ChatOpenAI calls that carry the PII-laden prompts) inherit the parent run tree's client,
so their inputs/outputs are redacted too.

Redaction is proportionate, not destructive: emails/phone numbers are masked and known
sensitive keys (credentials, tokens, passwords) are removed, while the run tree, timings,
errors and token counts that observability depends on are preserved.
"""

from __future__ import annotations

import functools
import logging
import re
from typing import Any

logger = logging.getLogger("dataautomated")

_MASK = "[REDACTED]"
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Conservative phone patterns — avoid matching ISO dates / scores: require a phone-shaped
# group layout or an international + prefix with 7+ digits.
_PHONE_RE = re.compile(r"(?<!\d)(\+\d[\d().\s-]{6,}\d|\d{3}[.\s-]\d{3}[.\s-]\d{4})(?!\d)")

# Keys whose VALUE is sensitive regardless of content — masked wholesale.
_SENSITIVE_KEYS = frozenset({
    "credentials", "credential", "api_key", "apikey", "openai_api_key",
    "hashed_password", "password", "authorization", "token", "access_token",
    "refresh_token", "secret", "jwt", "jwt_secret_key", "credential_encryption_key",
})


def redact_text(value: str) -> str:
    """Mask emails and phone numbers inside a free-text string."""
    value = _EMAIL_RE.sub("[REDACTED_EMAIL]", value)
    value = _PHONE_RE.sub("[REDACTED_PHONE]", value)
    return value


def redact_payload(data: Any) -> Any:
    """
    Recursively redact a run input/output payload.

    - dict: values under sensitive keys are masked; other values recursed.
    - list/tuple: each element recursed.
    - str: email/phone masked.
    - everything else (numbers, bools, None): passed through unchanged.
    """
    if isinstance(data, dict):
        out: dict[Any, Any] = {}
        for key, value in data.items():
            if isinstance(key, str) and key.lower() in _SENSITIVE_KEYS:
                out[key] = _MASK
            else:
                out[key] = redact_payload(value)
        return out
    if isinstance(data, (list, tuple)):
        return [redact_payload(item) for item in data]
    if isinstance(data, str):
        return redact_text(data)
    return data


@functools.lru_cache(maxsize=1)
def get_redacting_client():
    """
    Memoized LangSmith client (singleton) that redacts run inputs/outputs.

    Returned to the agents' `@traceable(client=...)`. Returns None if LangSmith is
    not importable, in which case `@traceable` falls back to its default client —
    observability wiring must never crash an agent run.
    """
    try:
        from langsmith import Client

        return Client(hide_inputs=redact_payload, hide_outputs=redact_payload)
    except Exception:  # noqa: BLE001 — defensive: never break agents on tracing setup
        logger.warning("LangSmith redacting client unavailable; tracing uses defaults.")
        return None
