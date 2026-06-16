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

import hashlib
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hmac import compare_digest
from typing import Optional
from uuid import UUID, uuid4

import asyncpg
from fastapi import APIRouter, Body, Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

import app.database as _db
from app.config import settings
from app.services.audit_service import record_audit
from app.services.email_service import send_invite_email

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
    # SR-01: jti + exp let /auth/logout add this exact token to the shared denylist.
    jti: str | None = None
    token_exp: int | None = None


def _verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def validate_password_strength(password: str) -> None:
    """
    Enforce a minimum-strength password wherever a password is set (seed script and
    any future user-provisioning endpoint). Pure apart from raising HTTPException(422).

    This is the policy half of P3-01; the HaveIBeenPwned breach check is deferred
    pending the Clerk-vs-custom-JWT ruling (CLAUDE.md §3) — see SECURITY_REMEDIATION.md.
    """
    problems: list[str] = []
    if len(password) < settings.password_min_length:
        problems.append(f"at least {settings.password_min_length} characters")
    if not re.search(r"[a-z]", password):
        problems.append("a lowercase letter")
    if not re.search(r"[A-Z]", password):
        problems.append("an uppercase letter")
    if not re.search(r"\d", password):
        problems.append("a digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        problems.append("a special character")
    if problems:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must contain " + ", ".join(problems) + ".",
        )


def _create_access_token(user_id: UUID, client_id: UUID, role: str = "viewer") -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": str(user_id),
        "client_id": str(client_id),
        "role": role,
        "jti": str(uuid4()),  # SR-01: unique token id for revocation
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


# ---------------------------------------------------------------------------
# Account lockout (P3-02) — shared state in the login_attempts table so the
# lock holds across all ECS tasks without Redis (PostgreSQL-backed per the
# launch-audit ruling).
# ---------------------------------------------------------------------------

async def _register_failed_login(identifier: str) -> None:
    """Increment the sliding-window failure counter; trip the lock at the threshold."""
    if _db.pool is None:
        return
    now = datetime.now(timezone.utc)
    window = timedelta(seconds=settings.login_lockout_window_seconds)
    async with _db.pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT failed_count, first_failed_at FROM login_attempts "
                "WHERE identifier = $1 FOR UPDATE",
                identifier,
            )
            if row is None:
                await conn.execute(
                    "INSERT INTO login_attempts "
                    "(identifier, failed_count, first_failed_at, last_failed_at) "
                    "VALUES ($1, 1, $2, $2) ON CONFLICT (identifier) DO NOTHING",
                    identifier, now,
                )
                return
            if row["first_failed_at"] is None or (now - row["first_failed_at"]) > window:
                new_count, first = 1, now  # stale window → start fresh
            else:
                new_count, first = row["failed_count"] + 1, row["first_failed_at"]
            locked_until = (
                now + timedelta(seconds=settings.login_lockout_duration_seconds)
                if new_count >= settings.login_max_failed_attempts
                else None
            )
            await conn.execute(
                "UPDATE login_attempts SET failed_count = $2, first_failed_at = $3, "
                "last_failed_at = $4, locked_until = $5 WHERE identifier = $1",
                identifier, new_count, first, now, locked_until,
            )


async def _clear_failed_logins(identifier: str) -> None:
    """Reset failure state on a successful login."""
    if _db.pool is None:
        return
    async with _db.pool.acquire() as conn:
        await conn.execute("DELETE FROM login_attempts WHERE identifier = $1", identifier)


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

    # Account-based lockout key (case-insensitive on email) — P3-02.
    identifier = form.username.strip().lower()
    now = datetime.now(timezone.utc)

    async with _db.pool.acquire() as conn:
        locked_until = await conn.fetchval(
            "SELECT locked_until FROM login_attempts WHERE identifier = $1",
            identifier,
        )
    if locked_until is not None and locked_until > now:
        retry_after = max(1, int((locked_until - now).total_seconds()))
        logger.warning('{"event": "auth.lockout", "username": "%s"}', identifier)
        await record_audit(
            "auth.lockout",
            actor=identifier,
            resource="POST /auth/token",
            detail={"locked_until": locked_until.isoformat()},
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Account temporarily locked due to repeated failed logins. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    async with _db.pool.acquire() as conn:
        row: asyncpg.Record | None = await conn.fetchrow(
            "SELECT id, client_id, hashed_password, role "
            "FROM users WHERE email = $1",
            form.username,
        )

    if row is None or not _verify_password(form.password, row["hashed_password"]):
        await _register_failed_login(identifier)
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

    # Successful login — clear the failure counter.
    await _clear_failed_logins(identifier)

    token = _create_access_token(
        user_id=row["id"],
        client_id=row["client_id"],
        role=row["role"],
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
        jti: str | None = payload.get("jti")
        token_exp: int | None = payload.get("exp")
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
        # SR-01: reject revoked tokens (shared denylist). Tokens issued before jti
        # existed simply have no jti and expire normally.
        if jti is not None:
            try:
                jti_uuid = UUID(jti)
            except (ValueError, TypeError):
                raise credentials_exc
            revoked = await conn.fetchval(
                "SELECT 1 FROM token_denylist WHERE jti = $1", jti_uuid
            )
            if revoked:
                logger.info('{"event": "auth.failure", "reason": "token_revoked"}')
                raise credentials_exc

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
        jti=jti,
        token_exp=token_exp,
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


@router.post("/logout", summary="Revoke the current access token (logout)")
async def logout(current_user: CurrentUser = Depends(get_current_user)):
    """
    SR-01: add the current token's jti to the shared denylist so it is rejected on
    every ECS instance for the remainder of its lifetime. The row is purgeable once
    `expires_at` passes (the token would have expired anyway). Idempotent.
    """
    if current_user.jti is None or current_user.token_exp is None:
        return {"status": "logged_out"}  # legacy token without jti — nothing to revoke
    if _db.pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )
    expires_at = datetime.fromtimestamp(current_user.token_exp, tz=timezone.utc)
    async with _db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO token_denylist (jti, user_id, client_id, reason, expires_at) "
            "VALUES ($1, $2, $3, 'logout', $4) ON CONFLICT (jti) DO NOTHING",
            UUID(current_user.jti),
            current_user.id,
            current_user.client_id,
            expires_at,
        )
    await record_audit(
        "auth.logout",
        client_id=current_user.client_id,
        actor=str(current_user.id),
        resource="POST /auth/logout",
    )
    return {"status": "logged_out"}


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


