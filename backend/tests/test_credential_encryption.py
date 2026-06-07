"""
Phase 2 — Credential encryption unit tests (SR-04 / MULTI_TENANT_SECURITY §6).

Pure unit tests; no database required.  Verifies:
  - encrypt_credentials produces a versioned payload with no plaintext.
  - payload declares AES-256-GCM as the encryption algorithm.
  - decrypt_credentials is a perfect roundtrip for the same key.
  - Wrong key cannot decrypt (InvalidToken).
  - Unsupported version raises ValueError.
  - Payload JSON serialisation contains no plaintext.

The encryption key in tests uses a hardcoded test value — never the production key.
"""

import json

import pytest
from cryptography.fernet import InvalidToken

from app.services.credential_encryption import decrypt_credentials, encrypt_credentials

_TEST_KEY = "test_key_for_unit_tests_only"
_TEST_KEY_B = "a_different_test_key_for_isolation"

_SAMPLE_CREDENTIALS = {
    "api_key": "supersecret_api_key_12345",
    "token": "bearer_token_xyz",
    "workspace_id": "ws_abc",
}


class TestEncryptCredentials:
    def test_returns_versioned_payload(self):
        payload = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        assert "v" in payload, "Payload must have a version key"
        assert "alg" in payload, "Payload must have an algorithm marker"
        assert "nonce" in payload, "Payload must have a nonce"
        assert "ct" in payload, "Payload must have a ciphertext key"
        assert payload["v"] == "1", "Current version must be '1'"
        assert payload["alg"] == "AES-256-GCM", "Credentials must use AES-256-GCM"

    def test_ciphertext_is_string(self):
        payload = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        assert isinstance(payload["ct"], str), "Ciphertext must be a string"
        assert len(payload["ct"]) > 0, "Ciphertext must not be empty"

    def test_payload_excludes_all_plaintext(self):
        payload = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        payload_json = json.dumps(payload)
        for secret_value in _SAMPLE_CREDENTIALS.values():
            assert secret_value not in payload_json, (
                f"Plaintext value {secret_value!r} must not appear in the serialised payload"
            )
        for secret_key in _SAMPLE_CREDENTIALS.keys():
            # Key names must also not leak
            assert secret_key not in payload_json, (
                f"Plaintext key {secret_key!r} must not appear in the serialised payload"
            )

    def test_supersecret_excluded_by_name(self):
        """Explicit spot-check for the most sensitive value."""
        payload = encrypt_credentials({"api_key": "supersecret"}, key=_TEST_KEY)
        assert "supersecret" not in json.dumps(payload)


class TestDecryptCredentials:
    def test_roundtrip_same_key(self):
        payload = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        recovered = decrypt_credentials(payload, key=_TEST_KEY)
        assert recovered == _SAMPLE_CREDENTIALS, "Decrypted credentials must match original"

    def test_roundtrip_nested_dict(self):
        nested = {"outer": {"inner": "value"}, "list": [1, 2, 3]}
        payload = encrypt_credentials(nested, key=_TEST_KEY)
        assert decrypt_credentials(payload, key=_TEST_KEY) == nested

    def test_empty_dict_roundtrip(self):
        payload = encrypt_credentials({}, key=_TEST_KEY)
        assert decrypt_credentials(payload, key=_TEST_KEY) == {}

    def test_wrong_key_raises_invalid_token(self):
        payload = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        with pytest.raises(InvalidToken):
            decrypt_credentials(payload, key=_TEST_KEY_B)

    def test_tampered_ciphertext_raises_invalid_token(self):
        payload = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        tampered = {**payload, "ct": payload["ct"][:-5] + "XXXXX"}
        with pytest.raises(InvalidToken):
            decrypt_credentials(tampered, key=_TEST_KEY)

    def test_unsupported_version_raises_value_error(self):
        payload = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        bad_version = {**payload, "v": "99"}
        with pytest.raises(ValueError, match="Unsupported credential payload version"):
            decrypt_credentials(bad_version, key=_TEST_KEY)

    def test_missing_version_raises_value_error(self):
        with pytest.raises(ValueError):
            decrypt_credentials({"ct": "some_token"}, key=_TEST_KEY)

    def test_different_keys_same_plaintext_produce_different_ciphertexts(self):
        payload_a = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        payload_b = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY_B)
        assert payload_a["ct"] != payload_b["ct"], (
            "Different keys must produce different ciphertexts"
        )

    def test_same_plaintext_same_key_produces_different_ciphertexts(self):
        """AES-GCM includes a random nonce — two encryptions of the same data differ."""
        payload_a = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        payload_b = encrypt_credentials(_SAMPLE_CREDENTIALS, key=_TEST_KEY)
        assert payload_a["ct"] != payload_b["ct"], (
            "AES-GCM randomises each encryption; ciphertexts must differ"
        )
