# Voice-agent research and design decisions

**Research date:** 16 November 2026

This note captures the official platform guidance and open-source project patterns used to improve JARVIS. The objective is a natural, interruptible voice assistant that can keep listening while speaking and continue the conversation while backend work runs.

## Executive recommendation

For the current goal, JARVIS uses **GPT-Live + WebRTC + Responses delegation** in the browser.

OpenAI's current GPT-Live guide describes this exact interaction pattern: a voice model carries the spoken conversation, listens while speaking (full duplex), and delegates research or tool work to a separately configured backend. WebRTC is recommended for browser audio; media tracks carry audio and a data channel carries transcripts, session events, and delegated work.

The architecture separates:
- **Conversation:** GPT-Live, configured with a short speaking style and delegation prompt.
- **Reasoning and tools:** a Responses model configured with hosted web search and JARVIS function tools.
- **Permissions and execution:** the Python application validates and runs every custom function.
- **State:** local SQLite text transcripts with on-demand history retrieval through a registered tool.

This is a closer fit than simply making the old request/response voice pipeline faster. It also avoids introducing a large third-party agent framework before the project needs telephony, multi-provider orchestration, or distributed workers.

## Current OpenAI voice choices

| Option | Conversation behavior | Backend/tool model | Good fit |
|---|---|---|---|
| GPT-Live | Full-duplex conversation; can listen while speaking and keep talking while backend work runs | Separate Responses delegation or an application-managed client backend | Best for conversational assistants that need overlapping turns and delegated tasks |
| Realtime API | Speech-to-speech session with built-in audio turn handling and interruption support | Tools can be selected in the voice session, then executed by the app | Good for a compact single-session speech agent where one model owns conversation and tool selection |
| Chained STT → LLM → TTS | Sequential speech recognition, text reasoning, and speech generation | Fully application-managed model/tools | Good for local/offline pipelines, explicit transcript processing, and debugging individual stages |

Official OpenAI references:
- GPT-Live overview: https://developers.openai.com/api/docs/guides/live
- GPT-Live WebRTC connection: https://developers.openai.com/api/docs/guides/voice-webrtc?api=live
- GPT-Live delegation and tools: https://developers.openai.com/api/docs/guides/live-delegation
- GPT-Live session and transcript lifecycle: https://developers.openai.com/api/docs/guides/live-conversations
- GPT-Live migration from Realtime: https://developers.openai.com/api/docs/guides/live-migration
- Voice-agent architecture comparison: https://developers.openai.com/api/docs/guides/voice-agents

## Why GPT-Live is the browser choice

The prior JARVIS browser flow used the browser SpeechRecognition API, waited for a completed transcript, sent one HTTP request to Flask, then played the result through browser speech synthesis. The desktop flow captured a fixed six-second audio segment, transcribed it with Whisper, ran a command or text model, then spoke the result. These are valid chained pipelines, but they are not continuous full-duplex conversations.

GPT-Live changes the interaction model:
1. The browser captures microphone audio and establishes WebRTC.
2. Flask receives the SDP offer and creates a Live session using the long-lived API key on the trusted server.
3. GPT-Live manages the spoken exchange and can listen while it is speaking.
4. For task-oriented work, GPT-Live delegates to the separately configured Responses backend.
5. The Responses backend can use hosted web search and ask the application to run registered custom functions.
6. The application verifies each function call and returns results through the Live/Responses event protocol.
7. The voice conversation and backend task can progress independently.

This architecture enables the assistant to keep talking while a longer task is running and to incorporate the result later. The browser never receives the project API key.

## Open-source frameworks reviewed

### LiveKit Agents

LiveKit Agents is a Python-first framework with agent sessions, pluggable model providers, turn detection, tools, telephony, deployment options, and session observability. Its turn documentation distinguishes voice activity detection from semantic turn completion and discusses interruption handling.

Patterns worth borrowing as JARVIS grows:
- Separate session lifecycle from application/business logic.
- Measure end-of-turn and interruption behavior instead of assuming VAD alone is enough.
- Track tool duration and task completion separately from audio playback.
- Add per-session metrics and traces.
- Consider LiveKit if JARVIS needs phone/SIP, rooms, multi-user sessions, provider switching, or distributed workers.

References:
- https://docs.livekit.io/agents/
- https://docs.livekit.io/agents/logic/turns/
- https://github.com/livekit/agents/tree/main/examples/voice_agents

### Pipecat

Pipecat is an open-source Python voice-AI pipeline framework with pluggable processors and transports. It is a strong choice when developers want explicit control over audio input, VAD/STT, LLM context, TTS, transport, and interruption frames.

