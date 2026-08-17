import logging
from pathlib import Path

Path("data").mkdir(exist_ok=True)

logging.basicConfig(
    filename="data/jarvis.log",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger("Jarvis")
