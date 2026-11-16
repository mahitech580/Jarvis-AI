import re
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
SCRIPT = (ROOT / "web" / "script.js").read_text(encoding="utf-8")
STYLES = (ROOT / "web" / "style.css").read_text(encoding="utf-8")
SERVER = (ROOT / "web_server.py").read_text(encoding="utf-8")


class _IdCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name == "id" and value:
                self.ids.append(value)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


class FrontendContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        parser = _IdCollector()
        parser.feed(HTML)
        parser.close()
        cls.html_ids = parser.ids

    def test_html_ids_are_unique(self):
        duplicates = sorted({
            element_id for element_id in self.html_ids
            if self.html_ids.count(element_id) > 1
        })
        self.assertEqual(duplicates, [], f"Duplicate HTML ids: {duplicates}")

    def test_every_javascript_dom_id_exists_in_html(self):
        referenced_ids = set(re.findall(
            r'getElementById\(["\']([^"\']+)["\']\)', SCRIPT
        ))
        missing = sorted(referenced_ids - set(self.html_ids))
        self.assertEqual(missing, [], f"JavaScript references missing HTML ids: {missing}")

    def test_frontend_api_calls_have_server_routes(self):
        client_routes = set(re.findall(
            r'fetch\(["\'](/api/[^"\']+)', SCRIPT
        ))
        server_routes = set(re.findall(
            r'@app\.route\(["\'](/api/[^"\']+)', SERVER
        ))
        missing = sorted(client_routes - server_routes)
        self.assertEqual(missing, [], f"Frontend calls missing API routes: {missing}")

    def test_typed_prompts_use_gpt_live_event_contract_in_order(self):
        start = SCRIPT.index("async function sendTypedMessage")
        end = SCRIPT.index("function exportVisibleTranscript", start)
        send_function = SCRIPT[start:end]

        item_event = send_function.index('type: "response.item.create"')
        response_event = send_function.index('type: "response.create"')
        self.assertLess(item_event, response_event)
        self.assertIn('type: "input_text"', send_function)
        self.assertIn('role: "user"', send_function)

    def test_tool_results_use_gpt_live_response_item_event(self):
        start = SCRIPT.index("async function runDelegatedTool")
        end = SCRIPT.index("async function finishDelegatedResponse", start)
        tool_function = SCRIPT[start:end]
        self.assertIn('type: "response.item.create"', tool_function)
        self.assertIn('type: "function_call_output"', tool_function)
        self.assertIn("call_id: item.call_id", tool_function)

    def test_live_session_waiter_cleans_callbacks_and_handles_early_rejection(self):
        start = SCRIPT.index("function waitForSessionStarted")
        end = SCRIPT.index("async function startConversation", start)
        waiter = SCRIPT[start:end]
        self.assertIn("sessionStartedResolve = null", waiter)
        self.assertIn("sessionStartedReject = null", waiter)
        self.assertIn("onFailed(new Error", waiter)
        self.assertIn("startedPromise.catch(() => {})", waiter)

    def test_live_api_client_event_family_is_used(self):
        for event_name in (
            "session.close",
            "session.commentary.append",
            "session.input_transcript.delta",
            "session.output_transcript.delta",
            "response.item.create",
            "response.create",
        ):
            with self.subTest(event_name=event_name):
                self.assertIn(event_name, SCRIPT)

    def test_responsive_and_reduced_motion_styles_exist(self):
        self.assertIn("@media (max-width: 760px)", STYLES)
        self.assertIn("@media (max-width: 480px)", STYLES)
        self.assertIn("@media (prefers-reduced-motion: reduce)", STYLES)

    def test_live_controls_and_text_fallback_are_present(self):
        for element_id in (
            "listenBtn",
            "micControlBtn",
            "speakerControlBtn",
            "messageForm",
            "messageInput",
            "sendMessageBtn",
            "exportTranscriptBtn",
            "settingsPanel",
            "micDeviceSelect",
            "shortcutDialog",
        ):
            with self.subTest(element_id=element_id):
                self.assertIn(element_id, self.html_ids)


if __name__ == "__main__":
    unittest.main()
