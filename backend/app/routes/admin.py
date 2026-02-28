from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, request

from app.db import get_db
from app.services.auth import admin_required
from app.utils.serializers import serialize_document
from app.utils.security import hash_password
from app.utils.validators import validate_username_password

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/users")
@admin_required
def list_users():
    print("[ADMIN] Listing all users")
    db = get_db()
    users = list(db.users.find().sort("created_at", -1))
    serialized = []
    for user in users:
        user_data = serialize_document(user)
        user_data.pop("password_hash", None)
        serialized.append(user_data)
    return {"message": "Users fetched successfully", "users": serialized}, 200


@admin_bp.post("/users")
@admin_required
def create_user():
    payload = request.get_json(silent=True) or {}
    username = payload.get("username", "").strip()
    password = payload.get("password", "")
    role = payload.get("role", "user").strip() or "user"

    print(f"[ADMIN] Create user request for username='{username}', role='{role}'")

    is_valid, error_message = validate_username_password(username, password)
    if not is_valid:
        return {"message": error_message}, 400

    db = get_db()
    if db.users.find_one({"username": username}):
        print("[ADMIN] Cannot create user: username already exists")
        return {"message": "Username already exists"}, 409

    now = datetime.now(timezone.utc)
    insert_result = db.users.insert_one(
        {
            "username": username,
            "password_hash": hash_password(password),
            "role": role,
            "created_at": now,
            "updated_at": now,
        }
    )

    created_user = db.users.find_one({"_id": insert_result.inserted_id})
    response_user = serialize_document(created_user)
    response_user.pop("password_hash", None)
    print(f"[ADMIN] User '{username}' created")
    return {"message": "User created successfully", "user": response_user}, 201


@admin_bp.put("/users/<user_id>")
@admin_required
def update_user(user_id: str):
    payload = request.get_json(silent=True) or {}
    print(f"[ADMIN] Update request for user_id={user_id}")

    update_payload = {"updated_at": datetime.now(timezone.utc)}

    if "username" in payload:
        username = str(payload.get("username", "")).strip()
        if not username:
            return {"message": "Username cannot be empty"}, 400
        update_payload["username"] = username

    if "password" in payload:
        password = payload.get("password", "")
        if len(password) < 4:
            return {"message": "Password must be at least 4 characters"}, 400
        update_payload["password_hash"] = hash_password(password)

    if "role" in payload:
        role = str(payload.get("role", "")).strip() or "user"
        update_payload["role"] = role

    db = get_db()
    try:
        result = db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_payload})
    except Exception:
        return {"message": "Invalid user id"}, 400

    if result.matched_count == 0:
        return {"message": "User not found"}, 404

    updated_user = db.users.find_one({"_id": ObjectId(user_id)})
    response_user = serialize_document(updated_user)
    response_user.pop("password_hash", None)
    print(f"[ADMIN] User {user_id} updated")
    return {"message": "User updated successfully", "user": response_user}, 200


@admin_bp.delete("/users/<user_id>")
@admin_required
def delete_user(user_id: str):
    print(f"[ADMIN] Delete request for user_id={user_id}")
    db = get_db()

    try:
        target_user = db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        return {"message": "Invalid user id"}, 400

    if not target_user:
        return {"message": "User not found"}, 404

    if target_user.get("role") == "admin":
        return {"message": "Cannot delete admin user"}, 400

    db.users.delete_one({"_id": ObjectId(user_id)})
    db.investments.delete_many({"user_id": ObjectId(user_id)})
    db.sessions.delete_many({"user_id": ObjectId(user_id)})
    print(f"[ADMIN] User {user_id} and related data deleted")
    return {"message": "User deleted successfully"}, 200
