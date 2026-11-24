"""Check Git-visible publication files without printing credential values."""
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
names = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
).decode("utf-8").split("\0")
secret_names = {"MODEL_API_KEY", "WORKER_TOKEN", "EXECUTOR_TOKEN", "SUPABASE_SECRET_KEY"}
secrets: set[bytes] = set()
for path in [root / "backend/.env", root / "backend/.runtime/worker.env", root / "frontend/.env.local"]:
    if path.is_file():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            key, separator, value = line.partition("=")
            value = value.strip().strip("\"'")
            if separator and key.strip() in secret_names and len(value) >= 16:
                secrets.add(value.encode())
forbidden = {".git", ".runtime", ".venv", "node_modules", ".next", "__pycache__"}
issues: list[str] = []
files = sorted(set(filter(None, names)))
for name in files:
    path = root / name
    if not path.is_file():
        continue
    if forbidden.intersection(Path(name).parts) or (path.name.startswith(".env") and path.name != ".env.example"):
        issues.append(name + ": excluded local state")
        continue
    data = path.read_bytes()
    if any(secret in data for secret in secrets):
        issues.append(name + ": matches a configured local secret")
    if re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk-proj-[A-Za-z0-9_-]{30,}", data):
        issues.append(name + ": possible credential material")
if issues:
    raise SystemExit("Publication check failed:\n" + "\n".join(issues))
print(f"Publication check passed for {len(files)} Git-visible files; no local secrets or runtime files found.")
