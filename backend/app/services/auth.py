from __future__ import annotations

from datetime import datetime, timezone
from functools import wraps

from bson import ObjectId
from flask import g, request

from app.db import get_db


def create_session(user_id: ObjectId) -> tuple[str, datetime]:
    from app.utils.security import create_session_token, session_expiry

    print(f"[AUTH] Creating session for user_id={user_id}")
    db = get_db()
    token = create_session_token()
    expires_at = session_expiry()
    db.sessions.insert_one(
        {
            "token": token,
            "user_id": user_id,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }
    )
    print("[AUTH] Session created successfully")
    return token, expires_at


def delete_session(token: str) -> None:
    print("[AUTH] Deleting session")
    db = get_db()
    db.sessions.delete_one({"token": token})


def _get_token_from_request() -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ", 1)[1].strip()


def _resolve_current_user():
    token = _get_token_from_request()
    if not token:
        print("[AUTH] No bearer token found in request")
        return None, None

    db = get_db()
    session = db.sessions.find_one({"token": token})
    if not session:
        print("[AUTH] Session token not found")
        return None, None

    user = db.users.find_one({"_id": session["user_id"]})
    if not user:
        print("[AUTH] User for session not found")
        return None, None

    return token, user


def login_required(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        token, user = _resolve_current_user()
        if not token or not user:
            return {"message": "Unauthorized"}, 401

        g.current_token = token
        g.current_user = user
        print(f"[AUTH] Authenticated user: {user.get('username')}")
        return view_func(*args, **kwargs)

    return wrapper


def admin_required(view_func):
    @wraps(view_func)
    @login_required
    def wrapper(*args, **kwargs):
        current_user = g.current_user
        if current_user.get("role") != "admin":
            print("[AUTH] Forbidden: non-admin attempted admin action")
            return {"message": "Forbidden. Admin access required."}, 403
        return view_func(*args, **kwargs)

    return wrapper
