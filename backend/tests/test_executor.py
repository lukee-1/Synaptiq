import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from executor import main
from executor.wasm import run

MODULE = Path(__file__).resolve().parents[1] / ".runtime/python.wasm"
pytestmark = pytest.mark.skipif(
    not MODULE.exists(), reason="Install the pinned WASI runtime for isolation checks"
)


def outcomes(source):
    return json.loads(run(source, ["[1]"] * 7, str(MODULE)))["results"]


def test_python_stdout_and_return_are_separate():
    result = outcomes("def solve(x):\n    print('debug:', x)\n    return x + 1\n")
    assert all(
        row["ok"] and row["result"] == 2 and "debug: 1" in row["stdout"]
        for row in result
    )


@pytest.mark.parametrize(
    "source",
    [
        "def solve(x):\n    return open('C:/Windows/win.ini').read()\n",
        "def solve(x):\n    import socket\n    return socket.create_connection(('example.com', 80))\n",
        "def solve(x):\n    import subprocess\n    return subprocess.run(['cmd', '/c', 'echo unsafe'])\n",
    ],
)
def test_wasi_cannot_access_host_files_network_or_processes(source):
    assert all(not row["ok"] for row in outcomes(source))


def test_host_secrets_are_not_inherited(monkeypatch):
    monkeypatch.setenv("SYNAPTIQ_TEST_SECRET", "must-not-enter-the-sandbox")
    assert all(
        row["result"] is None
        for row in outcomes(
            "def solve(x):\n    import os\n    return os.getenv('SYNAPTIQ_TEST_SECRET')\n"
        )
    )


def test_infinite_loop_is_interrupted():
    with pytest.raises(RuntimeError, match="limits"):
        outcomes("def solve(x):\n    while True: pass\n")


def test_memory_pressure_does_not_escape_the_instance():
    result = outcomes("def solve(x):\n    return len(bytearray(512 * 1024 * 1024))\n")
    assert all(not row["ok"] and row["error"] == "MemoryError" for row in result)


def test_real_gateway_grades_wrong_correct_and_syntax_errors(monkeypatch):
    monkeypatch.setattr(main.settings, "executor_backend", "wasi")
    monkeypatch.setattr(
        main.settings, "executor_token", SecretStr("test-only-private-token")
    )
    client = TestClient(main.app)
    payload = {
        "code": "def solve(x): return x + 2",
        "reference": "def solve(x): return x + 1",
        "cases_repr": [f"[{i}]" for i in range(7)],
    }
    assert client.post("/execute", json=payload).status_code == 401
    headers = {"Authorization": "Bearer test-only-private-token"}
    wrong = client.post("/execute", json=payload, headers=headers).json()
    assert wrong["passed"] == 0
    assert wrong["visible"][0]["actual"] == 2
    assert wrong["visible"][0]["expected"] == 1
    assert len(wrong["visible"]) == 2
    payload["code"] = payload["reference"]
    assert client.post("/execute", json=payload, headers=headers).json()["passed"] == 7
    payload["code"] = "def solve(x) return x"
    invalid = client.post("/execute", json=payload, headers=headers).json()
    assert invalid["passed"] == 0
    assert invalid["visible"][0]["error"] == "SyntaxError"
