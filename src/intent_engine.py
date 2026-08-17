class IntentEngine:

    def detect(self, text):

        text = text.lower().strip()

        if not text:
            return "EMPTY"

        # Exit
        if any(word in text for word in [
            "exit",
            "quit",
            "stop",
            "shutdown",
            "goodbye"
        ]):
            return "EXIT"

        # Time
        if any(phrase in text for phrase in [
            "what time",
            "current time",
            "time is it",
            "tell me the time"
        ]):
            return "GET_TIME"

        # Date
        if any(phrase in text for phrase in [
            "what date",
            "today's date",
            "todays date",
            "what is the date",
            "today"
        ]):
            return "GET_DATE"

        # Websites
        if "open google" in text:
            return "OPEN_GOOGLE"

        if "open github" in text:
            return "OPEN_GITHUB"

        if "open youtube" in text:
            return "OPEN_YOUTUBE"

        if "open linkedin" in text:
            return "OPEN_LINKEDIN"

        if "open gmail" in text or "open email" in text:
            return "OPEN_GMAIL"

        # Calculator
        if any(word in text for word in [
            "calculate",
            "calculator",
            "what is",
            "how much is"
        ]) and any(word in text for word in [
            "plus",
            "minus",
            "times",
            "multiplied",
            "divided",
            "divide",
            "add",
            "subtract",
            "multiply"
        ]):
            return "CALCULATE"

        # Search
        if text.startswith("search google for"):
            return "SEARCH_GOOGLE"

        if text.startswith("google search"):
            return "SEARCH_GOOGLE"

        if text.startswith("search for"):
            return "SEARCH_GOOGLE"

        # Greeting
        if any(phrase in text for phrase in [
            "hello",
            "hi jarvis",
            "hey jarvis",
            "good morning",
            "good evening"
        ]):
            return "GREETING"

        # Identity
        if "who are you" in text:
            return "IDENTITY"

        if "what can you do" in text:
            return "CAPABILITIES"

        if "how are you" in text:
            return "HOW_ARE_YOU"

        # History
        if "show history" in text:
            return "SHOW_HISTORY"

        if "conversation history" in text:
            return "SHOW_HISTORY"

        return "GENERAL_QUERY"
