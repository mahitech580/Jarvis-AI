"""AI response engine for the local desktop assistant.

The desktop path uses the Responses API when OPENAI_API_KEY is configured.
Without a key or network access it falls back to a small offline FAQ.
"""

import logging
import requests

from src.config import OPENAI_API_KEY, AI_MODEL

logger = logging.getLogger(__name__)


class AIEngine:
    def __init__(self, api_key=None, model=None):
        self.api_key = OPENAI_API_KEY if api_key is None else api_key
        self.model = model or AI_MODEL
        self.enabled = bool(self.api_key)

    def respond(self, user_text, history=None):
        if self.enabled:
            try:
                return self._respond_with_model(user_text, history or [])
            except requests.RequestException:
                logger.exception("The desktop AI request failed.")
                return "I could not reach the AI service. Please check your internet connection and API access."
            except (ValueError, KeyError, TypeError):
                logger.exception("The AI service returned an unexpected response.")
                return "I received an unreadable response from the AI service. Please try again."
        return self._offline_response(user_text)

    def _respond_with_model(self, user_text, history):
        context_lines = []
        for row in reversed(history[-8:]):
            if len(row) >= 4:
                context_lines.append("User: " + str(row[1])[:1000])
                context_lines.append("JARVIS: " + str(row[3])[:1000])

        prompt = user_text.strip()
        if context_lines:
            prompt = (
                "Recent conversation context (oldest first):\n"
                + "\n".join(context_lines)
                + "\n\nLatest user message:\n"
                + prompt
            )

        response = requests.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": "Bearer " + self.api_key,
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "instructions": (
                    "You are JARVIS, a helpful desktop voice assistant. "
                    "Answer accurately and naturally. Keep spoken answers concise. "
                    "Never claim to control the user's computer unless a local command "
                    "actually performed that action. Ask a question when a request is ambiguous."
                ),
                "input": prompt,
                "max_output_tokens": 500,
            },
            timeout=(5, 35),
        )
        response.raise_for_status()
        payload = response.json()

        output_text = payload.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()

        parts = []
        for item in payload.get("output", []):
            if item.get("type") != "message":
                continue
            for content in item.get("content", []):
                if content.get("type") in {"output_text", "text"}:
                    text = content.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text.strip())

        if not parts:
            raise ValueError("No text was returned.")
        return "\n".join(parts)

    def _offline_response(self, user_text):
        text = user_text.lower().strip()

        if text in {"hi", "hello", "hey", "hi jarvis", "hey jarvis"}:
            return "Hello! I am Jarvis. How can I help you?"
        if any(phrase in text for phrase in ("are you there", "can you hear me")):
            return "Yes, I am here and listening. How can I help you?"
        if any(phrase in text for phrase in ("who are you", "what are you", "introduce yourself")):
            return (
                "I am Jarvis, a Python voice assistant. I can understand speech, "
                "run supported commands, answer questions when AI is configured, "
                "and keep a local conversation history."
            )
        if any(phrase in text for phrase in ("what can you do", "your capabilities", "your features")):
            return (
                "I can tell you the time and date, open supported websites, search Google, "
                "perform basic calculations, answer common questions, and save conversation history."
            )
        if "python" in text and any(word in text for word in ("what", "explain", "about", "define")):
            return (
                "Python is a high-level programming language used for web development, "
                "automation, data science, machine learning, and artificial intelligence."
            )
        if "machine learning" in text:
            return "Machine learning enables software to learn patterns from data and use them to make predictions."
        if "deep learning" in text:
            return "Deep learning is a type of machine learning that uses multi-layer neural networks."
        if "artificial intelligence" in text or "generative ai" in text:
            return "Artificial intelligence builds systems that perform tasks such as language understanding, prediction, and decision-making."
        if "sql" in text:
            return "SQL is used to store, retrieve, update, and manage data in relational databases."
        if "whisper" in text:
            return "Whisper is a speech recognition model that converts spoken audio into text."
        if "voice assistant" in text or "voice ai" in text:
            return "A voice assistant combines speech recognition, conversation logic, tools, and speech generation."
        if "thank you" in text or text == "thanks":
            return "You're welcome. I am ready to help."
        if "how are you" in text:
            return "I am functioning normally and ready to help."
        if "good morning" in text:
            return "Good morning! I hope you have a great day."
        if "good afternoon" in text:
            return "Good afternoon! How can I help you?"
        if "good evening" in text:
            return "Good evening! What can I do for you?"
        if "joke" in text:
            return "Why do programmers prefer dark mode? Because light attracts bugs."

        return (
            "I do not have an offline answer for that yet. Add an OpenAI API key "
            "to your .env file to enable full AI responses in the desktop assistant."
        )
