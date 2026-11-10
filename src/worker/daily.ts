import type { BoardEntryResponse } from "../shared/types";
import { decodeRscChunks, extractArray } from "./rsc";

export const DAILY_BOARD = "daily";
export const DAILY_URL = "https://trendshift.io/";

const VALID_REPO_ID = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

export interface IngestResult {
  date: string | null;
  count: number;
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

function normalizeRows(rows: unknown[]): { entries: BoardEntryResponse[]; warnings: string[] } {
  const entries: BoardEntryResponse[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const item = asRecord(row);
    const rawFullName = item.full_name;

    if (typeof rawFullName !== "string" || !VALID_REPO_ID.test(rawFullName)) {
      warnings.push(`丢弃非法仓库标识（第 ${index + 1} 条）：${String(rawFullName)}`);
      return;
    }

    const repoId = rawFullName.toLowerCase();
    if (seen.has(repoId)) {
      warnings.push(`同一期次内重复的仓库（第 ${index + 1} 条）：${rawFullName}`);
      return;
    }
    seen.add(repoId);

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

function editionDate(rows: unknown[]): string {
  for (const row of rows) {
    const value = asRecord(row).date;
    if (typeof value === "string" && DATE_PREFIX.test(value)) return value.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export async function ingestDailyBoard(db: D1Database): Promise<IngestResult> {
  const response = await fetch(DAILY_URL, {
    headers: { "User-Agent": "trendshift-daily-wall/0.1" },
  });
  const html = await response.text();
  const rows = extractArray(decodeRscChunks(html), "initialData");

  if (!rows || rows.length === 0) {
    return { date: null, count: 0, warnings: ["首包 HTML 中没有可解析的 initialData"] };
  }

  const date = editionDate(rows);
  const { entries, warnings } = normalizeRows(rows);
  for (const warning of warnings) console.warn(warning);

  if (entries.length === 0) {
    return { date, count: 0, warnings };
  }

  const now = new Date().toISOString();
  const statements = [
    db.prepare("DELETE FROM board_entries WHERE board = ? AND date = ?").bind(DAILY_BOARD, date),
  ];

  for (const entry of entries) {
    statements.push(
      db
        .prepare(
          `INSERT INTO repositories (id, html_url, description_en, language, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             description_en = COALESCE(excluded.description_en, repositories.description_en),
             language = COALESCE(excluded.language, repositories.language),
             updated_at = excluded.updated_at`,
        )
        .bind(entry.repo, entry.htmlUrl, entry.descEn, entry.language, now, now),
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO board_entries
             (board, date, repo_id, rank, stars, forks, gained, featured, language, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          DAILY_BOARD,
          date,
          entry.repo,
          entry.rank,
          entry.stars,
          entry.forks,
          entry.gained,
          entry.featured,
          entry.language,
          JSON.stringify(entry.tags),
        ),
    );
  }

  await db.batch(statements);
  return { date, count: entries.length, warnings };
}

export async function latestDailyDate(db: D1Database): Promise<string | null> {
  const result = await db
    .prepare("SELECT MAX(date) AS date FROM board_entries WHERE board = ?")
    .bind(DAILY_BOARD)
    .first<{ date: string | null }>();
  return result?.date ?? null;
}

interface BoardRow {
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

export async function readDailyBoard(db: D1Database, date: string): Promise<BoardEntryResponse[]> {
  const result = await db
    .prepare(
      `SELECT e.rank, e.repo_id, r.html_url, r.description_en,
              e.stars, e.forks, e.gained, e.featured, e.language, e.tags
       FROM board_entries e
       JOIN repositories r ON r.id = e.repo_id
       WHERE e.board = ? AND e.date = ?
       ORDER BY e.rank`,
    )
    .bind(DAILY_BOARD, date)
    .all<BoardRow>();

  return result.results.map((row) => ({
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
  }));
}
