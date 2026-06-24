// lib/data-sdk/providers/sina.ts
// 新浪财经 (quotes.sina.cn) — financial statements (balance sheet, income statement, cash flow).
// Priority 2 data source — low risk, no rate limit needed.

import type { DataResult, BalanceSheet, IncomeStatement, CashFlowStatement } from "../types.js";
import { normalizeCode, getPrefix, fetchWithTimeout } from "../utils.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export class SinaProvider {
  private timeout: number;

  constructor(timeout: number = 15_000) {
    this.timeout = timeout;
  }

  /** Build Sina finance report URL. reportType: "balance" | "profit" | "cashflow" */
  private _reportUrl(code: string, reportType: string): string {
    const prefix = getPrefix(code);
    const market = prefix === "sh" ? "sh" : "sz";
    const c = normalizeCode(code);
    return `https://quotes.sina.cn/cn/api/jsonp_v2.php/data/stockFinanceReport?symbol=${market}${c}&type=${reportType}`;
  }

  private async _getJsonp(url: string): Promise<any> {
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // Strip JSONP callback wrapper: "callbackname(data);"
    const json = text.replace(/^[^(]*\(/, "").replace(/\);?$/, "");
    return JSON.parse(json);
  }

  async getBalanceSheet(code: string): Promise<DataResult<BalanceSheet | null>> {
    try {
      const d = await this._getJsonp(this._reportUrl(code, "balance"));
      const reportList = d?.data?.report_list;
      if (!reportList) return { data: null, error: "No report_list in response", source: "sina" };

      // Get latest report period
      const periods = Object.keys(reportList).sort().reverse();
      if (!periods.length) return { data: null, error: "No report periods", source: "sina" };
      const latest = reportList[periods[0]];
      const items = latest?.data ?? [];

      const getVal = (title: string) => {
        const item = items.find((i: any) => i.item_title?.includes(title));
        return item ? parseFloat(item.item_value) || 0 : 0;
      };

      return {
        data: {
          reportDate: periods[0],
          totalAssets: getVal("资产总计"),
          totalLiabilities: getVal("负债合计"),
          equity: getVal("股东权益"),
          currentAssets: getVal("流动资产合计"),
          currentLiabilities: getVal("流动负债合计"),
          cash: getVal("货币资金"),
          receivables: getVal("应收账款"),
          inventory: getVal("存货"),
          fixedAssets: getVal("固定资产"),
          goodwill: getVal("商誉"),
        },
        source: "sina",
      };
    } catch (err) {
      return { data: null, error: String(err), source: "sina" };
    }
  }

  async getIncomeStatement(code: string): Promise<DataResult<IncomeStatement | null>> {
    try {
      const d = await this._getJsonp(this._reportUrl(code, "profit"));
      const reportList = d?.data?.report_list;
      if (!reportList) return { data: null, error: "No report_list", source: "sina" };

      const periods = Object.keys(reportList).sort().reverse();
      if (!periods.length) return { data: null, error: "No periods", source: "sina" };
      const latest = reportList[periods[0]];
      const items = latest?.data ?? [];
      const prev = reportList[periods[1]]?.data ?? [];

      const getVal = (title: string) => {
        const item = items.find((i: any) => i.item_title?.includes(title));
        return item ? parseFloat(item.item_value) || 0 : 0;
      };
      const prevVal = (title: string) => {
        const item = prev.find((i: any) => i.item_title?.includes(title));
        return item ? parseFloat(item.item_value) || 0 : 0;
      };

      const revenue = getVal("营业收入");
      const netProfit = getVal("净利润");
      const prevRevenue = prevVal("营业收入");
      const prevProfit = prevVal("净利润");
      const grossProfit = getVal("毛利");
      const operatingProfit = getVal("营业利润");
      const totalEquity = getVal("股东权益");

      return {
        data: {
          reportDate: periods[0],
          revenue,
          revenueGrowth: prevRevenue ? (revenue - prevRevenue) / Math.abs(prevRevenue) : 0,
          netProfit,
          netProfitGrowth: prevProfit ? (netProfit - prevProfit) / Math.abs(prevProfit) : 0,
          operatingProfit,
          grossMargin: revenue ? grossProfit / revenue : 0,
          netMargin: revenue ? netProfit / revenue : 0,
          roe: totalEquity ? netProfit / totalEquity : 0,
          eps: getVal("每股收益"),
        },
        source: "sina",
      };
    } catch (err) {
      return { data: null, error: String(err), source: "sina" };
    }
  }

  async getCashFlow(code: string): Promise<DataResult<CashFlowStatement | null>> {
    try {
      const d = await this._getJsonp(this._reportUrl(code, "cashflow"));
      const reportList = d?.data?.report_list;
      if (!reportList) return { data: null, error: "No report_list", source: "sina" };

      const periods = Object.keys(reportList).sort().reverse();
      if (!periods.length) return { data: null, error: "No periods", source: "sina" };
      const latest = reportList[periods[0]];
      const items = latest?.data ?? [];

      const getVal = (title: string) => {
        const item = items.find((i: any) => i.item_title?.includes(title));
        return item ? parseFloat(item.item_value) || 0 : 0;
      };

      const operatingCF = getVal("经营活动产生的现金流量净额");
      const investingCF = getVal("投资活动产生的现金流量净额");
      const financingCF = getVal("筹资活动产生的现金流量净额");
      const capex = getVal("购建固定资产");

      return {
        data: {
          reportDate: periods[0],
          operatingCF,
          investingCF,
          financingCF,
          netCF: operatingCF + investingCF + financingCF,
          freeCashFlow: operatingCF - Math.abs(capex),
        },
        source: "sina",
      };
    } catch (err) {
      return { data: null, error: String(err), source: "sina" };
    }
  }
}
