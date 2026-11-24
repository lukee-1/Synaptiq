"""Install the checksum-pinned CPython WASI binary used by isolation tests."""
import hashlib
import urllib.request
from pathlib import Path

target = Path(__file__).resolve().parents[1] / "backend/.runtime/python.wasm"
digest = "e5dc5a398b07b54ea8fdb503bf68fb583d533f10ec3f930963e02b9505f7a763"
target.parent.mkdir(exist_ok=True)
if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
    url = "https://github.com/vmware-labs/webassembly-language-runtimes/releases/download/python/3.12.0%2B20231211-040d5a6/python-3.12.0.wasm"
    with urllib.request.urlopen(url, timeout=120) as response:
        target.write_bytes(response.read())
    if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise RuntimeError("WASI runtime checksum mismatch")
print("Pinned WASI runtime verified")
