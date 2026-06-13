"""
Environment configuration via pydantic-settings (CLAUDE.md §4, §14).

No secrets are hardcoded — values come from the environment / .env locally and from
AWS Secrets Manager in production (SR-03). See `.env.example` for the full list.

AUD-02: two database connection strings are intentionally kept separate —
  - `database_url` : SQLAlchemy/Alembic dialect URL (postgresql+asyncpg://) — migrations/typing (D2/D3)
  - `database_dsn` : raw asyncpg DSN (postgresql://) — consumed by the asyncpg pool (P3)
Never pass the +asyncpg dialect URL to asyncpg.

Security: the boot guard below rejects placeholder / blank critical secrets when
APP_ENV=production so a misconfigured container fails loudly at startup rather than
silently serving with weak credentials (P2 security hardening).
"""

import logging
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("dataautomated")

# Values that indicate a secret was never replaced after templating.
_PLACEHOLDER_VALUES = frozenset({"", "replace_me", "change_me_locally", "replace_with_a_long_random_string",
                                  "replace_with_a_local_dev_key", "your-secret-here", "changeme"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # ---- Runtime environment ----
    app_env: str = "development"  # set APP_ENV=production in ECS / docker-compose.prod.yml

    # ---- Database (DATABASE_FOUNDATION.md §6) ----
    database_url: str = "postgresql+asyncpg://dataautomated:change_me_locally@db:5432/dataautomated"
    database_dsn: str = "postgresql://dataautomated:change_me_locally@db:5432/dataautomated"

    # ---- Auth (D1 default: custom JWT; MULTI_TENANT_SECURITY.md §5) ----
    jwt_secret_key: str = "replace_me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # ---- App-layer credential encryption (SR-04 / AUD-12) ----
    credential_encryption_key: str = "replace_me"

    # ---- OpenAI / LangSmith (used from P4/P7) ----
    openai_api_key: str = ""
    langchain_tracing_v2: bool = True
    langchain_api_key: str = ""
    langchain_project: str = "dataautomated-dev"

    # ---- Vendor webhook HMAC secrets ----
    # In production: blank → reject (fail-closed). In development: blank → warn + allow.
    zendesk_webhook_secret: str = ""
    typeform_webhook_secret: str = ""
    intercom_webhook_secret: str = ""

    # ---- n8n / delivery / AWS (P6/P9) ----
    n8n_webhook_url: str = ""  # e.g. http://n8n:5678 inside compose; blank disables dispatch
    n8n_webhook_secret: str = ""
    resend_api_key: str = ""
    aws_region: str = "us-east-1"
    s3_reports_bucket: str = "dataautomated-reports"
    # Local S3 substitute only (minio in docker-compose). Leave blank/unset in production —
    # the real AWS SDK credential chain is used when this is None.
    s3_endpoint_url: str | None = None

    # ---- HTTP security ----
    # Comma-separated allowed hosts for TrustedHostMiddleware (empty = allow all).
    allowed_hosts: list[str] = ["*"]
    # Max webhook/API body size in bytes (512 KB default).
    max_body_size_bytes: int = 524288

    # ---- CORS (CLAUDE.md §10) ----
    cors_origins: list[str] = [
        "http://localhost:3000",
        "https://app.dataautomated.io",
    ]

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        if self.app_env != "production":
            # Development: warn but allow placeholder values so local testing works.
            for name, value in [
                ("JWT_SECRET_KEY", self.jwt_secret_key),
                ("CREDENTIAL_ENCRYPTION_KEY", self.credential_encryption_key),
            ]:
                if value in _PLACEHOLDER_VALUES:
                    logger.warning(
                        "CONFIG WARNING: %s is a placeholder value. Set a real secret before deploying.",
                        name,
                    )
            return self

        # Production: refuse to boot with any placeholder/blank critical secret.
        errors: list[str] = []
        critical = {
            "JWT_SECRET_KEY": self.jwt_secret_key,
            "CREDENTIAL_ENCRYPTION_KEY": self.credential_encryption_key,
            "DATABASE_DSN": self.database_dsn,
        }
        for name, value in critical.items():
            if value in _PLACEHOLDER_VALUES:
                errors.append(f"{name} is a placeholder or blank — set a real secret in production.")

        if self.openai_api_key in _PLACEHOLDER_VALUES:
            errors.append("OPENAI_API_KEY is blank — agents will fail in production.")

        if errors:
            raise ValueError(
                "Production secret validation failed — refusing to start:\n" +
                "\n".join(f"  • {e}" for e in errors)
            )
        return self


settings = Settings()
