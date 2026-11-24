"""Runs ONLY inside a capability-isolated WASI instance or gVisor container."""

import ast
import contextlib
import copy
import io
import json
import os
import sys

if os.environ.get("SYNAPTIQ_SANDBOX") != "1":
    raise SystemExit("This harness must run inside the sandbox image")


class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next


class Capture(io.TextIOBase):
    def __init__(self):
        self.text = ""

    def write(self, value):
        self.text += value[: max(0, 4000 - len(self.text))]
        return len(value)


def main():
    payload = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
    cases = [ast.literal_eval(case) for case in payload["cases_repr"]]
    results = []
    for args in cases:
        sink = Capture()
        try:
            env = {"__name__": "exercise", "Node": Node}
            with contextlib.redirect_stdout(sink):
                exec(compile(payload["source"], "<exercise>", "exec"), env)
                value = env["solve"](*copy.deepcopy(args))
                json.dumps(value, allow_nan=False)
            results.append(
                {"ok": True, "result": value, "error": "", "stdout": sink.text}
            )
        except BaseException as error:
            # Never send hidden inputs, locals, stdout or reference values to the API.
            results.append(
                {
                    "ok": False,
                    "result": None,
                    "error": type(error).__name__,
                    "stdout": sink.text,
                }
            )
    sys.stdout.write(json.dumps({"results": results}, allow_nan=False))


if __name__ == "__main__":
    main()
