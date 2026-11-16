# JARVIS AI Architecture

JARVIS contains two voice experiences: a full-duplex browser agent and a local chained desktop assistant. They share Python tools, configuration, and SQLite transcript storage.

## 1. Browser: GPT-Live over WebRTC

The browser uses media tracks for audio and a data channel for Live events, captions, delegation events, and tool results.

    Browser microphone and speaker
                 |
                 | WebRTC SDP offer (HTTPS/local HTTP)
                 v
             Flask server
                 |
                 | POST /v1/live/sessions
                 | Authorization: server-only API key
                 | session + transport.sdp
                 v
            GPT-Live voice model
                 |
                 | WebRTC audio tracks
                 | JSON event data channel
                 v
              Browser UI

    GPT-Live voice model
          |
          | delegates work while conversation continues
          v
    Responses backend model
          |
          +---- hosted web_search
          |
          +---- custom function call
                    |
                    v
            Browser event handler
                    |
                    | POST /api/tools/execute
                    v
               Flask tool route
                    |
                    v
             src/tools.py allowlist
                    |
                    +---- current date/time
                    +---- bounded calculator
                    +---- website/search links
                    +---- recent local history
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
             GPT-Live voice model
                    |
                    v
            Spoken answer to user

    User / assistant transcript deltas
                    |
                    v
              SQLite messages

### Browser session lifecycle

1. The user chooses Start conversation and grants microphone access.
2. The browser creates a WebRTC peer connection, adds microphone tracks, creates the oai-events data channel, creates an SDP offer, and waits for ICE gathering.
3. The browser sends the SDP offer to POST /api/live/session.
4. Flask validates the same-origin request and SDP size. It calls POST /v1/live/sessions using the server-only OPENAI_API_KEY, the GPT-Live session configuration, and a WebRTC transport.
5. The server returns the Live session ID and SDP answer. The browser applies the answer and waits for session.started.
6. GPT-Live carries on the spoken conversation. The caller and assistant can speak at the same time; input and output transcript fragments are displayed independently.
7. When the voice model delegates work, GPT-Live runs the configured Responses backend. The data channel forwards nested Responses events in response.event envelopes.
8. When a nested response.output_item.done event contains a completed function_call, the browser calls Flask's tool endpoint. The backend validates the tool name and arguments, runs only registered functionality, and returns a JSON-safe result.
9. The browser returns each result as response.item.create with a function_call_output item. After all calls from the backend response are returned, it sends response.create to continue delegated work.
10. The voice model can explain the backend result while keeping the Live session open.
11. Transcript deltas are saved locally when history is enabled. The latest text history is included in the delegated backend instructions when a new Live session starts.
12. End conversation sends session.close. The browser waits for session.closed and final usage before releasing media and transport resources; timeout/disconnect paths release local microphone resources and report unconfirmed finalization.

### Browser endpoints

- GET /api/status: Live and backend model configuration.
- POST /api/live/session: exchanges an SDP offer for a Live session answer.
- POST /api/tools/execute: executes a single allowlisted function.
- POST /api/conversation/message: stores transcript text.
- GET /api/history: retrieves local message history.

## 2. Desktop: chained local voice pipeline

The desktop app remains a simpler, inspectable pipeline. It is not full duplex and records a bounded six-second audio segment per listen cycle.

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
          SQLite history
              |
           pyttsx3
              |
        Desktop speaker

The desktop path is useful as a local fallback. It has sequential STT/model/TTS latency and does not provide the browser agent's overlapping conversation experience.

## 3. Shared components

| Component | Responsibility |
|---|---|
| src/config.py | Environment settings for API, models, audio, SQLite, and history |
| src/database.py | Thread-safe SQLite access, legacy turns, and user/assistant transcript messages |
| src/tools.py | Function schemas, restricted arithmetic, fixed website allowlist, local time, search links, and history |
| src/ai_engine.py | Desktop Responses API answers with a local FAQ fallback |
| src/intent_engine.py | Deterministic desktop intent routing |
| src/command_handler.py | Desktop time/date, website, search, and calculator commands |
| web_server.py | Static UI, Live session creation, tool execution, transcript persistence, and legacy text endpoint |
| web/script.js | WebRTC transport, Live event handling, transcript grouping, delegated tool result loop, and cleanup |

## 4. Tool security model

The voice model and backend model can request only registered tools. The application does not expose arbitrary code execution.

- Hosted web_search is configured for current information.
- get_current_datetime returns the server's local date/time.
- calculate uses a restricted AST visitor; it does not use eval or exec.
- open_website accepts a fixed list of supported site names and returns an HTTPS link.
- search_web returns an encoded Google search link.
- get_recent_history reads a small bounded number of local messages.

The browser forwards a function name and arguments to Flask. Flask calls execute_tool, which validates the name and argument structure again. The model never gains shell access or unrestricted local-file access.

## 5. Memory and privacy

- Browser audio is streamed to GPT-Live over WebRTC. The browser app does not save raw microphone audio.
- Transcript deltas are grouped for display and saved as text messages in data/jarvis.db.
- At session startup, the recent text history is provided to the delegated backend as context.
- The memory is a short recent-history window, not a vector database or semantic long-term memory.
- Set SAVE_CONVERSATION_HISTORY=false to disable new transcript persistence and history injection.
- The desktop app stores user and assistant text in the same SQLite message table so browser and desktop history can be shared.

## 6. Local security boundary

The Flask server binds to 127.0.0.1 by default. It validates same-origin POSTs, limits request body size, and applies basic response security headers. The permanent API key and session configuration stay on the trusted server. The browser receives only the SDP answer and opaque Live session ID.

This is a local single-user setup. Public hosting requires authentication, per-user data separation, persistent rate limiting, HTTPS, managed secrets, monitoring, and permission/confirmation flows for consequential actions.