Patterns worth borrowing:
- Keep transport adapters separate from the assistant's tools and business logic.
- Treat interruptions as cancellation of in-flight generation and queued audio, not only a UI state change.
- Use a structured client/server event protocol.
- Evaluate VAD and semantic turn detection on real user audio.

References:
- https://docs.pipecat.ai/overview/introduction
- https://docs.pipecat.ai/pipecat/learn/speech-input
- https://docs.pipecat.ai/pipecat/learn/transports
- https://docs.pipecat.ai/pipecat/fundamentals/interruptions
- https://github.com/pipecat-ai/pipecat
- https://github.com/pipecat-ai/pipecat-examples

## Implementation choices in this repository

Implemented:
- GPT-Live WebRTC session creation through Flask's server-side POST to /v1/live/sessions.
- The project API key remains on the backend; the browser receives only the SDP answer and session ID.
- A voice prompt for JARVIS and a separate Responses backend prompt.
- Responses delegation with hosted web search and registered custom tools.
- A Python allowlist with bounded arithmetic, safe URLs, current local date/time, and recent transcript history.
- The browser handles nested response.event envelopes, collects completed function calls, sends response.item.create results, and resumes backend work with response.create.
- Input and output transcript fragments are displayed independently because both speakers can overlap.
- SQLite transcript storage and an on-demand get_recent_history tool; historical text is returned as tool output rather than inserted into trusted instructions.
- Graceful session.close handling with session.closed finalization and local microphone cleanup.
- Desktop Responses API support and an offline FAQ fallback.
- Thread-safe SQLite access, safer desktop intent routing, request-size limits, same-origin checks, and basic security headers.

Not implemented or not yet verified:
- Real microphone testing against an API project with GPT-Live access.
- End-to-end evaluation of overlapping speech, interruption recovery, and latency.
- Automated browser/WebRTC integration tests.
- Wake-word detection for an always-on desktop.
- A user-controlled multilingual preference and systematic Telugu/Hindi/English evaluation.
- Semantic long-term/vector memory.
- OS-level application/file control, email sending, or other consequential tools.
- Multi-user authentication and public deployment hardening.

## Cost and privacy

GPT-Live voice duration and the delegated Responses model/tools are billed separately. Session creation and usage accounting are documented in the Live guides; check current API pricing and project spend limits before testing. ChatGPT subscriptions do not include API credits.

The browser client does not persist microphone recordings. It stores transcript text locally in SQLite when SAVE_CONVERSATION_HISTORY=true. Users can disable new local transcript storage and recent-history retrieval through the environment setting.

## Validation checklist

Run unit tests:

    python -m unittest discover -s tests -v

Then, with a configured API key, Chrome or Edge, microphone, and speakers/headphones:

1. Start the server with no API key. The page should explain that GPT-Live is not configured.
2. Add a valid API key with GPT-Live and backend-model access. Restart and check the model status.
3. Start a browser session and verify that session.started arrives and audio works.
4. Speak a normal question and verify the input and assistant transcript bubbles update.
5. Interrupt the assistant while it speaks. Verify that the user can speak concurrently and the assistant adapts rather than finishing an obsolete monologue.
6. Ask for current information. Verify the hosted web_search backend is used and its answer is spoken.
7. Ask for a calculation. Verify the delegated calculator tool executes and the result is returned to the backend.
8. Ask to open GitHub. Verify that JARVIS returns a user-clickable allowlisted link.
9. Request an arbitrary URL, shell command, or Python expression. Verify that no unrestricted execution path exists.
10. Reload the page and verify saved text history is restored.
11. Set SAVE_CONVERSATION_HISTORY=false and verify that new messages are not saved and the recent-history tool returns no stored transcript context.
12. Deny microphone permission, drop the network, and close the session. Verify error feedback, microphone release, and session finalization reporting.
13. Repeat with different accents, names, numbers, room noise, long pauses, and overlapping speech.

Record p50/p95 time to first response audio, tool duration, interruption recovery time, task success, transcription quality, and cost on the same test set. Do not claim latency or quality improvements until measured.

## Before public deployment

- Authenticate every user and isolate their session, transcripts, and tools.
- Rate-limit session creation and tool execution with persistent controls.
- Use HTTPS and managed secrets; configure API spend limits.
- Add tool-level authorization, explicit confirmations for actions with side effects, and audit logging.
- Add session tracing, tool progress reporting, crash recovery, and automated browser/WebRTC tests.
- Review data retention and transcript consent with users.
