const listenButton = document.getElementById("listenBtn");
const buttonText = document.getElementById("buttonText");
const clearButton = document.getElementById("clearBtn");
const orb = document.getElementById("orb");
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
let userTranscriptByItem = new Map();
let assistantTranscriptByItem = new Map();
let handledToolCalls = new Set();
let liveAssistantBubble = null;

function setStatus(title, detail, state = "idle") {
    statusText.textContent = title;
    subStatus.textContent = detail;
    voicePanel.dataset.state = state;
    connectionPill.dataset.state = state === "error" ? "error" : (connected ? "connected" : (connecting ? "connecting" : "idle"));
    connectionText.textContent = connected ? "Live session" : (connecting ? "Connecting" : (state === "error" ? "Connection error" : "Not connected"));
}

function updateControls() {
    listenButton.disabled = connecting;
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
        console.warn("Conversation message was not saved locally.", error);
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
                if (message && ["user", "assistant"].includes(message.role) && typeof message.content === "string") {
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
        throw new Error("The realtime data channel is not connected.");
    }
    dataChannel.send(JSON.stringify(payload));
}

function waitForDataChannel(channel, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        if (channel.readyState === "open") {
            resolve();
            return;
        }
        const timer = window.setTimeout(() => reject(new Error("Timed out waiting for the realtime session.")), timeoutMs);
        channel.addEventListener("open", () => {
            window.clearTimeout(timer);
            resolve();
        }, { once: true });
        channel.addEventListener("error", () => {
            window.clearTimeout(timer);
            reject(new Error("The realtime data channel failed to open."));
        }, { once: true });
    });
}

async function startConversation() {
    if (connecting || connected) return;
    connecting = true;
    updateControls();
    setupNote.textContent = "";
    setStatus("Connecting to JARVIS...", "Requesting microphone access and creating a secure voice session.", "connecting");

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

        const tokenResponse = await fetch("/api/realtime/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store"
        });
        const tokenPayload = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenPayload.value) {
            throw new Error(tokenPayload.error || "Could not create a secure realtime session.");
        }

        peerConnection = new RTCPeerConnection();
        remoteAudio = document.createElement("audio");
        remoteAudio.autoplay = true;
        remoteAudio.playsInline = true;
        remoteAudio.setAttribute("aria-hidden", "true");
        remoteAudio.style.display = "none";
        document.body.appendChild(remoteAudio);

        peerConnection.ontrack = (event) => {
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.play().catch((error) => {
                console.warn("Browser audio playback needs user interaction.", error);
                setStatus("Audio playback blocked", "Check your browser's audio permission and try again.", "error");
            });
        };

        microphoneStream.getAudioTracks().forEach((track) => {
            peerConnection.addTrack(track, microphoneStream);
        });

        dataChannel = peerConnection.createDataChannel("oai-events");
        dataChannel.addEventListener("message", handleRealtimeEvent);
        dataChannel.addEventListener("close", () => {
            if (connected) stopConversation(false);
        });
        dataChannel.addEventListener("error", () => {
            setStatus("Realtime channel error", "The event channel reported an error.", "error");
        });

        peerConnection.addEventListener("connectionstatechange", () => {
            if (!peerConnection) return;
            if (peerConnection.connectionState === "failed") {
                setStatus("Connection lost", "The network connection failed. Please reconnect.", "error");
                stopConversation(false);
            } else if (peerConnection.connectionState === "disconnected" && connected) {
                setStatus("Reconnecting...", "Waiting for the voice connection to recover.", "connecting");
            }
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
            method: "POST",
            body: peerConnection.localDescription.sdp,
            headers: {
                "Authorization": "Bearer " + tokenPayload.value,
                "Content-Type": "application/sdp"
            }
        });
        const answerSdp = await sdpResponse.text();
        if (!sdpResponse.ok) {
            throw new Error("Realtime connection rejected the offer (" + sdpResponse.status + "): " + answerSdp.slice(0, 240));
        }

        await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
        await waitForDataChannel(dataChannel);

        connected = true;
        connecting = false;
        updateControls();
        setStatus("JARVIS is listening.", "Speak naturally. You can interrupt JARVIS at any time.", "connected");
    } catch (error) {
        console.error("Could not start realtime voice:", error);
        const message = error && error.message ? error.message : "An unexpected error occurred.";
        setupNote.textContent = message;
        await stopConversation(false);
        setStatus("Could not connect.", message, "error");
    } finally {
        connecting = false;
        updateControls();
    }
}

async function runToolCall(item) {
    if (!item || !item.call_id || handledToolCalls.has(item.call_id)) return;
    handledToolCalls.add(item.call_id);

    let args;
    try {
        args = JSON.parse(item.arguments || "{}");
    } catch (error) {
        args = null;
    }

    let result;
    try {
        const response = await fetch("/api/tools/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: item.name, arguments: args }),
            cache: "no-store"
        });
        result = await response.json();
        if (!response.ok) {
            result = { ok: false, message: result.error || "The requested tool was rejected." };
        }
    } catch (error) {
        result = { ok: false, message: "The tool service could not be reached." };
    }

    if (result.browser_action && result.browser_action.type === "open_url") {
        addActionLink(result.browser_action.label, result.browser_action.url);
        result.message += " I added a link in the conversation for you to open.";
    }

    sendEvent({
        type: "conversation.item.create",
        item: {
            type: "function_call_output",
            call_id: item.call_id,
            output: JSON.stringify(result)
        }
    });
}

