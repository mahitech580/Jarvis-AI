const loginPanel = document.getElementById("loginPanel");
const loginForm = document.getElementById("loginForm");
const loginDescription = document.getElementById("loginDescription");
const loginError = document.getElementById("loginError");
const loginButton = document.getElementById("loginButton");
const passwordInput = document.getElementById("passwordInput");
const logoutButton = document.getElementById("logoutBtn");
const mainContent = document.getElementById("mainContent");

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
const stateEyebrow = document.getElementById("stateEyebrow");
const sessionDuration = document.getElementById("sessionDuration");
const micStateText = document.getElementById("micStateText");
const waveform = document.getElementById("waveform");
const micControlButton = document.getElementById("micControlBtn");
const speakerControlButton = document.getElementById("speakerControlBtn");
const micControlText = document.getElementById("micControlText");
const speakerControlText = document.getElementById("speakerControlText");
const orbStage = document.getElementById("orb");
const liveLinkLabel = document.getElementById("liveLinkLabel");
const browserStatus = document.getElementById("browserStatus");
const sessionMirror = document.getElementById("sessionMirror");
const localClock = document.getElementById("localClock");
const localDate = document.getElementById("localDate");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendMessageButton = document.getElementById("sendMessageBtn");
const exportTranscriptButton = document.getElementById("exportTranscriptBtn");
const toastRegion = document.getElementById("toastRegion");
const quickCommandButtons = document.querySelectorAll("[data-prompt]");
const settingsToggleButton = document.getElementById("settingsToggleBtn");
const settingsPanel = document.getElementById("settingsPanel");
const settingsCloseButton = document.getElementById("settingsCloseBtn");
const micDeviceSelect = document.getElementById("micDeviceSelect");
const refreshDevicesButton = document.getElementById("refreshDevicesBtn");
const deviceHint = document.getElementById("deviceHint");
const micPermissionStatus = document.getElementById("micPermissionStatus");
const keyboardHelpButton = document.getElementById("keyboardHelpBtn");
const shortcutDialog = document.getElementById("shortcutDialog");
const shortcutDialogClose = document.getElementById("shortcutDialogClose");

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
let sessionClosedResolve = null;
let sessionId = null;
let eventCounter = 0;
let isAuthenticated = false;
let audioContext = null;
let micAnalyser = null;
let visualizerFrame = null;
let sessionClock = null;
let sessionStartedAt = null;
let toastTimer = null;
let selectedMicDeviceId = "";
let micPermissionQuery = null;
let micPermissionChangeHandler = null;
let micMuted = false;
let speakerMuted = false;
const activeTranscriptSegments = { user: null, assistant: null };
const pendingResponses = new Map();
const handledToolCalls = new Set();

function nextEventId(prefix) {
    eventCounter += 1;
    return prefix + "_" + Date.now() + "_" + eventCounter;
}

function setStatus(title, detail, state = "idle") {
    const stateLabels = {
        idle: "READY FOR INPUT",
        connecting: "ESTABLISHING LIVE SESSION",
        connected: "LIVE SESSION ACTIVE",
        listening: "LISTENING TO YOU",
        speaking: "JARVIS IS SPEAKING",
        thinking: "WORKING ON YOUR REQUEST",
        error: "CONNECTION NEEDS ATTENTION"
    };
    statusText.textContent = title;
    subStatus.textContent = detail;
    voicePanel.dataset.state = state;
    stateEyebrow.textContent = stateLabels[state] || "LIVE VOICE SYSTEM";

    const pillState = state === "error" ? "error"
        : (state === "connecting" ? "connecting"
            : (connected || ["listening", "speaking", "thinking"].includes(state) ? "connected" : "idle"));
    connectionPill.dataset.state = pillState;
    connectionText.textContent = state === "error" ? "Connection issue"
        : (state === "connecting" ? "Connecting"
            : (connected ? (state === "thinking" ? "Working" : "Live") : "Standby"));

    micStateText.textContent = state === "error" ? "MIC OFFLINE"
        : (state === "idle" ? "MIC STANDBY"
            : (micMuted ? "MIC MUTED"
                : (state === "listening" ? "VOICE DETECTED" : "MIC ACTIVE")));
    if (waveform) waveform.dataset.active = String(Boolean(connected && !micMuted));
    if (liveLinkLabel) {
        liveLinkLabel.textContent = state === "error" ? "ATTENTION"
            : (connecting ? "CONNECTING" : (connected ? "LIVE" : "STANDBY"));
    }
}

