# JARVIS AI — Real-Time Voice Assistant

JARVIS is a Python voice assistant with two modes:

- **Browser live voice:** speech-to-speech conversation over WebRTC using the OpenAI Realtime API. Audio is streamed instead of recording fixed six-second clips.
- **Desktop assistant:** local microphone capture, Whisper transcription, deterministic commands, optional OpenAI Responses API answers, and pyttsx3 speech output.

The browser and desktop experiences share Python command/tool logic and SQLite conversation history.

## Features

### Browser live voice
- Full-duplex WebRTC audio session with natural turn-taking and interruption support.
- Secure short-lived Realtime client credentials minted by Flask. The long-lived OpenAI API key stays on the server.
- Live assistant speech transcripts and saved conversation text.
- Recent local conversation context is supplied when a new session is created.
- Server-side, allowlisted tools: current date/time, bounded arithmetic, Google search links, supported website links, and recent local history.
- Microphone echo cancellation, noise suppression, and automatic gain control requested from the browser.
- Session status, connection errors, history, and responsive UI.

### Desktop mode
- Whisper speech-to-text using sounddevice.
- Time/date, website launching, Google search, basic calculations, and conversation history.
- OpenAI Responses API answers when an API key is configured.
- Offline FAQ fallback when the API key is absent.

### Storage and privacy
- SQLite stores conversation text locally in data/jarvis.db.
- Audio recordings are not persisted by the browser app.
- Set SAVE_CONVERSATION_HISTORY=false to disable transcript/message persistence.
- Set REALTIME_TRANSCRIPTION_MODEL= (empty value) to disable the separate input transcription service. Without input transcription, live audio still works, but user-side captions and saved user messages will not be available for those sessions.
- .env, local databases, audio files, and generated data are excluded from Git.

## Architecture

See docs/architecture.md for the component map and request flows.

See docs/research-notes.md for the architecture comparison against OpenAI Realtime, LiveKit Agents, and Pipecat, plus the implementation decisions and production checklist.

## Requirements

- Python 3.10+ (Python 3.11 is a good default for current audio packages).
- An OpenAI API key with access to the configured Realtime and Responses models for AI-powered browser/desktop responses.
- A working microphone and speakers/headphones.
- A modern browser with WebRTC and microphone support (Chrome or Edge recommended).
- Internet access for the OpenAI Realtime API and web links.

Realtime and model API usage may incur charges. ChatGPT subscriptions do not include API credits. Check your API project limits and billing before using live voice.

## Setup — Windows PowerShell

    git clone https://github.com/mahitech580/Jarvis-AI.git
    cd Jarvis-AI

    py -3.11 -m venv .venv
    .\.venv\Scripts\Activate.ps1

    python -m pip install --upgrade pip
    pip install -r requirements.txt

    Copy-Item .env.example .env
    notepad .env

Add your API key to .env:

    OPENAI_API_KEY=your_project_api_key

Do not add quotation marks around the value and never commit .env.

Start the browser app:

    python web_server.py

Open http://127.0.0.1:5000, allow microphone access, then select **Start conversation**.

Start the desktop app in a separate terminal when required:

    python app.py

The desktop app uses the local microphone and speaker. Close other applications that are using the microphone if device access fails.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| OPENAI_API_KEY | empty | Server-side API key; required for cloud AI |
| REALTIME_MODEL | gpt-realtime-2.1 | Browser speech-to-speech model |
| REALTIME_VOICE | marin | Realtime assistant voice |
| REALTIME_TRANSCRIPTION_MODEL | gpt-realtime-whisper | Separate input transcription for captions/history; may add usage charges |
| AI_MODEL | gpt-5.6 | Desktop Responses API model |
| WHISPER_MODEL | base | Local desktop Whisper model |
| DATABASE_PATH | data/jarvis.db | Local SQLite database |
| SAVE_CONVERSATION_HISTORY | true | Persist user and assistant text locally |
| TTS_RATE | 165 | Desktop speech rate |
| TTS_VOLUME | 1.0 | Desktop speech volume |
| JARVIS_HOST | 127.0.0.1 | Flask bind address; keep local for single-user use |
| JARVIS_PORT | 5000 | Flask port |

To disable the additional realtime input-transcription service, set REALTIME_TRANSCRIPTION_MODEL to an empty value. Audio understanding and spoken replies remain available, but user transcript captions/history are then unavailable for those sessions.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/status | Server and Realtime configuration status |
| POST | /api/realtime/token | Mint a short-lived Realtime client secret |
| POST | /api/tools/execute | Execute an allowlisted assistant tool |
| POST | /api/conversation/message | Save a user/assistant transcript message |
| GET | /api/history | Retrieve recent local conversation text |
| POST | /api/command | Legacy text command endpoint |

The browser connects to OpenAI using the ephemeral secret returned by /api/realtime/token; the permanent project API key is never sent to browser JavaScript.

## Tests

Run the unit tests:

    python -m unittest discover -s tests -v

The tests cover safe arithmetic parsing, website allowlisting, search URL encoding, tool rejection, database message ordering, and intent-routing regressions.

## Security boundary

This repository is configured as a **single-user local application**. The Flask development server binds to 127.0.0.1 by default, rejects cross-origin POST requests, applies request-size limits and basic response security headers, and does not enable wildcard CORS.

Do not expose this server directly to the public internet. A shared/public deployment still needs user authentication, per-user authorization and data isolation, persistent rate limiting, HTTPS, secret management, audit logging, and operational monitoring. Review tool permissions before adding capabilities that change files, send messages, control devices, or spend money.

## Project layout

    Jarvis-AI/
    ├── app.py                    # Desktop voice assistant entry point
    ├── web_server.py             # Flask app and realtime session/tool endpoints
    ├── src/
    │   ├── ai_engine.py          # Responses API + offline fallback
    │   ├── command_handler.py    # Desktop deterministic commands
    │   ├── config.py              # Environment configuration
    │   ├── database.py            # Thread-safe SQLite persistence
    │   ├── intent_engine.py       # Desktop command routing
    │   ├── speech_to_text.py      # Local Whisper microphone pipeline
    │   ├── text_to_speech.py      # Local pyttsx3 speech output
    │   └── tools.py               # Realtime tool schemas and allowlisted handlers
    ├── web/
    │   ├── index.html
    │   ├── script.js              # WebRTC session and realtime events
    │   └── style.css
    ├── tests/
    │   ├── test_tools.py
    │   └── test_core.py
    └── docs/
        ├── architecture.md
        └── research-notes.md

## Roadmap

The current upgrade establishes the realtime voice and safe tool foundation. Sensible next stages are:
1. Add automated browser/WebRTC integration tests and a repeatable latency evaluation set.
2. Add configurable wake-word support for the desktop client.
3. Add multilingual voice evaluation and explicit language preferences.
4. Add permission prompts for higher-impact tools and a proper authenticated deployment mode.
5. Add provider adapters or adopt LiveKit/Pipecat if telephony, multi-provider routing, or distributed agent workers become requirements.
