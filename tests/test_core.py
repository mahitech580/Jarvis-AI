import unittest

from src.database import Database


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
