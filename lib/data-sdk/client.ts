// lib/data-sdk/client.ts
// AStockClient — composes all providers, orchestrates fallback chains.
// Public API organized by 7 data layers (matching the a-stock-data SKILL.md).

import type { DataResult, KlineBar, KlineOptions, Quote, IndexQuote, ETFQuote,
  ResearchReport, IndustryReport, ResearchPDF, HotStock, NorthBoundFlow,
  ConceptBlock, FundFlowMinute, DragonTigerEntry, AllDragonTigerEntry,
  LockupEntry, SectorInfo, SectorConstituent, MarginTradingEntry,
  BlockTradeEntry, ShareholderEntry, DividendEntry, FundFlowDay,
  StockNewsItem, GlobalNewsItem, StockInfo, BalanceSheet, IncomeStatement,
  CashFlowStatement, Announcement, ConsensusEPS, SearchResult, AStockClientOptions } from "./types.js";
import { calcMACD, calcRSI, calcMA, calcBollinger } from "./indicators.js";
import { TencentProvider } from "./providers/tencent.js";
import { EastmoneyProvider } from "./providers/eastmoney.js";
import { SinaProvider } from "./providers/sina.js";
import { CninfoProvider } from "./providers/cninfo.js";
import { THSProvider } from "./providers/ths.js";

export class AStockClient {
  // Providers
  private tencent: TencentProvider;
  private eastmoney: EastmoneyProvider;
  private sina: SinaProvider;
  private cninfo: CninfoProvider;
  private ths: THSProvider;

  // ─── Public 7-layer API ───

  readonly market: MarketLayer;
  readonly research: ResearchLayer;
  readonly signal: SignalLayer;
  readonly capital: CapitalLayer;
  readonly news: NewsLayer;
  readonly fundamentals: FundamentalsLayer;
  readonly announcements: AnnouncementsLayer;

  constructor(opts: AStockClientOptions = {}) {
    const timeout = opts.timeout ?? 15_000;
    const emInterval = opts.eastmoneyInterval ?? 1000;
    const emJitter = opts.eastmoneyJitter ?? 500;

    this.tencent = new TencentProvider(timeout);
    this.eastmoney = new EastmoneyProvider(timeout, emInterval, emJitter);
    this.sina = new SinaProvider(timeout);
    this.cninfo = new CninfoProvider(timeout);
    this.ths = new THSProvider(timeout);

    this.market = new MarketLayer(this.tencent, this.eastmoney);
    this.research = new ResearchLayer(this.eastmoney, this.ths);
    this.signal = new SignalLayer(this.ths, this.eastmoney);
    this.capital = new CapitalLayer(this.eastmoney);
    this.news = new NewsLayer(this.eastmoney);
    this.fundamentals = new FundamentalsLayer(this.eastmoney, this.sina);
    this.announcements = new AnnouncementsLayer(this.cninfo);
  }
}

// ─── Layer classes ───

class MarketLayer {
  constructor(private tencent: TencentProvider, private eastmoney: EastmoneyProvider) {}

  /** Get real-time quotes with PE/PB/market cap. Tencent (priority 1) → Eastmoney push2 fallback. */
  async quote(codes: string[]): Promise<DataResult<Record<string, Quote>>> {
    const r = await this.tencent.getQuotes(codes);
    if (r.data && Object.keys(r.data).length > 0) return r;
    // Fallback is limited — eastmoney push2 doesn't provide batch quotes the same way
    return r;
  }

  /** Get K-line data with pre-computed MA. Source: Baidu (HTTP, no IP block). */
  async kline(code: string, opts?: KlineOptions): Promise<DataResult<KlineBar[]>> {
    return this.tencent.getKline(code, opts);
  }

  /** Get index quotes (000001, 000300, 399006, etc.) */
  async indexQuote(codes: string[]): Promise<DataResult<IndexQuote[]>> {
    return this.tencent.getIndexQuotes(codes);
  }

  /** Get ETF quotes (510050, 510300, etc.) */
  async etfQuote(codes: string[]): Promise<DataResult<ETFQuote[]>> {
    return this.tencent.getETFQuotes(codes);
  }

  /** Search stocks/indices/ETFs by keyword. */
  async search(keyword: string): Promise<DataResult<SearchResult[]>> {
    return this.tencent.search(keyword);
  }
}

class ResearchLayer {
  constructor(private eastmoney: EastmoneyProvider, private ths: THSProvider) {}

  async individualReports(code: string, page?: number): Promise<DataResult<ResearchReport[]>> {
    return this.eastmoney.individualReports(code, page);
  }

  async industryReports(industryCode?: string, page?: number): Promise<DataResult<IndustryReport[]>> {
    return this.eastmoney.industryReports(industryCode, page);
  }

