import { BOARDS, BOARD_ORDER, type BoardMeta, type BoardSlug } from "../shared/boards";
import type { BoardEntryResponse, BoardsBySlug } from "../shared/types";
import { decodeRscChunks, extractArray } from "./rsc";

const VALID_REPO_ID = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const USER_AGENT = "trendshift-daily-wall/0.2";

export interface IngestResult {
  date: string | null;
  count: number;
  warnings: string[];
}

interface FetchedBoard {
  meta: BoardMeta;
  rows: unknown[] | null;
}

interface NormalizedBoard {
  entries: BoardEntryResponse[];
  warnings: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function tagNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => asRecord(tag).display_name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

function normalizeRepoId(value: unknown): string | null {
  if (typeof value !== "string" || !VALID_REPO_ID.test(value)) return null;
  return value.toLowerCase();
}

function uniqueRepoId(
  rawId: unknown,
  index: number,
  label: string,
  seen: Set<string>,
  warnings: string[],
): string | null {
  const repoId = normalizeRepoId(rawId);
  if (!repoId) {
    warnings.push(`[${label}] 丢弃非法仓库标识（第 ${index + 1} 条）：${String(rawId)}`);
    return null;
  }
  if (seen.has(repoId)) {
    warnings.push(`[${label}] 同一期次内重复的仓库（第 ${index + 1} 条）：${String(rawId)}`);
    return null;
  }
  seen.add(repoId);
  return repoId;
}

function normalizeGrowthRows(rows: unknown[], label: string): NormalizedBoard {
  const entries: BoardEntryResponse[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const item = asRecord(row);
    const repoId = uniqueRepoId(item.full_name, index, label, seen, warnings);
    if (!repoId) return;

    entries.push({
      rank: finiteNumber(item.rank) ?? index + 1,
      repo: repoId,
      htmlUrl: `https://github.com/${repoId}`,
      descEn: optionalText(item.repository_description),
      stars: finiteNumber(item.repository_stars),
      forks: finiteNumber(item.repository_forks),
      gained: finiteNumber(item.repository_stars_gained),
      featured: null,
      language: optionalText(item.repository_language) ?? optionalText(item.language),
      tags: tagNames(item.tags),
    });
  });

  return { entries, warnings };
}

function normalizeTrendingRows(rows: unknown[], label: string): NormalizedBoard {
  const entries: BoardEntryResponse[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const item = asRecord(row);
    const repoId = uniqueRepoId(item.full_name, index, label, seen, warnings);
    if (!repoId) return;

    entries.push({
      rank: index + 1,
      repo: repoId,
      htmlUrl: `https://github.com/${repoId}`,
      descEn: optionalText(item.description),
      stars: finiteNumber(item.watchers),
      forks: finiteNumber(item.forks),
      gained: null,
      featured: finiteNumber(item.featured_count),
      language: optionalText(item.language),
      tags: tagNames(item.tags),
    });
  });

  return { entries, warnings };
}

function normalizeMentionRows(rows: unknown[], label: string): NormalizedBoard {
  const entries: BoardEntryResponse[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const item = asRecord(row);
    const repoId = uniqueRepoId(item.repository_full_name, index, label, seen, warnings);
    if (!repoId) return;

    const platform = optionalText(item.platform);

    entries.push({
      rank: index + 1,
      repo: repoId,
      htmlUrl: `https://github.com/${repoId}`,
      descEn: optionalText(item.repository_description),
      stars: finiteNumber(item.repository_stars) ?? finiteNumber(item.stars),
      forks: finiteNumber(item.repository_forks) ?? finiteNumber(item.forks),
      gained: null,
      featured: null,
      language: optionalText(item.repository_language) ?? optionalText(item.language),
      tags: platform ? [platform] : [],
    });
  });

  return { entries, warnings };
}

function normalizeBoard(fetched: FetchedBoard): NormalizedBoard {
  const rows = fetched.rows ?? [];
  if (fetched.meta.kind === "trending") return normalizeTrendingRows(rows, fetched.meta.label);
  if (fetched.meta.kind === "mentions") return normalizeMentionRows(rows, fetched.meta.label);
  return normalizeGrowthRows(rows, fetched.meta.label);
}

