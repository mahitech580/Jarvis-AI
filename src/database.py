import sqlite3
from datetime import datetime
from pathlib import Path


class Database:

    def __init__(self, db_path="data/jarvis.db"):

        Path(db_path).parent.mkdir(
            parents=True,
            exist_ok=True
        )

        self.db_path = db_path

        self.connection = sqlite3.connect(
            self.db_path,
            check_same_thread=False
        )

        self.create_table()

    def create_table(self):

        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                user_text TEXT NOT NULL,
                intent TEXT NOT NULL,
                assistant_response TEXT NOT NULL
            )
        """)

        self.connection.commit()

    def save_conversation(
        self,
        user_text,
        intent,
        assistant_response
    ):

        timestamp = datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        self.connection.execute(
            """
            INSERT INTO conversations
            (timestamp, user_text, intent, assistant_response)
            VALUES (?, ?, ?, ?)
            """,
            (
                timestamp,
                user_text,
                intent,
                assistant_response
            )
        )

        self.connection.commit()

    def get_history(self, limit=10):

        cursor = self.connection.execute(
            """
            SELECT timestamp,
                   user_text,
                   intent,
                   assistant_response
            FROM conversations
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,)
        )

        return cursor.fetchall()

    def close(self):

        if self.connection:
            self.connection.close()