# ---------------------------------------------------------------------------
# Phase 1 — Invite-only onboarding & team management
# ---------------------------------------------------------------------------

_INVITE_TTL_DAYS = 7


def _hash_token(raw: str) -> str:
    """SHA-256 of the raw invite token — stored in DB; raw token travels only in URLs."""
    return hashlib.sha256(raw.encode()).hexdigest()


# ---- Pydantic request/response models ----

class CreateUserBody(BaseModel):
    email: str
    password: str
    role: str = "analyst"


class CreateInviteBody(BaseModel):
    email: str
    role: str = "analyst"


class AcceptInviteBody(BaseModel):
    password: str


class UpdateUserRoleBody(BaseModel):
    role: str


class UpdateClientBody(BaseModel):
    name: Optional[str] = None


# ---- Routes ----

@router.post("/users", summary="Admin: create a teammate directly")
async def create_user(
    body: CreateUserBody,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    Admin creates a teammate (direct provisioning, no invite token needed).
    The new user belongs to the same client as the admin.
    """
    validate_password_strength(body.password)
    if body.role not in ("admin", "analyst", "viewer"):
        raise HTTPException(status_code=422, detail="role must be admin, analyst, or viewer.")

    if _db.pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    hashed = _pwd_context.hash(body.password)
    async with _db.pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM users WHERE email = $1 AND client_id = $2",
            str(body.email), current_user.client_id,
        )
        if existing:
            raise HTTPException(status_code=409, detail="A user with that email already exists.")
        user_id = await conn.fetchval(
            "INSERT INTO users (client_id, email, hashed_password, role) "
            "VALUES ($1, $2, $3, $4) RETURNING id",
            current_user.client_id, str(body.email), hashed, body.role,
        )

    await record_audit(
        "user.create",
        client_id=current_user.client_id,
        actor=str(current_user.id),
        resource="POST /auth/users",
        detail={"new_user_id": str(user_id), "role": body.role},
    )
    return {"id": str(user_id), "email": str(body.email), "role": body.role}


@router.post("/invites", summary="Admin: issue an invite link")
async def create_invite(
    body: CreateInviteBody,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    Admin issues an invite. Returns the accept URL (and raw token in dev mode so
    the flow works without a verified Resend domain).
    """
    if body.role not in ("admin", "analyst", "viewer"):
        raise HTTPException(status_code=422, detail="role must be admin, analyst, or viewer.")

    if _db.pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=_INVITE_TTL_DAYS)

    # Fetch admin email for the invitation message
    async with _db.pool.acquire() as conn:
        admin_email = await conn.fetchval(
            "SELECT email FROM users WHERE id = $1", current_user.id
        )
        org_name = await conn.fetchval(
            "SELECT name FROM clients WHERE id = $1", current_user.client_id
        )
        await conn.execute(
            "INSERT INTO user_invites "
            "(client_id, email, role, token_hash, invited_by, expires_at) "
            "VALUES ($1, $2, $3, $4, $5, $6)",
            current_user.client_id, str(body.email), body.role,
            token_hash, current_user.id, expires_at,
        )

    accept_url = f"{settings.frontend_url}/invite/{raw_token}"

    # Try to send the email; fall back gracefully
    email_sent = await send_invite_email(
        to_email=str(body.email),
        invite_token=raw_token,
        invited_by_email=admin_email,
        org_name=org_name or "DataAutomated",
    )

    await record_audit(
        "invite.issue",
        client_id=current_user.client_id,
        actor=str(current_user.id),
        resource="POST /auth/invites",
        detail={"invitee": str(body.email), "role": body.role},
    )

    response: dict = {
        "status": "invited",
        "email": str(body.email),
        "role": body.role,
        "expires_at": expires_at.isoformat(),
        "email_sent": email_sent,
        # Always return the accept URL: if email failed the admin needs it to share manually.
        "accept_url": accept_url,
    }
    return response


