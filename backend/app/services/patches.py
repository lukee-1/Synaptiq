"""Validate exact, reversible source edits; never execute imported projects."""

import ast
import json
import re

from pydantic import Field

from app.models.contracts import Contract


class SourceEdit(Contract):
    search: str = Field(min_length=1, max_length=12000)
    replacement: str = Field(max_length=12000)
    reason: str = Field(min_length=1, max_length=500)


class AgentReply(Contract):
    message: str = Field(min_length=1, max_length=4000)
    edits: list[SourceEdit] = Field(max_length=6)


def apply_edits(source: str, edits: list[SourceEdit]) -> str:
    result = source
    for edit in edits:
        if result.count(edit.search) != 1:
            raise ValueError(
                "An edit did not match exactly one source location. No changes were applied."
            )
        if "\0" in edit.replacement:
            raise ValueError("Binary content is not a source edit")
        result = result.replace(edit.search, edit.replacement, 1)
    return result


def syntax_check(path: str, source: str) -> str:
    try:
        if path.lower().endswith(".py"):
            ast.parse(source)
            return "Python syntax checked. Runtime behavior has not been executed."
        if path.lower().endswith(".json"):
            json.loads(source)
            return "JSON syntax checked. Application behavior has not been executed."
    except (SyntaxError, json.JSONDecodeError, RecursionError) as error:
        raise ValueError(
            "The proposed repair has invalid syntax; the original file was preserved."
        ) from error
    return "Exact edit locations checked. This language needs its own build and runtime tests."


def source_context(source: str, question: str, budget: int = 14000) -> tuple[str, bool]:
    """Bound model context without imposing an import or stored-file size limit."""
    if len(source) <= budget:
        return source, False
    terms = [
        term
        for term in re.findall(r"[A-Za-z_][A-Za-z_0-9]{3,}", question)
        if term.lower()
        not in {"this", "that", "please", "code", "file", "with", "from"}
    ]
    matches = [source.lower().find(term.lower()) for term in terms]
    found = next((position for position in matches if position >= 0), 0)
    start = max(0, found - budget // 4)
    start = source.rfind("\n", 0, start) + 1
    end = min(len(source), start + budget)
    if end < len(source):
        end = source.rfind("\n", start, end)
        if end <= start:
            end = start + budget
    return source[start:end], True
