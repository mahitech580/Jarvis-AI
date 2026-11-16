import unittest

from src.tools import _calculate, execute_tool


class CalculatorTests(unittest.TestCase):
    def test_arithmetic_and_voice_phrases(self):
        self.assertEqual(_calculate("(25 times 4) plus 10"), "110")
        self.assertEqual(_calculate("100 divided by 4"), "25")
        self.assertEqual(_calculate("8 % 3"), "2")

    def test_rejects_code_and_names(self):
        with self.assertRaises(ValueError):
            _calculate("__import__('os').system('whoami')")
        with self.assertRaises(ValueError):
            _calculate("open(1)")

    def test_rejects_unbounded_expression(self):
        with self.assertRaises(ValueError):
            _calculate("9" * 130)

    def test_website_allowlist(self):
        result = execute_tool("open_website", {"website": "github"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["browser_action"]["url"], "https://github.com")

        blocked = execute_tool("open_website", {"website": "https://example.com"})
        self.assertFalse(blocked["ok"])

    def test_search_link_encodes_query(self):
        result = execute_tool("search_web", {"query": "python voice assistant"})
        self.assertIn("python+voice+assistant", result["browser_action"]["url"])

    def test_unknown_tool_is_rejected(self):
        self.assertFalse(execute_tool("run_shell", {})["ok"])


if __name__ == "__main__":
    unittest.main()
