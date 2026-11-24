import { describe, expect, it } from "vitest";
import { parseFrames, readEvents } from "./sse";

describe("persisted event streams", () => {
  it("preserves unfinished frames and ignores heartbeats", () => {
    const parsed = parseFrames(
      ": heartbeat\n\nid: 12\nevent: delta\ndata: first\ndata: second\n\nevent: state\ndata: half",
    );
    expect(parsed.events).toEqual([
      { id: "12", event: "delta", data: "first\nsecond" },
    ]);
    expect(parsed.remainder).toBe("event: state\ndata: half");
  });
  it("survives every byte boundary, including CRLF and UTF-8", async () => {
    const bytes = new TextEncoder().encode(
      'id: 4\r\nevent: delta\r\ndata: {"text":"λ 🙂"}\r\n\r\n',
    );
    for (let cut = 1; cut < bytes.length; cut++) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, cut));
          controller.enqueue(bytes.slice(cut));
          controller.close();
        },
      });
      const events = [];
      for await (const event of readEvents(stream)) events.push(event);
      expect(events).toEqual([
        { id: "4", event: "delta", data: '{"text":"λ 🙂"}' },
      ]);
    }
  });
  it("rejects an unbounded frame", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(1_000_001)));
        controller.close();
      },
    });
    await expect(readEvents(stream).next()).rejects.toThrow("size limit");
  });
});
