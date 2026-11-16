const listenButton = document.getElementById("listenBtn");
const buttonText = document.getElementById("buttonText");
const clearButton = document.getElementById("clearBtn");
const voicePanel = document.querySelector(".voice-panel");
const statusText = document.getElementById("statusText");
const subStatus = document.getElementById("subStatus");
const connectionPill = document.getElementById("connectionPill");
const connectionText = document.getElementById("connectionText");
const conversation = document.getElementById("conversation");
const emptyState = document.getElementById("emptyState");
const setupNote = document.getElementById("setupNote");
const historyLabel = document.getElementById("historyLabel");

let peerConnection = null;
let dataChannel = null;
let microphoneStream = null;
let remoteAudio = null;
let connecting = false;
let connected = false;
let sessionFinalized = false;
let closeTimer = null;
let sessionStartedResolve = null;
let sessionStartedReject = null;
let sessionId = null;
let eventCounter = 0;
let activeTranscriptSegments = { user: null, assistant: null };
const pendingResponses = new Map();
const handledToolCalls = new Set();

function nextEventId(prefix) {
    eventCounter += 1;
    return prefix + "_" + Date.now() + "_" + eventCounter;
}

function setStatus(title, detail, state = "idle") {
    statusText.textContent = title;
    subStatus.textContent = detail;
    voicePanel.dataset.state = state;
    connectionPill.dataset.state = state === "error"
        ? "error"
        : (connected ? "connected" : (connecting ? "connecting" : "idle"));
    connectionText.textContent = connected
        ? "GPT-Live session"
        : (connecting ? "Connecting" : (state === "error" ? "Connection error" : "Not connected"));
}

function updateControls() {
    listenButton.disabled = connecting || (connected && sessionFinalized);
    buttonText.textContent = connected ? "End conversation" : (connecting ? "Connecting..." : "Start conversation");
    listenButton.setAttribute("aria-label", connected ? "End live conversation" : "Start live conversation");
}

function ensureConversationVisible() {
    if (emptyState && emptyState.isConnected) {
        emptyState.remove();
    }
}

function addMessage(role, text, options = {}) {
    ensureConversationVisible();
    const bubble = document.createElement("article");
    bubble.className = "message " + (role === "user" ? "message-user" : "message-assistant");
    if (options.id) bubble.dataset.messageId = options.id;

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = role === "user" ? "YOU" : "JARVIS";

    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = text || "";

    bubble.append(label, body);
    conversation.appendChild(bubble);
    conversation.scrollTop = conversation.scrollHeight;
    return { bubble, body };
}

function addActionLink(label, url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") return;
        ensureConversationVisible();

        const bubble = document.createElement("article");
        bubble.className = "message message-assistant";
        const link = document.createElement("a");
        link.className = "action-link";
        link.href = parsed.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label || "Open link";
        bubble.appendChild(link);
        conversation.appendChild(bubble);
        conversation.scrollTop = conversation.scrollHeight;
    } catch (error) {
        console.warn("Ignored an invalid assistant action link.", error);
    }
}

async function persistMessage(role, content) {
    if (!content || !content.trim()) return;
    try {
        await fetch("/api/conversation/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, content: content.trim() }),
            cache: "no-store"
        });
    } catch (error) {
        console.warn("Conversation text was not saved locally.", error);
    }
}

function flushTranscript(role) {
    const segment = activeTranscriptSegments[role];
    if (!segment) return;

    if (segment.timer) window.clearTimeout(segment.timer);
    activeTranscriptSegments[role] = null;
    persistMessage(role, segment.text);
}

function appendTranscript(role, delta, startMs, endMs) {
    if (!delta) return;

    const start = Number.isFinite(startMs) ? startMs : null;
    const end = Number.isFinite(endMs) ? endMs : start;
    let segment = activeTranscriptSegments[role];

    if (
        segment &&
        start !== null &&
        segment.lastEnd !== null &&
        start - segment.lastEnd > 2200
    ) {
        flushTranscript(role);
        segment = null;
    }

    if (!segment) {
        const message = addMessage(role, "");
        segment = {
            text: "",
            bubble: message.bubble,
            body: message.body,
            lastEnd: null,
            timer: null
        };
        activeTranscriptSegments[role] = segment;
    }

    // Append fragments as delivered. Do not trim: leading spaces are meaningful.
    segment.text += delta;
    segment.body.textContent = segment.text;
    if (end !== null) segment.lastEnd = end;

    if (segment.timer) window.clearTimeout(segment.timer);
    segment.timer = window.setTimeout(() => flushTranscript(role), 1800);
    conversation.scrollTop = conversation.scrollHeight;

    if (role === "user") {
        setStatus("Listening...", "JARVIS can hear you while it is speaking.", "connected");
    } else {
        setStatus("JARVIS is speaking...", "You can speak at the same time or interrupt.", "speaking");
    }
}

