import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any


class Database:
    """Thread-safe SQLite or pooled PostgreSQL storage for JARVIS history."""

    def __init__(self, database_url_or_path="data/jarvis.db", pool_size=8):
        self.database_url_or_path = str(database_url_or_path).strip()
        self.backend = "postgres" if self.database_url_or_path.startswith(
            ("postgres://", "postgresql://")
        ) else "sqlite"
        self._lock = threading.RLock()
        self.connection = None
        self.pool = None

        if self.backend == "postgres":
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool

            connection_string = self.database_url_or_path
            if connection_string.startswith("postgres://"):
                connection_string = "postgresql://" + connection_string[len("postgres://"):]

            self.pool = ConnectionPool(
                conninfo=connection_string,
                min_size=1,
                max_size=max(1, min(int(pool_size), 16)),
                kwargs={"row_factory": dict_row},
                open=True,
            )
            self.pool.wait(timeout=15)
        else:
            self.db_path = self.database_url_or_path
            if self.db_path != ":memory:":
                Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

            self.connection = sqlite3.connect(
                self.db_path,
                timeout=10,
                check_same_thread=False,
            )
            self.connection.row_factory = sqlite3.Row
            with self._lock:
                self.connection.execute("PRAGMA foreign_keys = ON")
                self.connection.execute("PRAGMA journal_mode = WAL")

        self.create_table()

    def create_table(self):
        if self.backend == "postgres":
            with self.pool.connection() as connection:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS conversations (
                        id BIGSERIAL PRIMARY KEY,
                        timestamp TEXT NOT NULL,
                        user_text TEXT NOT NULL,
                        intent TEXT NOT NULL,
                        assistant_response TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS messages (
                        id BIGSERIAL PRIMARY KEY,
                        timestamp TEXT NOT NULL,
                        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                        content TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(id DESC)"
                )
            return

        with self._lock:
            self.connection.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    user_text TEXT NOT NULL,
                    intent TEXT NOT NULL,
                    assistant_response TEXT NOT NULL
                )
                """
            )
            self.connection.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                    content TEXT NOT NULL
                )
                """
            )
            self.connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(id DESC)"
            )
            self.connection.commit()

    def save_conversation(self, user_text, intent, assistant_response):
        timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
        if self.backend == "postgres":
            with self.pool.connection() as connection:
                connection.execute(
                    """
                    INSERT INTO conversations
                        (timestamp, user_text, intent, assistant_response)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (timestamp, str(user_text), str(intent), str(assistant_response)),
                )
            return

        with self._lock:
            self.connection.execute(
                """
                INSERT INTO conversations
                    (timestamp, user_text, intent, assistant_response)
                VALUES (?, ?, ?, ?)
                """,
                (timestamp, str(user_text), str(intent), str(assistant_response)),
            )
            self.connection.commit()

    def get_history(self, limit=10):
        try:
            limit = max(1, min(int(limit), 50))
        except (TypeError, ValueError):
            limit = 10

        if self.backend == "postgres":
            with self.pool.connection() as connection:
                rows = connection.execute(
                    """
                    SELECT timestamp, user_text, intent, assistant_response
                    FROM conversations
                    ORDER BY id DESC
                    LIMIT %s
                    """,
                    (limit,),
                ).fetchall()
            return [
                (row["timestamp"], row["user_text"], row["intent"], row["assistant_response"])
                for row in rows
            ]

        with self._lock:
            cursor = self.connection.execute(
                """
                SELECT timestamp, user_text, intent, assistant_response
                FROM conversations
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            )
            return [tuple(row) for row in cursor.fetchall()]

    def save_message(self, role: str, content: str) -> None:
        if role not in {"user", "assistant"}:
            raise ValueError("Only user and assistant messages can be saved.")
        if not isinstance(content, str) or not content.strip():
            return
        if len(content) > 8000:
            content = content[:8000]

        timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
        if self.backend == "postgres":
            with self.pool.connection() as connection:
                connection.execute(
                    "INSERT INTO messages (timestamp, role, content) VALUES (%s, %s, %s)",
                    (timestamp, role, content.strip()),
                )
            return

        with self._lock:
            self.connection.execute(
                "INSERT INTO messages (timestamp, role, content) VALUES (?, ?, ?)",
                (timestamp, role, content.strip()),
            )
            self.connection.commit()

    def get_recent_messages(self, limit=12) -> list[dict[str, Any]]:
        try:
            limit = max(1, min(int(limit), 30))
        except (TypeError, ValueError):
            limit = 12

        if self.backend == "postgres":
            with self.pool.connection() as connection:
                rows = connection.execute(
                    """
                    SELECT timestamp, role, content
                    FROM messages
                    ORDER BY id DESC
                    LIMIT %s
                    """,
                    (limit,),
                ).fetchall()
        else:
            with self._lock:
                cursor = self.connection.execute(
                    """
                    SELECT timestamp, role, content
                    FROM messages
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (limit,),
                )
                rows = cursor.fetchall()

        messages = [
            {"timestamp": row["timestamp"], "role": row["role"], "content": row["content"]}
            for row in rows
        ]
        return list(reversed(messages))

    def close(self):
        if self.backend == "postgres":
            if self.pool is not None:
                self.pool.close()
                self.pool = None
            return

        with self._lock:
            if self.connection is not None:
                self.connection.close()
                self.connection = None
