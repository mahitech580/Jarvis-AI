# JARVIS — Real-Time Web Voice Assistant

JARVIS is a browser-based, full-duplex AI voice assistant. Open the hosted website, sign in, allow microphone access, and speak naturally. The browser connects to GPT-Live over WebRTC; a trusted Python service protects credentials, creates sessions, and runs approved tools.

There is no desktop application or local microphone daemon. GitHub stores the source code; the complete application runs as a hosted web service.

## Live features

- **Natural real-time voice:** Browser microphone and speaker streams connect to GPT-Live using WebRTC.
- **Full-duplex interaction:** Speak naturally while JARVIS is responding; the voice session supports interruption.
- **Live transcript:** User and assistant transcript updates appear in the conversation panel as events arrive.
- **Microphone activity display:** The waveform is driven by the actual microphone stream using the Web Audio analyser.
- **Session controls:** Start/end session, mute/unmute microphone, mute/unmute speaker, and session timer.
- **Delegated reasoning:** A Responses backend handles web research and approved function calls while the live voice conversation remains active.
- **Approved tools:** Current date/time, bounded arithmetic, fixed website allowlist, search links, and recent transcript history.
- **Persistent transcript storage:** SQLite is used for local development; managed PostgreSQL is used in hosted deployment.
- **Protected access:** A shared access password protects the assistant APIs and billable voice-session creation.

## Architecture

```
Browser (HTTPS)
  ├── Microphone + speaker
  ├── Live waveform + transcript
  └── WebRTC audio / event data channel
             |
             v
Render Web Service (Flask + Gunicorn)
  ├── Shared-password sign-in + signed session cookie
  ├── GPT-Live session negotiation
  ├── Approved tool execution
  ├── Transcript API
  └── PostgreSQL connection pool
       |                   |
       v                   v
OpenAI GPT-Live       Render PostgreSQL
  └── Responses backend
       ├── hosted web_search
       └── JARVIS approved tools
```

The permanent OpenAI API key stays on the server. The server exchanges the browser's WebRTC SDP offer for a Live session answer. The browser then streams audio directly to the Live session over WebRTC. See [docs/architecture.md](docs/architecture.md).

## Deploy the complete application on Render

The repository includes a Render Blueprint at [render.yaml](render.yaml). It defines two resources in Singapore:

| Resource | Plan | Purpose |
|---|---|---|
| `jarvis-ai-web` | `0.5c-512mb` | Always-on Flask web service |
| `jarvis-db` | `0.1c-256mb` | Managed PostgreSQL transcript storage |

The configured minimum paid plans are approximately **US$7/month for the web service** and **US$6/month for PostgreSQL** (about **US$13/month total**, before any applicable taxes, extra bandwidth, or other usage). OpenAI API usage is billed separately. Verify current prices before applying the Blueprint.

1. Confirm the Render workspace you want to use.
2. Open the Blueprint setup: https://dashboard.render.com/blueprint/new?repo=https%3A%2F%2Fgithub.com%2Fmahitech580%2FJarvis-AI
3. Connect GitHub and select `mahitech580/Jarvis-AI`.
4. Review the proposed web service and PostgreSQL database, including the paid plans and region.
5. Supply `OPENAI_API_KEY` and `JARVIS_ACCESS_PASSWORD` through Render's secret fields or the service Environment page. Do not put them in GitHub or browser JavaScript.
6. Render generates `JARVIS_SESSION_SECRET` and injects the private PostgreSQL connection string into `DATABASE_URL`.
7. Apply the reviewed Blueprint. Open the generated HTTPS `onrender.com` URL after deployment and sign in.
8. Allow microphone access and select **Start live conversation**.

Creating or planning a Blueprint does not deploy it until you review and approve the infrastructure sync. Do not approve any plan until you are comfortable with the recurring charges.

### Why this uses paid Render resources

Render Free web services can spin down after inactivity, and Free PostgreSQL databases expire after 30 days and do not include backups. Those limitations are unsuitable for a durable, always-on assistant with persistent conversation history. See [Render's Free plan limitations](https://render.com/docs/free) and [current pricing](https://render.com/pricing).

## Configuration

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | Server-side OpenAI project key with access to the configured Live and Responses models |
| `JARVIS_ACCESS_PASSWORD` | Yes | Private shared access password |
| `JARVIS_SESSION_SECRET` | Production | Signs HTTP-only session cookies; Render generates it in the Blueprint |
| `LIVE_MODEL` | No | Live voice model; defaults to `gpt-live-1` |
| `LIVE_BACKEND_MODEL` | No | Delegated Responses model; defaults to `gpt-6-luna` |
| `DATABASE_URL` | Hosted | Render injects the PostgreSQL connection string automatically |
| `DATABASE_PATH` | Local fallback | SQLite path when `DATABASE_URL` is empty |
| `SAVE_CONVERSATION_HISTORY` | No | Enables or disables transcript persistence |
| `SESSION_COOKIE_SECURE` | No | Secure cookie flag; keep enabled for HTTPS production |

## Local development

1. Use Python 3.11 or later and Node.js 20 for the CI JavaScript syntax check.
2. Install dependencies:

   ```bash
   python -m pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and set the OpenAI key and private password.
4. Leave `DATABASE_URL` empty to use the local SQLite database.
5. Run:

   ```bash
   python web_server.py
   ```

6. Open http://localhost:10000. Microphone access in production requires HTTPS; localhost is treated as a secure development origin by modern browsers.

## Security and privacy boundary

- The OpenAI project key is read only by the backend and never returned to browser code.
- The app uses signed HTTP-only session cookies and same-origin checks for browser POST requests.
- Repeated failed sign-in attempts are rate-limited in memory.
- Custom functions use an allowlist; arithmetic is evaluated with a bounded AST, not `eval` or `exec`.
- The application does not save raw microphone audio. It stores text transcripts when history is enabled.
- Website and search actions return a link for the user to open; the backend does not control the user's desktop or browser.
- The current sign-in is a shared-password gate, not individual user accounts. Add per-user accounts, durable rate limits, audit logging, and session isolation before allowing multiple unrelated users.

## Tests

GitHub Actions runs on pushes and pull requests:

```bash
python -m compileall -q web_server.py src tests
python -m unittest discover -s tests -v
node --check web/script.js
```

These checks validate source compilation, SQLite storage behavior, authentication and browser JavaScript syntax. A successful CI run does not replace a live browser test with a real OpenAI API key, microphone, speakers/headphones, and a deployed HTTPS service.

## Repository layout

```
Jarvis-AI/
├── web_server.py              # Flask web service, auth, live session and tools APIs
├── render.yaml                # Render web + PostgreSQL Blueprint
├── requirements.txt            # Web and PostgreSQL dependencies
├── src/
│   ├── config.py               # Environment configuration
│   ├── database.py             # PostgreSQL pool / local SQLite adapter
│   └── tools.py                # Safe backend tool registry
├── web/
│   ├── index.html              # Live voice assistant interface
│   ├── script.js               # WebRTC, transcript, audio state and controls
│   └── style.css               # Responsive voice workspace
├── tests/
│   ├── test_core.py
│   └── test_tools.py
└── docs/
    └── architecture.md
```
