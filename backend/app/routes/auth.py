import os
from datetime import datetime, timezone
from uuid import uuid4

from flask import Blueprint, current_app, g, request
from werkzeug.utils import secure_filename

from app.db import get_db
from app.services.auth import create_session, delete_session, login_required
from app.utils.serializers import serialize_document
from app.utils.security import verify_password
from app.utils.validators import validate_username_password

auth_bp = Blueprint("auth", __name__)

ALLOWED_PROFILE_PICTURE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}


def _build_profile_picture_url(filename: str | None) -> str | None:
    if not filename:
        return None
    return f"/api/uploads/profile-pictures/{filename}"


def _serialize_user_response(user: dict) -> dict:
    user_response = serialize_document(user)
    user_response.pop("password_hash", None)
    user_response["profile_picture_url"] = _build_profile_picture_url(
        user_response.get("profile_picture_filename")
    )
    return user_response


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
    user_response = _serialize_user_response(user)

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
    user_data = _serialize_user_response(g.current_user)
    return {
        "message": "Current user fetched successfully",
        "server_time": datetime.now(timezone.utc).isoformat(),
        "user": user_data,
    }, 200


@auth_bp.post("/profile-picture")
@login_required
def upload_profile_picture():
    uploaded_file = request.files.get("profile_picture")
    if not uploaded_file or not uploaded_file.filename:
        return {"message": "Profile picture file is required"}, 400

    extension = uploaded_file.filename.rsplit(".", 1)[-1].lower() if "." in uploaded_file.filename else ""
    if extension not in ALLOWED_PROFILE_PICTURE_EXTENSIONS:
        return {
            "message": "Invalid file type. Allowed: png, jpg, jpeg, gif, webp"
        }, 400

    if uploaded_file.mimetype and not uploaded_file.mimetype.startswith("image/"):
        return {"message": "Only image files are allowed"}, 400

    db = get_db()
    current_user = g.current_user

    upload_dir = current_app.config.get("PROFILE_PICTURE_UPLOAD_DIR")
    if not upload_dir:
        return {"message": "Profile picture upload directory is not configured"}, 500

    os.makedirs(upload_dir, exist_ok=True)
    safe_stem = secure_filename(current_user.get("username") or "user")
    filename = f"{safe_stem}_{uuid4().hex}.{extension}"
    file_path = os.path.join(upload_dir, filename)
    uploaded_file.save(file_path)

    previous_filename = current_user.get("profile_picture_filename")
    db.users.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "profile_picture_filename": filename,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )

    if previous_filename and previous_filename != filename:
        previous_path = os.path.join(upload_dir, previous_filename)
        if os.path.isfile(previous_path):
            try:
                os.remove(previous_path)
            except OSError:
                print(f"[AUTH] Could not delete old profile picture: {previous_path}")

    updated_user = db.users.find_one({"_id": current_user["_id"]})
    response_user = _serialize_user_response(updated_user)

    print(f"[AUTH] Profile picture updated for user={current_user.get('username')}")
    return {
        "message": "Profile picture updated successfully",
        "user": response_user,
    }, 200
