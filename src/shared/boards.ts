export const BOARD_ORDER = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "live-mentions",
  "github-trending",
] as const;

export type BoardSlug = (typeof BOARD_ORDER)[number];

export type RscKey = "initialData" | "repositories" | "initialMentions";
export type BoardKind = "growth" | "trending" | "mentions";

export interface BoardMeta {
  slug: BoardSlug;
  label: string;
  url: string;
  rscKey: RscKey;
  kind: BoardKind;
}

export const BOARDS: readonly BoardMeta[] = [
  {
    slug: "daily",
    label: "日榜",
    url: "https://trendshift.io/",
    rscKey: "initialData",
    kind: "growth",
  },
  {
    slug: "weekly",
    label: "周榜",
    url: "https://trendshift.io/weekly",
    rscKey: "initialData",
    kind: "growth",
  },
  {
    slug: "monthly",
    label: "月榜",
    url: "https://trendshift.io/monthly",
    rscKey: "initialData",
    kind: "growth",
  },
  {
    slug: "yearly",
    label: "年榜",
    url: "https://trendshift.io/yearly",
    rscKey: "initialData",
    kind: "growth",
  },
  {
    slug: "live-mentions",
    label: "当日提及榜",
    url: "https://trendshift.io/live-mentions",
    rscKey: "initialMentions",
    kind: "mentions",
  },
  {
    slug: "github-trending",
    label: "GitHub 趋势历史榜",
    url: "https://trendshift.io/github-trending-repositories",
    rscKey: "repositories",
    kind: "trending",
  },
];

export const BOARD_LABELS: Record<BoardSlug, string> = Object.fromEntries(
  BOARDS.map((board) => [board.slug, board.label]),
) as Record<BoardSlug, string>;
