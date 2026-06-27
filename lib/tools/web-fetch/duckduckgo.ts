import ddgSearch from "duckduckgo-search";

export interface SearchItem {
  title: string;
  url: string;
  description: string;
}

const DEFAULT_MAX_RESULTS = 5;

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
  ): Promise<SearchItem[]> {
    try {
      const items: SearchItem[] = [];

      for await (const result of ddgSearch.text(query)) {
        if (items.length >= maxResults) break;

        items.push({
          title: (result as any).title ?? "",
          url: (result as any).href ?? "",
          description: (result as any).body ?? "",
        });
      }

      return items.filter((item) => item.url);
    } catch {
      return [];
    }
  }
}
