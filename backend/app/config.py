"""
Environment configuration via pydantic-settings (CLAUDE.md §4, §14).

No secrets are hardcoded — values come from the environment / .env locally and from
AWS Secrets Manager in production (SR-03). See `.env.example` for the full list.

AUD-02: two database connection strings are intentionally kept separate —
  - `database_url` : SQLAlchemy/Alembic dialect URL (postgresql+asyncpg://) — migrations/typing (D2/D3)
  - `database_dsn` : raw asyncpg DSN (postgresql://) — consumed by the asyncpg pool (P3)
Never pass the +asyncpg dialect URL to asyncpg.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

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

    # ---- n8n / delivery / AWS (P6/P9) ----
    n8n_webhook_url: str = ""  # e.g. http://n8n:5678 inside compose; blank disables dispatch
    n8n_webhook_secret: str = ""
    resend_api_key: str = ""
    aws_region: str = "us-east-1"
    s3_reports_bucket: str = "dataautomated-reports"
    # Local S3 substitute only (minio in docker-compose). Leave blank/unset in production —
    # the real AWS SDK credential chain is used when this is None.
    s3_endpoint_url: str | None = None

    # ---- CORS (CLAUDE.md §10) ----
    cors_origins: list[str] = [
        "http://localhost:3000",
        "https://app.dataautomated.io",
    ]


settings = Settings()