function editionDate(boards: FetchedBoard[]): string {
  for (const board of boards) {
    if (board.meta.kind !== "growth") continue;
    for (const row of board.rows ?? []) {
      const value = asRecord(row).date;
      if (typeof value === "string" && DATE_PREFIX.test(value)) return value.slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function repositoryUpsert(db: D1Database, entry: BoardEntryResponse, now: string) {
  return db
    .prepare(
      `INSERT INTO repositories (id, html_url, description_en, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         description_en = COALESCE(excluded.description_en, repositories.description_en),
         language = COALESCE(excluded.language, repositories.language),
         updated_at = excluded.updated_at`,
    )
    .bind(entry.repo, entry.htmlUrl, entry.descEn, entry.language, now, now);
}

function boardEntryInsert(db: D1Database, board: BoardSlug, date: string, entry: BoardEntryResponse) {
  return db
    .prepare(
      `INSERT INTO board_entries
         (board, date, repo_id, rank, stars, forks, gained, featured, language, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      board,
      date,
      entry.repo,
      entry.rank,
      entry.stars,
      entry.forks,
      entry.gained,
      entry.featured,
      entry.language,
      JSON.stringify(entry.tags),
    );
}

export async function ingestBoards(db: D1Database): Promise<IngestResult> {
  const fetched: FetchedBoard[] = await Promise.all(
    BOARDS.map(async (meta) => {
      const response = await fetch(meta.url, { headers: { "User-Agent": USER_AGENT } });
      const html = await response.text();
      return { meta, rows: extractArray(decodeRscChunks(html), meta.rscKey) };
    }),
  );

  const withRows = fetched.filter((board) => board.rows && board.rows.length > 0);
  const missingWarnings = (): string[] =>
    fetched
      .filter((board) => !board.rows || board.rows.length === 0)
      .map(
        (board) =>
          `[${board.meta.label}] 首包 HTML 中没有可解析的 ${board.meta.rscKey} 载荷`,
      );

  if (withRows.length === 0) {
    return { date: null, count: 0, warnings: missingWarnings() };
  }

  const date = editionDate(withRows);
  const now = new Date().toISOString();
  const warnings: string[] = missingWarnings();
  let count = 0;

  for (const board of fetched) {
    const normalized = normalizeBoard(board);
    warnings.push(...normalized.warnings);
    count += normalized.entries.length;

    const statements = [
      db
        .prepare("DELETE FROM board_entries WHERE board = ? AND date = ?")
        .bind(board.meta.slug, date),
    ];
    for (const entry of normalized.entries) {
      statements.push(repositoryUpsert(db, entry, now));
      statements.push(boardEntryInsert(db, board.meta.slug, date, entry));
    }
    await db.batch(statements);
  }

  for (const warning of warnings) console.warn(warning);
  return { date, count, warnings };
}

export async function latestEditionDate(db: D1Database): Promise<string | null> {
  const result = await db
    .prepare("SELECT MAX(date) AS date FROM board_entries")
    .first<{ date: string | null }>();
  return result?.date ?? null;
}

export function emptyBoards(): BoardsBySlug {
  const boards = {} as BoardsBySlug;
  for (const slug of BOARD_ORDER) boards[slug] = [];
  return boards;
}

interface BoardRow {
  board: string;
  rank: number;
  repo_id: string;
  html_url: string;
  description_en: string | null;
  stars: number | null;
  forks: number | null;
  gained: number | null;
  featured: number | null;
  language: string | null;
  tags: string;
}

export async function readBoards(db: D1Database, date: string): Promise<BoardsBySlug> {
  const boards = emptyBoards();
  const result = await db
    .prepare(
      `SELECT e.board, e.rank, e.repo_id, r.html_url, r.description_en,
              e.stars, e.forks, e.gained, e.featured, e.language, e.tags
       FROM board_entries e
       JOIN repositories r ON r.id = e.repo_id
       WHERE e.date = ?
       ORDER BY e.board, e.rank`,
    )
    .bind(date)
    .all<BoardRow>();

  for (const row of result.results) {
    const bucket = boards[row.board as BoardSlug];
    if (!bucket) continue;
    bucket.push({
      rank: row.rank,
      repo: row.repo_id,
      htmlUrl: row.html_url,
      descEn: row.description_en,
      stars: row.stars,
      forks: row.forks,
      gained: row.gained,
      featured: row.featured,
      language: row.language,
      tags: JSON.parse(row.tags) as string[],
    });
  }

  return boards;
}