async function loadHistory() {
    try {
        const response = await fetch("/api/history", { cache: "no-store" });
        if (!response.ok) throw new Error("History request failed.");
        const data = await response.json();
        const messages = Array.isArray(data.messages) ? data.messages : [];
        if (messages.length) {
            historyLabel.textContent = "Saved locally";
            messages.forEach((message) => {
                if (
                    message &&
                    ["user", "assistant"].includes(message.role) &&
                    typeof message.content === "string"
                ) {
                    addMessage(message.role, message.content);
                }
            });
        } else {
            historyLabel.textContent = "No saved messages";
        }
    } catch (error) {
        historyLabel.textContent = "History unavailable";
        console.warn(error);
    }
}

function sendEvent(payload) {
    if (!dataChannel || dataChannel.readyState !== "open") {
        throw new Error("The live event channel is not connected.");
    }
    dataChannel.send(JSON.stringify(payload));
}

function waitForIceGathering(peer, timeoutMs = 12000) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();

    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            peer.removeEventListener("icegatheringstatechange", onState);
            reject(new Error("Timed out while gathering the WebRTC connection details."));
        }, timeoutMs);

        function onState() {
            if (peer.iceGatheringState !== "complete") return;
            window.clearTimeout(timeout);
            peer.removeEventListener("icegatheringstatechange", onState);
            resolve();
        }

        peer.addEventListener("icegatheringstatechange", onState);
        onState();
    });
}

function waitForSessionStarted(timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            reject(new Error("GPT-Live did not confirm that the session started."));
        }, timeoutMs);

        sessionStartedResolve = () => {
            window.clearTimeout(timeout);
            sessionStartedResolve = null;
            sessionStartedReject = null;
            resolve();
        };

        sessionStartedReject = (error) => {
            window.clearTimeout(timeout);
            sessionStartedResolve = null;
            sessionStartedReject = null;
            reject(error);
        };
    });
}

async function startConversation() {
    if (connecting || connected) return;

    connecting = true;
    sessionFinalized = false;
    updateControls();
    setupNote.textContent = "";
    setStatus("Connecting to JARVIS...", "Requesting microphone access and starting a live session.", "connecting");

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Microphone access requires HTTPS or localhost and a supported browser.");
        }
        if (!window.RTCPeerConnection) {
            throw new Error("This browser does not support WebRTC.");
        }

        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        peerConnection = new RTCPeerConnection();
        remoteAudio = document.createElement("audio");
        remoteAudio.autoplay = true;
        remoteAudio.playsInline = true;
        remoteAudio.setAttribute("aria-label", "JARVIS voice output");
        remoteAudio.style.position = "absolute";
        remoteAudio.style.width = "1px";
        remoteAudio.style.height = "1px";
        remoteAudio.style.opacity = "0";
        document.body.appendChild(remoteAudio);

        peerConnection.addEventListener("track", (event) => {
            remoteAudio.srcObject = new MediaStream([event.track]);
            remoteAudio.play().catch((error) => {
                console.warn("Browser audio playback needs a user action.", error);
                setStatus("Audio playback blocked", "Check your browser audio permissions and try again.", "error");
            });
        });

        microphoneStream.getAudioTracks().forEach((track) => {
            peerConnection.addTrack(track, microphoneStream);
        });

        // GPT-Live expects its data channel to exist before the SDP offer.
        dataChannel = peerConnection.createDataChannel("oai-events");
        dataChannel.addEventListener("message", handleLiveEvent);
        dataChannel.addEventListener("close", () => {
            if (connected && !sessionFinalized) {
                setStatus("Connection closed", "The live event channel ended unexpectedly.", "error");
                cleanupSession();
            }
        });
        dataChannel.addEventListener("error", () => {
            setStatus("Live event channel error", "The session reported a transport problem.", "error");
        });

        peerConnection.addEventListener("connectionstatechange", () => {
            if (!peerConnection) return;
            if (peerConnection.connectionState === "failed") {
                setStatus("Connection lost", "The network connection failed. Please reconnect.", "error");
                cleanupSession();
            } else if (peerConnection.connectionState === "disconnected" && connected) {
                setStatus("Connection interrupted", "Waiting for the WebRTC connection to recover.", "connecting");
            }
        });

        const startedPromise = waitForSessionStarted();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await waitForIceGathering(peerConnection);

        const sdp = peerConnection.localDescription && peerConnection.localDescription.sdp;
        if (!sdp) throw new Error("The browser did not create a WebRTC SDP offer.");

        const response = await fetch("/api/live/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sdp }),
            cache: "no-store"
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Could not create the GPT-Live session.");
        }
        if (!result.transport || typeof result.transport.sdp !== "string") {
            throw new Error("The Live service returned an invalid WebRTC answer.");
        }

        sessionId = result.session && result.session.id ? result.session.id : null;
        await peerConnection.setRemoteDescription({
            type: "answer",
            sdp: result.transport.sdp
        });

        await startedPromise;
        connected = true;
        connecting = false;
        updateControls();
        setStatus("JARVIS is online.", "You can speak naturally, even while JARVIS is responding.", "connected");

        // GPT-Live paraphrases and speaks this opening message.
        sendEvent({
            type: "session.commentary.append",
            event_id: nextEventId("welcome"),
            delegation_id: null,
            content: "JARVIS is online. How can I help you today?"
        });
    } catch (error) {
        console.error("Could not start GPT-Live:", error);
        const message = error && error.message ? error.message : "An unexpected error occurred.";
        if (sessionStartedReject) sessionStartedReject(error);
        setupNote.textContent = message;
        cleanupSession();
        setStatus("Could not connect.", message, "error");
    } finally {
        connecting = false;
        updateControls();
    }
}

