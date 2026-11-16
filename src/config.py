import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()

# GPT-Live handles the ongoing spoken conversation. The delegated Responses
# model handles longer reasoning and registered tools.
LIVE_MODEL = os.getenv("LIVE_MODEL", "gpt-live-1").strip()
LIVE_BACKEND_MODEL = os.getenv("LIVE_BACKEND_MODEL", "gpt-6-luna").strip()

# Used by the chained desktop assistant.
AI_MODEL = os.getenv("AI_MODEL", "gpt-6-luna").strip()
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base").strip()
DATABASE_PATH = os.getenv("DATABASE_PATH", "data/jarvis.db").strip()
SAVE_CONVERSATION_HISTORY = os.getenv("SAVE_CONVERSATION_HISTORY", "true").lower() in {
    "1", "true", "yes", "on"
}

TTS_RATE = int(os.getenv("TTS_RATE", "165"))
TTS_VOLUME = float(os.getenv("TTS_VOLUME", "1.0"))
