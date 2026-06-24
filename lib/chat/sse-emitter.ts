const encoder = new TextEncoder();

export interface SSEController {
  enqueue(data: Uint8Array): void;
  close(): void;
}

export function createSSEEmitter(controller: SSEController) {
  function emit(event: string, data: unknown): void {
    const lines = [
      `event: ${event}`,
      `data: ${JSON.stringify(data)}`,
      "",
      "",
    ];
    controller.enqueue(encoder.encode(lines.join("\n")));
  }

  function close(): void {
    controller.close();
  }

  return { emit, close };
}
