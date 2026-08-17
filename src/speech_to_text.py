import os
import tempfile

import sounddevice as sd
from scipy.io.wavfile import write
import whisper

from .config import WHISPER_MODEL


class SpeechToText:

    def __init__(self):
        print(f"Loading Whisper model: {WHISPER_MODEL}")
        self.model = whisper.load_model(WHISPER_MODEL)

    def listen(self, duration=6, sample_rate=16000):

        print("\n?? Listening...")

        audio = sd.rec(
            int(duration * sample_rate),
            samplerate=sample_rate,
            channels=1,
            dtype="int16"
        )

        sd.wait()

        # Check whether the microphone received meaningful audio.
        peak = abs(audio).max()

        if peak < 500:
            print("No speech detected.")
            return ""

        with tempfile.NamedTemporaryFile(
            suffix=".wav",
            delete=False
        ) as temp:

            audio_path = temp.name

        try:

            write(
                audio_path,
                sample_rate,
                audio
            )

            result = self.model.transcribe(
                audio_path,
                fp16=False
            )

            text = result.get(
                "text",
                ""
            ).strip()

            if not text:
                print("No speech detected.")

            return text

        finally:

            if os.path.exists(audio_path):
                os.remove(audio_path)
