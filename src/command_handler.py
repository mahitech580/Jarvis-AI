import datetime
import webbrowser
import re
import operator
import ast
from urllib.parse import quote_plus


class CommandHandler:
    def execute(self, intent, user_text=""):
        if intent == "GET_TIME":
            return datetime.datetime.now().astimezone().strftime("The current time is %I:%M %p %Z.")
        if intent == "GET_DATE":
            return datetime.datetime.now().astimezone().strftime("Today is %d %B %Y.")
        if intent == "OPEN_GOOGLE":
            webbrowser.open("https://www.google.com")
            return "Opening Google."
        if intent == "OPEN_GITHUB":
            webbrowser.open("https://github.com")
            return "Opening GitHub."
        if intent == "OPEN_YOUTUBE":
            webbrowser.open("https://www.youtube.com")
            return "Opening YouTube."
        if intent == "OPEN_LINKEDIN":
            webbrowser.open("https://www.linkedin.com")
            return "Opening LinkedIn."
        if intent == "OPEN_GMAIL":
            webbrowser.open("https://mail.google.com")
            return "Opening Gmail."
        if intent == "SEARCH_GOOGLE":
            query = self.extract_search_query(user_text)
            if not query:
                return "Please tell me what you want me to search for."
            webbrowser.open("https://www.google.com/search?q=" + quote_plus(query))
            return f"Searching Google for {query}."
        if intent == "CALCULATE":
            return self.calculate(user_text)
        if intent == "GREETING":
            return "Hello! I am Jarvis. How can I help you?"
        if intent == "IDENTITY":
            return "I am Jarvis, a Python-based voice assistant powered by speech recognition and AI."
        if intent == "CAPABILITIES":
            return (
                "I can understand your voice, tell you the time and date, open websites, "
                "search Google, perform calculations, answer questions when AI is configured, "
                "and store conversation history."
            )
        if intent == "HOW_ARE_YOU":
            return "I am functioning normally and ready to help."
        return None

    def extract_search_query(self, text):
        text = text.lower().strip()
        for prefix in ("search google for", "google search", "search for"):
            if text.startswith(prefix):
                return text[len(prefix):].strip()
        return ""

    def calculate(self, text):
        expression = text.lower()
        replacements = {
            "multiplied by": "*", "multiply by": "*", "times": "*",
            "divided by": "/", "divide by": "/", "plus": "+",
            "minus": "-", "add": "+", "subtract": "-", "multiply": "*",
            "divide": "/",
        }
        for phrase, symbol in replacements.items():
            expression = expression.replace(phrase, symbol)

        for phrase in ("calculate", "calculator", "what is", "how much is"):
            expression = expression.replace(phrase, "")
        expression = expression.strip()

        if not re.fullmatch(r"[0-9+\-*/().\s]+", expression):
            return "I could not understand that calculation. Please use numbers and basic operators."
        try:
            result = self.safe_eval(expression)
            return f"The answer is {result}."
        except (ValueError, ZeroDivisionError, SyntaxError, OverflowError):
            return "I could not calculate that expression."

    def safe_eval(self, expression):
        allowed_operators = {
            ast.Add: operator.add,
            ast.Sub: operator.sub,
            ast.Mult: operator.mul,
            ast.Div: operator.truediv,
            ast.USub: operator.neg,
        }

        def evaluate(node):
            if isinstance(node, ast.Expression):
                return evaluate(node.body)
            if isinstance(node, ast.Constant):
                if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                    raise ValueError("Invalid number")
                if abs(node.value) > 1_000_000_000_000:
                    raise ValueError("Number outside supported range")
                return node.value
            if isinstance(node, ast.BinOp):
                operation = allowed_operators.get(type(node.op))
                if operation is None:
                    raise ValueError("Invalid operator")
                value = operation(evaluate(node.left), evaluate(node.right))
                if abs(value) > 1_000_000_000_000:
                    raise ValueError("Result outside supported range")
                return value
            if isinstance(node, ast.UnaryOp):
                operation = allowed_operators.get(type(node.op))
                if operation is None:
                    raise ValueError("Invalid operator")
                return operation(evaluate(node.operand))
            raise ValueError("Invalid expression")

        if len(expression) > 120:
            raise ValueError("Expression too long")
        if sum(1 for _ in ast.walk(ast.parse(expression, mode="eval"))) > 40:
            raise ValueError("Expression too complex")
        return evaluate(ast.parse(expression, mode="eval"))
