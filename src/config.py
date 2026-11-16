import os
import secrets
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
ACCESS_PASSWORD = os.getenv("JARVIS_ACCESS_PASSWORD", "").strip()
SESSION_SECRET = os.getenv("JARVIS_SESSION_SECRET", "").strip() or secrets.token_urlsafe(48)

LIVE_MODEL = os.getenv("LIVE_MODEL", "gpt-live-1").strip()
LIVE_BACKEND_MODEL = os.getenv("LIVE_BACKEND_MODEL", "gpt-6-luna").strip()

DATABASE_PATH = os.getenv("DATABASE_PATH", "data/jarvis.db").strip()
SAVE_CONVERSATION_HISTORY = os.getenv("SAVE_CONVERSATION_HISTORY", "true").lower() in {
    "1", "true", "yes", "on"
}
