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

describe("详情抽屉元数据", () => {
  it("榜单条目响应携带 homepage 字段，上游提供时透传、未提供时为 null", async () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      makeDailyRow(index, {
        date: "2026-11-05T00:00:00Z",
        ...(index === 0 ? { repository_homepage: "https://proj.example.dev/docs" } : {}),
      }),
    );
    servePages(boardPages({ date: "2026-11-05", overrides: { daily: rows } }));
    expect((await refresh()).status).toBe(200);

    const body = await read("2026-11-05");
    const entry = body.boards.daily[0];
    expect(entry).toHaveProperty("homepage");
    expect(entry.homepage).toBe("https://proj.example.dev/docs");
    expect(body.boards.daily[1].homepage).toBeNull();
  });

  it("回看历史期次时，抽屉所需的当期指标来自该期次条目而非仓库最新值", async () => {
    servePages(boardPages({ date: "2026-11-01" }));
    expect((await refresh()).status).toBe(200);
    servePages(
      boardPages({
        date: "2026-11-06",
        overrides: {
          daily: Array.from({ length: 25 }, (_, index) =>
            makeDailyRow(index, {
              date: "2026-11-06T00:00:00Z",
              repository_stars: 9000 + index,
            }),
          ),
        },
      }),
    );
    expect((await refresh()).status).toBe(200);

    const older = await read("2026-11-01");
    expect(older.date).toBe("2026-11-01");
    expect(older.boards.daily[0].stars).toBe(1000);
    expect(older.boards.daily[0]).toHaveProperty("homepage");
  });
});
