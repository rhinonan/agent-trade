import * as cheerio from "cheerio";
import type { SearchItem } from "./duckduckgo.js";

const BING_HOST = "https://www.bing.com";
const BING_SEARCH_URL = "https://www.bing.com/search?q=";
const DEFAULT_MAX_RESULTS = 5;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

export class BingSearchEngine {
  /**
   * Scrape Bing search results as a fallback when DuckDuckGo fails.
   *
   * @param query - The search query (supports Chinese)
   * @param maxResults - Maximum results to return (default: 5)
   * @returns SearchItem array (empty on failure)
   */
  static async search(
    query: string,
    maxResults: number = DEFAULT_MAX_RESULTS,
  ): Promise<SearchItem[]> {
    const results: SearchItem[] = [];

    try {
      let nextUrl: string | null = `${BING_SEARCH_URL}${encodeURIComponent(query)}`;
      let first = 1;

      while (results.length < maxResults && nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            Referer: "https://www.bing.com/",
          },
        });

        if (response.status !== 200) break;

        const html = await response.text();
        const $ = cheerio.load(html);

        const olResults = $("#b_results");
        if (!olResults.length) break;

        const lis = olResults.find("li.b_algo");
        for (const li of lis) {
          if (results.length >= maxResults) break;

          try {
            const $li = $(li);
            const h2 = $li.find("h2");
            const title = h2.text().trim();
            const url = h2.find("a").attr("href")?.trim() ?? "";
            const description = $li.find("p").first().text().trim();

            if (url) {
              results.push({ title: title || `Bing Result ${first}`, url, description });
            }
            first++;
          } catch {
            // Skip malformed result items
            continue;
          }
        }

        // Check for next page
        const nextBtn = $('a[title="Next page"]');
        if (nextBtn.length) {
          const nextHref = nextBtn.attr("href");
          nextUrl = nextHref ? `${BING_HOST}${nextHref}` : null;
        } else {
          nextUrl = null;
        }
      }

      return results.slice(0, maxResults);
    } catch {
      return [];
    }
  }
}