function updateControls() {
    listenButton.disabled = connecting || (connected && sessionFinalized);
    buttonText.textContent = connected ? "End live conversation" : (connecting ? "Connecting..." : "Start live conversation");
    listenButton.setAttribute("aria-label", connected ? "End live conversation" : "Start live conversation");

    micControlButton.disabled = !connected;
    speakerControlButton.disabled = !connected || !remoteAudio;
    micControlButton.setAttribute("aria-pressed", String(micMuted));
    speakerControlButton.setAttribute("aria-pressed", String(speakerMuted));
    micControlText.textContent = micMuted ? "Unmute mic" : "Mute mic";
    speakerControlText.textContent = speakerMuted ? "Unmute speaker" : "Mute speaker";
    if (messageInput) {
        messageInput.disabled = !connected;
        messageInput.placeholder = connected
            ? "Type to JARVIS… (Enter to send)"
            : "Start a live session to send a text prompt";
    }
    if (sendMessageButton) sendMessageButton.disabled = !connected;
}

function buildWaveform() {
    if (!waveform || waveform.childElementCount) return;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 36; index += 1) {
        const bar = document.createElement("span");
        bar.className = "wave-bar";
        fragment.appendChild(bar);
    }
    waveform.appendChild(fragment);
}

function startMicrophoneVisualizer(stream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !waveform) return;

    stopMicrophoneVisualizer();
    try {
        audioContext = new AudioContextClass();
        micAnalyser = audioContext.createAnalyser();
        micAnalyser.fftSize = 256;
        micAnalyser.smoothingTimeConstant = 0.72;
        audioContext.createMediaStreamSource(stream).connect(micAnalyser);
        audioContext.resume().catch((error) => console.warn("Microphone visualizer could not resume.", error));

        const samples = new Uint8Array(micAnalyser.fftSize);
        const bars = Array.from(waveform.children);
        const draw = () => {
            if (!micAnalyser) return;
            micAnalyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (let index = 0; index < samples.length; index += 1) {
                const centered = (samples[index] - 128) / 128;
                sum += centered * centered;
            }
            const level = Math.sqrt(sum / samples.length);
            const amplitude = micMuted ? 0 : Math.min(1, level * 7.5);

            bars.forEach((bar, index) => {
                const taper = 0.35 + (1 - Math.abs((index - (bars.length - 1) / 2) / (bars.length / 2))) * 0.65;
                const ripple = 0.25 + Math.abs(Math.sin(index * 0.72 + level * 35)) * 0.75;
                const height = micMuted ? 3 : 3 + amplitude * taper * ripple * 32;
                bar.style.height = height.toFixed(1) + "px";
                bar.style.opacity = micMuted ? "0.18" : String(0.28 + amplitude * 0.68);
            });
            waveform.dataset.active = String(Boolean(connected && !micMuted));
            if (orbStage) orbStage.style.setProperty("--voice-energy", amplitude.toFixed(3));
            visualizerFrame = window.requestAnimationFrame(draw);
        };
        draw();
    } catch (error) {
        console.warn("Microphone visualizer is unavailable.", error);
        stopMicrophoneVisualizer();
    }
}

function stopMicrophoneVisualizer() {
    if (visualizerFrame !== null) {
        window.cancelAnimationFrame(visualizerFrame);
        visualizerFrame = null;
    }
    micAnalyser = null;
    if (audioContext) {
        const context = audioContext;
        audioContext = null;
        context.close().catch((error) => console.warn("Could not close audio visualizer.", error));
    }
    if (waveform) waveform.dataset.active = "false";
    if (orbStage) orbStage.style.setProperty("--voice-energy", "0");
    if (micStateText) micStateText.textContent = "MIC STANDBY";
}

function formatSessionDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return minutes + ":" + seconds;
}

function startSessionClock() {
    if (sessionClock) return;
    sessionStartedAt = Date.now();
    const update = () => {
        if (sessionStartedAt !== null) {
            const elapsed = formatSessionDuration(Date.now() - sessionStartedAt);
            sessionDuration.textContent = elapsed;
            if (sessionMirror) sessionMirror.textContent = elapsed;
        }
    };
    update();
    sessionClock = window.setInterval(update, 1000);
}

