export type RawRow = Record<string, unknown>;

export const EDITION_DATE = "2026-11-09";

export function makeDailyRow(index: number, overrides: RawRow = {}): RawRow {
  return {
    id: 1000 + index,
    rank: index + 1,
    date: `${EDITION_DATE}T00:00:00Z`,
    full_name: `owner${index}/repo${index}`,
    language: "TypeScript",
    repository_language: "TypeScript",
    repository_description: `English description for repo ${index}.`,
    repository_stars: 1000 + index,
    repository_forks: 10 + index,
    repository_stars_gained: 100 + index,
    repository_forks_gained: 0,
    repository_created_at: "2026-11-08T05:49:46Z",
    tags: [{ id: 7, display_name: "AI Agent" }],
    score: 2500 - index,
    ...overrides,
  };
}

export function makeDailyRows(count: number): RawRow[] {
  return Array.from({ length: count }, (_, index) => makeDailyRow(index));
}

export function buildDailyRscHtml(rows: RawRow[]): string {
  const payload = `"initialData":${JSON.stringify(rows)}`;
  const splitAt = Math.floor(payload.length * 0.4);
  const chunks = [payload.slice(0, splitAt), payload.slice(splitAt)];
  const scripts = chunks
    .map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`)
    .join("");
  return `<!doctype html><html><head><title>TrendShift</title></head><body><main></main>${scripts}</body></html>`;
}
