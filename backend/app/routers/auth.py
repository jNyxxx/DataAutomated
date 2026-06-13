"""
Authentication router (CLAUDE.md §10; prefix `/auth`, tag `Authentication`).

Implements D1 default: custom JWT (python-jose + passlib/bcrypt).
Provides get_current_user dependency imported by all other routers.

Auth/Clerk discrepancy is documented in CLAUDE.md §3 — do not change this
implementation without a maintainer ruling.

Audit scaffold (SR-05): structured login/auth-failure events logged to the
"dataautomated" logger.  P9 wires CloudWatch handlers on this logger name.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hmac import compare_digest
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext

import app.database as _db
from app.config import settings
from app.services.audit_service import record_audit

logger = logging.getLogger("dataautomated")

router = APIRouter(prefix="/auth", tags=["Authentication"])

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
# Variant for dual-auth routes (frontend JWT OR n8n webhook secret): missing
# Authorization header yields None instead of an immediate 401.
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


@dataclass
class CurrentUser:
    id: UUID
    client_id: UUID
    role: str


def _verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def _create_access_token(user_id: UUID, client_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": str(user_id),
        "client_id": str(client_id),
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


@router.post("/token", summary="Login and obtain a JWT bearer token")
async def login(form: OAuth2PasswordRequestForm = Depends()):
    """
    OAuth2 password flow.  Issues a JWT with `sub` (user id) and `client_id` claims.
    Login queries `users` via a raw pool checkout — no tenant context needed at this
    stage (login precedes knowing which client the user belongs to).
    """
    if _db.pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    async with _db.pool.acquire() as conn:
        row: asyncpg.Record | None = await conn.fetchrow(
            "SELECT id, client_id, hashed_password, role "
            "FROM users WHERE email = $1",
            form.username,
        )

    if row is None or not _verify_password(form.password, row["hashed_password"]):
        logger.info(
            '{"event": "auth.failure", "reason": "invalid_credentials", "username": "%s"}',
            form.username,
        )
        await record_audit(
            "auth.failure",
            actor=form.username,
            resource="POST /auth/token",
            detail={"reason": "invalid_credentials"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = _create_access_token(
        user_id=row["id"],
        client_id=row["client_id"],
    )
    logger.info(
        '{"event": "auth.login", "user_id": "%s", "client_id": "%s"}',
        row["id"],
        row["client_id"],
    )
    await record_audit(
        "auth.login",
        client_id=row["client_id"],
        actor=str(row["id"]),
        resource="POST /auth/token",
    )
    return {"access_token": token, "token_type": "bearer"}


async def get_current_user(token: str = Depends(_oauth2_scheme)) -> CurrentUser:
    """
    FastAPI dependency — resolves and validates the bearer token.

    Returns CurrentUser with id/client_id/role.  Rebinds identity to DB truth:
    - user must exist in the DB
    - DB client_id must match the JWT claim (forged/stale tenant claim → 401)
    - client must be active (deactivated tenant → 403)

    Raises 401 on any token failure — no information leakage about the cause.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        user_id: str | None = payload.get("sub")
        client_id_str: str | None = payload.get("client_id")
        if user_id is None or client_id_str is None:
            raise credentials_exc
    except JWTError:
        logger.info('{"event": "auth.failure", "reason": "invalid_token"}')
        raise credentials_exc

    if _db.pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    async with _db.pool.acquire() as conn:
        row: asyncpg.Record | None = await conn.fetchrow(
            """SELECT u.id, u.role, u.client_id, c.is_active
               FROM users u
               JOIN clients c ON c.id = u.client_id
               WHERE u.id = $1""",
            UUID(user_id),
        )

    if row is None:
        logger.info('{"event": "auth.failure", "reason": "user_not_found", "user_id": "%s"}', user_id)
        raise credentials_exc

    # Verify the JWT tenant claim matches the DB record (prevents forged client_id claims).
    if str(row["client_id"]) != client_id_str:
        logger.warning(
            '{"event": "auth.failure", "reason": "client_id_mismatch", "user_id": "%s"}',
            user_id,
        )
        raise credentials_exc

    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive.",
        )

    return CurrentUser(
        id=row["id"],
        client_id=UUID(client_id_str),
        role=row["role"],
    )


def require_role(*roles: str):
    """
    FastAPI dependency factory — enforces RBAC.

    Usage: Depends(require_role("admin")) or Depends(require_role("admin", "analyst"))

    Roles (CLAUDE.md §5 schema):
      admin   — full access including credential writes and settings changes
      analyst — can trigger agent/report runs; read-only on settings
      viewer  — read-only access only

    n8n server-to-server endpoints bypass RBAC (they use verify_n8n_secret instead).
    """
    async def _check(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions.",
            )
        return current_user
    return _check


@router.get("/me", summary="Return the current authenticated user's profile")
async def me(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "client_id": str(current_user.client_id),
        "role": current_user.role,
    }


# ---------------------------------------------------------------------------
# n8n server-to-server auth (CLAUDE.md §13 — webhook auth via N8N_WEBHOOK_SECRET)
# ---------------------------------------------------------------------------

def verify_n8n_secret(provided: str | None) -> None:
    """
    Validate the X-N8N-Webhook-Secret header value for n8n-facing routes.
    Raises 401 when the secret is unset server-side, missing, or wrong —
    n8n endpoints must never be anonymously reachable (CLAUDE.md §13/§14).
    """
    expected = settings.n8n_webhook_secret
    if not expected or provided is None or not compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized.",
        )


async def require_n8n_webhook_secret(
    x_n8n_webhook_secret: str | None = Header(default=None),
) -> None:
    """FastAPI dependency — extracts X-N8N-Webhook-Secret and validates it."""
    verify_n8n_secret(x_n8n_webhook_secret)


async def resolve_service_client(client_id_raw: object) -> UUID:
    """
    Resolve the explicit client_id an n8n workflow passes in the request body
    (§6: background/service work always operates under an explicit client_id).
    Only callable after verify_n8n_secret. 422 on malformed id, 404 on
    unknown/inactive client.
    """
    try:
        client_id = UUID(str(client_id_raw))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A valid client_id is required.",
        )

    if _db.pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    async with _db.pool.acquire() as conn:
        is_active = await conn.fetchval(
            "SELECT is_active FROM clients WHERE id = $1", client_id
        )
    if not is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown or inactive client.",
        )
    return client_id