function stopSessionClock() {
    if (sessionClock) {
        window.clearInterval(sessionClock);
        sessionClock = null;
    }
    sessionStartedAt = null;
    sessionDuration.textContent = "00:00";
    if (sessionMirror) sessionMirror.textContent = "00:00";
}


function refreshLocalClock() {
    if (!localClock || !localDate) return;
    const now = new Date();
    localClock.textContent = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(now);
    localDate.textContent = new Intl.DateTimeFormat(undefined, {
        weekday: "short", day: "2-digit", month: "short", year: "numeric"
    }).format(now).toUpperCase();
}

function refreshBrowserStatus() {
    if (!browserStatus) return;
    browserStatus.textContent = navigator.onLine ? "NETWORK ONLINE" : "NETWORK OFFLINE";
    browserStatus.dataset.state = navigator.onLine ? "online" : "offline";
}

function handleNetworkChange() {
    refreshBrowserStatus();
    if (!connected) return;
    if (!navigator.onLine) {
        setStatus("Network connection interrupted.", "Waiting for the browser to reconnect. Your live session may recover automatically.", "connecting");
    } else {
        setStatus("Network restored.", "Checking the live voice channel and waiting for it to recover.", "connecting");
    }
}

const localClockTimer = window.setInterval(refreshLocalClock, 1000);
window.addEventListener("online", handleNetworkChange);
window.addEventListener("offline", handleNetworkChange);
refreshLocalClock();
refreshBrowserStatus();

function showLogin(message = "") {
    isAuthenticated = false;
    loginPanel.classList.remove("hidden");
    mainContent.hidden = true;
    logoutButton.classList.add("hidden");
    loginError.textContent = message;
    passwordInput.value = "";
}

function showAssistant() {
    isAuthenticated = true;
    loginPanel.classList.add("hidden");
    mainContent.hidden = false;
    logoutButton.classList.remove("hidden");
    loginError.textContent = "";
}

async function checkAuthentication() {
    try {
        const response = await fetch("/api/auth/status", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check access settings.");

        if (!data.configured) {
            loginDescription.textContent = "The owner must set JARVIS_ACCESS_PASSWORD in the hosting dashboard before anyone can sign in.";
            loginForm.classList.add("hidden");
            return;
        }

        loginForm.classList.remove("hidden");
        if (data.authenticated) {
            showAssistant();
            await loadHistory();
            await refreshServiceStatus();
        } else {
            loginDescription.textContent = "Enter the private access password provided by the JARVIS owner.";
            showLogin();
        }
    } catch (error) {
        loginDescription.textContent = "JARVIS could not reach its web server. Refresh the page to try again.";
        loginError.textContent = error.message || "Could not check access settings.";
    }
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loginButton.disabled) return;

    loginError.textContent = "";
    loginButton.disabled = true;
    loginButton.querySelector("span").textContent = "Signing in...";

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: passwordInput.value }),
            cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Sign-in failed.");

        showAssistant();
        await loadHistory();
        await refreshServiceStatus();
        passwordInput.value = "";
    } catch (error) {
        loginError.textContent = error.message || "Sign-in failed.";
        passwordInput.select();
    } finally {
        loginButton.disabled = false;
        loginButton.querySelector("span").textContent = "Continue";
    }
});

logoutButton.addEventListener("click", async () => {
    await stopConversation(false);
    try {
        await fetch("/api/auth/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store"
        });
    } catch (error) {
        console.warn("Could not complete sign-out request.", error);
    }
    showLogin("You have signed out.");
});



function readSavedMicrophonePreference() {
    try {
        selectedMicDeviceId = window.localStorage.getItem("jarvis.mic.deviceId") || "";
    } catch (error) {
        selectedMicDeviceId = "";
    }
}

function saveMicrophonePreference(deviceId) {
    selectedMicDeviceId = deviceId || "";
    try {
        if (selectedMicDeviceId) {
            window.localStorage.setItem("jarvis.mic.deviceId", selectedMicDeviceId);
        } else {
            window.localStorage.removeItem("jarvis.mic.deviceId");
        }
    } catch (error) {
        console.warn("The microphone preference could not be stored in this browser.", error);
    }
}

