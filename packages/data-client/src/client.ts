import { KlineModule } from "./modules/kline.js";
import { FinancialModule } from "./modules/financial.js";
import { ReferenceModule } from "./modules/reference.js";
import { SectorModule } from "./modules/sector.js";
import { MarketModule } from "./modules/market.js";
import type { HealthResponse } from "./types.js";

export interface DataClientOptions {
  baseUrl?: string;
  timeout?: number;
}

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
    const fetchFn = (path: string, init?: RequestInit) => this.fetch(path, init);
    this.kline = new KlineModule(fetchFn);
    this.financial = new FinancialModule(fetchFn);
    this.reference = new ReferenceModule(fetchFn);
    this.sector = new SectorModule(fetchFn);
    this.market = new MarketModule(fetchFn);
  }

  async health(): Promise<HealthResponse> {
    const res = await this.fetch("/health");
    return res.json() as Promise<HealthResponse>;
  }

  async fetch(path: string, init?: RequestInit): Promise<Response> {
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
