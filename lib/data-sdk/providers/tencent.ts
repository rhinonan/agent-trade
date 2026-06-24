// lib/data-sdk/providers/tencent.ts
// 腾讯财经 (qt.gtimg.cn) — real-time quotes, indices, ETFs, search.
// Also includes Baidu (finance.pae.baidu.com) for K-line with MA.
// Priority 1 data source — does not block IPs, no rate limit needed.

import type { DataResult, Quote, IndexQuote, ETFQuote, SearchResult, KlineBar, KlineOptions } from "../types.js";
import { normalizeCode, toTencentCode, decodeGBK, fetchWithTimeout } from "../utils.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export class TencentProvider {
  private timeout: number;

  constructor(timeout: number = 10_000) {
    this.timeout = timeout;
  }

  // ─── Real-time quotes ───

  /**
   * Batch fetch real-time quotes from Tencent Finance.
   * Returns PE(TTM), PB, market cap, turnover, limit up/down, etc.
   * Supports stocks, indices (000001=上证, 000300=沪深300, 399006=创业板), ETFs (510050, 510300).
   * Endpoint: GET https://qt.gtimg.cn/q={prefixed_codes}
   */
  async getQuotes(codes: string[]): Promise<DataResult<Record<string, Quote>>> {
    const prefixed = codes.map(toTencentCode);
    const url = `https://qt.gtimg.cn/q=${prefixed.join(",")}`;

    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) {
        return { data: null, error: `HTTP ${res.status}: ${res.statusText}`, source: "tencent" };
      }
      const buf = await res.arrayBuffer();
      const text = decodeGBK(buf);
      return { data: this._parseQuotes(text, codes), source: "tencent" };
    } catch (err) {
      return { data: null, error: String(err), source: "tencent" };
    }
  }

  /** Parse Tencent's "~" separated GBK response into Quote objects. */
  private _parseQuotes(text: string, codes: string[]): Record<string, Quote> {
    const result: Record<string, Quote> = {};
    const lines = text.split(";").filter((l) => l.trim() && l.includes("=") && l.includes('"'));

    for (const line of lines) {
      const vals = line.split('"')[1]?.split("~");
      if (!vals || vals.length < 53) continue;

      const code = vals[2]; // e.g. "600519"
      if (!code || !codes.some((c) => normalizeCode(c) === code)) continue;

      const q: Quote = {
        symbol: code,
        name: vals[1] || "",
        price: parseFloat(vals[3]) || 0,
        lastClose: parseFloat(vals[4]) || 0,
        open: parseFloat(vals[5]) || 0,
        high: parseFloat(vals[33]) || 0,
        low: parseFloat(vals[34]) || 0,
        changeAmt: parseFloat(vals[31]) || 0,
        changePct: parseFloat(vals[32]) || 0,
        turnoverPct: parseFloat(vals[38]) || 0,
        amplitudePct: parseFloat(vals[43]) || 0,
        peTtm: parseFloat(vals[39]) || 0,
        peStatic: parseFloat(vals[52]) || 0,
        pb: parseFloat(vals[46]) || 0,
        marketCapYi: parseFloat(vals[44]) || 0,
        floatMarketCapYi: parseFloat(vals[45]) || 0,
        limitUp: parseFloat(vals[47]) || 0,
        limitDown: parseFloat(vals[48]) || 0,
        volumeRatio: parseFloat(vals[49]) || 0,
        amountWan: parseFloat(vals[37]) || 0,
      };
      result[code] = q;
    }
    return result;
  }

  /** Fetch quotes for a single stock. */
  async getQuote(code: string): Promise<DataResult<Quote | null>> {
    const r = await this.getQuotes([code]);
    if (!r.data) return { data: null, error: r.error, source: r.source };
    const q = r.data[normalizeCode(code)];
    return { data: q ?? null, source: r.source, error: q ? undefined : `No data for ${code}` };
  }

  // ─── Index quotes ───

  /** Fetch index quotes (上证000001, 沪深300 000300, 创业板399006, etc.) */
  async getIndexQuotes(codes: string[]): Promise<DataResult<IndexQuote[]>> {
    const prefixed = codes.map((c) => `s_${toTencentCode(c)}`);
    const url = `https://qt.gtimg.cn/q=${prefixed.join(",")}`;

    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "tencent" };
      const buf = await res.arrayBuffer();
      const text = decodeGBK(buf);
      const items: IndexQuote[] = [];
      for (const line of text.split(";")) {
        const vals = line.split('"')[1]?.split("~");
        if (!vals || vals.length < 10) continue;
        items.push({
          symbol: vals[2],
          name: vals[1],
          price: parseFloat(vals[3]) || 0,
          lastClose: parseFloat(vals[4]) || 0,
          changePct: parseFloat(vals[32]) || 0,
          changeAmt: parseFloat(vals[31]) || 0,
          high: parseFloat(vals[33]) || 0,
          low: parseFloat(vals[34]) || 0,
          amountWan: parseFloat(vals[37]) || 0,
        });
      }
      return { data: items, source: "tencent" };
    } catch (err) {
      return { data: null, error: String(err), source: "tencent" };
    }
  }

  // ─── ETF quotes ───

  /** Fetch ETF quotes (510050, 510300, etc.) */
  async getETFQuotes(codes: string[]): Promise<DataResult<ETFQuote[]>> {
    const r = await this.getQuotes(codes);
    if (!r.data) return { data: null, error: r.error, source: r.source };
    const items: ETFQuote[] = Object.values(r.data).map((q) => ({
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      lastClose: q.lastClose,
      changePct: q.changePct,
      peTtm: q.peTtm,
      pb: q.pb,
      volume: 0, // Tencent ETF fields may differ — volume at index 6
    }));
    return { data: items, source: "tencent" };
  }

  // ─── K-line (via Baidu Finance — HTTP, no IP block) ───

  /**
   * Fetch K-line data with MA5/MA10/MA20 pre-computed.
   * Source: Baidu Finance (finance.pae.baidu.com). No IP block, no auth.
   * ktype: 1=daily, 2=weekly, 3=monthly.
   */
  async getKline(code: string, opts: KlineOptions = {}): Promise<DataResult<KlineBar[]>> {
    const { period = "daily" } = opts;
    const ktypeMap: Record<string, string> = { daily: "1", weekly: "2", monthly: "3" };
    const ktype = ktypeMap[period] ?? "1";

    const url = `https://finance.pae.baidu.com/selfselect/getstockquotation?all=1&isIndex=false&isBk=false&isBlock=false&isFutures=false&isStock=true&newFormat=1&group=quotation_kline_ab&finClientType=pc&code=${normalizeCode(code)}&ktype=${ktype}&start_time=`;

    try {
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "application/vnd.finance-web.v1+json",
          "Origin": "https://gushitong.baidu.com",
          "Referer": "https://gushitong.baidu.com/",
        },
      }, this.timeout);

      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "baidu" };
      const d: any = await res.json();
      const md = d?.Result?.newMarketData;
      if (!md) return { data: null, error: "No market data in response", source: "baidu" };

      const keys: string[] = md.keys ?? [];
      const rows: string[] = (md.marketData ?? "").split(";").filter(Boolean);

      // Map known key positions
      const idx = (name: string) => keys.indexOf(name);
      const timeIdx = idx("time"), openIdx = idx("open"), closeIdx = idx("close");
      const highIdx = idx("high"), lowIdx = idx("low");
      const volIdx = idx("volume"), amtIdx = idx("amount");

      const bars: KlineBar[] = [];
      for (const row of rows) {
        const cols = row.split(",");
        if (cols.length < keys.length) continue;
        bars.push({
          date: cols[timeIdx] ?? "",
          open: parseFloat(cols[openIdx]) || 0,
          close: parseFloat(cols[closeIdx]) || 0,
          high: parseFloat(cols[highIdx]) || 0,
          low: parseFloat(cols[lowIdx]) || 0,
          volume: parseFloat(cols[volIdx]) || 0,
          amount: amtIdx >= 0 ? (parseFloat(cols[amtIdx]) || 0) : undefined,
        });
      }
      return { data: bars, source: "baidu" };
    } catch (err) {
      return { data: null, error: String(err), source: "baidu" };
    }
  }

  // ─── Search ───

  /** Search stocks/indices by keyword (smartbox suggest). */
  async search(keyword: string): Promise<DataResult<SearchResult[]>> {
    const url = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(keyword)}&t=all`;
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "tencent" };
      const buf = await res.arrayBuffer();
      const text = decodeGBK(buf);
      // Response format: "v_hint=\"1^600519^贵州茅台^GP-A\""
      const results: SearchResult[] = [];
      const re = /(\d)~([A-Z]{2})?(\d{6})~([^~]+)~([^~]+)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const typeMap: Record<string, string> = { GP: "stock", ZS: "index", JJ: "etf" };
        results.push({ symbol: m[3], name: m[4], type: typeMap[m[5]] ?? "stock" });
      }
      return { data: results, source: "tencent" };
    } catch (err) {
      return { data: null, error: String(err), source: "tencent" };
    }
  }
}
