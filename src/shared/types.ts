import type { BoardSlug } from "./boards";

export interface BoardEntryResponse {
  rank: number;
  repo: string;
  htmlUrl: string;
  descEn: string | null;
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
