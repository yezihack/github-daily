import type { InterpretationStatus } from "./types";

export const EMPTY_DESCRIPTION = "暂无英文简介";

export function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}

export function formatRank(rank: number): string {
  return String(rank).padStart(2, "0");
}

export function interpretationStatusHint(status: InterpretationStatus): string {
  if (status === "failed") return "AI 解读生成失败";
  if (status === "pending") return "AI 解读生成中";
  if (status === "none") return "AI 解读待生成";
  return "";
}
