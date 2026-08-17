from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from src.intent_engine import IntentEngine
from src.command_handler import CommandHandler
from src.ai_engine import AIEngine
from src.database import Database

app = Flask(
    __name__,
    static_folder="web"
)

CORS(app)

intent_engine = IntentEngine()
command_handler = CommandHandler()
ai_engine = AIEngine()
database = Database()


@app.route("/")
def home():

    return send_from_directory(
        "web",
        "index.html"
    )


@app.route("/<path:filename>")
def static_files(filename):

    return send_from_directory(
        "web",
        filename
    )


@app.route("/api/status")
def status():

    return jsonify({
        "status": "online",
        "assistant": "JARVIS AI"
    })


@app.route("/api/command", methods=["POST"])
def command():

    data = request.get_json()

    user_text = data.get("text", "").strip()

    if not user_text:

        return jsonify({
            "success": False,
            "error": "No command provided"
        }), 400

    intent = intent_engine.detect(
        user_text
    )

    response = command_handler.execute(
        intent,
        user_text
    )

    if response is None:

        response = ai_engine.respond(
            user_text
        )

    database.save_conversation(
        user_text,
        intent,
        response
    )

    return jsonify({
        "success": True,
        "text": user_text,
        "intent": intent,
        "response": response
    })


@app.route("/api/history")
def history():

    rows = database.get_history(10)

    conversations = []

    for row in rows:

        conversations.append({
            "timestamp": row[0],
            "user": row[1],
            "intent": row[2],
            "response": row[3]
        })

    return jsonify(
        conversations
    )


if __name__ == "__main__":

    print("=" * 60)
    print("                 JARVIS AI WEB")
    print("=" * 60)
    print("Website: http://127.0.0.1:5000")
    print("Press CTRL+C to stop")
    print("=" * 60)

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )
