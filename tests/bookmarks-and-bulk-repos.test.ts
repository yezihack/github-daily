import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { describe, expect, it, beforeEach } from "vitest";
import { boardPages } from "./fixtures/boards-rsc";
import { network } from "./network";

const BASE = "https://example.com";
const AUTH = { Authorization: "Bearer test-admin-token" };

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM board_entries"),
    env.DB.prepare("DELETE FROM editions"),
    env.DB.prepare("DELETE FROM repositories"),
    env.DB.prepare("DELETE FROM interpretations"),
  ]);
});

function servePages(pages: Record<string, string>): void {
  for (const [url, html] of Object.entries(pages)) {
    network.use(http.get(url, () => HttpResponse.html(html)));
  }
}

async function refresh(): Promise<Response> {
  return SELF.fetch(`${BASE}/api/admin/ingest`, { method: "POST", headers: AUTH });
}

describe("工单 08：浏览器收藏 - POST /api/repos/bulk", () => {
  it("POST /api/repos/bulk 接收仓库列表并返回详情", async () => {
    // 先采集数据
    servePages(boardPages({ date: "2026-11-13" }));
    await refresh();

    // 批量查询仓库
    const response = await SELF.fetch(`${BASE}/api/repos/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { owner: "daily0", name: "repo0" },
        { owner: "daily1", name: "repo1" },
      ]),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{
      owner: string;
      name: string;
      htmlUrl: string;
      descEn: string | null;
      homepage: string | null;
      language: string | null;
      tags: string[];
    }>;
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      owner: "daily0",
      name: "repo0",
      htmlUrl: "https://github.com/daily0/repo0",
      descEn: "daily description 0.",
      homepage: null,
      language: "TypeScript",
      tags: ["AI Agent"],
    });
  });

  it("POST /api/repos/bulk 接受大小写混合并转为小写查询", async () => {
    servePages(boardPages({ date: "2026-11-13" }));
    await refresh();

    const response = await SELF.fetch(`${BASE}/api/repos/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ owner: "DAILY0", name: "REPO0" }]),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any[];
    expect(body).toHaveLength(1);
    expect(body[0].owner).toBe("daily0");
    expect(body[0].name).toBe("repo0");
  });

  it("POST /api/repos/bulk 不返回不存在的仓库", async () => {
    servePages(boardPages({ date: "2026-11-13" }));
    await refresh();

    const response = await SELF.fetch(`${BASE}/api/repos/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { owner: "daily0", name: "repo0" },
        { owner: "nonexistent", name: "repo" },
      ]),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any[];
    expect(body).toHaveLength(1);
    expect(body[0].owner).toBe("daily0");
  });

  it("POST /api/repos/bulk 对无效请求返回 400", async () => {
    const response1 = await SELF.fetch(`${BASE}/api/repos/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(response1.status).toBe(400);
    expect((await response1.json()) as { error: string }).toHaveProperty("error", "INVALID_JSON");

    const response2 = await SELF.fetch(`${BASE}/api/repos/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify("not an array"),
    });
    expect(response2.status).toBe(400);
    expect((await response2.json()) as { error: string }).toHaveProperty(
      "error",
      "PAYLOAD_NOT_ARRAY",
    );

    const response3 = await SELF.fetch(`${BASE}/api/repos/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ owner: "invalid..owner", name: "repo" }]),
    });
    expect(response3.status).toBe(400);
    expect((await response3.json()) as { error: string }).toHaveProperty(
      "error",
      "NO_VALID_REPOS",
    );
  });

  it("POST /api/repos/bulk 非 POST 请求返回 405", async () => {
    const response = await SELF.fetch(`${BASE}/api/repos/bulk`, { method: "GET" });
    expect(response.status).toBe(405);
    expect((await response.json()) as { error: string }).toHaveProperty(
      "error",
      "METHOD_NOT_ALLOWED",
    );
  });

  it("掉出榜单的仓库仍可通过 POST /api/repos/bulk 查询", async () => {
    // 第一次采集：daily0/repo0 在榜单中
    servePages(boardPages({ date: "2026-11-01" }));
    await refresh();

    // 验证仓库存在
    let response = await SELF.fetch(`${BASE}/api/repos/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ owner: "daily0", name: "repo0" }]),
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as any[]).toHaveLength(1);

    // 清除数据再重新采集不包含该仓库的榜单
    await env.DB.batch([
      env.DB.prepare("DELETE FROM board_entries"),
      env.DB.prepare("DELETE FROM editions"),
    ]);

    // 模拟新采集不包含该仓库
    servePages(boardPages({ date: "2026-11-02" }));
    await refresh();

    // 仓库仍在 repositories 表中，可查询
    response = await SELF.fetch(`${BASE}/api/repos/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ owner: "daily0", name: "repo0" }]),
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as any[]).toHaveLength(1);
  });
});

describe("工单 04 + 05 + 08 集成：期次、抽屉、收藏", () => {
  it("用户可从 API 获取完整期次数据，支持历史回看", async () => {
    servePages(boardPages({ date: "2026-11-10" }));
    await refresh();

    let body = (await SELF.fetch(`${BASE}/api/boards`).then((r) =>
      r.json(),
    )) as any;
    expect(body.date).toBe("2026-11-10");
    expect(body.dates).toEqual(["2026-11-10"]);

    // 新一期数据
    servePages(boardPages({ date: "2026-11-11" }));
    await refresh();

    body = (await SELF.fetch(`${BASE}/api/boards`).then((r) =>
      r.json(),
    )) as any;
    expect(body.date).toBe("2026-11-11");
    expect(body.dates).toEqual(["2026-11-11", "2026-11-10"]);

    // 回看旧期
    const oldBody = (await SELF.fetch(`${BASE}/api/boards?date=2026-11-10`).then((r) =>
      r.json(),
    )) as any;
    expect(oldBody.date).toBe("2026-11-10");
    expect(oldBody.boards.daily).toHaveLength(25);
    expect(oldBody.boards.daily[0].stars).toBe(1000);
  });
});
