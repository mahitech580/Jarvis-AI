# JARVIS AI — Full-Duplex Voice Assistant

JARVIS is a Python voice assistant with a browser-first, full-duplex conversational experience and a separate desktop mode.

- **Browser live voice:** GPT-Live over WebRTC. It can listen while speaking, keep the conversation open while backend work runs, and return tool results into the conversation.
- **Desktop assistant:** a local Whisper → intent/command → Responses API (optional) → pyttsx3 pipeline.

The browser voice model and delegated reasoning/tools backend are separate. Flask owns the API key, session creation, local tool execution, and SQLite storage.

## What is included

### Browser GPT-Live experience
- WebRTC microphone and speaker media tracks, with a data channel for session events and transcripts.
- Full-duplex conversation: caller and assistant transcripts are handled independently and can overlap.
- GPT-Live voice layer delegates research and task work to a Responses backend.
- Hosted web search for current information.
- Python function tools for local date/time, bounded arithmetic, allowlisted website links, user-opened search links, and recent local history.
- Backend tool calls are executed by Flask, not by arbitrary code in the browser.
- Tool results return to the Responses delegation; GPT-Live can explain them aloud while the session remains live.
- Local conversation transcript persistence, short recent-history context, usage display, graceful session close, and microphone cleanup.
- Responsive browser UI with connection states and visible transcripts.

### Desktop assistant
- Local microphone capture with sounddevice and Whisper transcription.
- Deterministic time/date, website, search, and calculator commands.
- OpenAI Responses API for open-ended answers when the key is configured.
- Offline FAQ fallback when there is no API key or a request cannot reach the service.
- pyttsx3 speech output.

### Security and privacy
- The permanent OpenAI API key stays on the Flask server.
- Browser WebRTC SDP is sent to Flask; Flask creates the Live session and returns only the session ID and SDP answer.
- Custom functions are allowlisted and validate their arguments. There is no shell, arbitrary Python, arbitrary URL, or unrestricted file-access tool.
- Local SQLite stores text transcripts, not browser microphone recordings.
- Set SAVE_CONVERSATION_HISTORY=false to disable new transcript persistence and history context.
- The server binds to 127.0.0.1 by default and is intended for one local user.
- .env, SQLite databases, audio and generated data are ignored by Git.

## Research and architecture

- docs/architecture.md describes browser Live, delegated tools, desktop voice, memory, and trust boundaries.
- docs/research-notes.md compares GPT-Live, Realtime API, LiveKit Agents, Pipecat, and chained voice pipelines, with official reference links and a manual evaluation checklist.

## Requirements

- Python 3.10+; Python 3.11 is a good default for the audio dependencies.
- An OpenAI project API key with access to GPT-Live and the configured Responses backend model.
- API billing enabled. GPT-Live voice duration and the delegated Responses model/tools are billed separately.
- A working microphone and speaker/headphones.
- A modern browser with WebRTC and microphone support. Chrome or Edge are recommended.
- Internet access for the live models and search.

A ChatGPT subscription does not provide API credits. Check your API project limits and billing before testing live voice.

## Setup — Windows PowerShell

    git clone https://github.com/mahitech580/Jarvis-AI.git
    cd Jarvis-AI

    py -3.11 -m venv .venv
    .\.venv\Scripts\Activate.ps1

    python -m pip install --upgrade pip
    pip install -r requirements.txt

    Copy-Item .env.example .env
    notepad .env

Set your project key in .env:

    OPENAI_API_KEY=your_project_api_key

Do not commit .env or paste the key into browser code.

Start the browser assistant:

    python web_server.py

Open http://127.0.0.1:5000, allow microphone access, then choose **Start conversation**. End the session using the same button so JARVIS can close it gracefully and receive final usage.

Start the desktop assistant separately when needed:

    python app.py

The desktop version uses the local microphone and speaker. Close other applications that are using the microphone if device access fails.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| OPENAI_API_KEY | empty | Server-side project API key |
| LIVE_MODEL | gpt-live-1 | Full-duplex browser voice model |
| LIVE_BACKEND_MODEL | gpt-6-luna | Delegated reasoning and custom tool selection |
| AI_MODEL | gpt-6-luna | Desktop Responses API model |
| WHISPER_MODEL | base | Local desktop Whisper model |
| DATABASE_PATH | data/jarvis.db | Local SQLite file |
| SAVE_CONVERSATION_HISTORY | true | Save local text transcripts and recent context |
| TTS_RATE | 165 | Desktop speech rate |
| TTS_VOLUME | 1.0 | Desktop speech volume |
| JARVIS_HOST | 127.0.0.1 | Flask bind address; keep local for single-user use |
| JARVIS_PORT | 5000 | Flask port |

Model names can be changed to another model supported by your OpenAI project.

## Browser API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/status | Shows configured Live/backend model names and history setting |
| POST | /api/live/session | Exchanges browser SDP for a GPT-Live WebRTC session |
| POST | /api/tools/execute | Validates and executes an allowlisted Python function |
| POST | /api/conversation/message | Saves a user or assistant transcript message |
| GET | /api/history | Returns recent local transcript text |
| POST | /api/command | Keeps the legacy text-command interface available |

The browser never receives the project API key. The API key is used only by Flask when it creates a Live session.

## Tools available to the delegated backend

| Tool | Behavior |
|---|---|
| Hosted web_search | Searches current online information |
| get_current_datetime | Returns server-local date, time, and timezone |
| calculate | Evaluates bounded arithmetic using a restricted AST |
| open_website | Returns a link from a fixed HTTPS allowlist |
| search_web | Returns an encoded Google search link |
| get_recent_history | Reads a small number of local transcript messages |

Opening a website or search result creates a link for the user to open. It does not remotely control the user's browser. More powerful tools must add authentication, authorization, explicit confirmation, audit records, and bounded inputs before they are implemented.

## Tests

Run the unit suite:

    python -m unittest discover -s tests -v

The tests cover safe arithmetic, website allowlisting, URL encoding, unknown-tool rejection, SQLite message ordering, and intent-routing regressions.

A successful unit test run does not prove that the external Live session, microphone, speakers, or real-time interruption behavior work. Complete the manual browser checklist in docs/research-notes.md with a configured API key and a real device.

## Production boundary

This is a **single-user local application**, not a public multi-user service. Do not expose the Flask development server directly to the internet. Before public deployment, add:
- User authentication and per-user database/session isolation.
- Persistent rate limiting and abuse controls for session creation and tool execution.
- HTTPS, managed secrets, API spend limits, audit logs, and monitoring.
- Per-tool authorization and explicit confirmation for consequential actions.
- Session lifecycle recovery, concurrency-safe persistence under the chosen production server, and automated browser/WebRTC tests.

## Project layout

    Jarvis-AI/
    ├── app.py
    ├── web_server.py
    ├── src/
    │   ├── ai_engine.py
    │   ├── command_handler.py
    │   ├── config.py
    │   ├── database.py
    │   ├── intent_engine.py
    │   ├── speech_to_text.py
    │   ├── text_to_speech.py
    │   └── tools.py
    ├── web/
    │   ├── index.html
    │   ├── script.js
    │   └── style.css
    ├── tests/
    └── docs/
        ├── architecture.md
        └── research-notes.md