function getNestedResponseId(nestedEvent) {
    return (
        nestedEvent.response_id ||
        (nestedEvent.response && nestedEvent.response.id) ||
        nestedEvent.id ||
        null
    );
}

async function runDelegatedTool(item) {
    if (!item || !item.call_id || handledToolCalls.has(item.call_id)) return null;
    handledToolCalls.add(item.call_id);

    let argumentsValue;
    try {
        argumentsValue = JSON.parse(item.arguments || "{}");
    } catch (error) {
        argumentsValue = null;
    }

    let result;
    try {
        const response = await fetch("/api/tools/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: item.name, arguments: argumentsValue }),
            cache: "no-store"
        });
        result = await response.json();
        if (!response.ok) {
            result = { ok: false, message: result.error || "The requested tool was rejected." };
        }
    } catch (error) {
        result = { ok: false, message: "The Python tool service could not be reached." };
    }

    if (result.browser_action && result.browser_action.type === "open_url") {
        addActionLink(result.browser_action.label, result.browser_action.url);
        result.message += " I added a link in the conversation for you to open.";
    }

    return {
        type: "response.item.create",
        event_id: nextEventId("tool_result"),
        item: {
            type: "function_call_output",
            call_id: item.call_id,
            output: JSON.stringify(result)
        }
    };
}

async function finishDelegatedResponse(responseId) {
    const batch = pendingResponses.get(responseId);
    if (!batch || batch.completed) return;

    batch.completed = true;
    pendingResponses.delete(responseId);
    const calls = batch.calls || [];
    if (!calls.length) return;

    setStatus("Working on your request...", "JARVIS is using an approved backend tool while the conversation remains live.", "connected");

    try {
        const outputs = await Promise.all(calls.map(runDelegatedTool));
        outputs.filter(Boolean).forEach((output) => sendEvent(output));
        sendEvent({
            type: "response.create",
            event_id: nextEventId("continue")
        });
        setStatus("JARVIS is listening.", "You can continue speaking while I finish the task.", "connected");
    } catch (error) {
        console.error("Could not return delegated tool results:", error);
        setStatus("Tool response error", "I could not return a result to the backend agent.", "error");
    }
}

function handleNestedResponseEvent(envelope) {
    const nested = envelope.event || {};
    const responseId = getNestedResponseId(nested);

    if (nested.type === "response.created") {
        const id = responseId || "active_" + (envelope.delegation_id || "response");
        if (!pendingResponses.has(id)) {
            pendingResponses.set(id, {
                delegationId: envelope.delegation_id || null,
                calls: [],
                completed: false
            });
        }
        return;
    }

    if (nested.type === "response.output_item.done") {
        const item = nested.item || nested.output_item || null;
        if (!item || item.type !== "function_call") return;

        const id = responseId || "active_" + (envelope.delegation_id || "response");
        if (!pendingResponses.has(id)) {
            pendingResponses.set(id, {
                delegationId: envelope.delegation_id || null,
                calls: [],
                completed: false
            });
        }
        pendingResponses.get(id).calls.push(item);
        return;
    }

    if (nested.type === "response.completed") {
        const id = responseId || "active_" + (envelope.delegation_id || "response");
        finishDelegatedResponse(id).catch((error) => {
            console.error("Delegated response failed:", error);
        });
        return;
    }

    if (nested.type === "error") {
        const message = nested.error && nested.error.message
            ? nested.error.message
            : "The backend agent reported an error.";
        addMessage("assistant", "Backend task error: " + message);
        setStatus("Backend task failed", message, "error");
    }
}

