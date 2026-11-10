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
  accent: string;
}

export const BOARDS: readonly BoardMeta[] = [
  {
    slug: "daily",
    label: "日榜",
    url: "https://trendshift.io/",
    rscKey: "initialData",
    kind: "growth",
    accent: "#7aa2f7",
  },
  {
    slug: "weekly",
    label: "周榜",
    url: "https://trendshift.io/weekly",
    rscKey: "initialData",
    kind: "growth",
    accent: "#bb9af7",
  },
  {
    slug: "monthly",
    label: "月榜",
    url: "https://trendshift.io/monthly",
    rscKey: "initialData",
    kind: "growth",
    accent: "#e0af68",
  },
  {
    slug: "yearly",
    label: "年榜",
    url: "https://trendshift.io/yearly",
    rscKey: "initialData",
    kind: "growth",
    accent: "#f7768e",
  },
  {
    slug: "live-mentions",
    label: "当日提及榜",
    url: "https://trendshift.io/live-mentions",
    rscKey: "initialMentions",
    kind: "mentions",
    accent: "#7dcfff",
  },
  {
    slug: "github-trending",
    label: "GitHub 趋势历史榜",
    url: "https://trendshift.io/github-trending-repositories",
    rscKey: "repositories",
    kind: "trending",
    accent: "#ff9e64",
  },
];

function boardMap<V>(pick: (board: BoardMeta) => V): Record<BoardSlug, V> {
  return Object.fromEntries(
    BOARDS.map((board) => [board.slug, pick(board)]),
  ) as Record<BoardSlug, V>;
}

export const BOARD_LABELS = boardMap((board) => board.label);
export const BOARD_ACCENTS = boardMap((board) => board.accent);
