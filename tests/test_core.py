import unittest

from src.database import Database
from src.intent_engine import IntentEngine


class DatabaseTests(unittest.TestCase):
    def test_recent_messages_are_returned_in_chronological_order(self):
        database = Database(":memory:")
        try:
            database.save_message("user", "Hello")
            database.save_message("assistant", "Hi there")
            messages = database.get_recent_messages(10)
            self.assertEqual([item["role"] for item in messages], ["user", "assistant"])
            self.assertEqual(messages[0]["content"], "Hello")
        finally:
            database.close()


class IntentEngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = IntentEngine()

    def test_greeting_does_not_match_inside_another_word(self):
        self.assertEqual(self.engine.detect("hi"), "GREETING")
        self.assertEqual(self.engine.detect("this is interesting"), "GENERAL_QUERY")

    def test_stop_only_matches_explicit_commands(self):
        self.assertEqual(self.engine.detect("stop listening"), "EXIT")
        self.assertEqual(self.engine.detect("please do not stop"), "GENERAL_QUERY")

    def test_common_desktop_intents(self):
        self.assertEqual(self.engine.detect("what time is it"), "GET_TIME")
        self.assertEqual(self.engine.detect("open github"), "OPEN_GITHUB")
        self.assertEqual(self.engine.detect("search for Python WebRTC"), "SEARCH_GOOGLE")


if __name__ == "__main__":
    unittest.main()
