// lib/data-sdk/index.ts — Barrel exports

export { AStockClient } from "./client.js";
export { TencentProvider } from "./providers/tencent.js";
export { EastmoneyProvider } from "./providers/eastmoney.js";
export { SinaProvider } from "./providers/sina.js";
export { CninfoProvider } from "./providers/cninfo.js";
export { THSProvider } from "./providers/ths.js";

export { calcMACD, calcRSI, calcMA, calcBollinger } from "./indicators.js";
export type { MACDItem, BollingerItem } from "./indicators.js";

export { normalizeCode, getPrefix, toSecId, toTencentCode, decodeGBK, RateLimiter, fetchWithTimeout } from "./utils.js";

export type {
  DataResult, KlineBar, KlineOptions, Quote, IndexQuote, ETFQuote,
  ResearchReport, IndustryReport, ResearchPDF,
  HotStock, NorthBoundFlow, ConceptBlock, FundFlowMinute,
  DragonTigerEntry, AllDragonTigerEntry, LockupEntry, SectorInfo, SectorConstituent, SectorRanking,
  MarginTradingEntry, BlockTradeEntry, ShareholderEntry, DividendEntry, FundFlowDay,
  StockNewsItem, GlobalNewsItem,
  StockInfo, BalanceSheet, IncomeStatement, CashFlowStatement,
  Announcement, ConsensusEPS, SearchResult, AStockClientOptions,
} from "./types.js";
