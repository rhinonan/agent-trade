import * as cheerio from "cheerio";

const MAX_CONTENT_LENGTH = 10_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

export class WebContentFetcher {
  /**
   * Fetch and extract clean text content from a webpage.
   *
   * @param url - The URL to fetch
   * @param signal - Optional AbortSignal for cancellation
   * @returns Cleaned text content (<=10KB) or null on failure
   */
  static async fetchContent(
    url: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal,
      });

      if (response.status !== 200) {
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove non-content elements
      $("script, style, header, footer, nav, noscript, iframe, svg").remove();

      // Extract and normalize text
      const text = $("body").text().replace(/\s+/g, " ").trim();

      if (!text) return null;

      return text.slice(0, MAX_CONTENT_LENGTH);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return null;
      }
      return null;
    }
  }
}
