import type { FinancialSummary, Valuation } from "../types.js";
import type { FetchFn } from "./kline.js";

export class FinancialModule {
  constructor(private fetch: FetchFn) {}

  async summary(symbol: string): Promise<FinancialSummary> {
    const res = await this.fetch(`/financial/${encodeURIComponent(symbol)}/summary`);
    return res.json() as Promise<FinancialSummary>;
  }

  async valuation(symbol: string): Promise<Valuation> {
    const res = await this.fetch(`/financial/${encodeURIComponent(symbol)}/valuation`);
    return res.json() as Promise<Valuation>;
  }
}
