import type { BoardSlug } from "./boards";

export type InterpretationStatus = "none" | "pending" | "done" | "failed";
export type DataFreshness = "latest" | "historic" | "fallback";

export interface Interpretation {
  summary: string | null;
  solves: string | null;
  audience: string | null;
  status: InterpretationStatus;
}

export interface BoardEntryResponse {
  rank: number;
  repo: string;
  htmlUrl: string;
  homepage: string | null;
  descEn: string | null;
  interpretation: Interpretation;
  stars: number | null;
  forks: number | null;
  gained: number | null;
  featured: number | null;
  language: string | null;
  tags: string[];
}

export type BoardsBySlug = Record<BoardSlug, BoardEntryResponse[]>;

export interface BoardsResponse {
  date: string | null;
  dates: string[];
  labels: Record<BoardSlug, string>;
  accents: Record<BoardSlug, string>;
  boards: BoardsBySlug;
  data_freshness: DataFreshness;
  fallback_date?: string; // When data_freshness is "fallback", this shows the date data came from
  pending_interpretations: number;
}

export interface InterpretationRun {
  id: number;
  started_at: string;
  finished_at: string;
  trigger: string;
  scanned: number;
  done: number;
  failed: number;
  rate_limited: number;
  duration_ms: number;
  errors: string | null;
}

export interface InterpretationRunsResponse {
  runs: InterpretationRun[];
}

export interface AdminStatusResponse {
  pending: number;
}
