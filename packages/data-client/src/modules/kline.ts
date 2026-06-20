import type { KlineResponse, IndicatorsResponse, KlineParams, IndicatorsParams } from "../types.js";

export type FetchFn = (path: string, init?: RequestInit) => Promise<Response>;

export class KlineModule {
  constructor(private fetch: FetchFn) {}

  async get(params: KlineParams): Promise<KlineResponse> {
    const { symbol, period = "daily", count = 120, adjust = "qfq" } = params;
    const qs = `period=${period}&count=${count}&adjust=${adjust}`;
    const res = await this.fetch(`/kline/${encodeURIComponent(symbol)}?${qs}`);
    return res.json() as Promise<KlineResponse>;
  }

  async indicators(params: IndicatorsParams): Promise<IndicatorsResponse> {
    const { symbol, names = ["MACD", "RSI"], period = "daily", count = 120 } = params;
    const nameStr = names.join(",");
    const qs = `names=${nameStr}&period=${period}&count=${count}`;
    const res = await this.fetch(`/kline/${encodeURIComponent(symbol)}/indicators?${qs}`);
    return res.json() as Promise<IndicatorsResponse>;
  }
}
