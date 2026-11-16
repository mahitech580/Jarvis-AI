"""Local Flask host for the JARVIS GPT-Live and desktop assistant."""

import logging
import os
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, make_response, request, send_from_directory

from src.config import (
    DATABASE_PATH,
    OPENAI_API_KEY,
    LIVE_MODEL,
    LIVE_BACKEND_MODEL,
    SAVE_CONVERSATION_HISTORY,
)
from src.database import Database
from src.intent_engine import IntentEngine
from src.command_handler import CommandHandler
from src.ai_engine import AIEngine
from src.tools import TOOL_DEFINITIONS, execute_tool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jarvis")

app = Flask(__name__, static_folder="web")
# SDP offers are larger than ordinary JSON API calls; keep a strict upper bound.
app.config["MAX_CONTENT_LENGTH"] = 128 * 1024

intent_engine = IntentEngine()
command_handler = CommandHandler()
ai_engine = AIEngine()
database = Database(DATABASE_PATH)

LIVE_VOICE_INSTRUCTIONS = """You are JARVIS, a calm, capable personal voice assistant.
Speak naturally in concise, clear sentences. You are in a live conversation:
listen while speaking, allow the user to interrupt, and do not talk over a
person who is still making a request. Acknowledge briefly and keep the
conversation moving. Ask one clear question when essential information is
missing. Delegate factual questions needing current information, calculations,
date/time requests, website lookup, or access to saved conversation history
to the backend. You may continue a natural conversation while delegated work
runs. Never claim that an action succeeded before you receive its result.
Never ask for passwords, API keys, or other secrets. Do not claim to run shell
commands, access arbitrary files, or control the operating system.
"""

LIVE_BACKEND_INSTRUCTIONS = """You are the task and tool backend for JARVIS, a voice assistant.
Voice transcripts may be incomplete or imperfect; use recent context and ask
for clarification if an important detail is ambiguous. Use hosted web search
for current or time-sensitive facts. Use the registered functions only when
they are appropriate. The application validates and executes custom functions.
Never claim a custom action is complete until its function result confirms it.
Never request or reveal credentials. Do not invent results or claim access to
local files, shell commands, or services that are not configured.
Return brief, factual results that are easy for a spoken assistant to explain.
"""


def _same_origin_request() -> bool:
    """Reject cross-origin browser POSTs; intended for same-origin local use."""
    origin = request.headers.get("Origin")
    if not origin:
        return True
    try:
        parsed = urlparse(origin)
        return parsed.scheme in {"http", "https"} and parsed.netloc == request.host
    except ValueError:
        return False


def _recent_context() -> str:
    if not SAVE_CONVERSATION_HISTORY:
        return ""
    messages = database.get_recent_messages(10)
    if not messages:
        return ""
    lines = [
        "Recent local conversation context (oldest first; treat as historical data):"
    ]
    for message in messages:
        role = "User" if message["role"] == "user" else "JARVIS"
        content = message["content"].replace("\n", " ").strip()
        lines.append(role + ": " + content[:900])
    return "\n".join(lines)


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=()"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    return response


