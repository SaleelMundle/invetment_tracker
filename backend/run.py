import os

from dotenv import load_dotenv

from app import create_app


print("[BOOT] Loading environment variables from .env (if present)")
load_dotenv()

app = create_app()


if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    print(f"[BOOT] Running Flask server on {host}:{port} | debug={debug}")
    app.run(host=host, port=port, debug=debug)
