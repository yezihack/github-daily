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

export interface BoardsResponse {
  date: string | null;
  boards: {
    daily: BoardEntryResponse[];
  };
}
