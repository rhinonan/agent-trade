import type {
  DataClientOptions,
  HealthResponse,
  KlineParams,
  KlineResponse,
  IndicatorsParams,
  IndicatorsResponse,
  FinancialSummary,
  Valuation,
  StockInfo,
  SearchResponse,
  SectorListResponse,
  SectorConstituentsResponse,
} from "./types.js";

// ---- Internal fetch type ----

export type FetchFn = (path: string, init?: RequestInit) => Promise<Response>;

// ---- Module classes ----

class KlineModule {
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

class FinancialModule {
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

class ReferenceModule {
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

class SectorModule {
  constructor(private fetch: FetchFn) {}

  async list(): Promise<SectorListResponse> {
    const res = await this.fetch("/sector/list");
    return res.json() as Promise<SectorListResponse>;
  }

  async constituents(name: string): Promise<SectorConstituentsResponse> {
    const res = await this.fetch(`/sector/${encodeURIComponent(name)}/constituents`);
    return res.json() as Promise<SectorConstituentsResponse>;
  }
}

class MarketModule {
  constructor(private _fetch: FetchFn) {}

  async snapshot(_symbol: string): Promise<Record<string, unknown>> {
    return { _note: "Market snapshot — Phase 2" };
  }
}

// ---- DataClient ----

export class DataClient {
  readonly kline: KlineModule;
  readonly financial: FinancialModule;
  readonly reference: ReferenceModule;
  readonly sector: SectorModule;
  readonly market: MarketModule;

  private baseUrl: string;
  private timeout: number;

  constructor(options: DataClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://localhost:9500";
    this.timeout = options.timeout ?? 30_000;
    const fetchFn: FetchFn = (path, init) => this._fetch(path, init);
    this.kline = new KlineModule(fetchFn);
    this.financial = new FinancialModule(fetchFn);
    this.reference = new ReferenceModule(fetchFn);
    this.sector = new SectorModule(fetchFn);
    this.market = new MarketModule(fetchFn);
  }

  async health(): Promise<HealthResponse> {
    const res = await this._fetch("/health");
    return res.json() as Promise<HealthResponse>;
  }

  private async _fetch(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Data service error ${res.status}: ${body}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
