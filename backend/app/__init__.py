import os

from flask import Flask, send_from_directory
from flask_cors import CORS

from .db import init_mongo
from .routes.admin import admin_bp
from .routes.auth import auth_bp
from .routes.bitcoin_holdings import bitcoin_holdings_bp
from .routes.investments import investment_bp
from .services.seed import ensure_admin_user


def create_app() -> Flask:
    print("[BOOT] Starting Flask application factory")
    app = Flask(__name__)
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    app.config["MONGO_URI"] = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    app.config["MONGO_DB_NAME"] = os.getenv("MONGO_DB_NAME", "investment_tracker")
    app.config["PROFILE_PICTURE_UPLOAD_DIR"] = os.getenv(
        "PROFILE_PICTURE_UPLOAD_DIR",
        os.path.join(project_root, "uploads", "profile_pictures"),
    )
    os.environ["PROFILE_PICTURE_UPLOAD_DIR"] = app.config["PROFILE_PICTURE_UPLOAD_DIR"]

    cors_origins = os.getenv("CORS_ORIGINS", "*").strip()
    if cors_origins == "*":
        CORS(app)
        print("[BOOT] CORS enabled for all origins")
    else:
        origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
        CORS(app, resources={r"/api/*": {"origins": origins}})
        print(f"[BOOT] CORS restricted to origins: {origins}")

    init_mongo(app)
    ensure_admin_user()

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(investment_bp, url_prefix="/api/investments")
    app.register_blueprint(bitcoin_holdings_bp, url_prefix="/api/bitcoin-holdings")

    @app.get("/api/uploads/profile-pictures/<path:filename>")
    def get_profile_picture(filename: str):
        return send_from_directory(app.config["PROFILE_PICTURE_UPLOAD_DIR"], filename)

    @app.get("/api/health")
    def health_check():
        print("[HEALTH] Health check endpoint called")
        return {"status": "ok", "message": "Investment tracker backend is running"}, 200

    print("[BOOT] Flask app creation complete")
    return app
