"""CPython inside WASI: no host directories, environment, sockets or subprocesses."""

import hashlib
import json
import threading
import time
from functools import lru_cache
from pathlib import Path

import wasmtime

RUNTIME_SHA256 = "e5dc5a398b07b54ea8fdb503bf68fb583d533f10ec3f930963e02b9505f7a763"


@lru_cache(maxsize=1)
def runtime(path: str) -> tuple[wasmtime.Engine, wasmtime.Module]:
    binary = Path(path).read_bytes()
    if hashlib.sha256(binary).hexdigest() != RUNTIME_SHA256:
        raise RuntimeError("WASI Python runtime checksum does not match")
    config = wasmtime.Config()
    config.consume_fuel = True
    config.epoch_interruption = True
    engine = wasmtime.Engine(config)
    module = wasmtime.Module(engine, binary)

    def epochs() -> None:
        while True:
            time.sleep(0.1)
            engine.increment_epoch()

    threading.Thread(target=epochs, daemon=True, name="sandbox-clock").start()
    return engine, module


def run(source: str, cases: list[str], module_path: str) -> bytes:
    engine, module = runtime(module_path)
    output = bytearray()
    overflow = False

    def capture(chunk: bytes) -> int:
        nonlocal overflow
        if len(output) + len(chunk) > 262144:
            overflow = True
            return -1
        output.extend(chunk)
        return len(chunk)

    with wasmtime.Store(engine) as store:
        store.set_limits(memory_size=128 * 1024 * 1024, instances=1, memories=1)
        store.set_fuel(2_000_000_000)
        store.set_epoch_deadline(50)
        wasi = wasmtime.WasiConfig()
        wasi.argv = [
            "python",
            "-I",
            "-c",
            Path(__file__).with_name("sandbox.py").read_text(encoding="utf-8"),
            json.dumps({"source": source, "cases_repr": cases}),
        ]
        wasi.env = [("SYNAPTIQ_SANDBOX", "1"), ("PYTHONHASHSEED", "0")]
        wasi.stdout_custom = capture
        wasi.stderr_custom = lambda chunk: len(chunk)
        # No preopened directories, inherited FDs, host imports or network capability.
        store.set_wasi(wasi)
        with wasmtime.Linker(engine) as linker:
            linker.define_wasi()
            try:
                instance = linker.instantiate(store, module)
                start = instance.exports(store)["_start"]
                if not isinstance(start, wasmtime.Func):
                    raise RuntimeError("Runtime entry point is missing")
                start(store)
            except (wasmtime.Trap, wasmtime.WasmtimeError) as exc:
                raise RuntimeError("Execution exceeded sandbox limits") from exc
    if overflow:
        raise ValueError("Execution output exceeded sandbox limits")
    return bytes(output)
