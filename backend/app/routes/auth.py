from datetime import datetime, timezone

from flask import Blueprint, g, request

from app.db import get_db
from app.services.auth import create_session, delete_session, login_required
from app.utils.serializers import serialize_document
from app.utils.security import verify_password
from app.utils.validators import validate_username_password

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    username = payload.get("username", "").strip()
    password = payload.get("password", "")
    print(f"[AUTH] Login request received for username='{username}'")

    is_valid, error_message = validate_username_password(username, password)
    if not is_valid:
        print(f"[AUTH] Login validation failed: {error_message}")
        return {"message": error_message}, 400

    db = get_db()
    user = db.users.find_one({"username": username})
    if not user:
        print("[AUTH] Login failed: user not found")
        return {"message": "Invalid username or password"}, 401

    if not verify_password(user["password_hash"], password):
        print("[AUTH] Login failed: invalid password")
        return {"message": "Invalid username or password"}, 401

    token, expires_at = create_session(user["_id"])
    user_response = serialize_document(user)
    user_response.pop("password_hash", None)

    print(f"[AUTH] Login successful for '{username}'")
    return {
        "message": "Login successful",
        "token": token,
        "expires_at": expires_at.isoformat(),
        "user": user_response,
    }, 200


@auth_bp.post("/logout")
@login_required
def logout():
    print(f"[AUTH] Logout request for user={g.current_user.get('username')}")
    delete_session(g.current_token)
    return {"message": "Logged out successfully"}, 200


@auth_bp.get("/me")
@login_required
def me():
    print(f"[AUTH] Fetching current user profile for {g.current_user.get('username')}")
    user_data = serialize_document(g.current_user)
    user_data.pop("password_hash", None)
    return {
        "message": "Current user fetched successfully",
        "server_time": datetime.now(timezone.utc).isoformat(),
        "user": user_data,
    }, 200
