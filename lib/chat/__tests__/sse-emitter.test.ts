import { describe, it, expect } from "vitest";
import { createSSEEmitter } from "../sse-emitter.js";

describe("createSSEEmitter", () => {
  it("emits SSE-formatted strings for events", () => {
    const chunks: string[] = [];
    const mockController = {
      enqueue(data: Uint8Array) { chunks.push(new TextDecoder().decode(data)); },
    } as any;
    const emitter = createSSEEmitter(mockController);
    emitter.emit("message-start", { messageId: "m1", senderId: "agent-1" });
    emitter.emit("token", { messageId: "m1", token: "hello" });
    const output = chunks.join("");
    expect(output).toContain("event: message-start");
    expect(output).toContain('"messageId":"m1"');
    expect(output).toContain("event: token");
    expect(output).toContain('"token":"hello"');
  });
});
