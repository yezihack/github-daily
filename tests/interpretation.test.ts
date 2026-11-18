import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { BoardsResponse, InterpretationStatus } from "../src/shared/types";
import { network } from "./network";

const BASE = "https://example.com";
const AUTH = { Authorization: "Bearer test-admin-token" };
const AI_URL = "https://ai.example.com/v1/chat/completions";

function repeatChars(count: number, ch = "字"): string {
  return ch.repeat(count);
}

const GOOD = {
  summary: repeatChars(16),
  solves: repeatChars(50),
  audience: repeatChars(28),
};

interface InterpretationRow {
  repo_id: string;
  status: string;
  summary: string | null;
  solves: string | null;
  audience: string | null;
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM interpretations"),
    env.DB.prepare("DELETE FROM board_entries"),
    env.DB.prepare("DELETE FROM editions"),
    env.DB.prepare("DELETE FROM repositories"),
  ]);
});

function serveAi(handler: (repoId: string) => "good" | "badjson" | "missing" | "short") {
  network.use(
    http.post(AI_URL, async ({ request }) => {
      const body = (await request.json()) as { messages?: { role: string; content: string }[] };
      const user = (body.messages ?? []).find((m) => m.role === "user");
      const repoId = user?.content ?? "";
      const kind = handler(repoId);
      if (kind === "badjson") {
        return HttpResponse.text("this is not json");
      }
      if (kind === "missing") {
        return HttpResponse.json({
          choices: [{ message: { content: JSON.stringify({ summary: GOOD.summary, solves: GOOD.solves }) } }],
        });
      }
      if (kind === "short") {
        return HttpResponse.json({
          choices: [
            { message: { content: JSON.stringify({ summary: repeatChars(5), solves: GOOD.solves, audience: GOOD.audience }) } },
          ],
        });
      }
      return HttpResponse.json({
        choices: [{ message: { content: JSON.stringify(GOOD) } }],
      });
    }),
  );
}

async function seedRepo(id: string, board: string, rank = 1): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT OR IGNORE INTO repositories (id, html_url, homepage, description_en, language, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, `https://github.com/${id}`, null, `English description for ${id}.`, "Rust", now, now),
    env.DB
      .prepare(
        `INSERT INTO board_entries (board, date, repo_id, rank, stars, forks, gained, featured, language, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(board, "2026-11-10", id, rank, 100, 10, 5, null, "Rust", "[]"),
  ]);
}

async function interpret(): Promise<Response> {
  return SELF.fetch(`${BASE}/api/admin/interpretations/process`, { method: "POST", headers: AUTH });
}

async function read(): Promise<BoardsResponse> {
  const response = await SELF.fetch(`${BASE}/api/boards`);
  expect(response.status).toBe(200);
  return (await response.json()) as BoardsResponse;
}

async function interpRows(): Promise<InterpretationRow[]> {
  const result = await env.DB
    .prepare("SELECT repo_id, status, summary, solves, audience FROM interpretations ORDER BY repo_id")
    .all<InterpretationRow>();
  return result.results;
}

describe("AI 三段解读", () => {
  it("运维触发后，每个唯一仓库生成一份三段解读并落库；坏 JSON 不入库", async () => {
    await seedRepo("good/repo", "daily", 1);
    await seedRepo("badjson/repo", "daily", 2);
    serveAi((id) => (id.includes("badjson") ? "badjson" : "good"));

    const response = await interpret();
    expect(response.status).toBe(200);
    // 坏 JSON 先记为 pending（重试 1/3），累计 3 次才转 failed
    expect(await response.json()).toEqual({ done: 1, failed: 0, pending: 1 });

    const rows = await interpRows();
    expect(rows).toHaveLength(2);
    const good = rows.find((r) => r.repo_id === "good/repo")!;
    expect(good.status).toBe("done");
    expect(good.summary).toBe(GOOD.summary);
    const bad = rows.find((r) => r.repo_id === "badjson/repo")!;
    expect(bad.status).toBe("pending");
    expect(bad.summary).toBeNull();

    await interpret();
    expect(await (await interpret()).json()).toEqual({ done: 0, failed: 1, pending: 0 });
    const failedRows = await interpRows();
    expect(failedRows.find((r) => r.repo_id === "badjson/repo")!.status).toBe("failed");

    const body = await read();
    const entry = body.boards.daily[0];
    expect(entry.interpretation.status).toBe<InterpretationStatus>("done");
    expect(entry.interpretation.summary).toBe(GOOD.summary);
  });

  it("缺段与字数越界一律视为失败，不写入半截内容", async () => {
    await seedRepo("missing/repo", "daily");
    await seedRepo("short/repo", "daily");
    serveAi((id) => (id.includes("missing") ? "missing" : id.includes("short") ? "short" : "good"));

    const response = await interpret();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ done: 0, failed: 0, pending: 2 });

    await interpret();
    expect(await (await interpret()).json()).toEqual({ done: 0, failed: 2, pending: 0 });
    const rows = await interpRows();
    expect(rows.every((r) => r.status === "failed" && r.summary === null)).toBe(true);
  });

  it("同一仓库跨榜单共用一份解读，不重复调用", async () => {
    await seedRepo("shared/repo", "daily");
    await seedRepo("shared/repo", "trending");
    serveAi(() => "good");

    const response = await interpret();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ done: 1, failed: 0, pending: 0 });

    const rows = await interpRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].repo_id).toBe("shared/repo");
  });

  it("未触发解读时，条目状态为 none，可读取英文原文", async () => {
    await seedRepo("pending/repo", "daily");
    const body = await read();
    expect(body.boards.daily[0].interpretation.status).toBe<InterpretationStatus>("none");
    expect(body.boards.daily[0].descEn).toBe("English description for pending/repo.");
  });
});
