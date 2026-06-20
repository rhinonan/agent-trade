import type { StockInfo, SearchResponse } from "../types.js";
import type { FetchFn } from "./kline.js";

export class ReferenceModule {
  constructor(private fetch: FetchFn) {}

  async get(symbol: string): Promise<StockInfo> {
    const res = await this.fetch(`/reference/${encodeURIComponent(symbol)}`);
    return res.json() as Promise<StockInfo>;
  }

  async search(keyword: string): Promise<SearchResponse> {
    const res = await this.fetch(`/reference/search?keyword=${encodeURIComponent(keyword)}`);
    return res.json() as Promise<SearchResponse>;
  }
}
