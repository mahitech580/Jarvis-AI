# JARVIS AI — Web-Only Architecture

JARVIS is a hosted browser application. Users do not run a local desktop assistant.

## 1. Hosted web request path

    Visitor browser (HTTPS)
          |
          | GET website assets
          v
    Render web service
          |
          +--> Flask serves index.html, CSS, JavaScript
          |
          +--> /api/auth/login validates shared password
          |        |
          |        +--> signed HTTP-only session cookie
          |
          +--> protected assistant API routes
                   |
                   +--> create GPT-Live WebRTC session
                   +--> execute approved backend tools
                   +--> save/read transcript text

The Flask app binds to 0.0.0.0 and the hosting platform's PORT. Render terminates public TLS and forwards HTTP traffic to the Python web process. Gunicorn runs one worker with multiple threads so the shared SQLite connection remains protected by the database lock.

## 2. Live browser voice path

The browser captures microphone audio and adds it as a WebRTC media track. A data channel named oai-events carries transcripts, session lifecycle events, and delegated tool events.

    Browser microphone and speaker
              |
              | SDP offer
              v
          Flask server
              |
              | POST /v1/live/sessions
              | server-only OPENAI_API_KEY
              | session configuration + WebRTC SDP
              v
          GPT-Live-1
              |
              | audio media track
              | JSON event data channel
              v
          Browser UI

Flask returns only the Live session ID and SDP answer. The browser applies the answer and waits for session.started. The permanent API key stays on the server.

## 3. Delegated task and tool flow

GPT-Live speaks to the user and delegates research or task work to a configured Responses model. Hosted web search is available to that backend. Custom application functions run through the Python allowlist.

    GPT-Live conversation
          |
          | Generate <|SpawnThinking|> when backend work is needed
          v
    Responses delegation
          |
          +---- hosted web_search
          |
          +---- custom function call
                    |
                    | response.event envelope
                    v
              Browser event handler
                    |
                    | POST /api/tools/execute
                    v
                Flask API
                    |
                    v
              src/tools.py allowlist
                    |
                    +---- current date/time
                    +---- bounded calculator
                    +---- allowlisted website link
                    +---- search link
                    +---- recent transcript history
                    |
                    v
              function_call_output
                    |
                    | response.item.create
                    | response.create
                    v
              Responses delegation
                    |
                    v
              GPT-Live speaks result

The browser collects custom function calls from nested response.output_item.done events. It executes the calls through Flask, returns each result with response.item.create, then requests continuation with response.create. This follows the GPT-Live Responses delegation event flow.

## 4. Components

| Component | Responsibility |
|---|---|
| web_server.py | Hosted Flask app, health endpoint, password sign-in, Live session creation, API authentication, tool dispatch, transcript endpoints |
| src/config.py | OpenAI models/key, access password, session secret, SQLite path, history flag |
| src/database.py | Thread-safe SQLite message persistence |
| src/tools.py | Function schemas and bounded tool handlers |
| web/index.html | Browser UI and sign-in view |
| web/script.js | Cookie sign-in, WebRTC lifecycle, Live events, transcript display, delegated tool result loop |
| web/style.css | Responsive web styling |
| render.yaml | Render web service, health check, start command, and environment variables |

## 5. Sign-in and API protection

- The landing page is public, but all assistant API endpoints require an authenticated signed session.
- The access password is configured on the hosting service as JARVIS_ACCESS_PASSWORD.
- The server compares passwords with constant-time comparison and rate-limits repeated failed attempts in memory.
- Successful sign-in sets a 12-hour HTTP-only, Secure, SameSite=Lax cookie.
- Browser POST requests must include a same-origin Origin header.
- The OpenAI API key is only read by Flask and is never returned to browser code.
- Health checks and the access-status/login routes are the only API paths available without signing in.

This is a shared-password, single-user-style gate, not individual user accounts or multi-tenant authorization.

## 6. Data and persistence

- Browser microphone audio is streamed to GPT-Live; the application does not save raw audio recordings.
- Transcript text is stored in SQLite when SAVE_CONVERSATION_HISTORY=true.
- get_recent_history returns only a bounded number of prior messages when the delegated backend asks for them.
- Historical user text is passed as tool output, never interpolated into trusted system/developer instructions.
- SAVE_CONVERSATION_HISTORY=false disables transcript writes and returns no stored history.
- The Render Blueprint sets SQLite to /tmp/jarvis.db. The Free service filesystem is ephemeral, so history can disappear after a spin-down, restart, or redeploy. Use a durable external database before relying on history.

## 7. Tool security

The assistant only receives explicitly registered functions:
- get_current_datetime
- calculate
- search_web
- open_website
- get_recent_history

Arithmetic uses a bounded AST visitor, not eval/exec. Website targets come from a fixed HTTPS allowlist. Search and website functions produce links for the user to open. There is no shell, arbitrary Python, unrestricted file system, or arbitrary URL fetch tool.

## 8. Deployment

Render uses:
- Runtime: Python
- Build: pip install -r requirements.txt
- Start: Gunicorn on 0.0.0.0:$PORT
- Health: /healthz
- Region: Singapore
- Plan: Free for initial hosted testing

The Free plan may spin down after inactivity and has no persistent disk. GPT-Live duration and delegated backend/tool usage are separate OpenAI API charges. A production launch needs a durable datastore, stronger identity/auth, durable rate limits, audit logging, monitoring, and explicit approval for consequential tools.