async function refreshAudioDevices() {
    if (!micDeviceSelect) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        micDeviceSelect.disabled = true;
        if (deviceHint) deviceHint.textContent = "This browser does not expose audio device selection.";
        return;
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((device) => device.kind === "audioinput");
        const previousSelection = selectedMicDeviceId || micDeviceSelect.value;
        micDeviceSelect.replaceChildren();

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "System default microphone";
        micDeviceSelect.appendChild(defaultOption);

        inputs.forEach((device, index) => {
            const option = document.createElement("option");
            option.value = device.deviceId;
            option.textContent = device.label || ("Microphone " + (index + 1));
            micDeviceSelect.appendChild(option);
        });

        const selectionExists = inputs.some((device) => device.deviceId === previousSelection);
        micDeviceSelect.value = selectionExists ? previousSelection : "";
        if (!selectionExists && previousSelection) saveMicrophonePreference("");

        micDeviceSelect.disabled = inputs.length === 0;
        if (deviceHint) {
            deviceHint.textContent = inputs.some((device) => device.label)
                ? "Choose the input used the next time you start a live session."
                : "Device names are hidden until microphone access is granted. Choose the default for now.";
        }
    } catch (error) {
        console.warn("Could not enumerate microphone devices.", error);
        if (deviceHint) deviceHint.textContent = "Microphone devices could not be listed. The system default will be used.";
    }
}

async function refreshMicrophonePermission() {
    if (!micPermissionStatus) return;
    if (!navigator.permissions || !navigator.permissions.query) {
        micPermissionStatus.textContent = "BROWSER MANAGED";
        return;
    }
    try {
        if (micPermissionQuery && micPermissionChangeHandler) {
            micPermissionQuery.removeEventListener("change", micPermissionChangeHandler);
        }
        micPermissionQuery = await navigator.permissions.query({ name: "microphone" });
        micPermissionChangeHandler = () => {
            micPermissionStatus.textContent = micPermissionQuery.state.toUpperCase();
        };
        micPermissionChangeHandler();
        micPermissionQuery.addEventListener("change", micPermissionChangeHandler);
    } catch (error) {
        micPermissionStatus.textContent = "BROWSER MANAGED";
    }
}

function openSettingsPanel() {
    if (!settingsPanel || !settingsToggleButton) return;
    settingsPanel.hidden = false;
    settingsToggleButton.setAttribute("aria-expanded", "true");
    refreshAudioDevices();
    refreshMicrophonePermission();
}

function closeSettingsPanel() {
    if (!settingsPanel || !settingsToggleButton) return;
    settingsPanel.hidden = true;
    settingsToggleButton.setAttribute("aria-expanded", "false");
}

if (settingsToggleButton) {
    settingsToggleButton.addEventListener("click", () => {
        if (settingsPanel && !settingsPanel.hidden) closeSettingsPanel();
        else openSettingsPanel();
    });
}

if (settingsCloseButton) settingsCloseButton.addEventListener("click", closeSettingsPanel);

document.addEventListener("click", (event) => {
    if (!settingsPanel || settingsPanel.hidden) return;
    if (settingsPanel.contains(event.target) || settingsToggleButton?.contains(event.target)) return;
    closeSettingsPanel();
});

if (micDeviceSelect) {
    micDeviceSelect.addEventListener("change", () => {
        saveMicrophonePreference(micDeviceSelect.value);
        if (deviceHint) {
            deviceHint.textContent = selectedMicDeviceId
                ? "Selected microphone will be used when you start the next live session."
                : "The system default microphone will be used next time.";
        }
        showToast("Microphone preference saved for the next session.");
    });
}

if (refreshDevicesButton) {
    refreshDevicesButton.addEventListener("click", async () => {
        await refreshAudioDevices();
        await refreshMicrophonePermission();
        showToast("Audio device list refreshed.");
    });
}

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", refreshAudioDevices);
}

function openShortcutGuide() {
    if (!shortcutDialog) return;
    if (typeof shortcutDialog.showModal === "function") shortcutDialog.showModal();
    else shortcutDialog.setAttribute("open", "");
}

function closeShortcutGuide() {
    if (!shortcutDialog) return;
    if (typeof shortcutDialog.close === "function") shortcutDialog.close();
    else shortcutDialog.removeAttribute("open");
}