  async downloadPdf(url: string): Promise<DataResult<ResearchPDF>> {
    return this.eastmoney.downloadPdf(url);
  }

  async consensusEPS(code: string): Promise<DataResult<ConsensusEPS | null>> {
    return this.ths.getConsensusEPS(code);
  }
}

class SignalLayer {
  constructor(private ths: THSProvider, private eastmoney: EastmoneyProvider) {}

  async hotStocks(): Promise<DataResult<HotStock[]>> {
    return this.ths.getHotStocks();
  }

  async northBound(): Promise<DataResult<NorthBoundFlow[]>> {
    return this.ths.getNorthBound();
  }

  async conceptBlocks(code: string): Promise<DataResult<ConceptBlock[]>> {
    return this.eastmoney.getConceptBlocks(code);
  }

  async fundFlowMinute(code: string): Promise<DataResult<FundFlowMinute[]>> {
    return this.eastmoney.getFundFlowMinute(code);
  }

  async dragonTigerBoard(code?: string, date?: string): Promise<DataResult<DragonTigerEntry[]>> {
    return this.eastmoney.dragonTigerBoard(code, date);
  }

  async allDragonTigerBoard(date?: string): Promise<DataResult<AllDragonTigerEntry[]>> {
    return this.eastmoney.allDragonTigerBoard(date);
  }

  async lockupExpiration(startDate?: string, endDate?: string): Promise<DataResult<LockupEntry[]>> {
    return this.eastmoney.lockupExpiration(startDate, endDate);
  }

  async sectorRanking(): Promise<DataResult<SectorInfo[]>> {
    return this.eastmoney.getSectorList();
  }
}

class CapitalLayer {
  constructor(private eastmoney: EastmoneyProvider) {}

  async marginTrading(code: string, startDate?: string, endDate?: string): Promise<DataResult<MarginTradingEntry[]>> {
    return this.eastmoney.marginTrading(code, startDate, endDate);
  }

  async blockTrades(code: string, startDate?: string, endDate?: string): Promise<DataResult<BlockTradeEntry[]>> {
    return this.eastmoney.blockTrades(code, startDate, endDate);
  }

  async shareholders(code: string): Promise<DataResult<ShareholderEntry[]>> {
    return this.eastmoney.shareholders(code);
  }

  async dividends(code: string): Promise<DataResult<DividendEntry[]>> {
    return this.eastmoney.dividends(code);
  }

  async fundFlow120(code: string): Promise<DataResult<FundFlowDay[]>> {
    return this.eastmoney.getFundFlow120(code);
  }
}

class NewsLayer {
  constructor(private eastmoney: EastmoneyProvider) {}

  async stockNews(code: string, page?: number): Promise<DataResult<StockNewsItem[]>> {
    return this.eastmoney.stockNews(code, page);
  }

  async globalNews(page?: number): Promise<DataResult<GlobalNewsItem[]>> {
    return this.eastmoney.globalNews(page);
  }
}

class FundamentalsLayer {
  constructor(private eastmoney: EastmoneyProvider, private sina: SinaProvider) {}

  async stockInfo(code: string): Promise<DataResult<StockInfo | null>> {
    return this.eastmoney.getStockInfo(code);
  }

  /** Balance sheet — Sina (priority 2) first, then eastmoney fallback. */
  async balanceSheet(code: string): Promise<DataResult<BalanceSheet | null>> {
    const r = await this.sina.getBalanceSheet(code);
    if (r.data) return r;
    // Eastmoney may have balance sheet data — but Sina is better structured
    return r;
  }

  /** Income statement — Sina (priority 2) first. */
  async incomeStatement(code: string): Promise<DataResult<IncomeStatement | null>> {
    return this.sina.getIncomeStatement(code);
  }

  /** Cash flow statement — Sina (priority 2) first. */
  async cashFlow(code: string): Promise<DataResult<CashFlowStatement | null>> {
    return this.sina.getCashFlow(code);
  }

  /** Compute technical indicators from close prices (local, zero network). */
  async indicators(
    closes: number[],
  ): Promise<{ macd: ReturnType<typeof calcMACD>; rsi: ReturnType<typeof calcRSI>; ma: ReturnType<typeof calcMA>; boll: ReturnType<typeof calcBollinger> }> {
    return {
      macd: calcMACD(closes),
      rsi: calcRSI(closes),
      ma: calcMA(closes),
      boll: calcBollinger(closes),
    };
  }
}

class AnnouncementsLayer {
  constructor(private cninfo: CninfoProvider) {}

  async search(keyword: string, code?: string, startDate?: string, endDate?: string): Promise<DataResult<Announcement[]>> {
    return this.cninfo.search(keyword, code, startDate, endDate);
  }

  async download(url: string): Promise<DataResult<ArrayBuffer>> {
    return this.cninfo.download(url);
  }
}
