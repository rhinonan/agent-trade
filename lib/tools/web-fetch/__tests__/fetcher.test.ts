import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebContentFetcher } from "../fetcher.js";

describe("WebContentFetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and cleans HTML content", async () => {
    const html = `<html>
      <head><script>console.log('remove me')</script><style>body {}</style></head>
      <body>
        <header>nav stuff</header>
        <nav>links</nav>
        <main><p>Hello   World</p><p>Second paragraph.</p></main>
        <footer>copyright</footer>
      </body>
    </html>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(html),
    } as Response);

    const content = await WebContentFetcher.fetchContent("https://example.com");
    expect(content).toContain("Hello World");
    expect(content).toContain("Second paragraph");
    expect(content).not.toContain("console.log");
    expect(content).not.toContain("nav stuff");
    expect(content).not.toContain("copyright");
    expect(content).not.toContain("links");
  });

  it("returns null on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 404,
      statusText: "Not Found",
    } as Response);

    const content = await WebContentFetcher.fetchContent("https://example.com/404");
    expect(content).toBeNull();
  });

  it("returns null on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const content = await WebContentFetcher.fetchContent("https://example.com");
    expect(content).toBeNull();
  });

  it("truncates content to 10,000 characters", async () => {
    const longText = "x".repeat(15000);
    const html = `<html><body><p>${longText}</p></body></html>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(html),
    } as Response);

    const content = await WebContentFetcher.fetchContent("https://example.com");
    expect(content).not.toBeNull();
    expect(content!.length).toBeLessThanOrEqual(10000);
  });

  it("aborts when signal fires", async () => {
    const controller = new AbortController();
    controller.abort(); // abort immediately

    // Mock fetch to throw AbortError when signal is already aborted
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return Promise.resolve({ status: 200, text: () => Promise.resolve("ok") } as Response);
    });

    const content = await WebContentFetcher.fetchContent(
      "https://example.com",
      controller.signal,
    );
    expect(content).toBeNull();
  });
});
