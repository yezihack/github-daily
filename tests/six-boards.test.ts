import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { BoardSlug } from "../src/shared/boards";
import type { BoardsResponse } from "../src/shared/types";
import { boardPages } from "./fixtures/boards-rsc";
import { makeDailyRow } from "./fixtures/daily-rsc";
import { network } from "./network";

const BASE = "https://example.com";
const AUTH = { Authorization: "Bearer test-admin-token" };

const EXPECTED_ORDER: BoardSlug[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "live-mentions",
  "github-trending",
];

const EXPECTED_LABELS: Record<BoardSlug, string> = {
  daily: "日榜",
  weekly: "周榜",
  monthly: "月榜",
  yearly: "年榜",
  "live-mentions": "当日提及榜",
  "github-trending": "GitHub 趋势历史榜",
};

function servePages(pages: Record<string, string>): void {
  for (const [url, html] of Object.entries(pages)) {
    network.use(http.get(url, () => HttpResponse.html(html)));
  }
}

async function refresh(): Promise<Response> {
  return SELF.fetch(`${BASE}/api/admin/refresh`, { method: "POST", headers: AUTH });
}

async function readBoards(date: string): Promise<BoardsResponse> {
  const response = await SELF.fetch(`${BASE}/api/boards?date=${date}`);
  expect(response.status).toBe(200);
  return (await response.json()) as BoardsResponse;
}

describe("六榜全量采集", () => {
  it("一次采集返回六个榜单各 25 条，中文名称与顺序固定", async () => {
    servePages(boardPages({ date: "2026-11-05" }));

    const refreshed = await refresh();
    expect(refreshed.status).toBe(200);

    const body = await readBoards("2026-11-05");
    expect(Object.keys(body.boards)).toEqual(EXPECTED_ORDER);
    expect(body.labels).toEqual(EXPECTED_LABELS);

    for (const slug of EXPECTED_ORDER) {
      expect(body.boards[slug]).toHaveLength(25);
    }
    expect(Object.values(body.boards).flat()).toHaveLength(150);
  });

  it("三类 RSC 载荷各自归一化为该榜该有的指标", async () => {
    servePages(boardPages({ date: "2026-11-03" }));
    expect((await refresh()).status).toBe(200);

    const body = await readBoards("2026-11-03");

    expect(body.boards.daily[0]).toMatchObject({
      rank: 1,
      repo: "daily0/repo0",
      htmlUrl: "https://github.com/daily0/repo0",
      stars: 1000,
      forks: 10,
      gained: 100,
      featured: null,
      language: "TypeScript",
      tags: ["AI Agent"],
    });

    expect(body.boards["github-trending"][0]).toMatchObject({
      rank: 1,
      repo: "trending0/repo0",
      stars: 50000,
      forks: 500,
      gained: null,
      featured: 10,
      language: "Rust",
      tags: ["Learning resources"],
    });

    const mention = body.boards["live-mentions"][0];
    expect(mention).toMatchObject({
      rank: 1,
      repo: "mention0/repo0",
      descEn: "Mentioned repository description 0.",
      stars: 1200,
      forks: 30,
      gained: null,
      featured: null,
      language: "Python",
      tags: ["x"],
    });
    expect(mention.descEn).not.toContain("Mention title 0");
  });

  it("gained 大于 stars 时按上游原值展示，不做修正", async () => {
    servePages(
      boardPages({
        date: "2026-11-02",
        overrides: {
          daily: [
            makeDailyRow(0, {
              date: "2026-11-02T00:00:00Z",
              repository_stars: 10,
              repository_stars_gained: 999,
            }),
          ],
        },
      }),
    );

    expect((await refresh()).status).toBe(200);
    const body = await readBoards("2026-11-02");
    expect(body.boards.daily[0]).toMatchObject({ stars: 10, gained: 999 });
  });

  it("同一仓库跨榜不重复写入仓库与地址", async () => {
    const shared = makeDailyRow(0, {
      date: "2026-11-01T00:00:00Z",
      full_name: "Shared/Tool",
    });
    servePages(
      boardPages({
        date: "2026-11-01",
        overrides: { daily: [shared], weekly: [shared] },
      }),
    );

    expect((await refresh()).status).toBe(200);
    const body = await readBoards("2026-11-01");

    expect(body.boards.daily[0].repo).toBe("shared/tool");
    expect(body.boards.weekly[0].repo).toBe("shared/tool");
    expect(body.boards.daily[0].htmlUrl).toBe("https://github.com/shared/tool");
    expect(body.boards.weekly[0].htmlUrl).toBe("https://github.com/shared/tool");

    const stored = await env.DB.prepare("SELECT COUNT(*) AS count FROM repositories WHERE id = ?")
      .bind("shared/tool")
      .first<{ count: number }>();
    expect(stored?.count).toBe(1);
  });

  it("某一榜缺失载荷时该榜为空并留下警告，其余榜不受影响", async () => {
    servePages(boardPages({ date: "2026-10-31", overrides: { weekly: null } }));

    const refreshed = await refresh();
    expect(refreshed.status).toBe(200);
    const result = (await refreshed.json()) as { warnings: string[] };
    expect(result.warnings).toContainEqual(expect.stringContaining("[周榜]"));
    expect(result.warnings).toContainEqual(expect.stringContaining("initialData"));

    const body = await readBoards("2026-10-31");
    expect(body.boards.weekly).toEqual([]);
    for (const slug of EXPECTED_ORDER.filter((item) => item !== "weekly")) {
      expect(body.boards[slug]).toHaveLength(25);
    }
  });

  it("同日重复采集时，缺失的榜会覆盖掉当期旧条目", async () => {
    servePages(boardPages({ date: "2026-10-30" }));
    expect((await refresh()).status).toBe(200);
    expect((await readBoards("2026-10-30")).boards.weekly).toHaveLength(25);

    servePages(boardPages({ date: "2026-10-30", overrides: { weekly: null } }));
    expect((await refresh()).status).toBe(200);
    expect((await readBoards("2026-10-30")).boards.weekly).toEqual([]);
  });
});