if (keyboardHelpButton) keyboardHelpButton.addEventListener("click", openShortcutGuide);
if (shortcutDialogClose) shortcutDialogClose.addEventListener("click", closeShortcutGuide);

document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement && (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    );
    if (event.key === "Escape") {
        closeSettingsPanel();
        return;
    }
    if (isTyping || event.altKey) return;

    if (event.key === "?" && !event.ctrlKey && !event.metaKey) {
        openShortcutGuide();
        return;
    }

    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();

    if (event.shiftKey && event.code === "Space") {
        event.preventDefault();
        if (connected || connecting) stopConversation();
        else startConversation();
        return;
    }
    if (key === "m" && event.shiftKey) {
        event.preventDefault();
        if (connected && remoteAudio) speakerControlButton.click();
        return;
    }
    if (key === "m" && !event.shiftKey) {
        event.preventDefault();
        if (connected && microphoneStream) micControlButton.click();
        return;
    }
    if (key === "e" && event.shiftKey) {
        event.preventDefault();
        exportVisibleTranscript();
    }
});

readSavedMicrophonePreference();
refreshAudioDevices();
refreshMicrophonePermission();

function showToast(message, kind = "info") {
    if (!toastRegion) return;
    toastRegion.replaceChildren();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.kind = kind;
    toast.textContent = message;
    toastRegion.appendChild(toast);
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.remove();
        toastTimer = null;
    }, 3600);
}

async function sendTypedMessage(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return;
    if (text.length > 4000) {
        showToast("Messages must be 4,000 characters or fewer.", "error");
        return;
    }
    if (!connected || !dataChannel || dataChannel.readyState !== "open") {
        showToast("Start a live conversation before sending a text prompt.");
        return;
    }

    try {
        sendEvent({
            type: "response.item.create",
            event_id: nextEventId("typed_message"),
            item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text }]
            }
        });
        sendEvent({
            type: "response.create",
            event_id: nextEventId("typed_response")
        });
        addMessage("user", text);
        persistMessage("user", text);
        if (messageInput) {
            messageInput.value = "";
            messageInput.style.height = "auto";
        }
        setStatus("Working on your message...", "Your text prompt has entered this live session. JARVIS will respond here and by voice.", "thinking");
    } catch (error) {
        console.error("Could not send the typed prompt to JARVIS:", error);
        showToast(error.message || "The message could not be sent.", "error");
    }
}

function exportVisibleTranscript() {
    if (!conversation) return;
    const entries = Array.from(conversation.querySelectorAll(".message")).map((message) => {
        const label = message.querySelector(".message-label")?.textContent || "JARVIS";
        const body = message.querySelector(".message-body")?.textContent
            || message.querySelector("a")?.textContent
            || "";
        return body.trim() ? label + ": " + body.trim() : "";
    }).filter(Boolean);

    if (!entries.length) {
        showToast("There are no visible messages to export.");
        return;
    }

    const exportedAt = new Date().toLocaleString();
    const contents = [
        "JARVIS — CONVERSATION TRANSCRIPT",
        "Exported: " + exportedAt,
        "----------------------------------------",
        "",
        ...entries,
        ""
    ].join("\n");
    const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "jarvis-transcript-" + new Date().toISOString().replace(/[:.]/g, "-") + ".txt";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    showToast("Transcript exported as a text file.");
}

function autosizeMessageInput() {
    if (!messageInput) return;
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
}

if (messageForm && messageInput) {
    messageForm.addEventListener("submit", (event) => {
        event.preventDefault();
        sendTypedMessage(messageInput.value);
    });
    messageInput.addEventListener("input", autosizeMessageInput);
    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            messageForm.requestSubmit();
        }
    });
}

quickCommandButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const prompt = button.dataset.prompt || "";
        if (!prompt) return;
        if (connected && dataChannel && dataChannel.readyState === "open") {
            sendTypedMessage(prompt);
            return;
        }
        if (messageInput) {
            messageInput.value = prompt;
            autosizeMessageInput();
        }
        showToast("Prompt prepared. Start a live session, then send it from the conversation panel.");
    });
});

if (exportTranscriptButton) {
    exportTranscriptButton.addEventListener("click", exportVisibleTranscript);
}

function ensureConversationVisible() {
    if (emptyState && emptyState.isConnected) emptyState.remove();
}

