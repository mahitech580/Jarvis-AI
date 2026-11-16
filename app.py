from src.speech_to_text import SpeechToText
from src.text_to_speech import TextToSpeech
from src.intent_engine import IntentEngine
from src.command_handler import CommandHandler
from src.ai_engine import AIEngine
from src.database import Database
from src.config import DATABASE_PATH, SAVE_CONVERSATION_HISTORY


class Jarvis:
    def __init__(self):
        self.stt = SpeechToText()
        self.tts = TextToSpeech()
        self.intent_engine = IntentEngine()
        self.command_handler = CommandHandler()
        self.database = Database(DATABASE_PATH)
        self.ai_engine = AIEngine()

    def display_history(self):
        history = self.database.get_history(10)
        if not history:
            print("\nNo conversation history found.\n")
            return "There is no conversation history yet."

        print("\n" + "=" * 60)
        print("                 CONVERSATION HISTORY")
        print("=" * 60)
        for timestamp, user_text, intent, response in reversed(history):
            print(f"\nTime: {timestamp}")
            print(f"You: {user_text}")
            print(f"Intent: {intent}")
            print(f"Jarvis: {response}")
        print("\n" + "=" * 60)
        return "I displayed your recent conversation history."

    def _save_turn(self, user_text, intent, response):
        if not SAVE_CONVERSATION_HISTORY:
            return
        self.database.save_conversation(user_text, intent, response)
        # Keep the shared browser/desktop recent-history memory in sync.
        self.database.save_message("user", user_text)
        self.database.save_message("assistant", response)

    def run(self):
        print("=" * 60)
        print("                 JARVIS AI")
        print("        Intelligent Voice Assistant")
        print("=" * 60)
        self.tts.speak("Jarvis is online. How can I help you?")

        try:
            while True:
                try:
                    user_text = self.stt.listen()
                    if not user_text:
                        continue

                    print(f"You: {user_text}")
                    intent = self.intent_engine.detect(user_text)
                    print(f"Intent: {intent}")

                    if intent == "EXIT":
                        response = "Goodbye. Jarvis is shutting down."
                        self._save_turn(user_text, intent, response)
                        self.tts.speak(response)
                        break

                    if intent == "SHOW_HISTORY":
                        response = self.display_history()
                    else:
                        response = self.command_handler.execute(intent, user_text)
                        if response is None:
                            response = self.ai_engine.respond(
                                user_text,
                                history=self.database.get_history(8),
                            )

                    self._save_turn(user_text, intent, response)
                    self.tts.speak(response)

                except KeyboardInterrupt:
                    print("\nJarvis stopped.")
                    break
                except Exception:
                    print("Application error. Check the logs and try again.")
                    self.tts.speak("I encountered an unexpected error.")
        finally:
            self.database.close()


if __name__ == "__main__":
    Jarvis().run()
