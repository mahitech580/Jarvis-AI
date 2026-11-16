import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
AI_MODEL = os.getenv("AI_MODEL", "gpt-5.6").strip()

REALTIME_MODEL = os.getenv("REALTIME_MODEL", "gpt-realtime-2.1").strip()
REALTIME_VOICE = os.getenv("REALTIME_VOICE", "marin").strip()
# Input transcription is a separate service and may incur additional usage charges.
REALTIME_TRANSCRIPTION_MODEL = os.getenv(
    "REALTIME_TRANSCRIPTION_MODEL",
    "gpt-realtime-whisper",
).strip()

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base").strip()
DATABASE_PATH = os.getenv("DATABASE_PATH", "data/jarvis.db").strip()
SAVE_CONVERSATION_HISTORY = os.getenv("SAVE_CONVERSATION_HISTORY", "true").lower() in {
    "1", "true", "yes", "on"
}

TTS_RATE = int(os.getenv("TTS_RATE", "165"))
TTS_VOLUME = float(os.getenv("TTS_VOLUME", "1.0"))
