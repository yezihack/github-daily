import { BOARDS, type BoardSlug } from "../../src/shared/boards";
import { EDITION_DATE, makeDailyRow, type RawRow } from "./daily-rsc";

export const EMPTY_SHELL_HTML = "<!doctype html><html><body>no rsc payload</body></html>";

export function buildRscHtml(key: string, rows: RawRow[]): string {
  const payload = `"${key}":${JSON.stringify(rows)}`;
  const splitAt = Math.floor(payload.length * 0.4);
  const chunks = [payload.slice(0, splitAt), payload.slice(splitAt)];
  const scripts = chunks
    .map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`)
    .join("");
  return `<!doctype html><html><head><title>TrendShift</title></head><body><main></main>${scripts}</body></html>`;
}

export function makeTrendingRow(index: number, overrides: RawRow = {}): RawRow {
  return {
    full_name: `trending${index}/repo${index}`,
    description: `Trending description ${index}.`,
    watchers: 50000 + index,
    forks: 500 + index,
    featured_count: 10 + index,
    language: "Rust",
    tags: [{ id: 1, display_name: "Learning resources" }],
    best_ranking: 1,
    ...overrides,
  };
}

export function makeMentionRow(index: number, overrides: RawRow = {}): RawRow {
  return {
    repository_full_name: `mention${index}/repo${index}`,
    repository_description: `Mentioned repository description ${index}.`,
    repository_stars: 1200 + index,
    repository_forks: 30 + index,
    repository_language: "Python",
    platform: "x",
    title: `Mention title ${index}`,
    content: `Mention body ${index} with details.`,
    posted_at: `${EDITION_DATE}T03:09:11Z`,
    link: "https://x.com/example/status/1",
    ...overrides,
  };
}

export interface BoardPagesOptions {
  date?: string;
  overrides?: Partial<Record<BoardSlug, RawRow[] | null>>;
}

export function boardPages(options: BoardPagesOptions = {}): Record<string, string> {
  const date = options.date ?? EDITION_DATE;
  const overrides = options.overrides ?? {};
  const pages: Record<string, string> = {};

  for (const board of BOARDS) {
    const override = overrides[board.slug];
    if (override === null) {
      pages[board.url] = EMPTY_SHELL_HTML;
      continue;
    }

    let rows: RawRow[];
    if (override) {
      rows = override;
    } else if (board.kind === "trending") {
      rows = Array.from({ length: 25 }, (_, index) => makeTrendingRow(index));
    } else if (board.kind === "mentions") {
      rows = Array.from({ length: 25 }, (_, index) => makeMentionRow(index));
    } else {
      rows = Array.from({ length: 25 }, (_, index) =>
        makeDailyRow(index, {
          date: `${date}T00:00:00Z`,
          full_name: `${board.slug}${index}/repo${index}`,
          repository_description: `${board.slug} description ${index}.`,
        }),
      );
    }

    pages[board.url] = buildRscHtml(board.rscKey, rows);
  }

  return pages;
}
