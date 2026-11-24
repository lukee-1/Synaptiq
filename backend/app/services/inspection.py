import ast
import json

from app.models.contracts import Finding, SourceFile


def inspect_source(file: SourceFile) -> list[Finding]:
    if file.path.lower().endswith(".py"):
        try:
            tree = ast.parse(file.source)
        except SyntaxError as exc:
            return [Finding(severity="error", line=exc.lineno, message=exc.msg)]
        findings = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ExceptHandler) and node.type is None:
                findings.append(
                    Finding(
                        severity="warning",
                        line=node.lineno,
                        message="A bare except can hide the underlying failure.",
                    )
                )
        return findings or [
            Finding(
                severity="info",
                message="Python syntax is valid. Runtime behavior has not been checked.",
            )
        ]
    if file.path.lower().endswith(".json"):
        try:
            json.loads(file.source)
        except json.JSONDecodeError as exc:
            return [Finding(severity="error", line=exc.lineno, message=exc.msg)]
        return [
            Finding(
                severity="info",
                message="Valid JSON. No schema validation was performed.",
            )
        ]
    return [
        Finding(
            severity="info",
            message="Source imported. Language-specific analysis is not configured for this file type.",
        )
    ]
