"""
seed_demo_user.py — Insert a demo client + admin user for local development.

Usage (from project root, after `docker-compose up -d`):
    python backend/app/tools/seed_demo_user.py

Credentials created:
    Email    : demo@dataautomated.io
    Password : Demo1234!
    Role     : admin
"""

from __future__ import annotations

import asyncio
import os
import sys

import asyncpg
from passlib.context import CryptContext

# ---------------------------------------------------------------------------
# Config — reads from env just like the app does, but falls back to the
# host-side DSN (localhost:5433 = Docker-mapped port).
# ---------------------------------------------------------------------------
DB_DSN = os.environ.get(
    "SEED_DATABASE_DSN",
    "postgresql://dataautomated:change_me_locally@localhost:5433/dataautomated",
)

DEMO_CLIENT_NAME = "DataAutomated Demo"
DEMO_CLIENT_EMAIL = "client@dataautomated.io"
DEMO_USER_EMAIL = "demo@dataautomated.io"
DEMO_PASSWORD = "Demo1234!"

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed() -> None:
    print(f"Connecting to: {DB_DSN.split('@')[-1]}")  # hide credentials in output
    try:
        conn = await asyncpg.connect(DB_DSN)
    except Exception as exc:
        print(f"\n❌  Could not connect to the database: {exc}")
        print("    Make sure Docker is running:  docker-compose up -d")
        sys.exit(1)

    try:
        # ---- Check if demo user already exists ----
        existing = await conn.fetchval(
            "SELECT id FROM users WHERE email = $1;", DEMO_USER_EMAIL
        )
        if existing:
            print(f"\n[OK] Demo user already exists -- no changes made.")
            print(f"\n     Email    : {DEMO_USER_EMAIL}")
            print(f"     Password : {DEMO_PASSWORD}")
            print(f"     Role     : admin\n")
            return

        # ---- Insert client (tenant) ----
        client_id = await conn.fetchval(
            """
            INSERT INTO clients (name, email)
            VALUES ($1, $2)
            ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
            RETURNING id;
            """,
            DEMO_CLIENT_NAME,
            DEMO_CLIENT_EMAIL,
        )

        # ---- Insert admin user ----
        hashed = pwd_ctx.hash(DEMO_PASSWORD)
        user_id = await conn.fetchval(
            """
            INSERT INTO users (client_id, email, hashed_password, role)
            VALUES ($1, $2, $3, 'admin')
            ON CONFLICT (email) DO UPDATE SET hashed_password = EXCLUDED.hashed_password
            RETURNING id;
            """,
            client_id,
            DEMO_USER_EMAIL,
            hashed,
        )

        print("\n[OK] Demo user seeded successfully!\n")
        print(f"     Email    : {DEMO_USER_EMAIL}")
        print(f"     Password : {DEMO_PASSWORD}")
        print(f"     Role     : admin")
        print(f"     User ID  : {user_id}")
        print(f"     Client ID: {client_id}\n")
        print("     Login at  : http://localhost:3000\n")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed())
