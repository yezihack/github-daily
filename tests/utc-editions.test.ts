import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { BoardsResponse } from "../src/shared/types";
import { boardPages } from "./fixtures/boards-rsc";
import { makeDailyRow } from "./fixtures/daily-rsc";
import { network } from "./network";

const BASE = "https://example.com";
const AUTH = { Authorization: "Bearer test-admin-token" };

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM board_entries"),
    env.DB.prepare("DELETE FROM editions"),
    env.DB.prepare("DELETE FROM repositories"),
  ]);
});

function servePages(pages: Record<string, string>): void {
  for (const [url, html] of Object.entries(pages)) {
    network.use(http.get(url, () => HttpResponse.html(html)));
  }
}

async function refresh(): Promise<Response> {
  return SELF.fetch(`${BASE}/api/admin/refresh`, { method: "POST", headers: AUTH });
}

async function read(date?: string): Promise<BoardsResponse> {
  const url = date ? `${BASE}/api/boards?date=${date}` : `${BASE}/api/boards`;
  const response = await SELF.fetch(url);
  expect(response.status).toBe(200);
  return (await response.json()) as BoardsResponse;
}

function dailyRows(date: string, starsBase: number): ReturnType<typeof makeDailyRow>[] {
  return Array.from({ length: 25 }, (_, index) =>
    makeDailyRow(index, {
      date: `${date}T00:00:00Z`,
      full_name: `daily${index}/repo${index}`,
      repository_stars: starsBase + index,
    }),
  );
}

describe("UTC 期次", () => {
  it("日期列表只列出确实存在的期次，采集后可按该 UTC 日期读到当期榜单条目", async () => {
    expect((await read()).dates).toEqual([]);

    servePages(boardPages({ date: "2026-11-01" }));
    expect((await refresh()).status).toBe(200);

    const body = await read("2026-11-01");
    expect(body.date).toBe("2026-11-01");
    expect(body.dates).toEqual(["2026-11-01"]);
    expect(body.boards.daily).toHaveLength(25);
  });

  it("同日再次采集覆盖当期榜单条目，该日仍只有一个期次", async () => {
    servePages(boardPages({ date: "2026-11-02" }));
    expect((await refresh()).status).toBe(200);
    expect((await read("2026-11-02")).boards.daily[0].stars).toBe(1000);

    servePages(
      boardPages({
        date: "2026-11-02",
        overrides: { daily: dailyRows("2026-11-02", 7000) },
      }),
    );
    expect((await refresh()).status).toBe(200);

    const body = await read("2026-11-02");
    expect(body.boards.daily).toHaveLength(25);
    expect(body.boards.daily[0].stars).toBe(7000);
    expect(body.boards.daily[24].stars).toBe(7024);
    expect(body.dates).toEqual(["2026-11-02"]);

    const one = await env.DB
      .prepare("SELECT COUNT(*) AS count FROM editions WHERE board = ? AND date = ?")
      .bind("daily", "2026-11-02")
      .first<{ count: number }>();
    expect(one?.count).toBe(1);

    const all = await env.DB
      .prepare("SELECT COUNT(*) AS count FROM editions WHERE date = ?")
      .bind("2026-11-02")
      .first<{ count: number }>();
    expect(all?.count).toBe(6);
  });

  it("回看较早 UTC 日期返回该期次的当期指标，后续采集不删除历史期次", async () => {
    servePages(boardPages({ date: "2026-11-01" }));
    expect((await refresh()).status).toBe(200);

    servePages(
      boardPages({
        date: "2026-11-06",
        overrides: { daily: dailyRows("2026-11-06", 9000) },
      }),
    );
    expect((await refresh()).status).toBe(200);

    const latest = await read();
    expect(latest.date).toBe("2026-11-06");
    expect(latest.dates).toEqual(["2026-11-06", "2026-11-01"]);
    expect(latest.boards.daily[0].stars).toBe(9000);

    const older = await read("2026-11-01");
    expect(older.date).toBe("2026-11-01");
    expect(older.boards.daily).toHaveLength(25);
    expect(older.boards.daily[0].stars).toBe(1000);
    expect(older.boards.daily.every((entry, index) => entry.stars === 1000 + index)).toBe(true);
    expect(older.dates).toEqual(latest.dates);
  });

  it("无期次的 UTC 日期不出现在日期列表里，查询该日返回空的六个榜单", async () => {
    servePages(boardPages({ date: "2026-11-03" }));
    expect((await refresh()).status).toBe(200);

    const body = await read("2026-10-20");
    expect(body.dates).toEqual(["2026-11-03"]);
    expect(body.date).toBe("2026-10-20");
    expect(Object.values(body.boards).flat()).toHaveLength(0);
  });

  it("不带日期参数时返回最新一期的当期指标", async () => {
    servePages(boardPages({ date: "2026-11-01" }));
    expect((await refresh()).status).toBe(200);
    servePages(boardPages({ date: "2026-11-04" }));
    expect((await refresh()).status).toBe(200);

    const body = await read();
    expect(body.date).toBe("2026-11-04");
    expect(body.boards.daily).toHaveLength(25);
  });

  it("01/02 时代只有榜单条目的日期仍可回看", async () => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO repositories (id, html_url, description_en, language, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind("legacy/tool", "https://github.com/legacy/tool", null, null, now, now),
      env.DB
        .prepare(
          `INSERT INTO board_entries
             (board, date, repo_id, rank, stars, forks, gained, featured, language, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind("daily", "2026-09-30", "legacy/tool", 1, 42, 2, 3, null, null, "[]"),
    ]);

    const body = await read();
    expect(body.date).toBe("2026-09-30");
    expect(body.dates).toEqual(["2026-09-30"]);
    expect(body.boards.daily[0].repo).toBe("legacy/tool");
    expect(body.boards.daily[0].stars).toBe(42);
  });

  it("日期参数格式不合法时返回明确的错误响应", async () => {
    const response = await SELF.fetch(`${BASE}/api/boards?date=not-a-date`);
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toHaveProperty(
      "error",
      "INVALID_DATE",
    );
  });
});