function handleLiveEvent(message) {
    let event;
    try {
        event = JSON.parse(message.data);
    } catch (error) {
        console.warn("Ignored malformed GPT-Live event.", error);
        return;
    }

    switch (event.type) {
        case "session.started":
            sessionId = event.session && event.session.id ? event.session.id : sessionId;
            connected = true;
            connecting = false;
            updateControls();
            setStatus("JARVIS is online.", "The live voice session is ready.", "connected");
            if (sessionStartedResolve) sessionStartedResolve();
            break;

        case "session.closed": {
            sessionFinalized = true;
            const usage = event.usage && Number.isFinite(event.usage.seconds)
                ? " Session usage: " + event.usage.seconds + " seconds."
                : "";
            flushTranscript("user");
            flushTranscript("assistant");
            setStatus("Session ended.", "JARVIS has closed the live session." + usage, "idle");
            cleanupSession();
            break;
        }

        case "session.input_transcript.delta":
            appendTranscript("user", event.delta || "", event.start_ms, event.end_ms);
            break;

        case "session.output_transcript.delta":
            appendTranscript("assistant", event.delta || "", event.start_ms, event.end_ms);
            break;

        case "session.delegation.created":
            setStatus("JARVIS is working...", "I am handling a backend task while keeping the conversation open.", "connected");
            break;

        case "response.event":
            handleNestedResponseEvent(event);
            break;

        case "session.usage.updated":
            if (event.usage && Number.isFinite(event.usage.seconds)) {
                historyLabel.textContent = "Live session · " + event.usage.seconds + "s";
            }
            break;

        case "error":
            console.error("GPT-Live error:", event.error);
            if (sessionStartedReject && connecting) {
                sessionStartedReject(new Error(
                    (event.error && event.error.message) || "The Live session could not start."
                ));
            } else {
                setStatus(
                    "Live session error",
                    (event.error && event.error.message) || "The voice service reported an error.",
                    "error"
                );
            }
            break;

        default:
            break;
    }
}

function cleanupSession() {
    if (closeTimer) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
    }

    flushTranscript("user");
    flushTranscript("assistant");

    connected = false;
    connecting = false;
    pendingResponses.clear();
    handledToolCalls.clear();

    if (dataChannel) {
        try {
            dataChannel.close();
        } catch (error) {
            console.warn(error);
        }
        dataChannel = null;
    }

    if (peerConnection) {
        try {
            peerConnection.close();
        } catch (error) {
            console.warn(error);
        }
        peerConnection = null;
    }

    if (microphoneStream) {
        microphoneStream.getTracks().forEach((track) => track.stop());
        microphoneStream = null;
    }

    if (remoteAudio) {
        remoteAudio.pause();
        remoteAudio.srcObject = null;
        remoteAudio.remove();
        remoteAudio = null;
    }

    sessionId = null;
    updateControls();
}

function endConversation() {
    if (!connected || !dataChannel || dataChannel.readyState !== "open") {
        cleanupSession();
        setStatus("Session ended.", "Start a new conversation whenever you need me.", "idle");
        return;
    }

    listenButton.disabled = true;
    buttonText.textContent = "Ending session...";
    setStatus("Closing JARVIS...", "Finishing the live session and collecting final usage.", "connecting");

    try {
        sendEvent({
            type: "session.close",
            event_id: nextEventId("close")
        });
        closeTimer = window.setTimeout(() => {
            sessionFinalized = false;
            cleanupSession();
            setStatus("Session closed locally.", "The service did not confirm final usage before the timeout.", "error");
        }, 15000);
    } catch (error) {
        cleanupSession();
        setStatus("Session ended.", "The connection was released.", "idle");
    }
}

listenButton.addEventListener("click", () => {
    if (connected || connecting) {
        endConversation();
    } else {
        startConversation();
    }
});

clearButton.addEventListener("click", () => {
    conversation.replaceChildren();
    if (emptyState) conversation.appendChild(emptyState);
});

window.addEventListener("beforeunload", () => {
    try {
        if (dataChannel && dataChannel.readyState === "open" && connected) {
            dataChannel.send(JSON.stringify({
                type: "session.close",
                event_id: nextEventId("page_close")
            }));
        }
    } catch (error) {
        // Releasing local media is more important during page shutdown.
    }
    if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
    if (peerConnection) peerConnection.close();
});

loadHistory();
fetch("/api/status", { cache: "no-store" })
    .then((response) => response.json())
    .then((data) => {
        if (!data.live_configured) {
            setupNote.textContent = "GPT-Live is not configured yet. Add OPENAI_API_KEY to .env and restart the Flask server.";
        } else {
            setupNote.textContent = "Voice: " + (data.live_model || "GPT-Live") +
                " · Backend: " + (data.backend_model || "Responses") +
                ". Voice duration and backend tool/model usage may incur API charges.";
        }
    })
    .catch(() => {
        setupNote.textContent = "Could not check JARVIS server status.";
    });

updateControls();
