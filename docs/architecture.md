# JARVIS — Real-Time Web Architecture

JARVIS is a hosted browser voice assistant. Users open the HTTPS website, sign in, allow microphone access, and speak naturally. There is no desktop application or local microphone daemon.

## 1. Web application request path

    Browser
      |
      | HTTPS: website assets + API requests
      v
    Render web service (Flask + Gunicorn)
      |
      +--> serves the voice UI
      +--> validates shared-password login
      +--> issues signed HTTP-only session cookie
      +--> creates GPT-Live WebRTC session
      +--> runs allowlisted application tools
      +--> stores / retrieves transcript text
      |
      v
    Render PostgreSQL (private connection string)

The web service binds to `0.0.0.0:$PORT`. Render terminates public TLS. Same-region services use the PostgreSQL internal connection string injected into `DATABASE_URL`.

## 2. Real-time browser voice path

The browser captures microphone audio and adds it to an RTCPeerConnection. The app creates a data channel named `oai-events` for transcripts, lifecycle messages, and delegated tool events.

    Microphone + speaker
          |
          | WebRTC SDP offer (HTTP POST)
          v
    Flask session endpoint
          |
          | server-only OPENAI_API_KEY
          | Live session configuration
          v
    OpenAI GPT-Live
          |
          +--> WebRTC audio media
          +--> event data channel
                     |
                     v
                Browser UI

The backend exchanges the SDP offer and returns the SDP answer and session identifier. The permanent OpenAI API key never enters browser JavaScript.

The frontend displays the actual microphone signal with a Web Audio analyser. The animated waveform is not a mock input meter. The assistant state changes with session events and transcript deltas: connecting, listening, speaking, thinking, and error. Microphone and speaker mute controls act on the active media stream and remote audio element.

## 3. Delegated task and tool flow

GPT-Live handles the ongoing voice conversation. For research and task execution it can delegate to the configured Responses backend, which can use hosted web search and registered custom functions.

    GPT-Live conversation
          |
          | SpawnThinking / delegation
          v
    Responses backend
          |
          +--> hosted web_search
          |
          +--> custom function call
                    |
                    v
              Browser event handler
                    |
                    | POST /api/tools/execute
                    v
              Flask API + tool allowlist
                    |
                    v
              function_call_output
                    |
                    v
              Responses backend
                    |
                    v
              GPT-Live speaks the result

The browser collects function calls from nested response output events. The backend validates and executes the tool, and the browser returns function output events to the delegation flow.

## 4. Frontend responsibilities

| Component | Responsibility |
|---|---|
| `web/index.html` | Voice workspace, session indicators, microphone/speaker controls, transcript panel |
| `web/script.js` | WebRTC lifecycle, real-time transcript events, live state labels, microphone analyser, session timer, mute controls |
| `web/style.css` | Responsive dark interface and state-driven orb / waveform styling |

## 5. Backend responsibilities

| Component | Responsibility |
|---|---|
| `web_server.py` | Flask app, authentication, Live session negotiation, tool dispatch, transcript endpoints |
| `src/config.py` | API credentials, models, database URL and history configuration |
| `src/database.py` | PostgreSQL connection pool in hosted mode; SQLite for local development |
| `src/tools.py` | Registered function schemas and safe tool handlers |
| `render.yaml` | Render web service, managed PostgreSQL and environment wiring |

## 6. Database and persistence

- Hosted deployment uses Render PostgreSQL through the private `DATABASE_URL` environment variable.
- The app uses psycopg 3 and a bounded connection pool (maximum eight connections by default).
- Startup creates the `conversations` and `messages` tables and the recent-messages index if they do not exist.
- Local development and unit tests use SQLite when `DATABASE_URL` is empty.
- `SAVE_CONVERSATION_HISTORY=false` disables transcript writes and returns no stored transcript history.
- Raw microphone audio is streamed to the Live session and is not stored by this app.

## 7. Authentication and safety

- The landing page is public; assistant APIs require a signed authenticated session.
- The password is configured as `JARVIS_ACCESS_PASSWORD` on the hosting service.
- Successful sign-in sets a 12-hour HTTP-only, Secure, SameSite=Lax session cookie.
- Browser POST requests must include the same-origin Origin header.
- The permanent OpenAI API key stays server-side.
- The tool registry is allowlisted. Arithmetic uses a bounded AST; arbitrary shell or Python execution is not exposed.

The current authentication is a shared-password gate, not a multi-user identity system. Add per-user accounts, persistent rate limits, audit logs, and session isolation before opening the application to unrelated users.

## 8. Render deployment

The Blueprint defines:
- `jarvis-ai-web`: Python web service on the paid `0.5c-512mb` plan.
- `jarvis-db`: managed PostgreSQL on the paid `0.1c-256mb` plan.
- Both resources use Singapore region and auto-deploy from `main`.
- `DATABASE_URL` is wired from the database's internal connection string.

The minimum listed service prices total approximately US$13/month before extra usage and taxes. OpenAI voice and delegated model usage is billed separately. The Render Blueprint must be reviewed and approved before infrastructure is created.
