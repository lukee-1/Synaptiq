// Transport chunks prevent HTTP body limits from becoming file-size limits.
export function* textChunks(source: string): Generator<string> {
  if (!source.length) {
    yield "";
    return;
  }
  for (let start = 0; start < source.length;) {
    let end = Math.min(start + 32768, source.length);
    const last = source.charCodeAt(end - 1);
    if (end < source.length && last >= 0xd800 && last <= 0xdbff) end--;
    yield source.slice(start, end);
    start = end;
  }
}

export function excludedPath(path: string): boolean {
  return path
    .split("/")
    .some(
      (part) =>
        [
          "node_modules",
          ".git",
          ".next",
          ".venv",
          "venv",
          "__pycache__",
          "dist",
          "build",
        ].includes(part) ||
        part === ".env" ||
        part.startsWith(".env.") ||
        /\.(pem|key|p12|pfx)$/i.test(part),
    );
}

