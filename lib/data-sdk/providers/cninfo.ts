// lib/data-sdk/providers/cninfo.ts
// 巨潮资讯 (webapi.cninfo.com.cn) — official announcements.
// Priority 2 data source — low risk, no rate limit needed.

import type { DataResult, Announcement } from "../types.js";
import { normalizeCode, fetchWithTimeout } from "../utils.js";

interface CninfoRecord {
  announcementId?: string;
  id?: string;
  announcementTitle?: string;
  title?: string;
  publishDate?: string;
  announcementTime?: string;
  secCode?: string;
  secName?: string;
  announcementType?: string;
  summary?: string;
  adjunctUrl?: string;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const BASE_URL = "https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1000";

/** Module-level cache for orgId lookup (loaded once). */
let _orgIdMap: Record<string, string> | null = null;

export class CninfoProvider {
  private timeout: number;

  constructor(timeout: number = 15_000) {
    this.timeout = timeout;
  }

  /**
   * Search announcements by keyword and optional stock code.
   * orgId is auto-resolved from a cached mapping table.
   */
  async search(
    keyword: string,
    code?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<DataResult<Announcement[]>> {
    try {
      let orgId = "";
      if (code) {
        orgId = await this._getOrgId(normalizeCode(code));
      }

      const params = new URLSearchParams();
      params.set("keyword", keyword);
      params.set("pageNum", "1");
      params.set("pageSize", "30");
      params.set("sortName", "pubdate");
      params.set("sortType", "desc");
      if (orgId) params.set("orgId", orgId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const url = `${BASE_URL}?${params}`;
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "cninfo" };

      const d = await res.json();
      const records = d?.records ?? d?.data ?? [];
      const items: Announcement[] = (Array.isArray(records) ? records : []).map((r: CninfoRecord) => ({
        id: r.announcementId ?? r.id ?? "",
        title: r.announcementTitle ?? r.title ?? "",
        publishDate: r.publishDate ?? r.announcementTime ?? "",
        stockCode: r.secCode ?? code ?? "",
        stockName: r.secName ?? "",
        category: r.announcementType ?? "",
        summary: r.summary ?? "",
        pdfUrl: r.adjunctUrl ?? undefined,
      }));
      return { data: items, source: "cninfo" };
    } catch (err) {
      return { data: null, error: String(err), source: "cninfo" };
    }
  }

  /** Download announcement PDF or text. */
  async download(url: string): Promise<DataResult<ArrayBuffer>> {
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "cninfo" };
      return { data: await res.arrayBuffer(), source: "cninfo" };
    } catch (err) {
      return { data: null, error: String(err), source: "cninfo" };
    }
  }

  /** Resolve orgId from code. Falls back to "gssz{code}" / "gssh{code}" convention. */
  private async _getOrgId(code: string): Promise<string> {
    if (!_orgIdMap) {
      try {
        const res = await fetchWithTimeout(
          "https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1000?type=orgId",
          { headers: { "User-Agent": UA } },
          this.timeout,
        );
        if (res.ok) _orgIdMap = await res.json();
      } catch { /* fall through */ }
    }

    if (_orgIdMap && _orgIdMap[code]) return _orgIdMap[code];

    // Fallback: hardcoded convention
    return code.startsWith("6") || code.startsWith("9") ? `gssh${code}` : `gssz${code}`;
  }
}
