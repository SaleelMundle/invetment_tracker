import os

from flask import Flask
from flask_cors import CORS

from .db import init_mongo
from .routes.admin import admin_bp
from .routes.auth import auth_bp
from .routes.investments import investment_bp
from .services.seed import ensure_admin_user


def create_app() -> Flask:
    print("[BOOT] Starting Flask application factory")
    app = Flask(__name__)

    app.config["MONGO_URI"] = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    app.config["MONGO_DB_NAME"] = os.getenv("MONGO_DB_NAME", "investment_tracker")

    CORS(app)
    print("[BOOT] CORS enabled for all origins in development mode")

    init_mongo(app)
    ensure_admin_user()

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(investment_bp, url_prefix="/api/investments")

    @app.get("/api/health")
    def health_check():
        print("[HEALTH] Health check endpoint called")
        return {"status": "ok", "message": "Investment tracker backend is running"}, 200

    print("[BOOT] Flask app creation complete")
    return app
