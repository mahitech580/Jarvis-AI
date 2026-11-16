import re


class IntentEngine:
    """Small deterministic router for desktop commands."""

    def detect(self, text):
        normalized = " ".join(re.findall(r"[a-z0-9']+", str(text).lower()))
        if not normalized:
            return "EMPTY"

        # Exit only on explicit stop phrases; avoid matching words inside sentences.
        if normalized in {"exit", "quit", "stop", "shutdown", "goodbye", "stop listening", "go offline"}:
            return "EXIT"

        if any(phrase in normalized for phrase in (
            "what time", "current time", "time is it", "tell me the time"
        )):
            return "GET_TIME"

        if normalized in {"today", "what is today", "what's today"} or any(
            phrase in normalized for phrase in (
                "what date", "today's date", "todays date", "what is the date"
            )
        ):
            return "GET_DATE"

        if "open google" in normalized:
            return "OPEN_GOOGLE"
        if "open github" in normalized:
            return "OPEN_GITHUB"
        if "open youtube" in normalized:
            return "OPEN_YOUTUBE"
        if "open linkedin" in normalized:
            return "OPEN_LINKEDIN"
        if "open gmail" in normalized or "open email" in normalized:
            return "OPEN_GMAIL"

        if any(term in normalized for term in (
            "calculate", "calculator", "what is", "how much is"
        )) and any(term in normalized for term in (
            "plus", "minus", "times", "multiplied", "divided",
            "divide", "add", "subtract", "multiply"
        )):
            return "CALCULATE"

        if normalized.startswith(("search google for", "google search", "search for")):
            return "SEARCH_GOOGLE"

        if normalized in {"hello", "hi", "hey", "hi jarvis", "hey jarvis", "good morning", "good afternoon", "good evening"}:
            return "GREETING"

        if "who are you" in normalized:
            return "IDENTITY"
        if any(phrase in normalized for phrase in ("what can you do", "your capabilities", "your features")):
            return "CAPABILITIES"
        if "how are you" in normalized:
            return "HOW_ARE_YOU"
        if "show history" in normalized or "conversation history" in normalized:
            return "SHOW_HISTORY"

        return "GENERAL_QUERY"
