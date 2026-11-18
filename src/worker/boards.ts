import { BOARDS, BOARD_ORDER, type BoardMeta, type BoardSlug } from "../shared/boards";
import type {
  BoardEntryResponse,
  BoardsBySlug,
  Interpretation,
  InterpretationStatus,
} from "../shared/types";
import { decodeRscChunks, extractArray } from "./rsc";

const VALID_REPO_ID = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const USER_AGENT = "trendshift-daily-wall/0.2";

export interface IngestResult {
  date: string | null;
  count: number;
  warnings: string[];
  fallbacks?: Record<string, { board: string; date: string }>;
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

function optionalHomepage(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const NO_INTERPRETATION: Interpretation = {
  summary: null,
  solves: null,
  audience: null,
  status: "none",
};

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
      homepage: optionalHomepage(item.repository_homepage),
      descEn: optionalText(item.repository_description),
      interpretation: NO_INTERPRETATION,
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
      homepage: optionalHomepage(item.homepage),
      descEn: optionalText(item.description),
      interpretation: NO_INTERPRETATION,
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
      homepage: optionalHomepage(item.repository_homepage),
      descEn: optionalText(item.repository_description),
      interpretation: NO_INTERPRETATION,
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
      `INSERT INTO repositories (id, html_url, homepage, description_en, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         homepage = COALESCE(excluded.homepage, repositories.homepage),
         description_en = COALESCE(excluded.description_en, repositories.description_en),
         language = COALESCE(excluded.language, repositories.language),
         updated_at = excluded.updated_at`,
    )
    .bind(entry.repo, entry.htmlUrl, entry.homepage, entry.descEn, entry.language, now, now);
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

function editionUpsert(db: D1Database, board: BoardSlug, date: string, now: string) {
  return db
    .prepare(
      `INSERT INTO editions (board, date, collected_at)
       VALUES (?, ?, ?)
       ON CONFLICT(board, date) DO UPDATE SET
         collected_at = excluded.collected_at`,
    )
    .bind(board, date, now);
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
  const missingBoards = fetched.filter((board) => !board.rows || board.rows.length === 0);
  const missingWarnings = (): string[] =>
    missingBoards.map(
      (board) =>
        `[${board.meta.label}] 首包 HTML 中没有可解析的 ${board.meta.rscKey} 载荷`,
    );

  if (withRows.length === 0) {
    // Even if all boards are missing, we should handle fallbacks
    const now = new Date().toISOString();
    const warnings: string[] = missingWarnings();
    let count = 0;
    const fallbacks: Record<string, { board: string; date: string }> = {};
    let date: string | null = null;
    let hasAnyFallback = false;

    // Process fallbacks for all missing boards
    for (const board of missingBoards) {
      const prevDate = await db
        .prepare(
          `SELECT date FROM editions WHERE board = ? ORDER BY date DESC LIMIT 1`,
        )
        .bind(board.meta.slug)
        .first<{ date: string }>();

      if (prevDate) {
        hasAnyFallback = true;
        // Use today's date for the fallback data
        if (!date) {
          date = new Date().toISOString().slice(0, 10);
        }

        const prevEntries = await db
          .prepare(
            `SELECT e.* FROM board_entries e
             WHERE e.board = ? AND e.date = ?
             ORDER BY e.rank LIMIT 25`,
          )
          .bind(board.meta.slug, prevDate.date)
          .all<BoardRow>();

        const statements = [
          db
            .prepare("DELETE FROM board_entries WHERE board = ? AND date = ?")
            .bind(board.meta.slug, date),
          editionUpsert(db, board.meta.slug, date, now),
        ];

        for (const entry of prevEntries.results) {
          statements.push(
            db
              .prepare(
                `INSERT INTO board_entries
                   (board, date, repo_id, rank, stars, forks, gained, featured, language, tags)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                entry.board,
                date,
                entry.repo_id,
                entry.rank,
                entry.stars,
                entry.forks,
                entry.gained,
                entry.featured,
                entry.language,
                entry.tags,
              ),
          );
        }

        await db.batch(statements);
        count += prevEntries.results.length;
        fallbacks[board.meta.slug] = {
          board: board.meta.label,
          date: prevDate.date,
        };
        warnings.push(`[${board.meta.label}] 沿用 ${prevDate.date} 的数据（${prevEntries.results.length} 条）`);
      }
    }

    for (const warning of warnings) console.warn(warning);
    // Return error if no fallbacks were found (all boards missing AND no previous data)
    return { date: hasAnyFallback ? date : null, count, warnings, fallbacks };
  }

  const date = editionDate(withRows);
  const now = new Date().toISOString();
  const warnings: string[] = missingWarnings();
  let count = 0;
  const fallbacks: Record<string, { board: string; date: string }> = {};

  // Process boards with data
  for (const board of withRows) {
    const normalized = normalizeBoard(board);
    warnings.push(...normalized.warnings);
    count += normalized.entries.length;

    const statements = [
      db
        .prepare("DELETE FROM board_entries WHERE board = ? AND date = ?")
        .bind(board.meta.slug, date),
      editionUpsert(db, board.meta.slug, date, now),
    ];
    for (const entry of normalized.entries) {
      statements.push(repositoryUpsert(db, entry, now));
      statements.push(boardEntryInsert(db, board.meta.slug, date, entry));
    }
    await db.batch(statements);
  }

  // Handle fallbacks for missing boards
  for (const board of missingBoards) {
    // Find the latest date for this board
    const prevDate = await db
      .prepare(
        `SELECT date FROM editions WHERE board = ? ORDER BY date DESC LIMIT 1`,
      )
      .bind(board.meta.slug)
      .first<{ date: string }>();

    if (prevDate) {
      // Get previous data and insert as fallback
      const prevEntries = await db
        .prepare(
          `SELECT e.* FROM board_entries e
           WHERE e.board = ? AND e.date = ?
           ORDER BY e.rank LIMIT 25`,
        )
        .bind(board.meta.slug, prevDate.date)
        .all<BoardRow>();

      // Insert fallback data with today's date
      const statements = [
        db
          .prepare("DELETE FROM board_entries WHERE board = ? AND date = ?")
          .bind(board.meta.slug, date),
        editionUpsert(db, board.meta.slug, date, now),
      ];

      for (const entry of prevEntries.results) {
        // Reconstruct the entry without touching the repository table
        statements.push(
          db
            .prepare(
              `INSERT INTO board_entries
                 (board, date, repo_id, rank, stars, forks, gained, featured, language, tags)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              entry.board,
              date,
              entry.repo_id,
              entry.rank,
              entry.stars,
              entry.forks,
              entry.gained,
              entry.featured,
              entry.language,
              entry.tags,
            ),
        );
      }

      await db.batch(statements);
      count += prevEntries.results.length;
      fallbacks[board.meta.slug] = {
        board: board.meta.label,
        date: prevDate.date,
      };
      warnings.push(`[${board.meta.label}] 沿用 ${prevDate.date} 的数据（${prevEntries.results.length} 条）`);
    }
  }

  for (const warning of warnings) console.warn(warning);
  return { date, count, warnings, fallbacks };
}

export async function listEditionDates(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT DISTINCT date FROM editions
       UNION
       SELECT DISTINCT date FROM board_entries
       ORDER BY date DESC`,
    )
    .all<{ date: string }>();
  return result.results.map((row) => row.date);
}

export async function latestEditionDate(db: D1Database): Promise<string | null> {
  const dates = await listEditionDates(db);
  return dates[0] ?? null;
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
  homepage: string | null;
  description_en: string | null;
  interp_summary: string | null;
  interp_solves: string | null;
  interp_audience: string | null;
  interp_status: string | null;
  stars: number | null;
  forks: number | null;
  gained: number | null;
  featured: number | null;
  language: string | null;
  tags: string;
}

export async function readBoards(db: D1Database, date: string): Promise<BoardsBySlug> {
  const boards = emptyBoards();
  
  // Query each board separately to get up to 25 entries per board
  for (const boardSlug of BOARD_ORDER) {
    const result = await db
      .prepare(
        `SELECT e.board, e.rank, e.repo_id, r.html_url, r.homepage, r.description_en,
                i.summary AS interp_summary, i.solves AS interp_solves,
                i.audience AS interp_audience, i.status AS interp_status,
                e.stars, e.forks, e.gained, e.featured, e.language, e.tags
         FROM board_entries e
         JOIN repositories r ON r.id = e.repo_id
         LEFT JOIN interpretations i ON i.repo_id = e.repo_id
         WHERE e.date = ? AND e.board = ?
         ORDER BY e.rank
         LIMIT 25`,
      )
      .bind(date, boardSlug)
      .all<BoardRow>();

    for (const row of result.results) {
      const bucket = boards[row.board as BoardSlug];
      if (!bucket) continue;
      const status = row.interp_status as InterpretationStatus | null;
      bucket.push({
        rank: row.rank,
        repo: row.repo_id,
        htmlUrl: row.html_url,
        homepage: row.homepage,
        descEn: row.description_en,
        interpretation: {
          summary: row.interp_summary,
          solves: row.interp_solves,
          audience: row.interp_audience,
          status: status ?? "none",
        },
        stars: row.stars,
        forks: row.forks,
        gained: row.gained,
        featured: row.featured,
        language: row.language,
        tags: JSON.parse(row.tags) as string[],
      });
    }
  }

  return boards;
}