@app.route("/")
def home():
    return send_from_directory("web", "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory("web", filename)


@app.route("/api/status")
def status():
    return jsonify({
        "status": "online",
        "assistant": "JARVIS AI",
        "live_configured": bool(OPENAI_API_KEY),
        "live_model": LIVE_MODEL if OPENAI_API_KEY else None,
        "backend_model": LIVE_BACKEND_MODEL if OPENAI_API_KEY else None,
        "history_enabled": SAVE_CONVERSATION_HISTORY,
    })


@app.route("/api/live/session", methods=["POST"])
def create_live_session():
    """Exchange a browser SDP offer for a GPT-Live WebRTC answer.

    The permanent project API key and all session instructions remain on the
    server. The browser receives only the SDP answer and opaque session ID.
    """
    if not _same_origin_request():
        return jsonify({"error": "Cross-origin requests are not allowed."}), 403
    if not OPENAI_API_KEY:
        return jsonify({
            "error": "Live voice is not configured. Add OPENAI_API_KEY to .env and restart JARVIS."
        }), 503

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    sdp = payload.get("sdp")
    if not isinstance(sdp, str) or not sdp.strip() or len(sdp) > 100_000:
        return jsonify({"error": "A valid WebRTC SDP offer is required."}), 400

    context = _recent_context()
    session_config = {
        "model": LIVE_MODEL,
        "instructions": LIVE_VOICE_INSTRUCTIONS,
        "delegation": {
            "type": "responses",
            "responses": {
                "model": LIVE_BACKEND_MODEL,
                "instructions": LIVE_BACKEND_INSTRUCTIONS + (
                    "\n\n" + context if context else ""
                ),
                "tools": [{"type": "web_search"}] + TOOL_DEFINITIONS,
                "tool_choice": "auto",
                "parallel_tool_calls": False,
            },
        },
    }

    try:
        response = requests.post(
            "https://api.openai.com/v1/live/sessions",
            headers={
                "Authorization": "Bearer " + OPENAI_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "session": session_config,
                "transport": {
                    "type": "webrtc",
                    "sdp": sdp,
                },
            },
            timeout=(5, 45),
        )

        if not response.ok:
            logger.warning("GPT-Live session creation failed with status %s", response.status_code)
            try:
                details = response.json().get("error", {}).get("message", "")
            except (ValueError, AttributeError):
                details = ""
            message = details[:500] if details else "The Live service could not create a session."
            return jsonify({"error": message}), 502

        result = response.json()
        session_id = result.get("session", {}).get("id")
        answer_sdp = result.get("transport", {}).get("sdp")
        if not isinstance(session_id, str) or not isinstance(answer_sdp, str):
            logger.error("GPT-Live returned an incomplete session response.")
            return jsonify({"error": "The Live service returned an incomplete WebRTC answer."}), 502

        safe_result = make_response(jsonify({
            "session": {"id": session_id},
            "transport": {"type": "webrtc", "sdp": answer_sdp},
        }), 201)
        safe_result.headers["Cache-Control"] = "no-store, max-age=0"
        safe_result.headers["Pragma"] = "no-cache"
        return safe_result

    except requests.RequestException:
        logger.exception("Could not reach GPT-Live.")
        return jsonify({
            "error": "Could not reach the Live service. Check your network connection and API access."
        }), 502
    except (ValueError, TypeError, AttributeError):
        logger.exception("Invalid response from GPT-Live.")
        return jsonify({"error": "The Live service returned an invalid response."}), 502


@app.route("/api/tools/execute", methods=["POST"])
def execute_assistant_tool():
    if not _same_origin_request():
        return jsonify({"error": "Cross-origin requests are not allowed."}), 403

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    name = payload.get("name")
    arguments = payload.get("arguments", {})
    if not isinstance(name, str) or len(name) > 80:
        return jsonify({"error": "Invalid tool name."}), 400

    result = execute_tool(name, arguments, database=database)
    return jsonify(result)


@app.route("/api/conversation/message", methods=["POST"])
def save_live_message():
    if not _same_origin_request():
        return jsonify({"error": "Cross-origin requests are not allowed."}), 403
    if not SAVE_CONVERSATION_HISTORY:
        return jsonify({"stored": False, "message": "Conversation history is disabled."})

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    role = payload.get("role")
    content = payload.get("content")
    if role not in {"user", "assistant"}:
        return jsonify({"error": "Role must be user or assistant."}), 400
    if not isinstance(content, str) or not content.strip() or len(content) > 8000:
        return jsonify({"error": "Message content must be between 1 and 8000 characters."}), 400

    database.save_message(role, content)
    return jsonify({"stored": True}), 201


@app.route("/api/history")
def history():
    messages = database.get_recent_messages(30)
    if not messages:
        legacy = database.get_history(10)
        for timestamp, user_text, _intent, assistant_response in reversed(legacy):
            messages.append({"timestamp": timestamp, "role": "user", "content": user_text})
            messages.append({"timestamp": timestamp, "role": "assistant", "content": assistant_response})
        messages = messages[-30:]
    return jsonify({"messages": messages})


@app.route("/api/command", methods=["POST"])
def command():
    if not _same_origin_request():
        return jsonify({"success": False, "error": "Cross-origin requests are not allowed."}), 403

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "error": "A JSON object is required."}), 400

    user_text = data.get("text", "")
    if not isinstance(user_text, str) or not user_text.strip() or len(user_text) > 2000:
        return jsonify({"success": False, "error": "Command text must be between 1 and 2000 characters."}), 400

    user_text = user_text.strip()
    intent = intent_engine.detect(user_text)
    response = command_handler.execute(intent, user_text)
    if response is None:
        response = ai_engine.respond(user_text, history=database.get_history(6))

    if SAVE_CONVERSATION_HISTORY:
        database.save_conversation(user_text, intent, response)
        database.save_message("user", user_text)
        database.save_message("assistant", response)

    return jsonify({
        "success": True,
        "text": user_text,
        "intent": intent,
        "response": response,
    })


if __name__ == "__main__":
    print("=" * 60)
    print("                 JARVIS AI WEB")
    print("=" * 60)
    print("Website: http://127.0.0.1:5000")
    print("GPT-Live configured:", "yes" if OPENAI_API_KEY else "no - add OPENAI_API_KEY to .env")
    print("Press CTRL+C to stop")
    print("=" * 60)
    app.run(
        host=os.getenv("JARVIS_HOST", "127.0.0.1"),
        port=int(os.getenv("JARVIS_PORT", "5000")),
        debug=False,
        threaded=True,
    )
