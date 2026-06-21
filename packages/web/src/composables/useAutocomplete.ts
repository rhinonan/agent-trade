import { ref, watch, type Ref } from "vue";

export interface Suggestion {
  code: string;
  name: string;
}

/** Local hot stocks shown on focus when stock tab is active */
const HOT_STOCKS: Suggestion[] = [
  { code: "600519", name: "贵州茅台" },
  { code: "300750", name: "宁德时代" },
  { code: "000858", name: "五粮液" },
  { code: "601318", name: "中国平安" },
  { code: "000333", name: "美的集团" },
  { code: "002594", name: "比亚迪" },
  { code: "600036", name: "招商银行" },
  { code: "000651", name: "格力电器" },
  { code: "600900", name: "长江电力" },
  { code: "601899", name: "紫金矿业" },
  { code: "300059", name: "东方财富" },
  { code: "688981", name: "中芯国际" },
  { code: "002371", name: "北方华创" },
  { code: "601012", name: "隆基绿能" },
  { code: "600276", name: "恒瑞医药" },
  { code: "000725", name: "京东方A" },
  { code: "002415", name: "海康威视" },
  { code: "600809", name: "山西汾酒" },
  { code: "300308", name: "中际旭创" },
  { code: "002230", name: "科大讯飞" },
];

/** Local sector names — loaded once on sector tab activation */
const SECTOR_LIST: Suggestion[] = [
  { code: "CPO", name: "光电共封装" },
  { code: "白酒", name: "白酒" },
  { code: "半导体", name: "半导体" },
];

export function useAutocomplete(
  query: Ref<string>,
  targetType: Ref<"stock" | "sector">,
) {
  const suggestions = ref<Suggestion[]>([]);
  const loading = ref(false);

  /** Local filter when user types */
  function localFilter(q: string, pool: Suggestion[]): Suggestion[] {
    const lower = q.toLowerCase().trim();
    if (!lower) return pool.slice(0, 8);
    return pool
      .filter(
        (s) =>
          s.code.toLowerCase().includes(lower) ||
          s.name.includes(lower) ||
          s.name.includes(q.trim()),
      )
      .slice(0, 8);
  }

  /** Fetch from API on input (stock mode only — sector is fully local) */
  async function fetchFromAPI(keyword: string) {
    if (targetType.value !== "stock" || !keyword.trim()) return;
    loading.value = true;
    try {
      const res = await fetch(
        `/api/reference/search?keyword=${encodeURIComponent(keyword)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.results?.length) {
        suggestions.value = data.results;
      }
    } catch {
      // API unreachable — local results already showing
    } finally {
      loading.value = false;
    }
  }

  watch(
    [query, targetType],
    ([q, type]) => {
      const pool = type === "sector" ? SECTOR_LIST : HOT_STOCKS;
      suggestions.value = localFilter(q, pool);
      // In stock mode, also try API for more results
      if (type === "stock" && q.trim().length >= 1) {
        fetchFromAPI(q);
      }
    },
    { immediate: true },
  );

  return { suggestions, loading };
}
