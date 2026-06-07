"""
App-layer credential encryption (SR-04 / MULTI_TENANT_SECURITY.md §6 / CLAUDE.md §14).

Encrypts/decrypts per-client integration credentials stored in data_sources.credentials.
Plaintext credentials NEVER touch the database; only AES-256 ciphertext is persisted.

Design:
  - AES-256-GCM from the cryptography library.
  - Key derivation: PBKDF2HMAC-SHA256 derives a 32-byte AES key from the raw
    settings.credential_encryption_key string.
  - Versioned payload: {"v": "1", "alg": "AES-256-GCM", "nonce": "...", "ct": "..."}
    The "v" field enables future key rotation — add "v":"2" with a new key, decrypt
    old "v":"1" payloads with the old key during the rotation window.
  - Stored in the JSONB credentials column; callers are responsible for JSON
    serialisation/deserialisation of the outer dict.

Security rules (CLAUDE.md §14):
  - Never log plaintext credentials.
  - Never return raw ciphertext payloads to frontend callers.
  - Never store decrypted credentials at rest or pass them to the frontend.
  - Decryption happens only inside the MCP tool boundary at call time (P5).
"""

from __future__ import annotations

import base64
import json
import os
from typing import Optional

from cryptography.exceptions import InvalidTag
from cryptography.fernet import InvalidToken
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Domain-specific salt — stable across deployments.
# A static salt is acceptable here because we're deriving an *encryption key*,
# not hashing a password; the secret entropy comes from credential_encryption_key itself.
_SALT = b"dataautomated_cred_v1"

# Supported payload versions.  Decryption must handle all; encryption writes the latest.
_CURRENT_VERSION = "1"
_ALGORITHM = "AES-256-GCM"
_NONCE_BYTES = 12


def _derive_aes256_key(raw_key: str) -> bytes:
    """Derive a 32-byte AES-256 key from any string key."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_SALT,
        iterations=100_000,
    )
    return kdf.derive(raw_key.encode("utf-8"))


def _b64encode(raw: bytes) -> str:
    """Encode binary payload parts for JSONB storage."""
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _b64decode(value: str) -> bytes:
    """Decode binary payload parts from JSONB storage."""
    return base64.urlsafe_b64decode(value.encode("ascii"))


def encrypt_credentials(plaintext: dict, key: Optional[str] = None) -> dict:
    """
    Encrypt a credentials dict into a versioned JSONB payload.

    Args:
        plaintext: The credential dict to encrypt (e.g. {"api_key": "...", "token": "..."}).
        key: Encryption key string.  Defaults to settings.credential_encryption_key.

    Returns:
        A dict safe to store in the JSONB credentials column. The returned dict
        contains NO plaintext keys or values.
    """
    if key is None:
        from app.config import settings  # deferred to avoid import-time side effects
        key = settings.credential_encryption_key

    aesgcm = AESGCM(_derive_aes256_key(key))
    nonce = os.urandom(_NONCE_BYTES)
    plaintext_bytes = json.dumps(plaintext, separators=(",", ":")).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, plaintext_bytes, None)
    return {
        "v": _CURRENT_VERSION,
        "alg": _ALGORITHM,
        "nonce": _b64encode(nonce),
        "ct": _b64encode(ciphertext),
    }


def decrypt_credentials(payload: dict, key: Optional[str] = None) -> dict:
    """
    Decrypt a versioned JSONB payload back into a credentials dict.

    Args:
        payload: The dict from data_sources.credentials (must have "v" and "ct" keys).
        key: Encryption key string.  Defaults to settings.credential_encryption_key.

    Returns:
        The original plaintext credentials dict.

    Raises:
        ValueError: If the payload version is unsupported.
        cryptography.fernet.InvalidToken: If decryption fails (wrong key or tampered data).
    """
    if key is None:
        from app.config import settings
        key = settings.credential_encryption_key

    version = payload.get("v")
    if version != "1":
        raise ValueError(
            f"Unsupported credential payload version: {version!r}. "
            "Only version '1' is supported."
        )

    algorithm = payload.get("alg")
    if algorithm != _ALGORITHM:
        raise ValueError(
            f"Unsupported credential payload algorithm: {algorithm!r}. "
            f"Only {_ALGORITHM!r} is supported."
        )

    aesgcm = AESGCM(_derive_aes256_key(key))
    try:
        plaintext_bytes = aesgcm.decrypt(
            _b64decode(payload["nonce"]),
            _b64decode(payload["ct"]),
            None,
        )
    except (InvalidTag, KeyError, ValueError) as exc:
        raise InvalidToken from exc
    return json.loads(plaintext_bytes.decode("utf-8"))


__all__ = ["encrypt_credentials", "decrypt_credentials", "InvalidToken"]
