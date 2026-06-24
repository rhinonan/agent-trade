// lib/data-sdk/providers/eastmoney.ts
// 东财全家桶 — all eastmoney.com endpoints share one RateLimiter + HTTP session.
// Priority 3 data source — ONLY for data that Tencent/Sina don't provide.
// Built-in rate limiting (1s interval + jitter) to avoid IP bans.

import type { DataResult, StockInfo, SectorInfo, FundFlowMinute, FundFlowDay,
  ConceptBlock, DragonTigerEntry, AllDragonTigerEntry, MarginTradingEntry,
  BlockTradeEntry, ShareholderEntry, DividendEntry, LockupEntry,
  ResearchReport, IndustryReport, ResearchPDF, StockNewsItem, GlobalNewsItem } from "../types.js";
import { normalizeCode, toSecId, fetchWithTimeout, RateLimiter } from "../utils.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const PUSH2_URL = "https://push2.eastmoney.com/api/qt";
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const REPORT_URL = "https://reportapi.eastmoney.com/report/list";
const SEARCH_URL = "https://search-api-web.eastmoney.com/search/jsonp";
const NEWS_URL = "https://np-weblist.eastmoney.com/comm/web/getNewsList";

interface Push2Response { data?: { f57?: string; f58?: string; f85?: string; f86?: number; f84?: number; f20?: number; f117?: string; diff?: Array<Record<string, any>>; klines?: string[]; }; }
interface DatacenterResponse { result?: { data?: Record<string, any>[]; }; }
interface ReportResponse { result?: { data?: Record<string, any>[]; }; }
interface NewsResponse { result?: { cmsArticleWebOld?: Record<string, any>[]; data?: Record<string, any>[]; }; }

// Single-threaded JS: ++ is atomic between await points (no concurrent writes).
let _jsonpCounter = 0;

export class EastmoneyProvider {
  private limiter: RateLimiter;
  private timeout: number;

  constructor(timeout: number = 15_000, minInterval: number = 1000, jitter: number = 500) {
    this.limiter = new RateLimiter(minInterval, jitter);
    this.timeout = timeout;
  }

  /** Shared fetch for all eastmoney endpoints — auto rate-limited. */
  private async _get(url: string, opts: RequestInit = {}): Promise<Response> {
    await this.limiter.wait();
    const res = await fetchWithTimeout(url, {
      ...opts,
      headers: { "User-Agent": UA, ...opts.headers },
    }, this.timeout);
    return res;
  }

  /** Safe JSON parse with DataResult wrapping. */
  private async _safeJson<T>(url: string, label: string): Promise<DataResult<T>> {
    try {
      const res = await this._get(url);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: `eastmoney.${label}` };
      const d = await res.json();
      return { data: d as T, source: `eastmoney.${label}` };
    } catch (err) {
      return { data: null, error: String(err), source: `eastmoney.${label}` };
    }
  }

  // ─── Push2: Stock info ───

  async getStockInfo(code: string): Promise<DataResult<StockInfo | null>> {
    const secid = toSecId(code);
    const url = `${PUSH2_URL}/stock/get?secid=${secid}&fields=f57,f58,f85,f86,f84,f117,f20,f21`;
    const r = await this._safeJson<Push2Response>(url, "push2.info");
    if (!r.data?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const d = r.data.data;
    return {
      data: {
        symbol: normalizeCode(code),
        name: d.f58 ?? "",
        industry: d.f85 ?? "",
        totalShares: d.f86 ?? 0,
        floatShares: d.f84 ?? 0,
        marketCapYi: d.f20 ?? 0,
        listedDate: d.f117 ?? "",
      },
      source: r.source,
    };
  }

  // ─── Push2: Sector list ───

  async getSectorList(): Promise<DataResult<SectorInfo[]>> {
    const url = `${PUSH2_URL}/clist/get?pn=1&pz=500&po=1&np=1&fltt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f3,f104`;
    const r = await this._safeJson<Push2Response>(url, "push2.sectors");
    if (!r.data?.data?.diff) return { data: null, error: r.error ?? "No data", source: r.source };

    const sectors: SectorInfo[] = r.data.data.diff.map((d: { f12?: string; f14?: string; f3?: number; f104?: number }) => ({
      code: d.f12 ?? "",
      name: d.f14 ?? "",
      changePct: d.f3 ?? 0,
      constituentCount: d.f104 ?? 0,
    }));
    return { data: sectors, source: r.source };
  }

  // ─── Push2: Fund flow minute ───

  async getFundFlowMinute(code: string): Promise<DataResult<FundFlowMinute[]>> {
    const secid = toSecId(code);
    const url = `${PUSH2_URL}/stock/fflow/kline/get?secid=${secid}&lmt=0&klt=1&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57`;
    const r = await this._safeJson<Push2Response>(url, "push2.fflow");
    if (!r.data?.data?.klines) return { data: null, error: r.error ?? "No data", source: r.source };

    const items: FundFlowMinute[] = r.data.data.klines.map((k: string) => {
      const cols = k.split(",");
      return {
        time: cols[0] ?? "",
        mainNetFlow: parseFloat(cols[2]) || 0,
        superLargeNet: parseFloat(cols[3]) || 0,
        largeNet: parseFloat(cols[4]) || 0,
        mediumNet: parseFloat(cols[5]) || 0,
        smallNet: parseFloat(cols[6]) || 0,
      };
    });
    return { data: items, source: r.source };
  }

  // ─── Push2: Fund flow 120 days ───

  async getFundFlow120(code: string): Promise<DataResult<FundFlowDay[]>> {
    const secid = toSecId(code);
    const url = `${PUSH2_URL}/stock/fflow/daykline/get?secid=${secid}&lmt=0&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57`;
    const r = await this._safeJson<Push2Response>(url, "push2.fflow120");
    if (!r.data?.data?.klines) return { data: null, error: r.error ?? "No data", source: r.source };

    const items: FundFlowDay[] = r.data.data.klines.map((k: string) => {
      const cols = k.split(",");
      return {
        tradeDate: cols[0] ?? "",
        mainNetFlow: parseFloat(cols[2]) || 0,
        superLargeNet: parseFloat(cols[3]) || 0,
        largeNet: parseFloat(cols[4]) || 0,
        mediumNet: parseFloat(cols[5]) || 0,
        smallNet: parseFloat(cols[6]) || 0,
      };
    });
    return { data: items, source: r.source };
  }

  // ─── Slist: Concept blocks ───

  async getConceptBlocks(code: string): Promise<DataResult<ConceptBlock[]>> {
    const secid = toSecId(code);
    const url = `${PUSH2_URL}/slist/get?spt=3&secid=${secid}&fields=f12,f14,f13,f3,f128`;
    const r = await this._safeJson<Push2Response>(url, "slist.concept");
    if (!r.data?.data?.diff) return { data: null, error: r.error ?? "No data", source: r.source };

    const blocks: ConceptBlock[] = r.data.data.diff.map((d: { f12?: string; f14?: string; f13?: number; f3?: number; f128?: string }) => ({
      blockCode: d.f12 ?? "",
      blockName: d.f14 ?? "",
      blockType: d.f13 === 1 ? "行业" : d.f13 === 2 ? "概念" : "地域",
      changePct: d.f3 ?? 0,
      leaderStock: d.f128 ?? "",
    }));
    return { data: blocks, source: r.source };
  }

  // ─── Datacenter: Dragon Tiger Board ───

  async dragonTigerBoard(code?: string, date?: string): Promise<DataResult<DragonTigerEntry[]>> {
    let filter = "";
    if (code) filter += `(SECUCODE="${normalizeCode(code)}")`;
    if (date) filter += (filter ? "+AND+" : "") + `(TRADE_DATE='${date}')`;

    const params = new URLSearchParams({
      reportName: "RPT_DRAGON_TIGER", columns: "ALL",
      filter, pageNumber: "1", pageSize: "50",
      sortColumns: "TRADE_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<DatacenterResponse>(`${DATACENTER_URL}?${params}`, "datacenter.dt");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: DragonTigerEntry[] = r.data.result.data.map((d: Record<string, any>) => ({
      tradeDate: d.TRADE_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      stockName: d.SECURITY_NAME_ABBR ?? "",
      closePrice: d.CLOSE_PRICE ?? 0,
      changePct: d.CHANGE_RATE ?? 0,
      turnoverPct: d.TURNOVERRATE ?? 0,
      reason: d.EXPLANATION ?? "",
      netBuyAmt: d.NET_BUY_AMT ?? 0,
      buyAmt: d.TOTAL_BUY_AMT ?? 0,
      sellAmt: d.TOTAL_SELL_AMT ?? 0,
      topBuyBrokers: [],   // Broker detail requires separate RPT_DRAGON_TIGER_BROKER endpoint
      topSellBrokers: [],  // Broker detail requires separate RPT_DRAGON_TIGER_BROKER endpoint
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: All Dragon Tiger Board ───

  async allDragonTigerBoard(date?: string): Promise<DataResult<AllDragonTigerEntry[]>> {
    let filter = "";
    if (date) filter = `(TRADE_DATE='${date}')`;

    const params = new URLSearchParams({
      reportName: "RPT_DAILY_DRAGON_TIGER", columns: "ALL",
      filter, pageNumber: "1", pageSize: "200",
      sortColumns: "NET_BUY_AMT", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<DatacenterResponse>(`${DATACENTER_URL}?${params}`, "datacenter.allDt");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: AllDragonTigerEntry[] = r.data.result.data.map((d: Record<string, any>, i: number) => ({
      tradeDate: d.TRADE_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      stockName: d.SECURITY_NAME_ABBR ?? "",
      closePrice: d.CLOSE_PRICE ?? 0,
      changePct: d.CHANGE_RATE ?? 0,
      netBuyAmt: d.NET_BUY_AMT ?? 0,
      reason: d.EXPLANATION ?? "",
      rank: i + 1,
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Margin Trading ───

  async marginTrading(code: string, startDate?: string, endDate?: string): Promise<DataResult<MarginTradingEntry[]>> {
    let filter = `(SECUCODE="${normalizeCode(code)}")`;
    if (startDate) filter += `+AND+(TRADE_DATE>=+'${startDate}')`;
    if (endDate) filter += `+AND+(TRADE_DATE<=+'${endDate}')`;

    const params = new URLSearchParams({
      reportName: "RPT_MARGIN_TRADE", columns: "ALL",
      filter, pageNumber: "1", pageSize: "100",
      sortColumns: "TRADE_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<DatacenterResponse>(`${DATACENTER_URL}?${params}`, "datacenter.margin");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: MarginTradingEntry[] = r.data.result.data.map((d: Record<string, any>) => ({
      tradeDate: d.TRADE_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      marginBalance: d.MARGIN_BAL ?? 0,
      marginBuy: d.MARGIN_BUY ?? 0,
      marginRepay: d.MARGIN_REPAY ?? 0,
      shortBalance: d.SHORT_BAL ?? 0,
      shortVolume: d.SHORT_VOL ?? 0,
      totalBalance: d.TOTAL_BAL ?? 0,
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Block Trades ───

  async blockTrades(code: string, startDate?: string, endDate?: string): Promise<DataResult<BlockTradeEntry[]>> {
    let filter = `(SECUCODE="${normalizeCode(code)}")`;
    if (startDate) filter += `+AND+(TRADE_DATE>=+'${startDate}')`;
    if (endDate) filter += `+AND+(TRADE_DATE<=+'${endDate}')`;

    const params = new URLSearchParams({
      reportName: "RPT_BLOCK_TRADE", columns: "ALL",
      filter, pageNumber: "1", pageSize: "100",
      sortColumns: "TRADE_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<DatacenterResponse>(`${DATACENTER_URL}?${params}`, "datacenter.block");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: BlockTradeEntry[] = r.data.result.data.map((d: Record<string, any>) => ({
      tradeDate: d.TRADE_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      stockName: d.SECURITY_NAME_ABBR ?? "",
      price: d.TRADE_PRICE ?? 0,
      volume: d.TRADE_VOL ?? 0,
      amount: d.TRADE_AMT ?? 0,
      discountRate: d.DISCOUNT_RATE ?? 0,
      buyerBroker: d.BUYER_BROKER ?? "",
      sellerBroker: d.SELLER_BROKER ?? "",
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Shareholders ───

  async shareholders(code: string): Promise<DataResult<ShareholderEntry[]>> {
    const filter = `(SECUCODE="${normalizeCode(code)}")`;
    const params = new URLSearchParams({
      reportName: "RPT_SHAREHOLDER_NUM", columns: "ALL",
      filter, pageNumber: "1", pageSize: "20",
      sortColumns: "REPORT_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<DatacenterResponse>(`${DATACENTER_URL}?${params}`, "datacenter.shareholder");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: ShareholderEntry[] = r.data.result.data.map((d: Record<string, any>) => ({
      reportDate: d.REPORT_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      shareholderCount: d.HOLDER_NUM ?? 0,
      changePct: d.CHANGE_RATE ?? 0,
      avgHolding: d.AVG_HOLD_NUM ?? 0,
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Dividends ───

  async dividends(code: string): Promise<DataResult<DividendEntry[]>> {
    const filter = `(SECUCODE="${normalizeCode(code)}")`;
    const params = new URLSearchParams({
      reportName: "RPT_DIVIDEND", columns: "ALL",
      filter, pageNumber: "1", pageSize: "30",
      sortColumns: "EX_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<DatacenterResponse>(`${DATACENTER_URL}?${params}`, "datacenter.dividend");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: DividendEntry[] = r.data.result.data.map((d: Record<string, any>) => ({
      exDate: d.EX_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      cashDiv: d.CASH_DIV ?? 0,
      stockDiv: d.STOCK_DIV ?? 0,
      transferDiv: d.TRANSFER_DIV ?? 0,
      recordDate: d.RECORD_DATE ?? "",
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Lockup Expiration ───

  async lockupExpiration(startDate?: string, endDate?: string): Promise<DataResult<LockupEntry[]>> {
    let filter = "";
    if (startDate) filter += `(UNLOCK_DATE>=+'${startDate}')`;
    if (endDate) filter += (filter ? "+AND+" : "") + `(UNLOCK_DATE<=+'${endDate}')`;

    const params = new URLSearchParams({
      reportName: "RPT_LOCKUP_STOCK", columns: "ALL",
      filter, pageNumber: "1", pageSize: "200",
      sortColumns: "UNLOCK_DATE", sortTypes: "1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<DatacenterResponse>(`${DATACENTER_URL}?${params}`, "datacenter.lockup");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: LockupEntry[] = r.data.result.data.map((d: Record<string, any>) => ({
      stockCode: d.SECUCODE ?? "",
      stockName: d.SECURITY_NAME_ABBR ?? "",
      unlockDate: d.UNLOCK_DATE ?? "",
      unlockShares: d.UNLOCK_SHARES ?? 0,
      unlockCap: d.UNLOCK_CAP ?? 0,
      unlockRatio: d.UNLOCK_RATIO ?? 0,
    }));
    return { data: entries, source: r.source };
  }

  // ─── Report API: Individual Reports ───

  async individualReports(code: string, page: number = 1): Promise<DataResult<ResearchReport[]>> {
    const url = `${REPORT_URL}?stockCode=${normalizeCode(code)}&pageNo=${page}&pageSize=20&qType=0`;
    const r = await this._safeJson<ReportResponse>(url, "report.individual");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const reports: ResearchReport[] = r.data.result.data.map((d: Record<string, any>) => ({
      id: d.infoCode ?? "",
      title: d.title ?? "",
      author: d.author ?? "",
      orgName: d.orgName ?? "",
      publishDate: d.publishDate ?? "",
      stockCode: d.stockCode ?? "",
      stockName: d.stockName ?? "",
      rating: d.rating ?? "",
      ratingChange: d.ratingChange,
      eps2025: d.eps2025,
      eps2026: d.eps2026,
      eps2027: d.eps2027,
      pdfUrl: d.infoCode ? `https://reportapi.eastmoney.com/report/pdf/${d.infoCode}` : undefined,
    }));
    return { data: reports, source: r.source };
  }

  // ─── Report API: Industry Reports ───

  async industryReports(industryCode: string = "*", page: number = 1): Promise<DataResult<IndustryReport[]>> {
    const url = `${REPORT_URL}?industryCode=${industryCode}&pageNo=${page}&pageSize=20&qType=1`;
    const r = await this._safeJson<ReportResponse>(url, "report.industry");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const reports: IndustryReport[] = r.data.result.data.map((d: Record<string, any>) => ({
      id: d.infoCode ?? "",
      title: d.title ?? "",
      author: d.author ?? "",
      orgName: d.orgName ?? "",
      publishDate: d.publishDate ?? "",
      industryCode: d.industryCode ?? "",
      industryName: d.industryName ?? "",
      pdfUrl: d.infoCode ? `https://reportapi.eastmoney.com/report/pdf/${d.infoCode}` : undefined,
    }));
    return { data: reports, source: r.source };
  }

  // ─── Report API: Download PDF ───

  async downloadPdf(url: string): Promise<DataResult<ResearchPDF>> {
    try {
      const res = await this._get(url);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "eastmoney.pdf" };
      const buf = await res.arrayBuffer();
      return { data: { title: url.split("/").pop() ?? "report.pdf", pdfBuffer: buf }, source: "eastmoney.pdf" };
    } catch (err) {
      return { data: null, error: String(err), source: "eastmoney.pdf" };
    }
  }

  // ─── Stock News ───

  async stockNews(code: string, page: number = 1): Promise<DataResult<StockNewsItem[]>> {
    const cb = `jQuery${Date.now()}_${_jsonpCounter++}`;
    const url = `${SEARCH_URL}?cb=${cb}&keyword=${normalizeCode(code)}&pageNo=${page}&pageSize=20`;
    try {
      const res = await this._get(url);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "eastmoney.news.stock" };
      const text = await res.text();
      const json = text.replace(new RegExp(`^${cb}\\(`), "").replace(/\)$/, "");
      const d = JSON.parse(json);
      const articles = d?.result?.cmsArticleWebOld ?? d?.result ?? [];
      const items: StockNewsItem[] = (Array.isArray(articles) ? articles : []).map((a: Record<string, any>) => ({
        id: a.articleId ?? a.id ?? "",
        title: a.title ?? "",
        summary: a.summary ?? "",
        publishDate: a.publishDate ?? a.date ?? "",
        source: a.source ?? "",
        url: a.url ?? "",
      }));
      return { data: items, source: "eastmoney.news.stock" };
    } catch (err) {
      return { data: null, error: `JSONP parse error: ${String(err)}`, source: "eastmoney.news.stock" };
    }
  }

  // ─── Global News (24x7) ───

  async globalNews(page: number = 1): Promise<DataResult<GlobalNewsItem[]>> {
    const url = `${NEWS_URL}?pageNo=${page}&pageSize=30`;
    const r = await this._safeJson<NewsResponse>(url, "news.global");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const items: GlobalNewsItem[] = r.data.result.data.map((d: Record<string, any>) => ({
      id: d.newsId ?? d.id ?? "",
      title: d.newsTitle ?? d.title ?? "",
      content: d.newsContent ?? d.content ?? "",
      publishTime: d.publishTime ?? d.date ?? "",
      category: d.category ?? d.newsType ?? "",
    }));
    return { data: items, source: r.source };
  }
}