@router.get("/invites/{token}", summary="Look up an invite (validate before accepting)")
async def get_invite(token: str):
    """
    Validate an invite token (used by the frontend accept page to show the
    invitee's email and check the token hasn't expired).
    """
    if _db.pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    token_hash = _hash_token(token)
    async with _db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT email, role, expires_at, accepted_at "
            "FROM user_invites WHERE token_hash = $1",
            token_hash,
        )

    if row is None:
        raise HTTPException(status_code=404, detail="Invite not found.")
    if row["accepted_at"] is not None:
        raise HTTPException(status_code=410, detail="Invite already accepted.")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invite has expired.")

    return {"email": row["email"], "role": row["role"], "expires_at": row["expires_at"].isoformat()}


@router.post("/invites/{token}/accept", summary="Accept an invite and create account")
async def accept_invite(token: str, body: AcceptInviteBody):
    """
    Invitee sets their password to complete account creation.
    Issues a JWT so they are immediately logged in after accepting.
    """
    validate_password_strength(body.password)

    if _db.pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    token_hash = _hash_token(token)
    async with _db.pool.acquire() as conn:
        async with conn.transaction():
            invite = await conn.fetchrow(
                "SELECT id, client_id, email, role, expires_at, accepted_at "
                "FROM user_invites WHERE token_hash = $1 FOR UPDATE",
                token_hash,
            )
            if invite is None:
                raise HTTPException(status_code=404, detail="Invite not found.")
            if invite["accepted_at"] is not None:
                raise HTTPException(status_code=410, detail="Invite already accepted.")
            if invite["expires_at"] < datetime.now(timezone.utc):
                raise HTTPException(status_code=410, detail="Invite has expired.")

            # Check for existing user with this email in this client
            existing = await conn.fetchval(
                "SELECT id FROM users WHERE email = $1 AND client_id = $2",
                invite["email"], invite["client_id"],
            )
            if existing:
                raise HTTPException(status_code=409, detail="An account with that email already exists.")

            hashed = _pwd_context.hash(body.password)
            user_id = await conn.fetchval(
                "INSERT INTO users (client_id, email, hashed_password, role) "
                "VALUES ($1, $2, $3, $4) RETURNING id",
                invite["client_id"], invite["email"], hashed, invite["role"],
            )
            await conn.execute(
                "UPDATE user_invites SET accepted_at = NOW() WHERE id = $1",
                invite["id"],
            )

    jwt_token = _create_access_token(user_id=user_id, client_id=invite["client_id"], role=invite["role"])

    await record_audit(
        "invite.accept",
        client_id=invite["client_id"],
        actor=str(user_id),
        resource=f"POST /auth/invites/{token[:8]}…/accept",
        detail={"email": invite["email"], "role": invite["role"]},
    )

    return {"access_token": jwt_token, "token_type": "bearer"}


@router.get("/users", summary="List all teammates in this tenant")
async def list_users(current_user: CurrentUser = Depends(require_role("admin", "analyst"))):
    """Returns all users belonging to the current client. Admin/analyst only."""
    if _db.pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    async with _db.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, email, role, created_at FROM users WHERE client_id = $1 ORDER BY created_at",
            current_user.client_id,
        )
    return {"users": [
        {"id": str(r["id"]), "email": r["email"], "role": r["role"],
         "created_at": r["created_at"].isoformat() if r["created_at"] else None}
        for r in rows
    ]}


@router.patch("/users/{user_id}", summary="Admin: change a teammate's role")
async def update_user_role(
    user_id: str,
    body: UpdateUserRoleBody,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    if body.role not in ("admin", "analyst", "viewer"):
        raise HTTPException(status_code=422, detail="role must be admin, analyst, or viewer.")

    if _db.pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid user_id.")

    async with _db.pool.acquire() as conn:
        updated = await conn.fetchval(
            "UPDATE users SET role = $1 WHERE id = $2 AND client_id = $3 RETURNING id",
            body.role, uid, current_user.client_id,
        )
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found.")

    await record_audit(
        "role.change",
        client_id=current_user.client_id,
        actor=str(current_user.id),
        resource=f"PATCH /auth/users/{user_id}",
        detail={"target_user": user_id, "new_role": body.role},
    )
    return {"id": user_id, "role": body.role}


@router.patch("/clients/me", summary="Admin: update organisation name")
async def update_client(
    body: UpdateClientBody,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    if _db.pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="name cannot be empty.")
        async with _db.pool.acquire() as conn:
            await conn.execute(
                "UPDATE clients SET name = $1 WHERE id = $2",
                name, current_user.client_id,
            )
        await record_audit(
            "client.update",
            client_id=current_user.client_id,
            actor=str(current_user.id),
            resource="PATCH /auth/clients/me",
            detail={"name": name},
        )

    async with _db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT name, email, plan FROM clients WHERE id = $1",
            current_user.client_id,
        )
    return {"name": row["name"], "email": row["email"], "plan": row["plan"]}
