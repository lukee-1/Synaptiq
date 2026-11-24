import { describe, expect, it } from "vitest";
import { excludedPath, textChunks } from "./source-files";

describe("chunked source imports", () => {
  it("round-trips large Unicode source without splitting surrogate pairs", () => {
    const source = "x".repeat(32767) + "🚀" + "é".repeat(900000);
    const chunks = [...textChunks(source)];
    expect(chunks.join("")).toBe(source);
    expect(chunks.length).toBeGreaterThan(20);
    for (const chunk of chunks) expect(new TextDecoder().decode(new TextEncoder().encode(chunk))).toBe(chunk);
  });
  it("uploads empty text files as one part", () => { expect([...textChunks("")]).toEqual([""]); });
  it("skips credentials and generated folders while accepting normal source", () => {
    expect(excludedPath("project/node_modules/a/index.js")).toBe(true);
    expect(excludedPath("project/.env.local")).toBe(true);
    expect(excludedPath("project/secret.pem")).toBe(true);
    expect(excludedPath("project/Dockerfile")).toBe(false);
    expect(excludedPath("project/notes.txt")).toBe(false);
  });
});