function addMessage(role, text) {
    ensureConversationVisible();
    const bubble = document.createElement("article");
    bubble.className = "message " + (role === "user" ? "message-user" : "message-assistant");

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
    if (!isAuthenticated || !content || !content.trim()) return;
    try {
        const response = await fetch("/api/conversation/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, content: content.trim() }),
            cache: "no-store"
        });
        if (response.status === 401) showLogin("Your sign-in session expired. Sign in again.");
    } catch (error) {
        console.warn("Conversation text was not saved.", error);
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

    if (segment && start !== null && segment.lastEnd !== null && start - segment.lastEnd > 2200) {
        flushTranscript(role);
        segment = null;
    }

    if (!segment) {
        const message = addMessage(role, "");
        segment = { text: "", body: message.body, lastEnd: null, timer: null };
        activeTranscriptSegments[role] = segment;
    }

    segment.text += delta;
    segment.body.textContent = segment.text;
    if (end !== null) segment.lastEnd = end;

    if (segment.timer) window.clearTimeout(segment.timer);
    segment.timer = window.setTimeout(() => flushTranscript(role), 1800);
    conversation.scrollTop = conversation.scrollHeight;

    if (role === "user") {
        setStatus("Listening...", "Your voice is being streamed to the live session. You can interrupt JARVIS at any time.", "listening");
    } else {
        setStatus("JARVIS is speaking...", "You can interrupt naturally; JARVIS will stop and listen.", "speaking");
    }
}

async function loadHistory() {
    if (!isAuthenticated) return;
    try {
        const response = await fetch("/api/history", { cache: "no-store" });
        if (response.status === 401) {
            showLogin("Your sign-in session expired. Sign in again.");
            return;
        }
        if (!response.ok) throw new Error("History request failed.");
        const data = await response.json();
        const messages = Array.isArray(data.messages) ? data.messages : [];
        if (messages.length) {
            historyLabel.textContent = "Saved transcripts";
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

async function refreshServiceStatus() {
    try {
        const response = await fetch("/api/status", { cache: "no-store" });
        const data = await response.json();
        if (!data.live_configured) {
            setupNote.textContent = "Voice is not configured. The owner must add OPENAI_API_KEY in the hosting dashboard.";
        } else {
            setupNote.textContent = "Voice: " + (data.live_model || "GPT-Live") +
                " · Backend: " + (data.backend_model || "Responses") +
                ". Voice duration and backend model/tool usage can incur API charges.";
        }
        if (!data.history_enabled) historyLabel.textContent = "History disabled";
    } catch (error) {
        setupNote.textContent = "Could not check the JARVIS service status.";
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
            reject(new Error("Timed out while gathering WebRTC connection details."));
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
        const timeout = window.setTimeout(() => reject(new Error("GPT-Live did not confirm that the session started.")), timeoutMs);
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
    if (!isAuthenticated || connecting || connected) return;

    connecting = true;
    sessionFinalized = false;
    updateControls();
    setupNote.textContent = "";
    setStatus("Connecting to JARVIS...", "Requesting microphone access and starting the live session.", "connecting");

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Microphone access requires HTTPS and a supported browser.");
        }
        if (!window.RTCPeerConnection) throw new Error("This browser does not support WebRTC.");

        const audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };
        if (selectedMicDeviceId) audioConstraints.deviceId = { exact: selectedMicDeviceId };

        try {
            microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (error) {
            const deviceUnavailable = selectedMicDeviceId &&
                ["OverconstrainedError", "NotFoundError"].includes(error.name);
            if (!deviceUnavailable) throw error;
            console.warn("The preferred microphone is unavailable; retrying with the system default.");
            saveMicrophonePreference("");
            if (micDeviceSelect) micDeviceSelect.value = "";
            showToast("Preferred microphone unavailable. Using the system default instead.");
            microphoneStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
        }
        if (micPermissionStatus) micPermissionStatus.textContent = "GRANTED";
        await refreshAudioDevices();
        microphoneStream.getAudioTracks().forEach((track) => {
            track.addEventListener("ended", () => {
                if (!connected && !connecting) return;
                setStatus("Microphone disconnected.", "The selected input device stopped. Reconnect your microphone and start a new session.", "error");
                stopConversation(false).catch((error) => console.warn("Could not close the session after microphone loss.", error));
            }, { once: true });
        });
        startMicrophoneVisualizer(microphoneStream);

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
            const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
            remoteAudio.srcObject = stream;
            updateControls();
            remoteAudio.play().catch((error) => {
                console.warn("Browser audio playback needs user interaction.", error);
                setStatus("Audio playback blocked", "Check browser audio permissions and try again.", "error");
            });
        });

        microphoneStream.getAudioTracks().forEach((track) => peerConnection.addTrack(track, microphoneStream));

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
                setStatus("Connection interrupted", "Waiting for WebRTC to recover.", "connecting");
            } else if (peerConnection.connectionState === "connected" && connected) {
                setStatus("JARVIS is online.", "The live voice channel is active. Speak naturally or send a text prompt.", "connected");
            }
        });

        const startedPromise = waitForSessionStarted();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await waitForIceGathering(peerConnection);

        const sdp = peerConnection.localDescription && peerConnection.localDescription.sdp;
        if (!sdp) throw new Error("The browser did not create a WebRTC offer.");

        const response = await fetch("/api/live/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sdp }),
            cache: "no-store"
        });
        const result = await response.json();
        if (response.status === 401) {
            showLogin("Your sign-in session expired. Sign in again.");
            throw new Error("Your sign-in session expired.");
        }
        if (!response.ok) throw new Error(result.error || "Could not create the GPT-Live session.");
        if (!result.transport || typeof result.transport.sdp !== "string") {
            throw new Error("The Live service returned an invalid WebRTC answer.");
        }

        sessionId = result.session && result.session.id ? result.session.id : null;
        await peerConnection.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });
        await startedPromise;

        connected = true;
        connecting = false;
        updateControls();
        setStatus("JARVIS is online.", "Speak naturally. You can interrupt while I am responding.", "connected");

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
        if (isAuthenticated) setStatus("Could not connect.", message, "error");
    } finally {
        connecting = false;
        updateControls();
    }
}

