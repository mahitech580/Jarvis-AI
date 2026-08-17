from src.speech_to_text import SpeechToText
from src.text_to_speech import TextToSpeech
from src.intent_engine import IntentEngine
from src.command_handler import CommandHandler
from src.ai_engine import AIEngine
from src.database import Database


class Jarvis:

    def __init__(self):

        self.stt = SpeechToText()
        self.tts = TextToSpeech()
        self.intent_engine = IntentEngine()
        self.command_handler = CommandHandler()
        self.ai_engine = AIEngine()
        self.database = Database()

    def display_history(self):

        history = self.database.get_history(10)

        if not history:

            print("\nNo conversation history found.\n")

            return (
                "There is no conversation history yet."
            )

        print("\n" + "=" * 60)
        print("                 CONVERSATION HISTORY")
        print("=" * 60)

        for row in reversed(history):

            timestamp = row[0]
            user_text = row[1]
            intent = row[2]
            response = row[3]

            print(f"\nTime: {timestamp}")
            print(f"You: {user_text}")
            print(f"Intent: {intent}")
            print(f"Jarvis: {response}")

        print("\n" + "=" * 60)

        return "I displayed your recent conversation history."

    def run(self):

        print("=" * 60)
        print("                 JARVIS AI")
        print("        Intelligent Voice Assistant")
        print("=" * 60)

        self.tts.speak(
            "Jarvis is online. How can I help you?"
        )

        while True:

            try:

                user_text = self.stt.listen()

                if not user_text:
                    continue

                print(f"You: {user_text}")

                intent = self.intent_engine.detect(
                    user_text
                )

                print(f"Intent: {intent}")

                if intent == "EXIT":

                    response = (
                        "Goodbye. Jarvis is shutting down."
                    )

                    self.tts.speak(response)

                    self.database.save_conversation(
                        user_text,
                        intent,
                        response
                    )

                    break

                if intent == "SHOW_HISTORY":

                    response = self.display_history()

                else:

                    response = self.command_handler.execute(
                        intent,
                        user_text
                    )

                    if response is None:

                        response = self.ai_engine.respond(
                            user_text
                        )

                self.database.save_conversation(
                    user_text,
                    intent,
                    response
                )

                self.tts.speak(response)

            except KeyboardInterrupt:

                print("\nJarvis stopped.")

                break

            except Exception as error:

                print(
                    f"Application error: {error}"
                )

                self.tts.speak(
                    "I encountered an unexpected error."
                )

        self.database.close()


if __name__ == "__main__":

    Jarvis().run()