async function handleToolCalls(response) {
    const calls = (response.output || []).filter((item) => item.type === "function_call");
    if (!calls.length) return;
    setStatus("Using a tool...", "JARVIS is running an approved assistant skill.", "connected");
    for (const item of calls) {
        await runToolCall(item);
    }
    sendEvent({ type: "response.create" });
}

function handleRealtimeEvent(message) {
    let event;
    try {
        event = JSON.parse(message.data);
    } catch (error) {
        console.warn("Ignored malformed realtime event.", error);
        return;
    }

    switch (event.type) {
        case "session.created":
        case "session.updated":
            setStatus("JARVIS is ready.", "Speak naturally. You can interrupt JARVIS at any time.", "connected");
            break;

        case "input_audio_buffer.speech_started":
            setStatus("Listening...", "I heard you start speaking.", "connected");
            break;

        case "input_audio_buffer.speech_stopped":
            setStatus("Thinking...", "Working on your request.", "connected");
            break;

        case "conversation.item.input_audio_transcription.delta": {
            const itemId = event.item_id || "current-user";
            userTranscriptByItem.set(itemId, (userTranscriptByItem.get(itemId) || "") + (event.delta || ""));
            break;
        }

        case "conversation.item.input_audio_transcription.completed": {
            const transcript = (event.transcript || "").trim();
            if (!transcript) break;
            const itemId = event.item_id || String(Date.now());
            userTranscriptByItem.set(itemId, transcript);
            addMessage("user", transcript, { id: "user-" + itemId });
            persistMessage("user", transcript);
            break;
        }

        case "response.created":
            setStatus("Thinking...", "Preparing a response.", "connected");
            liveAssistantBubble = null;
            break;

        case "response.output_audio_transcript.delta": {
            const itemId = event.item_id || "assistant-current";
            const nextText = (assistantTranscriptByItem.get(itemId) || "") + (event.delta || "");
            assistantTranscriptByItem.set(itemId, nextText);
            if (!liveAssistantBubble || liveAssistantBubble.dataset.messageId !== "assistant-" + itemId) {
                liveAssistantBubble = addMessage("assistant", "", { id: "assistant-" + itemId }).bubble;
            }
            const body = liveAssistantBubble.querySelector(".message-body");
            if (body) body.textContent = nextText;
            conversation.scrollTop = conversation.scrollHeight;
            setStatus("JARVIS is speaking...", "You can speak to interrupt.", "speaking");
            break;
        }

        case "response.output_audio_transcript.done": {
            const itemId = event.item_id || "assistant-current";
            const transcript = (event.transcript || assistantTranscriptByItem.get(itemId) || "").trim();
            if (!transcript) break;
            assistantTranscriptByItem.set(itemId, transcript);
            let bubble = document.querySelector('[data-message-id="assistant-' + CSS.escape(itemId) + '"]');
            if (!bubble) bubble = addMessage("assistant", "", { id: "assistant-" + itemId }).bubble;
            const body = bubble.querySelector(".message-body");
            if (body) body.textContent = transcript;
            persistMessage("assistant", transcript);
            setStatus("JARVIS is listening.", "Continue speaking whenever you're ready.", "connected");
            break;
        }

        case "response.output_text.delta": {
            const itemId = event.item_id || "assistant-current";
            if (!assistantTranscriptByItem.has(itemId)) {
                const nextText = (assistantTranscriptByItem.get(itemId) || "") + (event.delta || "");
                assistantTranscriptByItem.set(itemId, nextText);
                if (!liveAssistantBubble) {
                    liveAssistantBubble = addMessage("assistant", "", { id: "assistant-" + itemId }).bubble;
                }
                const body = liveAssistantBubble.querySelector(".message-body");
                if (body) body.textContent = nextText;
            }
            break;
        }

        case "response.done":
            handleToolCalls(event.response || {}).catch((error) => {
                console.error("Tool handling failed:", error);
                setStatus("Tool error", "I could not complete an assistant action.", "error");
            });
            if (!(event.response && (event.response.output || []).some((item) => item.type === "function_call"))) {
                setStatus("JARVIS is listening.", "Continue speaking whenever you're ready.", "connected");
            }
            break;

        case "error":
            console.error("Realtime API error:", event.error);
            setStatus("Realtime error", (event.error && event.error.message) || "The voice service reported an error.", "error");
            break;

        default:
            break;
    }
}

async function stopConversation(updateStatus = true) {
    connected = false;
    connecting = false;

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

    assistantTranscriptByItem.clear();
    userTranscriptByItem.clear();
    handledToolCalls.clear();
    liveAssistantBubble = null;

    updateControls();
    if (updateStatus) {
        setStatus("Session ended.", "Start a new conversation whenever you need me.", "idle");
    }
}

listenButton.addEventListener("click", () => {
    if (connected || connecting) {
        stopConversation();
    } else {
        startConversation();
    }
});

clearButton.addEventListener("click", () => {
    conversation.replaceChildren();
    if (emptyState) {
        conversation.appendChild(emptyState);
    }
});

window.addEventListener("beforeunload", () => {
    if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
    if (peerConnection) peerConnection.close();
});

loadHistory();
fetch("/api/status", { cache: "no-store" })
    .then((response) => response.json())
    .then((data) => {
        if (!data.realtime_configured) {
            setupNote.textContent = "Realtime voice is not configured yet. Add OPENAI_API_KEY to .env and restart the Flask server.";
        } else {
            setupNote.textContent = "Realtime model: " + (data.realtime_model || "configured") + ". API usage may incur charges.";
        }
    })
    .catch(() => {
        setupNote.textContent = "Could not check JARVIS server status.";
    });

updateControls();
