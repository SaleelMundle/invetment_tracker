from __future__ import annotations

from typing import Optional

from pymongo import MongoClient
from pymongo.database import Database

mongo_client: Optional[MongoClient] = None
mongo_db: Optional[Database] = None


def init_mongo(app) -> None:
    """Initialize a singleton MongoDB client and database handle."""
    global mongo_client, mongo_db

    mongo_uri = app.config["MONGO_URI"]
    db_name = app.config["MONGO_DB_NAME"]

    print(f"[DB] Connecting to MongoDB at {mongo_uri}")
    mongo_client = MongoClient(mongo_uri)
    mongo_db = mongo_client[db_name]
    print(f"[DB] Connected to database: {db_name}")

    _ensure_indexes()


def get_db() -> Database:
    if mongo_db is None:
        raise RuntimeError("[DB] MongoDB is not initialized")
    return mongo_db


def _ensure_indexes() -> None:
    db = get_db()
    print("[DB] Ensuring database indexes")
    db.users.create_index("username", unique=True)
    db.users.create_index("role")
    db.investments.create_index([("user_id", 1), ("recorded_at", -1)])
    db.sessions.create_index("token", unique=True)
    db.sessions.create_index("expires_at", expireAfterSeconds=0)
    print("[DB] Index setup complete")
