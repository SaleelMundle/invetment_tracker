from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from app.constants import SESSION_DURATION_HOURS


def hash_password(password: str) -> str:
    print("[SECURITY] Hashing password")
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    print("[SECURITY] Verifying password")
    return check_password_hash(password_hash, password)


def create_session_token() -> str:
    token = secrets.token_urlsafe(32)
    print("[SECURITY] Generated new session token")
    return token


def session_expiry() -> datetime:
    expiry = datetime.now(timezone.utc) + timedelta(hours=SESSION_DURATION_HOURS)
    print(f"[SECURITY] Session expiry set to {expiry.isoformat()}")
    return expiry
