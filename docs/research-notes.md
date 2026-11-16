# JARVIS Web Voice Agent — Research and Design Notes

**Research date:** 16 November 2026

This research informed a browser-only, hosted GPT-Live voice assistant. The selected approach keeps browser media transport, trusted server logic, and delegated reasoning separate.

## Recommendation

Use **GPT-Live-1 over WebRTC with a Responses delegation backend**.

The official GPT-Live guide describes a full-duplex spoken conversation that can continue while a backend agent searches, reasons, and uses tools. OpenAI recommends WebRTC for browser audio: negotiated media tracks carry audio and a data channel carries JSON events for transcripts, session updates, and delegated work.

Official sources:
- https://developers.openai.com/api/docs/guides/live
- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://developers.openai.com/api/docs/guides/live-prompting
- https://developers.openai.com/api/docs/guides/live-delegation
- https://developers.openai.com/api/docs/guides/live-conversations
- https://developers.openai.com/api/docs/models/gpt-live-1

## Agent framework comparison

| Option | Advantages | Tradeoffs | Fit for JARVIS now |
|---|---|---|---|
| GPT-Live-1 + Responses delegation | Full-duplex voice; delegation while talking; WebRTC browser path; hosted web search and registered app functions | OpenAI model coupling and separate voice/backend usage charges | Best match for the existing small Flask web service |
| OpenAI Realtime API | Direct speech-to-speech, session VAD/turn handling, app-defined tools | One session model handles conversation/tool flow; less separation than GPT-Live delegation | Good for a single-model realtime voice interface |
| LiveKit Agents | Python-first framework; provider options; session lifecycle, turn detection, interruptions, telephony and operational features | Adds framework and deployment complexity | Strong future option for telephony, multiple providers or larger concurrent sessions |
| Pipecat | Open-source composable audio pipeline; transports and a broad provider ecosystem | Requires explicit pipeline configuration and ownership of STT/LLM/TTS stages | Strong future option for custom audio processing or provider-neutral pipelines |
| Chained STT → LLM → TTS | Easy to inspect and swap individual stages | Sequential response, endpointing and interruption complexity | Not chosen for the browser experience |

Framework references:
- https://docs.livekit.io/agents/
- https://docs.livekit.io/agents/logic/turns/
- https://github.com/livekit/agents
- https://docs.pipecat.ai/overview/introduction
- https://docs.pipecat.ai/pipecat/learn/speech-input
- https://docs.pipecat.ai/pipecat/learn/transports
- https://docs.pipecat.ai/pipecat/fundamentals/interruptions
- https://github.com/pipecat-ai/pipecat

## Why the previous design changed

The old browser application waited for a completed Web Speech API transcript, sent one request to Flask, then used browser speech synthesis. The desktop assistant recorded fixed-duration chunks with Whisper. Those designs are not full-duplex web voice.

The new application is browser-only:
1. A visitor opens the hosted HTTPS site and signs in with the shared access password.
2. The browser captures microphone media and creates a WebRTC SDP offer.
3. Flask uses its server-side OpenAI project key to create a GPT-Live session and exchanges the SDP offer for an answer.
4. GPT-Live manages speech, listening, interruptions, and conversation flow.
5. GPT-Live delegates research or longer tasks to the Responses backend.
6. Hosted web search and registered JARVIS functions run in the delegated backend.
7. Custom function calls are validated and executed by Flask, and results are returned with response.item.create followed by response.create.
8. User and assistant transcripts are displayed and optionally stored in SQLite.

## Design and safety decisions

- **No API key in browser:** Flask creates sessions with the server-side key; the browser receives only the SDP answer and opaque session ID.
- **Password gate:** all assistant APIs require a signed browser session. The access password is stored in hosting environment variables.
- **Same-origin POSTs:** the web server rejects cross-origin POST requests.
- **Tool allowlist:** no shell access, arbitrary Python, arbitrary URL fetch, or direct file-system operations.
- **Prompt injection boundary:** past transcripts are retrieved as tool output, not embedded into trusted instructions.
- **History privacy:** transcript storage can be disabled with SAVE_CONVERSATION_HISTORY=false.
- **No audio archival:** the browser app stores text transcripts only.
- **Explicit hosting limitation:** Render Free SQLite storage is ephemeral. Durable history requires a persistent external database.
- **Cost control:** GPT-Live voice duration and delegated model/tool usage are charged separately. Use project spend limits and monitor usage.

## What is implemented

- Browser-only application and sign-in screen.
- Flask session authentication, rate-limited failed sign-in attempts, same-origin POST validation, and basic security headers.
- GPT-Live WebRTC session creation using a trusted server-side OpenAI key.
- Responses delegation with hosted web search.
- Python allowlisted tools for date/time, bounded arithmetic, search links, website links, and transcript retrieval.
- Transcript display, local SQLite persistence, history privacy setting, and graceful session close.
- Render web-service Blueprint and health endpoint.
- Web-only dependencies; desktop microphone/Whisper/pyttsx3 modules removed.
- CI for Python compilation, unit tests, sign-in behavior, and JavaScript syntax.

## Not yet verified

- A real external GPT-Live session with a configured OpenAI API project.
- Real microphone/speaker quality across Chrome, Edge, phones, and different networks.
- Full duplex interruption behavior under real user speech.
- p50/p95 time-to-first-audio, tool duration, task success, transcript quality, and API spend.
- Durable database persistence, individual user accounts, and production-scale abuse controls.

## Manual hosted test plan

1. Verify /healthz returns HTTP 200.
2. Visit the public site while signed out; the login view should block assistant APIs.
3. Confirm an incorrect password is rejected and repeated failures are rate-limited.
4. Sign in with the configured password.
5. Verify the page indicates whether GPT-Live is configured.
6. Start a session in Chrome/Edge and confirm session.started, microphone input, and generated audio.
7. Ask a general question and inspect the live transcript.
8. Interrupt JARVIS while it is speaking and verify it adapts to the new user turn.
9. Ask for current information and verify the Responses backend's hosted web_search result is communicated.
10. Ask for a calculation and verify bounded calculator tool execution.
11. Ask to open a supported site; verify JARVIS adds a clickable HTTPS link.
12. Ask it to run shell code or open an unsupported arbitrary URL; verify no such tool exists.
13. Reload the page and verify local transcript history is restored while the service instance remains active.
14. Sign out and verify assistant APIs return HTTP 401 again.
15. Set SAVE_CONVERSATION_HISTORY=false and verify new messages are not written and prior history is not returned.

Record real latency, interruption recovery, task completion, transcription quality, and spend before claiming performance results.

## Before a public multi-user launch

- Replace shared password access with individual users and proper account/session management.
- Store transcripts in durable, access-controlled PostgreSQL or another production datastore.
- Use persistent distributed rate limits and abuse detection.
- Add audit logs, observability, alerts, and per-user spend controls.
- Add explicit user approval for tools that send messages, modify files, control devices, or cause financial effects.
- Add end-to-end browser tests for session startup, WebRTC disconnects, delegated tool calls, and microphone permission failures.
