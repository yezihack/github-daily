import type { BoardSlug } from "./boards";

export type InterpretationStatus = "none" | "pending" | "done" | "failed";

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
}
