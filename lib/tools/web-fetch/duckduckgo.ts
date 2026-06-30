import ddgSearch from "duckduckgo-search";

// Patch: duckduckgo-search v1.0.7 sets `this.logger = console` but calls
// `this.logger.warning()`, which doesn't exist on Node's console (it's `.warn`).
(console as any).warning = (console as any).warning ?? console.warn;

export interface SearchItem {
  title: string;
  url: string;
  description: string;
}

const DEFAULT_MAX_RESULTS = 5;

/**
 * DuckDuckGo is blocked in some regions (e.g. mainland China).
 * Use a short timeout so the fallback (Bing) kicks in quickly instead of
 * waiting for the OS-level TCP timeout (60–130 s).
 */
const DDG_TIMEOUT_MS = 8_000;

export class DuckDuckGoSearchEngine {
  /**
   * Search DuckDuckGo and return structured results.
   *
   * The underlying duckduckgo-search package uses an async generator (`text()`)
   * that yields {title, href, body} objects. We iterate it and map to the
   * stable SearchItem interface.
   *
   * @param query - The search query
   * @param maxResults - Maximum number of results to return (default: 5)
   * @returns SearchItem array (empty on failure)
   */
  static async search(
    query: string,
    maxResults: number = DEFAULT_MAX_RESULTS,
    signal?: AbortSignal,
  ): Promise<SearchItem[]> {
    try {
      const items: SearchItem[] = [];

      // Collect results from the async generator, but race against a short
      // timeout so an unreachable DuckDuckGo doesn't block the fallback path.
      const collectPromise = (async () => {
        for await (const result of ddgSearch.text(query)) {
          if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          if (items.length >= maxResults) break;

          items.push({
            title: (result as any).title ?? "",
            url: (result as any).href ?? "",
            description: (result as any).body ?? "",
          });
        }
      })();

      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new DOMException("DDG timeout", "TimeoutError")), DDG_TIMEOUT_MS),
      );

      await Promise.race([collectPromise, timeoutPromise]);

      return items.filter((item) => item.url);
    } catch (err) {
      if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) {
        return [];
      }
      console.warn(
        `[DuckDuckGoSearchEngine] Search failed for "${query}":`,
        err instanceof Error ? err.message : String(err),
      );
      return [];
    }
  }
}
