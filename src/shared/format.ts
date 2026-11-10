export const EMPTY_DESCRIPTION = "暂无英文简介";

export function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}

export function formatRank(rank: number): string {
  return String(rank).padStart(2, "0");
}
