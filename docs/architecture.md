# JARVIS AI Architecture

JARVIS has two voice paths that share the Python backend and local SQLite storage.

## 1. Browser live voice path

The browser uses a persistent WebRTC connection instead of uploading a completed recording after every turn.

    User and microphone
           |
           | Live audio track
           v
      Browser WebRTC peer <================> OpenAI Realtime API
           |                                      |
           | JSON events / function calls         | generated speech audio
           v                                      |
      Flask tool endpoint                         |
           |                                      |
      Python allowlisted tools                    |
           |                                      |
           +---------------> SQLite <-------------+
           ^
           |
    Flask mints short-lived client secret
           |
      OpenAI client-secrets endpoint

### Session lifecycle

1. The browser asks Flask for a short-lived Realtime client secret.
2. Flask authenticates to OpenAI using the server-only OPENAI_API_KEY.
3. The browser captures microphone audio and negotiates a WebRTC session using the ephemeral secret.
4. Realtime handles speech understanding, response generation, voice output, voice activity detection, and interruption behavior.
5. The browser receives transcript and lifecycle events on the WebRTC data channel.
6. When the model requests a tool, the browser sends the named function and arguments to Flask. The Python tool registry validates the request and runs only explicitly supported functions.
7. Tool output is returned to the model as a function_call_output conversation item; the model then continues the spoken response.
8. User and assistant transcript text is optionally saved in SQLite and a small recent-history window is added to the next session's instructions.

### Browser endpoints

- POST /api/realtime/token: creates a Realtime client secret; response is Cache-Control: no-store.
- POST /api/tools/execute: validates and runs an allowlisted tool.
- POST /api/conversation/message: stores transcript text when history is enabled.
- GET /api/history: retrieves recent messages.

## 2. Desktop voice path

The desktop implementation is a chained pipeline. It remains useful as a local fallback, but it is not a continuous full-duplex stream.

    Desktop microphone
           |
    sounddevice capture
           |
    Temporary WAV file
           |
    Local Whisper transcription
           |
       Intent engine
           |
      Known command?
        /       \
      Yes        No
       |          |
    Command     OpenAI Responses API
    handler     or offline FAQ
       \          /
        Response text
              |
           SQLite
              |
           pyttsx3
              |
        Desktop speaker

The desktop path currently captures a bounded six-second audio segment per listen cycle. This is intentionally separate from the browser's realtime WebRTC path.

## 3. Shared components

| Component | Responsibility |
|---|---|
| src/config.py | Loads API, model, audio, database, and history settings from environment variables |
| src/database.py | Thread-safe SQLite access; legacy paired turns and newer role/content messages |
| src/tools.py | JSON tool schemas, restricted arithmetic, fixed website allowlist, current time, search links, history lookup |
| src/ai_engine.py | Desktop Responses API requests with local FAQ fallback |
| src/intent_engine.py | Deterministic routing for desktop commands |
| src/command_handler.py | Desktop time/date, websites, search, and arithmetic commands |
| web_server.py | Serves the browser UI, creates ephemeral credentials, validates and dispatches tools, stores transcript text |

## 4. Tool security model

The model does not receive access to Python execution, shell commands, arbitrary file paths, or arbitrary URLs.

Available functions:
- get_current_datetime
- calculate
- search_web
- open_website (fixed allowlist only)
- get_recent_history

Arithmetic is evaluated using a restricted Python AST visitor, with limits on expression length, AST size, and result magnitude. Website opening returns an HTTPS link for the user to click; it does not execute a server-side browser action.

## 5. Memory model

- Browser Realtime audio is understood by the voice model.
- An optional transcription service produces user-side transcript events for captions and persistence.
- Completed assistant audio transcripts are saved as assistant messages.
- Text is stored in the local ignored database file data/jarvis.db.
- At session creation, the latest local messages are added to the session instructions as context.
- Set SAVE_CONVERSATION_HISTORY=false to disable persistence and cross-session context.
- Set REALTIME_TRANSCRIPTION_MODEL to an empty value to disable the separately billed user-input transcription service.

This is a lightweight recent-history memory, not a vector database or long-term semantic memory system.

## 6. Local security boundary

The Flask server binds to localhost by default. It does not enable wildcard CORS, checks same-origin POST requests, caps request bodies, and applies response security headers. The permanent OpenAI API key remains server-side; only a short-lived client secret is returned to the browser.

This is not yet a multi-user production deployment. Public hosting requires authentication, per-user data separation, rate limiting, HTTPS, secret management, monitoring, and a permission/approval flow for high-impact tools.
