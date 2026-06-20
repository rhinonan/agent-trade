export type TargetType = "stock" | "sector" | "index";

export interface AnalysisTarget {
  type: TargetType;
  code: string;
  name?: string;
  market?: "sh" | "sz" | "bj";
}
