import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import openapiTS, { astToString } from "openapi-typescript";

const root = resolve(import.meta.dirname, "..");
const python = resolve(
  root,
  "backend/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const schema = JSON.parse(
  execFileSync(
    python,
    [
      "-c",
      "import json; from app.main import app; print(json.dumps(app.openapi()))",
    ],
    { cwd: resolve(root, "backend"), encoding: "utf8" },
  ),
);
const output = astToString(await openapiTS(schema));
const target = resolve(root, "frontend/src/lib/generated-api.ts");
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== output)
    throw new Error("API contracts are stale. Run npm run contracts.");
} else {
  writeFileSync(target, output);
  writeFileSync(
    resolve(root, "backend/openapi.json"),
    JSON.stringify(schema, null, 2) + "\n",
  );
  console.log("Generated API contracts from FastAPI OpenAPI.");
}
