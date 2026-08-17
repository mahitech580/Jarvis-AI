import pyttsx3

from .config import TTS_RATE, TTS_VOLUME


class TextToSpeech:
    def __init__(self):
        self.engine = pyttsx3.init()

        self.engine.setProperty(
            "rate",
            TTS_RATE
        )

        self.engine.setProperty(
            "volume",
            TTS_VOLUME
        )

    def speak(self, text):
        print(f"Jarvis: {text}")

        self.engine.say(text)
        self.engine.runAndWait()
