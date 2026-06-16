"""
Secrets abstraction (CLAUDE.md §14, SR-03).

SECRETS_BACKEND=env  (default, local testing): reads from environment variables.
SECRETS_BACKEND=aws  (production): reads from AWS Secrets Manager.
    Coded but inert locally — activate by setting SECRETS_BACKEND=aws once
    LOCAL-ONLY mode is lifted and the ECS task role is configured.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


async def get_secret(name: str, default: str = "") -> str:
    """
    Retrieve a secret value by name from the configured backend.

    ``name`` is the environment variable name for the env backend, or the
    AWS Secrets Manager SecretId (e.g. ``prod/dataautomated/jwt_secret``)
    for the aws backend.
    """
    from app.config import settings  # late import avoids circular dependency

    if settings.secrets_backend == "aws":
        return await _get_aws_secret(name, settings.aws_region)
    return os.environ.get(name, default)


async def _get_aws_secret(name: str, region: str) -> str:
    """Fetch a plain-string secret from AWS Secrets Manager."""
    import asyncio

    import boto3
    from botocore.exceptions import ClientError

    def _fetch() -> str:
        client = boto3.client("secretsmanager", region_name=region)
        try:
            resp = client.get_secret_value(SecretId=name)
            return resp["SecretString"]
        except ClientError as exc:
            raise RuntimeError(
                f"AWS Secrets Manager: failed to retrieve '{name}': {exc}"
            ) from exc

    return await asyncio.get_event_loop().run_in_executor(None, _fetch)