function getResponseKey(envelope, nested) {
    return envelope.delegation_id ||
        nested.response_id ||
        (nested.response && nested.response.id) ||
        "unkeyed_" + nextEventId("response");
}

async function runDelegatedTool(item) {
    if (!item || !item.call_id || handledToolCalls.has(item.call_id)) return null;
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
        if (response.status === 401) {
            showLogin("Your sign-in session expired.");
            throw new Error("Sign-in session expired.");
        }
        if (!response.ok) result = { ok: false, message: result.error || "The requested tool was rejected." };
    } catch (error) {
        result = { ok: false, message: "The tool service could not complete this request." };
    }

    if (result.browser_action && result.browser_action.type === "open_url") {
        addActionLink(result.browser_action.label, result.browser_action.url);
        result.message += " I added a link for you to open.";
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

async function finishDelegatedResponse(key) {
    const batch = pendingResponses.get(key);
    if (!batch || batch.completed) return;
    batch.completed = true;
    pendingResponses.delete(key);
    if (!batch.calls.length) return;

    setStatus("Working on your request...", "JARVIS is using an approved backend tool while keeping the conversation open.", "connected");
    try {
        const outputs = await Promise.all(batch.calls.map(runDelegatedTool));
        outputs.filter(Boolean).forEach((output) => sendEvent(output));
        sendEvent({ type: "response.create", event_id: nextEventId("continue") });
        setStatus("JARVIS is listening.", "You can continue speaking while I finish the task.", "listening");
    } catch (error) {
        console.error("Could not return delegated tool results:", error);
        setStatus("Tool response error", "I could not return a result to the backend agent.", "error");
    }
}

function handleNestedResponseEvent(envelope) {
    const nested = envelope.event || {};
    const key = getResponseKey(envelope, nested);

    if (!pendingResponses.has(key)) pendingResponses.set(key, { calls: [], completed: false });

    if (nested.type === "response.output_item.done") {
        const item = nested.item || nested.output_item || null;
        if (item && item.type === "function_call") pendingResponses.get(key).calls.push(item);
        return;
    }

    if (nested.type === "response.completed") {
        finishDelegatedResponse(key).catch((error) => console.error("Delegated response failed:", error));
        return;
    }

    if (nested.type === "error") {
        const message = nested.error && nested.error.message
            ? nested.error.message
            : "The delegated backend reported an error.";
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
            startSessionClock();
            updateControls();
            setStatus("JARVIS is online.", "The live voice session is ready. Speak naturally and interrupt whenever you need.", "connected");
            if (sessionStartedResolve) sessionStartedResolve();
            break;

        case "session.closed": {
            sessionFinalized = true;
            const usage = event.usage && Number.isFinite(event.usage.seconds)
                ? " Session usage: " + event.usage.seconds + " seconds."
                : "";
            flushTranscript("user");
            flushTranscript("assistant");
            cleanupSession();
            setStatus("Session ended.", "JARVIS has closed the live session." + usage, "idle");
            if (sessionClosedResolve) {
                sessionClosedResolve();
                sessionClosedResolve = null;
            }
            break;
        }

        case "session.input_transcript.delta":
            appendTranscript("user", event.delta || "", event.start_ms, event.end_ms);
            break;

        case "session.output_transcript.delta":
            appendTranscript("assistant", event.delta || "", event.start_ms, event.end_ms);
            break;

        case "session.delegation.created":
            setStatus("JARVIS is working...", "I am handling a backend task while keeping our conversation open.", "thinking");
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
    if (sessionClosedResolve) {
        const resolveClosed = sessionClosedResolve;
        sessionClosedResolve = null;
        resolveClosed();
    }

    flushTranscript("user");
    flushTranscript("assistant");

    connected = false;
    connecting = false;
    stopSessionClock();
    stopMicrophoneVisualizer();
    micMuted = false;
    speakerMuted = false;
    pendingResponses.clear();
    handledToolCalls.clear();

    if (dataChannel) {
        try { dataChannel.close(); } catch (error) { console.warn(error); }
        dataChannel = null;
    }

    if (peerConnection) {
        try { peerConnection.close(); } catch (error) { console.warn(error); }
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

async function stopConversation(updateStatus = true) {
    if (connected && dataChannel && dataChannel.readyState === "open") {
        const closed = new Promise((resolve) => {
            sessionClosedResolve = resolve;
            closeTimer = window.setTimeout(resolve, 8000);
        });
        try {
            sendEvent({ type: "session.close", event_id: nextEventId("close") });
            await closed;
        } catch (error) {
            console.warn("Could not gracefully close the Live session.", error);
        } finally {
            sessionClosedResolve = null;
        }
    }

    cleanupSession();
    if (updateStatus && isAuthenticated) {
        setStatus("Session ended.", "Start another conversation whenever you need me.", "idle");
    }
}

listenButton.addEventListener("click", () => {
    if (connected || connecting) stopConversation();
    else startConversation();
});

micControlButton.addEventListener("click", () => {
    if (!connected || !microphoneStream) return;
    micMuted = !micMuted;
    microphoneStream.getAudioTracks().forEach((track) => {
        track.enabled = !micMuted;
    });
    micControlButton.setAttribute("aria-pressed", String(micMuted));
    micControlText.textContent = micMuted ? "Unmute mic" : "Mute mic";
    micStateText.textContent = micMuted ? "MIC MUTED" : "MIC ACTIVE";
    if (waveform) waveform.dataset.active = String(!micMuted);
});

speakerControlButton.addEventListener("click", () => {
    if (!connected || !remoteAudio) return;
    speakerMuted = !speakerMuted;
    remoteAudio.muted = speakerMuted;
    speakerControlButton.setAttribute("aria-pressed", String(speakerMuted));
    speakerControlText.textContent = speakerMuted ? "Unmute speaker" : "Mute speaker";
});

clearButton.addEventListener("click", () => {
    conversation.replaceChildren();
    if (emptyState) conversation.appendChild(emptyState);
    historyLabel.textContent = "View cleared";
    showToast("Visible transcript cleared. Saved history remains unchanged.");
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
        // Always release local media when the user leaves the page.
    }
    if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
    stopMicrophoneVisualizer();
    stopSessionClock();
    if (toastTimer) window.clearTimeout(toastTimer);
    window.clearInterval(localClockTimer);
    window.removeEventListener("online", handleNetworkChange);
    window.removeEventListener("offline", handleNetworkChange);
    if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", refreshAudioDevices);
    }
    if (micPermissionQuery && micPermissionChangeHandler) {
        micPermissionQuery.removeEventListener("change", micPermissionChangeHandler);
    }
    if (peerConnection) peerConnection.close();
});

buildWaveform();
updateControls();
checkAuthentication();
