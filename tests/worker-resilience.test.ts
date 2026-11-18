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

function servePages(pages: Record<string, string>): void {
  for (const [url, html] of Object.entries(pages)) {
    network.use(http.get(url, () => HttpResponse.html(html)));
  }
}

function serveRsc(rows: Record<string, unknown>[]): void {
  servePages(boardPages({ overrides: { daily: rows } }));
}

async function refresh(): Promise<Response> {
  return SELF.fetch(`${BASE}/api/admin/refresh`, { method: "POST", headers: AUTH });
}

async function readBoard(date: string): Promise<BoardsResponse> {
  const response = await SELF.fetch(`${BASE}/api/boards?date=${date}`);
  expect(response.status).toBe(200);
  return (await response.json()) as BoardsResponse;
}

describe("采集边界", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM interpretations"),
      env.DB.prepare("DELETE FROM board_entries"),
      env.DB.prepare("DELETE FROM editions"),
      env.DB.prepare("DELETE FROM repositories"),
    ]);
  });

  it("非法仓库标识被丢弃并留下警告，不产生无效链接", async () => {
    serveRsc([
      makeDailyRow(0, { date: "2026-11-07T00:00:00Z", full_name: "NoSlash" }),
      makeDailyRow(1, { date: "2026-11-07T00:00:00Z", full_name: "a/b/c" }),
      makeDailyRow(2, { date: "2026-11-07T00:00:00Z" }),
    ]);

    const refreshed = await refresh();
    expect(refreshed.status).toBe(200);
    expect((await refreshed.json()) as { warnings: string[] }).toHaveProperty("warnings", [
      expect.stringContaining("NoSlash"),
      expect.stringContaining("a/b/c"),
    ]);

    const body = await readBoard("2026-11-07");
    expect(body.boards.daily).toHaveLength(1);
    expect(body.boards.daily[0].repo).toBe("owner2/repo2");
    expect(body.boards.daily[0].htmlUrl).toBe("https://github.com/owner2/repo2");
  });

  it("大小写写法不同的同一仓库标识只归一化为一个仓库", async () => {
    serveRsc([
      makeDailyRow(0, { date: "2026-11-06T00:00:00Z", full_name: "OpenAI/Codex" }),
      makeDailyRow(1, { date: "2026-11-06T00:00:00Z", full_name: "openai/codex" }),
    ]);

    expect((await refresh()).status).toBe(200);

    const body = await readBoard("2026-11-06");
    expect(body.boards.daily).toHaveLength(1);
    expect(body.boards.daily[0].repo).toBe("openai/codex");
    expect(body.boards.daily[0].htmlUrl).toBe("https://github.com/openai/codex");
  });

  it("未带令牌不能触发采集，也不会写出数据", async () => {
    const response = await SELF.fetch(`${BASE}/api/admin/refresh`, { method: "POST" });
    expect(response.status).toBe(401);
    expect((await readBoard("2020-01-01")).boards.daily).toEqual([]);
  });

  it("上游没有 RSC 载荷时返回明确错误而不是空白或崩溃", async () => {
    network.use(
      http.get("https://trendshift.io/", () =>
        HttpResponse.html("<!doctype html><html><body>empty shell</body></html>"),
      ),
    );

    const response = await refresh();
    expect(response.status).toBe(502);
    expect((await response.json()) as { error: string }).toHaveProperty("error", "RSC_PAYLOAD_MISSING");
  });

  it("还没有任何期次时接口返回空列表，页面可据此显示空状态", async () => {
    const body = await readBoard("2020-01-01");
    expect(body.date).toBe("2020-01-01");
    expect(body.boards.daily).toEqual([]);
  });

  it("同一个 Worker 提供前端构建产物", async () => {
    const response = await SELF.fetch(`${BASE}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="root">');
  });
});
