import { apiRequest } from "./client";
import type { ChatRequest, ChatStreamEvent } from "./types";

/**
 * Parses a `text/event-stream` body into `{ event, data }` records.
 * EventSource can't POST, so `POST /chat` is read with fetch + ReadableStream.
 */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseBlock = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    return data.length ? { event, data: data.join("\n") } : null;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseBlock(block);
        if (parsed) yield parsed;
        sep = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    const tail = parseBlock(buffer.trim());
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

const CHAT_EVENTS = new Set(["start", "sources", "delta", "done", "error"]);

/** `POST /chat`: yields typed stream events. Throws ApiError for non-2xx. */
export async function* streamChat(
  request: ChatRequest,
  signal?: AbortSignal
): AsyncGenerator<ChatStreamEvent> {
  const res = await apiRequest("/chat", {
    method: "POST",
    body: request,
    headers: { Accept: "text/event-stream" },
    signal,
  });
  if (!res.body) return;
  for await (const { event, data } of parseSSE(res.body)) {
    if (!CHAT_EVENTS.has(event)) continue;
    try {
      yield { event, data: JSON.parse(data) } as ChatStreamEvent;
    } catch {
      // Ignore malformed frames rather than killing the stream.
    }
  }
}
