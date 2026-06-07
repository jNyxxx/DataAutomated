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
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext

import app.database as _db
from app.config import settings

logger = logging.getLogger("dataautomated")

router = APIRouter(prefix="/auth", tags=["Authentication"])

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


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
    return {"access_token": token, "token_type": "bearer"}


async def get_current_user(token: str = Depends(_oauth2_scheme)) -> CurrentUser:
    """
    FastAPI dependency — resolves and validates the bearer token.

    Imported by insights/signals/journeys routers.  Returns CurrentUser with:
    - id: from DB (UUID object, not str)
    - client_id: from JWT claim (per MULTI_TENANT_SECURITY §5 — "the tenant claim
      flows directly into the RLS session context")
    - role: from DB query (role is not carried in the JWT per spec)

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
            "SELECT id, role FROM users WHERE id = $1",
            UUID(user_id),
        )

    if row is None:
        logger.info('{"event": "auth.failure", "reason": "user_not_found", "user_id": "%s"}', user_id)
        raise credentials_exc

    return CurrentUser(
        id=row["id"],
        client_id=UUID(client_id_str),  # authoritative JWT claim per MULTI_TENANT_SECURITY §5
        role=row["role"],
    )


@router.get("/me", summary="Return the current authenticated user's profile")
async def me(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "client_id": str(current_user.client_id),
        "role": current_user.role,
    }
