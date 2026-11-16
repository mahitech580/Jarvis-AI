# Voice-agent research and design decisions

**Research date:** 16 November 2026

This note records the current reference patterns reviewed for the JARVIS upgrade. It focuses on practical architecture choices, not benchmark claims.

## Executive recommendation

For this repository's immediate goal, the best fit is a browser-first OpenAI Realtime session over WebRTC, with Flask retaining the trusted tool-execution and storage boundary.

Why:
- The existing web app is already a small Flask + vanilla JavaScript application.
- The desired browser experience is natural speech-to-speech with low interaction overhead and the ability to interrupt the assistant.
- The Realtime API handles audio input/output and turn behavior in one stateful session, while the app can still expose server-controlled tools.
- WebRTC is the recommended browser transport; the API's server-to-server WebSocket path would require the app to manage audio chunks, encoding, buffering, playback, and truncation itself.

This avoids introducing a large framework before the product requires it. The Python desktop app remains a separate chained pipeline for now.

## Approaches compared

| Approach | Strengths | Tradeoffs | When it fits |
|---|---|---|---|
| OpenAI Realtime API + WebRTC | Direct speech-to-speech session, provider-managed audio transport, VAD/turn handling, interruptions, tool calls | OpenAI model/provider coupling; usage is billed; app still owns tool safety and persistence | Best immediate fit for the existing browser app |
| LiveKit Agents | Python-first agent framework; pluggable STT/LLM/TTS and realtime models; session lifecycle, turn detection, interruptions, tools, telephony and deployment paths | More infrastructure and concepts than this small repo currently needs | Strong next step for multi-provider routing, rooms, SIP/phone, distributed workers, or production deployment |
| Pipecat | Open-source Python voice pipeline; composable processors; multiple STT/LLM/TTS providers; WebRTC transports and RTVI client integrations | You manage a pipeline and its components; introduces transport/server and dependency complexity | Best when you need explicit control of every audio stage or want provider-neutral pipelines |
| Chained Whisper → LLM → TTS | Transparent stages; local components possible; easy to inspect intermediate transcripts; works offline for some stages | Sequential latency; endpointing and interruption behavior are application responsibilities; fixed-duration recording is not continuous voice | Good for offline desktop operation and workflows that need transcript control |

## Key patterns taken from the reference projects

### OpenAI Realtime

The official Realtime guide describes a browser flow where the backend creates a short-lived client secret, the frontend establishes a WebRTC session, and the session handles audio turns, tools, and interruptions. The Realtime conversation guide documents tool-call lifecycle events and returning results through a function_call_output conversation item.

JARVIS follows that pattern:
- Flask mints the short-lived credential.
- The permanent API key remains on the server.
- Browser audio travels over WebRTC.
- A data channel carries lifecycle events and tool calls.
- Tool execution remains on the Python backend.

Official references:
- https://developers.openai.com/api/docs/guides/realtime
- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://developers.openai.com/api/docs/guides/realtime-conversations
- https://developers.openai.com/api/docs/guides/voice-agents
- https://developers.openai.com/api/docs/guides/voice-latency-cost

### LiveKit Agents

The LiveKit Agents examples show a Python AgentSession pattern with STT, LLM, TTS, and turn detection. Its turn documentation distinguishes VAD-only endpointing from semantic turn detection and explains interruption cancellation and truncating conversation context to speech the user actually heard.

Useful patterns for a future JARVIS phase:
- Explicit session lifecycle and agent state.
- Turn detection separate from raw speech detection.
- Barge-in cancellation that stops in-flight generation and audio.
- Session/tool metrics and tracing.
- Provider swaps without rewriting the product layer.

References:
- https://docs.livekit.io/agents/
- https://docs.livekit.io/agents/logic/turns/
- https://github.com/livekit/agents/tree/main/examples/voice_agents

### Pipecat

Pipecat uses a pipeline of transport input, VAD/STT, user context, LLM, TTS, transport output, and assistant context. Its documentation describes WebRTC as a good fit for browser/mobile clients and interruption frames that cancel in-flight generation and clear queued speech. Its examples repository includes WebRTC, instant-voice, and provider integration examples.

Useful patterns for a future JARVIS phase:
- A processor/frame pipeline makes each audio stage inspectable.
- VAD and semantic turn strategies should not be confused.
- Interruption handling must cancel model/TTS work and clear unplayed speech.
- RTVI provides a structured client/server event protocol.
- Keep transport code separate from business logic.

