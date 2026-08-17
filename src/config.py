import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "gpt-5.6")

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")

DATABASE_PATH = os.getenv(
    "DATABASE_PATH",
    "data/jarvis.db"
)

TTS_RATE = int(os.getenv("TTS_RATE", "165"))
TTS_VOLUME = float(os.getenv("TTS_VOLUME", "1.0"))
