import { describe, it, expect, vi, beforeEach } from "vitest";
import { BingSearchEngine } from "../bing.js";

describe("BingSearchEngine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses Bing search results page correctly", async () => {
    const bingHtml = `<!DOCTYPE html>
    <html>
      <body>
        <ol id="b_results">
          <li class="b_algo">
            <h2><a href="https://example.com/first">First Result Title</a></h2>
            <p>This is the first result description snippet.</p>
          </li>
          <li class="b_algo">
            <h2><a href="https://example.com/second">Second Result</a></h2>
            <p>Description for the second result.</p>
          </li>
        </ol>
      </body>
    </html>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(bingHtml),
    } as Response);

    const results = await BingSearchEngine.search("test query", 5);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "First Result Title",
      url: "https://example.com/first",
      description: "This is the first result description snippet.",
    });
    expect(results[1].title).toBe("Second Result");
  });

  it("returns empty array when Bing blocks the request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 403,
      text: () => Promise.resolve(""),
    } as Response);

    const results = await BingSearchEngine.search("test query");
    expect(results).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Connection refused"));

    const results = await BingSearchEngine.search("test query");
    expect(results).toEqual([]);
  });

  it("encodes Chinese query in URL", async () => {
    const bingHtml = `<html><body><ol id="b_results"></ol></body></html>`;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(bingHtml),
    } as Response);

    await BingSearchEngine.search("茅台 财报", 5);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent("茅台 财报"));
  });

  it("stops collecting when maxResults reached", async () => {
    // Generate 15 results across 2 pages
    const generateItems = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => {
        const n = start + i;
        return `<li class="b_algo"><h2><a href="https://example.com/${n}">Result ${n}</a></h2><p>Desc ${n}</p></li>`;
      }).join("");

    const page1Html = `<html><body><ol id="b_results">${generateItems(1, 10)}</ol><a title="Next page" href="/search?q=test&first=11">Next</a></body></html>`;
    const page2Html = `<html><body><ol id="b_results">${generateItems(11, 5)}</ol></body></html>`;

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(page1Html),
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(page2Html),
      } as Response);

    const results = await BingSearchEngine.search("test", 8);
    expect(results).toHaveLength(8);
  });
});
