import unittest

from src.database import Database


class DatabaseStorageTests(unittest.TestCase):
    def setUp(self):
        self.database = Database(":memory:")

    def tearDown(self):
        self.database.close()

    def test_recent_messages_are_returned_in_chronological_order(self):
        self.database.save_message("user", "Hello JARVIS")
        self.database.save_message("assistant", "Hello. How can I help?")
        messages = self.database.get_recent_messages(10)

        self.assertEqual([message["role"] for message in messages], ["user", "assistant"])
        self.assertEqual(messages[0]["content"], "Hello JARVIS")
        self.assertEqual(messages[1]["content"], "Hello. How can I help?")
        self.assertTrue(messages[0]["timestamp"])

    def test_recent_messages_limit_is_bounded(self):
        for index in range(5):
            self.database.save_message("user", f"message {index}")

        messages = self.database.get_recent_messages(2)
        self.assertEqual([message["content"] for message in messages], ["message 3", "message 4"])

    def test_invalid_roles_are_rejected(self):
        with self.assertRaises(ValueError):
            self.database.save_message("system", "This must not be stored.")

    def test_legacy_conversation_history_round_trip(self):
        self.database.save_conversation("Hello", "greeting", "Hello there")
        rows = self.database.get_history(1)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1:], ("Hello", "greeting", "Hello there"))


class HostedWebAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import web_server
        cls.web_server = web_server

    def setUp(self):
        self.original_database = self.web_server.database
        self.web_server.database = Database(":memory:")
        self.original_password = self.web_server.ACCESS_PASSWORD
        self.web_server.ACCESS_PASSWORD = "correct-test-password"
        self.web_server.app.config.update(
            TESTING=True,
            SESSION_COOKIE_SECURE=False,
        )
        self.client = self.web_server.app.test_client()
        self.origin = {"Origin": "http://localhost"}

    def tearDown(self):
        self.web_server.database.close()
        self.web_server.database = self.original_database
        self.web_server.ACCESS_PASSWORD = self.original_password

    def test_health_endpoint_is_public(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")

    def test_voice_and_history_apis_require_login(self):
        self.assertEqual(self.client.get("/api/history").status_code, 401)
        self.assertEqual(
            self.client.post("/api/live/session", json={"sdp": "example"}, headers=self.origin).status_code,
            401,
        )

    def test_login_rejects_cross_origin_requests(self):
        response = self.client.post(
            "/api/auth/login",
            json={"password": "correct-test-password"},
            headers={"Origin": "https://attacker.example"},
        )
        self.assertEqual(response.status_code, 403)

    def test_password_login_unlocks_history_api(self):
        login = self.client.post(
            "/api/auth/login",
            json={"password": "correct-test-password"},
            headers=self.origin,
        )
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.get_json()["authenticated"])

        response = self.client.get("/api/history")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["messages"], [])

    def test_wrong_password_is_rejected(self):
        response = self.client.post(
            "/api/auth/login",
            json={"password": "incorrect"},
            headers=self.origin,
        )
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
