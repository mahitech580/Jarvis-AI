"""Safe, allowlisted tools exposed to the JARVIS delegated live assistant."""

from __future__ import annotations

import ast
import math
import operator
import re
from datetime import datetime
from urllib.parse import quote_plus
from typing import Any

from src.config import SAVE_CONVERSATION_HISTORY

SITES = {
    "google": "https://www.google.com",
    "youtube": "https://www.youtube.com",
    "github": "https://github.com",
    "linkedin": "https://www.linkedin.com",
    "gmail": "https://mail.google.com",
    "wikipedia": "https://www.wikipedia.org",
    "stackoverflow": "https://stackoverflow.com",
}

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "name": "get_current_datetime",
        "description": "Get the current local date, time, and timezone.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "calculate",
        "description": "Evaluate a basic arithmetic expression. Supports +, -, *, /, //, %, and parentheses. Do not use this for code execution.",
        "parameters": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "A numeric arithmetic expression, for example (25 * 4) + 10.",
                }
            },
            "required": ["expression"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "search_web",
        "description": "Prepare a Google search link for a current or specific web query. The user opens the returned link from the chat.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search terms to look up.",
                }
            },
            "required": ["query"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "open_website",
        "description": "Prepare a link to one of the supported websites. Only use a site from the allowed list.",
        "parameters": {
            "type": "object",
            "properties": {
                "website": {
                    "type": "string",
                    "enum": list(SITES.keys()),
                    "description": "One of: " + ", ".join(SITES.keys()),
                }
            },
            "required": ["website"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "get_recent_history",
        "description": "Retrieve a small number of recent JARVIS conversation messages saved locally.",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 10,
                    "description": "Number of recent messages to retrieve.",
                }
            },
            "required": ["limit"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]


def _calculate(expression: str) -> str:
    """Evaluate bounded arithmetic without eval/exec or arbitrary names."""
    if not isinstance(expression, str) or not expression.strip():
        raise ValueError("A calculation expression is required.")
    if len(expression) > 120:
        raise ValueError("The calculation is too long.")

    normalized = expression.lower().strip()
    replacements = {
        "multiplied by": "*",
        "divided by": "/",
        "plus": "+",
        "minus": "-",
        "times": "*",
        "multiply by": "*",
        "divide by": "/",
        "over": "/",
    }
    for phrase, symbol in replacements.items():
        normalized = re.sub(r"\b" + re.escape(phrase) + r"\b", symbol, normalized)

    if not re.fullmatch(r"[0-9+\-*/().%\s]+", normalized):
        raise ValueError("Use only numbers, parentheses, and basic arithmetic operators.")

    tree = ast.parse(normalized, mode="eval")
    if sum(1 for _ in ast.walk(tree)) > 40:
        raise ValueError("The calculation is too complex.")

    binary_ops = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
    }
    unary_ops = {ast.UAdd: operator.pos, ast.USub: operator.neg}

    def evaluate(node: ast.AST) -> float | int:
        if isinstance(node, ast.Expression):
            return evaluate(node.body)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise ValueError("Only numeric values are allowed.")
            if abs(node.value) > 1_000_000_000_000:
                raise ValueError("The numbers are outside the supported range.")
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in binary_ops:
            left = evaluate(node.left)
            right = evaluate(node.right)
            value = binary_ops[type(node.op)](left, right)
            if not math.isfinite(float(value)) or abs(value) > 1_000_000_000_000:
                raise ValueError("The result is outside the supported range.")
            return value
        if isinstance(node, ast.UnaryOp) and type(node.op) in unary_ops:
            value = unary_ops[type(node.op)](evaluate(node.operand))
            if not math.isfinite(float(value)) or abs(value) > 1_000_000_000_000:
                raise ValueError("The result is outside the supported range.")
            return value
        raise ValueError("That expression contains an unsupported operation.")

    result = evaluate(tree)
    if isinstance(result, float) and result.is_integer():
        result = int(result)
    return str(result)


def execute_tool(name: str, arguments: Any, database: Any = None) -> dict[str, Any]:
    """Run one explicitly allowlisted function and return JSON-safe data."""
    if not isinstance(arguments, dict):
        return {"ok": False, "message": "Tool arguments must be a JSON object."}

    try:
        if name == "get_current_datetime":
            if arguments:
                raise ValueError("This tool does not accept arguments.")
            now = datetime.now().astimezone()
            return {
                "ok": True,
                "message": now.strftime("%A, %d %B %Y at %I:%M:%S %p %Z"),
                "iso_datetime": now.isoformat(),
                "timezone": str(now.tzinfo),
            }

        if name == "calculate":
            if set(arguments) != {"expression"}:
                raise ValueError("Expected only an expression argument.")
            return {"ok": True, "message": "The answer is " + _calculate(arguments["expression"]) + "."}

        if name == "search_web":
            if set(arguments) != {"query"}:
                raise ValueError("Expected only a query argument.")
            query = arguments["query"]
            if not isinstance(query, str) or not query.strip() or len(query) > 200:
                raise ValueError("Enter a search query between 1 and 200 characters.")
            url = "https://www.google.com/search?q=" + quote_plus(query.strip())
            return {
                "ok": True,
                "message": "I prepared a Google search link for: " + query.strip(),
                "browser_action": {"type": "open_url", "url": url, "label": "Open search results"},
            }

        if name == "open_website":
            if set(arguments) != {"website"}:
                raise ValueError("Expected only a website argument.")
            website = arguments["website"]
            if not isinstance(website, str) or website.lower() not in SITES:
                raise ValueError("That website is not on the allowlist.")
            website = website.lower()
            return {
                "ok": True,
                "message": "I prepared the " + website.title() + " link.",
                "browser_action": {
                    "type": "open_url",
                    "url": SITES[website],
                    "label": "Open " + website.title(),
                },
            }

        if name == "get_recent_history":
            if not SAVE_CONVERSATION_HISTORY:
                return {"ok": True, "messages": [], "message": "Conversation history is disabled."}
            if set(arguments) != {"limit"}:
                raise ValueError("Expected only a limit argument.")
            if database is None:
                return {"ok": True, "messages": [], "message": "Conversation storage is unavailable."}
            limit = arguments["limit"]
            if isinstance(limit, bool) or not isinstance(limit, int):
                raise ValueError("Limit must be an integer.")
            limit = max(1, min(limit, 10))
            messages = database.get_recent_messages(limit)
            return {"ok": True, "messages": messages, "message": "Retrieved recent local conversation messages."}

        return {"ok": False, "message": "This tool is not available."}

    except (ValueError, TypeError, SyntaxError, ZeroDivisionError, OverflowError) as error:
        return {"ok": False, "message": str(error)}
    except Exception:
        return {"ok": False, "message": "The tool could not complete the request."}
