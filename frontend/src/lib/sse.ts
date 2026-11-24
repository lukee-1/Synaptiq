export type ServerEvent = { id?: string; event: string; data: string };
export function parseFrames(buffer: string): {
  events: ServerEvent[];
  remainder: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  const remainder = frames.pop() ?? "";
  const events: ServerEvent[] = [];
  for (const frame of frames) {
    const event: ServerEvent = { event: "message", data: "" };
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      else if (line.startsWith("event:")) event.event = line.slice(6).trim();
      else if (line.startsWith("id:")) event.id = line.slice(3).trim();
    }
    if (data.length) {
      event.data = data.join("\n");
      events.push(event);
    }
  }
  return { events, remainder };
}

export async function* readEvents(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000)
        throw new Error("Streaming frame exceeded its size limit");
      const parsed = parseFrames(buffer);
      buffer = parsed.remainder;
      for (const event of parsed.events) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}
