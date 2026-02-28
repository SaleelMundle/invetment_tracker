from datetime import datetime, timezone

from app.constants import ADMIN_PASSWORD, ADMIN_USERNAME
from app.db import get_db
from app.utils.security import hash_password


def ensure_admin_user() -> None:
    print("[SEED] Checking if default admin user exists")
    db = get_db()
    existing_admin = db.users.find_one({"username": ADMIN_USERNAME})

    if existing_admin:
        print(f"[SEED] Admin user '{ADMIN_USERNAME}' already exists")
        return

    print(f"[SEED] Creating default admin user '{ADMIN_USERNAME}'")
    db.users.insert_one(
        {
            "username": ADMIN_USERNAME,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )
    print("[SEED] Default admin created successfully")
