// lib/data-sdk/types.ts
// All business types for the A-Stock Data SDK.

// ─── Universal result wrapper ───

export interface DataResult<T> {
  data: T | null;
  error?: string;
  source: string; // e.g. "tencent", "eastmoney.push2", "sina"
}

// ─── Market layer ───

export interface KlineBar {
  date: string;   // "2026-06-20"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
}

export interface KlineOptions {
  period?: "daily" | "weekly" | "monthly";
  count?: number;   // default 120
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  lastClose: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  changeAmt: number;
  turnoverPct: number;
  volumeRatio: number;
  amplitudePct: number;
  peTtm: number;
  peStatic: number;
  pb: number;
  marketCapYi: number;       // 总市值(亿)
  floatMarketCapYi: number;  // 流通市值(亿)
  limitUp: number;
  limitDown: number;
  amountWan: number;         // 成交额(万)
}

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  lastClose: number;
  changePct: number;
  changeAmt: number;
  high: number;
  low: number;
  amountWan: number;
}

export interface ETFQuote {
  symbol: string;
  name: string;
  price: number;
  lastClose: number;
  changePct: number;
  peTtm: number;
  pb: number;
  volume?: number;
}

// ─── Research layer ───

export interface ResearchReport {
  id: string;
  title: string;
  author: string;
  orgName: string;        // 机构名称
  publishDate: string;
  stockCode: string;
  stockName: string;
  rating: string;          // 评级: "买入"/"增持"/"中性"/"减持"/"卖出"
  ratingChange?: string;   // 评级变动: "调高"/"调低"/"维持"
  eps2025?: number;
  eps2026?: number;
  eps2027?: number;
  pdfUrl?: string;
}

export interface IndustryReport {
  id: string;
  title: string;
  author: string;
  orgName: string;
  publishDate: string;
  industryCode: string;
  industryName: string;
  pdfUrl?: string;
}

export interface ResearchPDF {
  title: string;
  pdfBuffer: ArrayBuffer;
}

// ─── Signal layer ───

export interface HotStock {
  symbol: string;
  name: string;
  reason: string;       // 题材归因
  changePct: number;
  limitUpTimes: number; // 连板数
}

export interface NorthBoundFlow {
  time: string;         // "HH:mm"
  hgtBuy: number;       // 沪股通买入(万)
  hgtSell: number;      // 沪股通卖出(万)
  sgtBuy: number;       // 深股通买入(万)
  sgtSell: number;      // 深股通卖出(万)
  netFlow: number;      // 净流入(万)
}

export interface ConceptBlock {
  blockCode: string;    // BK码
  blockName: string;    // 板块名
  blockType: string;    // "概念"/"行业"/"地域"
  changePct: number;
  leaderStock: string;  // 龙头股
}

export interface FundFlowMinute {
  time: string;
  mainNetFlow: number;    // 主力净流入(万)
  superLargeNet: number;  // 超大单净流入(万)
  largeNet: number;       // 大单净流入(万)
  mediumNet: number;      // 中单净流入(万)
  smallNet: number;       // 小单净流入(万)
}

export interface DragonTigerEntry {
  tradeDate: string;
  stockCode: string;
  stockName: string;
  closePrice: number;
  changePct: number;
  turnoverPct: number;
  reason: string;         // 上榜原因
  netBuyAmt: number;      // 净买额(万)
  buyAmt: number;         // 总买入(万)
  sellAmt: number;        // 总卖出(万)
  topBuyBrokers: { name: string; amount: number }[];
  topSellBrokers: { name: string; amount: number }[];
}

export interface AllDragonTigerEntry {
  tradeDate: string;
  stockCode: string;
  stockName: string;
  closePrice: number;
  changePct: number;
  netBuyAmt: number;
  reason: string;
  rank: number;           // 净买额排名
}

export interface LockupEntry {
  stockCode: string;
  stockName: string;
  unlockDate: string;
  unlockShares: number;   // 解禁股数(万)
  unlockCap: number;      // 解禁市值(万)
  unlockRatio: number;    // 占总股本比例
}

