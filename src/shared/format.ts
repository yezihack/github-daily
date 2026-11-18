import type { InterpretationStatus, DataFreshness } from "./types";

export const EMPTY_DESCRIPTION = "暂无英文简介";

export function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}

export function formatRank(rank: number): string {
  return String(rank).padStart(2, "0");
}

export function interpretationStatusHint(status: InterpretationStatus): string {
  if (status === "failed") return "解读暂缺";
  if (status === "pending") return "解读生成中";
  if (status === "none") return "";
  return "";
}

export function dataFreshnessHint(freshness: DataFreshness, date: string | null): string {
  if (freshness === "latest") return "";
  if (freshness === "historic") return "历史期次";
  if (freshness === "fallback" && date) return `数据更新于 ${date} UTC`;
  return "";
}

