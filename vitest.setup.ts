import "@testing-library/jest-dom/vitest";

// Polyfill AbortSignal.any for jsdom (not yet supported)
if (typeof AbortSignal.any !== "function") {
  (AbortSignal as any).any = function (signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return controller.signal;
      }
      signal.addEventListener(
        "abort",
        () => controller.abort(signal.reason),
        { once: true },
      );
    }
    return controller.signal;
  };
}
