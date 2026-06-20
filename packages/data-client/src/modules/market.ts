import type { FetchFn } from "./kline.js";

export class MarketModule {
  constructor(private fetch: FetchFn) {}

  async snapshot(_symbol: string): Promise<Record<string, unknown>> {
    return { _note: "Market snapshot — Phase 2" };
  }
}
