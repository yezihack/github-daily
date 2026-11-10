import { SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { BoardsResponse } from "../src/shared/types";
import { buildDailyRscHtml, EDITION_DATE, makeDailyRows } from "./fixtures/daily-rsc";
import { network } from "./network";

const BASE = "https://example.com";
const AUTH = { Authorization: "Bearer test-admin-token" };

describe("日榜端到端", () => {
  it("运维触发一次采集后，访客能从只读接口拿到 25 个仓库及其指标与地址", async () => {
    network.use(
      http.get("https://trendshift.io/", () =>
        HttpResponse.html(buildDailyRscHtml(makeDailyRows(25))),
      ),
    );

    const refreshed = await SELF.fetch(`${BASE}/api/admin/refresh`, {
      method: "POST",
      headers: AUTH,
    });
    expect(refreshed.status).toBe(200);

    const response = await SELF.fetch(`${BASE}/api/boards?date=${EDITION_DATE}`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as BoardsResponse;
    expect(body.date).toBe(EDITION_DATE);
    expect(body.boards.daily).toHaveLength(25);
    expect(body.boards.daily[0]).toEqual({
      rank: 1,
      repo: "owner0/repo0",
      htmlUrl: "https://github.com/owner0/repo0",
      homepage: null,
      descEn: "English description for repo 0.",
      stars: 1000,
      forks: 10,
      gained: 100,
      featured: null,
      language: "TypeScript",
      tags: ["AI Agent"],
    });
    expect(body.boards.daily[24].repo).toBe("owner24/repo24");
    expect(body.boards.daily.every((entry) => entry.htmlUrl.startsWith("https://github.com/"))).toBe(true);
  });
});
