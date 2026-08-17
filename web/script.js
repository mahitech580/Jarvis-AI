const button = document.getElementById("listenBtn");
const orb = document.getElementById("orb");

const statusText = document.getElementById("statusText");
const subStatus = document.getElementById("subStatus");

const userBox = document.getElementById("userBox");
const jarvisBox = document.getElementById("jarvisBox");

const userMessage = document.getElementById("userMessage");
const jarvisMessage = document.getElementById("jarvisMessage");

let active = false;
let recognition = null;
let processing = false;


function setListeningUI() {

    orb.classList.add("active");

    button.textContent = "?";

    statusText.textContent =
        "Listening...";

    subStatus.textContent =
        "Speak to JARVIS";
}


function setIdleUI() {

    orb.classList.remove("active");

    button.textContent = "??";

    statusText.textContent =
        "How can I help?";

    subStatus.textContent =
        "Tap the microphone to start";
}


function speak(text) {

    return new Promise(resolve => {

        if (!window.speechSynthesis) {
            resolve();
            return;
        }

        window.speechSynthesis.cancel();

        const speech =
            new SpeechSynthesisUtterance(text);

        speech.rate = 1;
        speech.pitch = 1;

        speech.onstart = () => {

            statusText.textContent =
                "JARVIS is speaking...";

            subStatus.textContent =
                "Please wait...";
        };

        speech.onend = () => {

            resolve();
        };

        speech.onerror = () => {

            resolve();
        };

        window.speechSynthesis.speak(speech);
    });
}


function listenOnce() {

    return new Promise(resolve => {

        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;


        if (!SpeechRecognition) {

            statusText.textContent =
                "Speech recognition unavailable";

            subStatus.textContent =
                "Use Chrome or Edge";

            resolve(null);

            return;
        }


        recognition =
            new SpeechRecognition();


        recognition.lang = "en-US";

        recognition.continuous = false;

        recognition.interimResults = false;


        let finished = false;


        function finish(value) {

            if (finished) {
                return;
            }

            finished = true;

            recognition = null;

            resolve(value);
        }


        recognition.onstart = () => {

            setListeningUI();
        };


        recognition.onresult = event => {

            const text =
                event.results[0][0]
                    .transcript
                    .trim();

            finish(text);
        };


        recognition.onerror = event => {

            console.log(
                "Speech error:",
                event.error
            );

            finish(null);
        };


        recognition.onend = () => {

            finish(null);
        };


        try {

            recognition.start();

        } catch (error) {

            console.log(error);

            finish(null);
        }

    });
}


async function processCommand(text) {

    processing = true;


    try {

        const response =
            await fetch("/api/command", {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    text: text
                })
            });


        const data =
            await response.json();


        if (!response.ok) {
            throw new Error(
                data.error ||
                "Request failed"
            );
        }


        userBox.classList.remove("hidden");
        jarvisBox.classList.remove("hidden");

        userMessage.textContent =
            text;

        jarvisMessage.textContent =
            data.response;


        statusText.textContent =
            "JARVIS";

        subStatus.textContent =
            data.intent || "Responding";


        await speak(data.response);


    } catch (error) {

        console.error(error);

        jarvisBox.classList.remove("hidden");

        jarvisMessage.textContent =
            "I couldn't process that command.";

        await speak(
            "I couldn't process that command."
        );
    }


    processing = false;
}


async function conversationLoop() {

    while (active) {

        /*
         * WAIT FOR USER
         */

        const text =
            await listenOnce();


        if (!active) {
            break;
        }


        /*
         * MICROPHONE DID NOT HEAR ANYTHING
         */

        if (!text) {

            await new Promise(
                resolve =>
                    setTimeout(resolve, 400)
            );

            continue;
        }


        console.log(
            "User:",
            text
        );


        /*
         * STOP COMMAND
         */

        const lower =
            text.toLowerCase();


        if (
            lower === "stop" ||
            lower === "exit" ||
            lower === "quit" ||
            lower === "goodbye" ||
            lower.includes("stop listening") ||
            lower.includes("go offline")
        ) {

            active = false;

            userBox.classList.remove("hidden");
            jarvisBox.classList.remove("hidden");

            userMessage.textContent =
                text;

            jarvisMessage.textContent =
                "Goodbye! JARVIS is going offline.";

            await speak(
                "Goodbye! JARVIS is going offline."
            );

            setIdleUI();

            break;
        }


        /*
         * PROCESS COMMAND
         */

        await processCommand(text);


        /*
         * SMALL PAUSE BEFORE LISTENING AGAIN
         */

        if (active) {

            await new Promise(
                resolve =>
                    setTimeout(resolve, 300)
            );
        }
    }
}


function startJarvis() {

    if (active) {
        return;
    }

    active = true;

    conversationLoop();
}


function stopJarvis() {

    active = false;

    if (recognition) {

        try {
            recognition.abort();
        } catch (error) {
            console.log(error);
        }

        recognition = null;
    }

    window.speechSynthesis.cancel();

    setIdleUI();
}


button.addEventListener(
    "click",
    () => {

        if (active) {

            stopJarvis();

        } else {

            startJarvis();

        }

    }
);
