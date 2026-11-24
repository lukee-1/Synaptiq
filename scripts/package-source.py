"""Create a portable source archive from Git-visible files, excluding local state."""

import hashlib
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
output = root.parent / "Synaptiq_Rebuilt_Source.zip"
files = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    cwd=root,
).decode("utf-8").split("\0")
excluded = {
    ".git", ".venv", "node_modules", ".next", ".next-previous", "__pycache__",
    ".pytest_cache", ".ruff_cache", ".mypy_cache", ".vercel", ".fastapicloud", ".runtime",
}
selected: list[tuple[Path, str]] = []
for name in sorted(set(filter(None, files))):
    relative = Path(name)
    if any(part in excluded for part in relative.parts):
        continue
    if relative.name.startswith(".env") and relative.name != ".env.example":
        continue
    if relative.suffix in {".log", ".pyc", ".tsbuildinfo"}:
        continue
    source = root / relative
    if source.is_symlink() or not source.resolve().is_relative_to(root):
        raise ValueError(f"Refusing a source path outside the repository: {name}")
    if source.is_file():
        selected.append((source, "synaptiq/" + relative.as_posix()))
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for source, name in selected:
        archive.write(source, name)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist()) == len(selected)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix(".zip.sha256").write_text(
    f"{digest}  {output.name}\n", encoding="utf-8"
)
print(f"Packaged {len(selected)} source files: {output}")
print(f"SHA-256: {digest}")