References:
- https://docs.pipecat.ai/overview/introduction
- https://docs.pipecat.ai/pipecat/learn/speech-input
- https://docs.pipecat.ai/pipecat/learn/transports
- https://docs.pipecat.ai/pipecat/fundamentals/interruptions
- https://github.com/pipecat-ai/pipecat
- https://github.com/pipecat-ai/pipecat-examples

## Important product lessons

1. **Real-time is a transport and turn-taking property, not just a faster transcript request.** The old browser code waited for a completed Web Speech API result, sent one Flask request, then used browser speech synthesis. The old desktop path captured a fixed six-second clip. Neither path is a full-duplex streaming experience.
2. **Barge-in is essential.** Users must be able to speak while the assistant is responding. Realtime WebRTC provides provider-managed audio buffering and interruption handling; a future WebSocket pipeline must implement cancellation and audio truncation carefully.
3. **Keep tools on the trusted server.** The model proposes a function call; the backend validates the function name and arguments. JARVIS exposes only date/time, bounded arithmetic, a fixed website allowlist, search links, and local history. It does not expose shell, arbitrary Python, arbitrary URLs, or unrestricted local-file access.
4. **Keep secrets out of the browser.** The browser receives only a short-lived client credential. The standard API key is read by Flask from .env.
5. **Treat transcripts as imperfect hints.** Input transcription is asynchronous and can differ from what the audio model understood. It is used for captions and local history, not as the source of truth for every spoken instruction.
6. **Memory needs boundaries.** JARVIS stores recent text locally and supplies a short recent-history window on the next session. This is not yet semantic/vector memory. Users can disable it.
7. **Measure real users' audio.** Accents, code-switching, background noise, names, numbers, pauses, interruption frequency, and device changes matter more than a demo with clean synthesized audio.

## Current implementation scope

Implemented in this upgrade:
- Browser WebRTC speech-to-speech session using the GA Realtime client-secret flow.
- Server-only key handling and no-store client-secret response.
- Realtime tools routed through an allowlisted Flask endpoint.
- Live transcript UI and local message storage.
- Recent conversation context injected at new-session creation.
- Optional input transcription setting.
- Desktop Responses API integration with offline FAQ fallback.
- Thread-safe SQLite storage and safer intent matching.
- Request size limits, same-origin POST checks, and basic security headers.

Not claimed as completed:
- A production multi-user auth system.
- A persistent distributed worker/session service.
- A local wake-word engine.
- Full multilingual evaluation and user language preferences.
- A vector database or long-term semantic memory.
- Browser automation, email sending, OS-level desktop control, or file modification tools.
- Automated end-to-end WebRTC evaluation on real microphones.
- Measured latency or quality results.

## Validation plan

Run the unit suite:

    python -m unittest discover -s tests -v

Then perform these manual scenarios in Chrome/Edge:
1. Start without OPENAI_API_KEY: UI should explain configuration is missing and never expose a project key.
2. Start with a valid key and microphone permission: session connects and audio is audible.
3. Speak a normal open-ended question: JARVIS responds in speech and the transcript appears.
4. Interrupt JARVIS mid-response: output should stop/yield and the new user turn should be handled.
5. Ask for a calculation: calculate is called and only arithmetic is evaluated.
6. Ask for a web search: a clickable HTTPS link appears; the server does not execute arbitrary browsing.
7. Ask to open a disallowed URL or run shell code: the tool registry rejects it.
8. Reload the page: saved local transcript text is restored when history is enabled.
9. Disable SAVE_CONVERSATION_HISTORY: new transcript messages are not stored.
10. Disable the input transcription model: live speech remains possible; user-side transcript persistence is absent.
11. Deny microphone permission, disconnect the network, or close the data channel: the UI reports a recoverable error and releases the microphone.
12. Test several accents, room noise, names, numbers, and longer pauses; note transcription and turn-taking failures separately.

## Production hardening before public deployment

- Authentication and per-user data separation.
- Per-user tool authorization and audit log.
- Persistent rate limiting for token creation and tool endpoints.
- HTTPS and managed secrets.
- A policy/confirmation layer for high-impact actions.
- Observability for session creation, first audio, tool start/end, interruptions, disconnects, and API errors.
- A repeatable evaluation set and p50/p95 latency reporting.
- Session cleanup and database lifecycle under the chosen WSGI/ASGI server.
- Provider quota, billing, and abuse monitoring.
