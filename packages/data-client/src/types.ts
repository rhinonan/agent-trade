// === Response types for the AgentTrade data service ===

export interface KlineBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
}

export interface KlineResponse {
  symbol: string;
  period: "daily" | "weekly" | "monthly";
  adjust: "none" | "qfq" | "hfq";
  count: number;
  bars: KlineBar[];
}

export interface MACDItem {
  index: number;
  dif: number | null;
  dea: number | null;
  histogram: number | null;
}

export interface BollingerItem {
  middle: number | null;
  upper: number | null;
  lower: number | null;
}

export interface IndicatorsResponse {
  symbol: string;
  indicators: {
    macd?: MACDItem[];
    rsi?: (number | null)[];
    ma?: Record<string, (number | null)[]>;
    boll?: BollingerItem[];
  };
}

export interface FinancialSummary {
  symbol: string;
  reportDate: string | null;
  revenueGrowth: number | null;
  netProfitGrowth: number | null;
  grossMargin: number | null;
  roe: number | null;
  debtRatio: number | null;
}

export interface Valuation {
  symbol: string;
  pe: number | null;
  pb: number | null;
  ps: number | null;
  peg: number | null;
  dividendYield: number | null;
  marketCap: number | null;
}

export interface StockInfo {
  symbol: string;
  name: string;
  industry: string;
  marketCap: number;
}

export interface SectorInfo {
  code: string;
  name: string;
  constituentCount: number;
}

export interface SectorConstituent {
  symbol: string;
  name: string;
  weight?: number;
}

export interface SectorConstituentsResponse {
  code: string;
  name: string;
  constituents: SectorConstituent[];
}

export interface SectorListResponse {
  sectors: SectorInfo[];
}

export interface SearchResult {
  symbol: string;
  name: string;
  industry?: string;
  marketCap?: number;
}

export interface SearchResponse {
  keyword: string;
  results: SearchResult[];
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface KlineParams {
  symbol: string;
  period?: "daily" | "weekly" | "monthly";
  count?: number;
  adjust?: "none" | "qfq" | "hfq";
}

export interface IndicatorsParams {
  symbol: string;
  names?: string[];
  period?: string;
  count?: number;
}
