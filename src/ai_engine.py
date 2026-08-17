class AIEngine:

    def __init__(self):
        self.enabled = False

    def respond(self, user_text):

        text = user_text.lower().strip()

        # -------------------------------------------------
        # GREETINGS
        # -------------------------------------------------

        if any(word in text for word in [
            "hello",
            "hi jarvis",
            "hi",
            "hey jarvis",
            "hey"
        ]):
            return (
                "Hello! I am Jarvis. "
                "How can I help you?"
            )


        # -------------------------------------------------
        # PRESENCE
        # -------------------------------------------------

        if any(phrase in text for phrase in [
            "are you there",
            "are you present",
            "present",
            "can you hear me"
        ]):
            return (
                "Yes, I am here and listening. "
                "How can I help you?"
            )


        # -------------------------------------------------
        # IDENTITY
        # -------------------------------------------------

        if any(phrase in text for phrase in [
            "who are you",
            "what are you",
            "tell me about yourself",
            "introduce yourself"
        ]):
            return (
                "I am Jarvis, an intelligent voice assistant "
                "built with Python. I can understand voice "
                "commands, detect intents, perform local "
                "tasks, store conversation history, and "
                "respond using speech."
            )


        # -------------------------------------------------
        # CAPABILITIES
        # -------------------------------------------------

        if any(phrase in text for phrase in [
            "what can you do",
            "what do you do",
            "your capabilities",
            "your features",
            "help me",
            "how can you help me"
        ]):
            return (
                "I can understand voice commands, tell you "
                "the time and date, open websites such as "
                "Google, GitHub and YouTube, perform "
                "calculations, answer common technical "
                "questions, and maintain conversation history."
            )


        # -------------------------------------------------
        # PYTHON
        # -------------------------------------------------

        if (
            "python" in text
            and any(word in text for word in [
                "what",
                "explain",
                "tell",
                "about",
                "define"
            ])
        ):
            return (
                "Python is a high-level, interpreted programming "
                "language known for its simple syntax. It is "
                "widely used in web development, automation, "
                "data science, machine learning, artificial "
                "intelligence, and scripting."
            )


        # -------------------------------------------------
        # ARTIFICIAL INTELLIGENCE
        # -------------------------------------------------

        if (
            ("artificial intelligence" in text)
            or (
                "ai" in text
                and any(word in text for word in [
                    "what",
                    "explain",
                    "about",
                    "define"
                ])
            )
        ):
            return (
                "Artificial intelligence is a field of computer "
                "science focused on creating systems that can "
                "perform tasks that normally require human "
                "intelligence, such as understanding language, "
                "recognizing patterns, and making decisions."
            )


        # -------------------------------------------------
        # MACHINE LEARNING
        # -------------------------------------------------

        if (
            "machine learning" in text
            and any(word in text for word in [
                "what",
                "explain",
                "about",
                "define"
            ])
        ):
            return (
                "Machine learning is a branch of artificial "
                "intelligence where computers learn patterns "
                "from data and use those patterns to make "
                "predictions or decisions."
            )


        # -------------------------------------------------
        # DEEP LEARNING
        # -------------------------------------------------

        if (
            "deep learning" in text
            and any(word in text for word in [
                "what",
                "explain",
                "about",
                "define"
            ])
        ):
            return (
                "Deep learning is a type of machine learning "
                "that uses multi-layer neural networks to learn "
                "complex patterns from large amounts of data."
            )


        # -------------------------------------------------
        # SQL
        # -------------------------------------------------

        if (
            "sql" in text
            and any(word in text for word in [
                "what",
                "explain",
                "about",
                "define"
            ])
        ):
            return (
                "SQL stands for Structured Query Language. "
                "It is used to store, retrieve, update, and "
                "manage data in relational databases."
            )


        # -------------------------------------------------
        # VOICE AI
        # -------------------------------------------------

        if (
            "voice ai" in text
            or "voice assistant" in text
            or "voice artificial intelligence" in text
        ):
            return (
                "Voice AI allows computers to understand and "
                "respond to human speech. A typical Voice AI "
                "system uses speech recognition, language "
                "processing, intent detection, and text to "
                "speech technologies."
            )


        # -------------------------------------------------
        # WHISPER
        # -------------------------------------------------

        if "whisper" in text:
            return (
                "Whisper is a speech recognition model developed "
                "by OpenAI. It converts spoken audio into text "
                "and supports multiple languages."
            )


        # -------------------------------------------------
        # GENERATIVE AI
        # -------------------------------------------------

        if (
            "generative ai" in text
            or "generative artificial intelligence" in text
        ):
            return (
                "Generative AI is artificial intelligence that "
                "can create new content such as text, images, "
                "audio, code, and other types of data."
            )


        # -------------------------------------------------
        # PYTHON PROJECT
        # -------------------------------------------------

        if (
            "how does this work" in text
            or "how do you work" in text
            or "how does jarvis work" in text
        ):
            return (
                "I use a voice recognition layer to convert "
                "your speech into text. The text is then "
                "processed by my intent engine. Commands are "
                "handled locally and responses are converted "
                "back into speech."
            )


        # -------------------------------------------------
        # THANKS
        # -------------------------------------------------

        if any(phrase in text for phrase in [
            "thank you",
            "thanks",
            "thank you jarvis"
        ]):
            return (
                "You're welcome. I am always ready to help."
            )


        # -------------------------------------------------
        # HOW ARE YOU
        # -------------------------------------------------

        if any(phrase in text for phrase in [
            "how are you",
            "how are you doing",
            "are you doing well"
        ]):
            return (
                "I am functioning normally and ready to "
                "help you."
            )


        # -------------------------------------------------
        # GOOD MORNING / AFTERNOON / EVENING
        # -------------------------------------------------

        if "good morning" in text:
            return (
                "Good morning! I hope you have a great day."
            )

        if "good afternoon" in text:
            return (
                "Good afternoon! How can I help you?"
            )

        if "good evening" in text:
            return (
                "Good evening! What can I do for you?"
            )


        # -------------------------------------------------
        # JOKE
        # -------------------------------------------------

        if any(word in text for word in [
            "tell me a joke",
            "tell a joke",
            "make me laugh"
        ]):
            return (
                "Why do programmers prefer dark mode? "
                "Because light attracts bugs."
            )


        # -------------------------------------------------
        # LOCAL FALLBACK
        # -------------------------------------------------

        return (
            "I understand your request, but I don't have "
            "a local answer for that yet. You can ask me "
            "about Python, artificial intelligence, machine "
            "learning, SQL, Voice AI, Whisper, or my "
            "capabilities."
        )