export interface SectorRanking {
  sectorCode: string;
  sectorName: string;
  changePct: number;
  upCount: number;
  downCount: number;
  leaderStock: string;
}

// ─── Capital layer ───

export interface MarginTradingEntry {
  tradeDate: string;
  stockCode: string;
  marginBalance: number;    // 融资余额(万)
  marginBuy: number;        // 融资买入额(万)
  marginRepay: number;      // 融资偿还额(万)
  shortBalance: number;     // 融券余额(万)
  shortVolume: number;      // 融券余量(股)
  totalBalance: number;     // 两融余额(万)
}

export interface BlockTradeEntry {
  tradeDate: string;
  stockCode: string;
  stockName: string;
  price: number;
  volume: number;           // 成交量(万股)
  amount: number;           // 成交额(万)
  discountRate: number;     // 折溢价率(负=折价)
  buyerBroker: string;
  sellerBroker: string;
}

export interface ShareholderEntry {
  reportDate: string;
  stockCode: string;
  shareholderCount: number;
  changePct: number;        // 环比变化%，负=筹码集中
  avgHolding: number;       // 户均持股(股)
}

export interface DividendEntry {
  exDate: string;           // 除权除息日
  stockCode: string;
  cashDiv: number;          // 每股派息(元)
  stockDiv: number;         // 每股送股
  transferDiv: number;      // 每股转增
  recordDate: string;       // 股权登记日
}

export interface FundFlowDay {
  tradeDate: string;
  mainNetFlow: number;
  superLargeNet: number;
  largeNet: number;
  mediumNet: number;
  smallNet: number;
}

// ─── News layer ───

export interface StockNewsItem {
  id: string;
  title: string;
  summary: string;
  publishDate: string;
  source: string;
  url: string;
}

export interface GlobalNewsItem {
  id: string;
  title: string;
  content: string;
  publishTime: string;
  category: string;  // "全球"/"宏观"/"行业" etc.
}

// ─── Fundamentals layer ───

export interface StockInfo {
  symbol: string;
  name: string;
  industry: string;
  totalShares: number;      // 总股本(万股)
  floatShares: number;      // 流通股(万股)
  marketCapYi: number;      // 总市值(亿)
  listedDate: string;
}

export interface BalanceSheet {
  reportDate: string;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  currentAssets: number;
  currentLiabilities: number;
  cash: number;
  receivables: number;
  inventory: number;
  fixedAssets: number;
  goodwill: number;
}

export interface IncomeStatement {
  reportDate: string;
  revenue: number;
  revenueGrowth: number;
  netProfit: number;
  netProfitGrowth: number;
  operatingProfit: number;
  grossMargin: number;
  netMargin: number;
  roe: number;
  eps: number;
}

export interface CashFlowStatement {
  reportDate: string;
  operatingCF: number;
  investingCF: number;
  financingCF: number;
  netCF: number;
  freeCashFlow: number;
}

// ─── Announcements layer ───

export interface Announcement {
  id: string;
  title: string;
  publishDate: string;
  stockCode: string;
  stockName: string;
  category: string;
  summary: string;
  pdfUrl?: string;
}

// ─── THS types ───

export interface ConsensusEPS {
  stockCode: string;
  stockName: string;
  eps2025: number;
  eps2026: number;
  eps2027: number;
  analystCount: number;
  targetPrice: number;
}

// ─── Sector types ───

export interface SectorInfo {
  code: string;
  name: string;
  changePct?: number;
  constituentCount?: number;
}

export interface SectorConstituent {
  symbol: string;
  name: string;
  weight?: number;
}

// ─── Search ───

export interface SearchResult {
  symbol: string;
  name: string;
  type: string;  // "stock" | "index" | "etf"
}

// ─── Client options ───

export interface AStockClientOptions {
  timeout?: number;              // default 15000ms
  eastmoneyInterval?: number;    // default 1000ms
  eastmoneyJitter?: number;      // default 500ms
  retryOnFailure?: boolean;      // default true (retry once on network errors)
}
