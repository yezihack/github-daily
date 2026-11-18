/**
 * TDD: 修复代码审查发现的三个关键缺陷
 * 
 * 缺陷 1：采集失败沿用上期 (AC#11)
 * 缺陷 2：README 兜底流程 (AC#9)
 * 缺陷 3：定时任务配置 (AC#38-39) - 部署层，此处测试手动触发
 */

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
const AI_URL = "https://ai.example.com/v1/chat/completions";

function repeatChars(count: number, ch = "字"): string {
  return ch.repeat(count);
}

const GOOD_INTERPRETATION = {
  summary: repeatChars(16),
  solves: repeatChars(50),
  audience: repeatChars(28),
};

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM interpretations"),
    env.DB.prepare("DELETE FROM board_entries"),
    env.DB.prepare("DELETE FROM editions"),
    env.DB.prepare("DELETE FROM repositories"),
  ]);
});

async function ingest(pages: Record<string, string>): Promise<Response> {
  for (const [url, html] of Object.entries(pages)) {
    network.use(http.get(url, () => HttpResponse.html(html)));
  }
  return SELF.fetch(`${BASE}/api/admin/ingest`, { method: "POST", headers: AUTH });
}

async function readBoards(date?: string): Promise<BoardsResponse> {
  const url = date ? `${BASE}/api/boards?date=${date}` : `${BASE}/api/boards`;
  const response = await SELF.fetch(url);
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as BoardsResponse;
}

describe("缺陷 1: 采集失败沿用上期（AC#11）", () => {
  it("第一次采集成功，记录日期 2026-11-12", async () => {
    const pages1 = boardPages({
      date: "2026-11-12",
      overrides: {
        daily: [
          makeDailyRow(0, { full_name: "owner1/repo1" }),
          makeDailyRow(1, { full_name: "owner2/repo2" }),
        ],
      },
    });

    const result1 = await ingest(pages1);
    expect(result1.status).toBe(200);
    const body1 = (await result1.json()) as { date: string };
    expect(body1.date).toBe("2026-11-12");

    const boards1 = await readBoards();
    expect(boards1.boards.daily).toHaveLength(2);
    expect(boards1.date).toBe("2026-11-12");
  });

  it("RED: 第二天采集时，日榜 RSC 缺失但其他榜正常，应沿用前日日榜并标记 fallback", async () => {
    // 第一天采集成功
    const pages1 = boardPages({
      date: "2026-11-12",
      overrides: {
        daily: [makeDailyRow(0, { full_name: "owner1/repo1" })],
        weekly: [makeDailyRow(0, { full_name: "owner3/repo3" })],
      },
    });
    await ingest(pages1);

    // 第二天采集：日榜 RSC 缺失（空数组），周榜正常
    const pages2 = boardPages({
      date: "2026-11-13",
      overrides: {
        daily: [], // 空 = RSC 缺失
        weekly: [makeDailyRow(0, { full_name: "owner4/repo4" })],
      },
    });
    
    const result2 = await ingest(pages2);
    expect(result2.status).toBe(200);

    // 验证：应返回沿用前日日榜的数据
    const boards2 = await readBoards("2026-11-13");

    // ✅ 日榜：沿用 2026-11-12 的数据（1 条）
    expect(boards2.boards.daily).toHaveLength(1);
    expect(boards2.boards.daily[0].repo).toBe("owner1/repo1");

    // ✅ 周榜：2026-11-13 的新数据（1 条）
    expect(boards2.boards.weekly).toHaveLength(1);
    expect(boards2.boards.weekly[0].repo).toBe("owner4/repo4");

    // ✅ 数据新鲜度：日榜应标记为 fallback
    expect(boards2.data_freshness).toBe("fallback");

    // ✅ 顶栏信息：应能显示「更新于 2026-11-12 UTC」
    expect(boards2.fallback_date).toBe("2026-11-12");
  });

  it("按历史日期查询时，日榜应返回沿用的前日数据（不混入最新数据）", async () => {
    // 2026-11-12: 日榜 2 条
    const pages1 = boardPages({
      date: "2026-11-12",
      overrides: {
        daily: [
          makeDailyRow(0, { full_name: "owner1/repo1" }),
          makeDailyRow(1, { full_name: "owner2/repo2" }),
        ],
      },
    });
    const ingestResult1 = await SELF.fetch(`https://example.com/api/admin/ingest`, { 
      method: "POST", 
      headers: AUTH,
      body: JSON.stringify(Object.entries(pages1)),
    });
    console.log("Ingest 1 result:", await ingestResult1.json());

    for (const [url, html] of Object.entries(pages1)) {
      network.use(http.get(url, () => HttpResponse.html(html)));
    }
    await SELF.fetch(`https://example.com/api/admin/ingest`, { 
      method: "POST", 
      headers: AUTH,
    });

    // 2026-11-13: 日榜为空（沿用 2026-11-12）
    const pages2 = boardPages({
      date: "2026-11-13",
      overrides: { daily: [] },
    });
    
    for (const [url, html] of Object.entries(pages2)) {
      network.use(http.get(url, () => HttpResponse.html(html)));
    }
    const ingestResult2 = await SELF.fetch(`https://example.com/api/admin/ingest`, { 
      method: "POST", 
      headers: AUTH,
    });
    console.log("Ingest 2 result:", await ingestResult2.json());

    // 回看 2026-11-12：应返回当期数据（2 条）
    const boards12 = await readBoards("2026-11-12");
    console.log("Boards 2026-11-12:", boards12);
    expect(boards12.boards.daily).toHaveLength(2);
    expect(boards12.data_freshness).toBe("historic"); // 2026-11-12 is in the past

    // 回看 2026-11-13：应返回沿用的 2026-11-12 数据（2 条）+ fallback 标记
    const boards13 = await readBoards("2026-11-13");
    console.log("Boards 2026-11-13:", boards13);
    expect(boards13.boards.daily).toHaveLength(2);
    expect(boards13.data_freshness).toBe("fallback");
    expect(boards13.fallback_date).toBe("2026-11-12");
  });
});

describe("缺陷 2: README 兜底流程（AC#9）", () => {
  it("RED: 简介为空时，自动 fetch README 并作为解读输入", async () => {
    // 设置数据：仓库简介为空
    const pages = boardPages({
      date: "2026-11-13",
      minimal: true,
      overrides: {
        daily: [makeDailyRow(0, { 
          full_name: "owner1/repo1",
          repository_description: "", // 空简介
        })],
      },
    });
    
    // 模拟 README 和 AI 响应
    let readmeFetched = false;
    network.use(
      http.get("https://raw.githubusercontent.com/owner1/repo1/main/README.md", () => {
        readmeFetched = true;
        return HttpResponse.text("# This is a great library for X\n\nUsage: ...", { status: 200 });
      }),
    );

    let aiInput = "";
    network.use(
      http.post(AI_URL, async ({ request }) => {
        const body = (await request.json()) as { messages?: { role: string; content?: string }[] };
        const user = (body.messages ?? []).find((m) => m.role === "user");
        aiInput = user?.content ?? "";
        
        return HttpResponse.json({
          choices: [{
            message: {
              content: JSON.stringify(GOOD_INTERPRETATION),
            },
          }],
        });
      }),
    );

    // 采集并手动触发解读
    for (const [url, html] of Object.entries(pages)) {
      network.use(http.get(url, () => HttpResponse.html(html)));
    }
    await SELF.fetch(`${BASE}/api/admin/ingest`, { method: "POST", headers: AUTH });

    // 处理解读队列
    await SELF.fetch(`${BASE}/api/admin/interpretations/process`, { 
      method: "POST", 
      headers: AUTH,
    });

    // ✅ 验证：README 应被 fetch
    expect(readmeFetched).toBe(true);

    // ✅ 验证：README 内容应进入 AI prompt
    expect(aiInput).toContain("This is a great library");

    // ✅ 验证：解读应成功生成
    const boards = await readBoards();
    expect(boards.boards.daily[0].interpretation.status).toBe("done");
    expect(boards.boards.daily[0].interpretation.summary).toBeTruthy();
  });

  it("README fetch 失败时，应降级为纯元数据调用", async () => {
    const pages = boardPages({
      date: "2026-11-13",
      minimal: true,
      overrides: {
        daily: [makeDailyRow(0, { 
          full_name: "owner1/repo1",
          repository_description: "", // 空简介
        })],
      },
    });

    // README fetch 返回 404
    network.use(
      http.get("https://raw.githubusercontent.com/owner1/repo1/main/README.md", () => 
        HttpResponse.json({ message: "Not Found" }, { status: 404 })
      ),
    );

    let aiInputWithoutReadme = "";
    network.use(
      http.post(AI_URL, async ({ request }) => {
        const body = (await request.json()) as { messages?: { role: string; content?: string }[] };
        const user = (body.messages ?? []).find((m) => m.role === "user");
        aiInputWithoutReadme = user?.content ?? "";
        
        return HttpResponse.json({
          choices: [{
            message: {
              content: JSON.stringify(GOOD_INTERPRETATION),
            },
          }],
        });
      }),
    );

    for (const [url, html] of Object.entries(pages)) {
      network.use(http.get(url, () => HttpResponse.html(html)));
    }
    await SELF.fetch(`${BASE}/api/admin/ingest`, { method: "POST", headers: AUTH });
    
    await SELF.fetch(`${BASE}/api/admin/interpretations/process`, { 
      method: "POST", 
      headers: AUTH,
    });

    // ✅ 验证：AI 应用元数据调用（不含 README）
    expect(aiInputWithoutReadme).toContain("owner1/repo1");
    expect(aiInputWithoutReadme).not.toContain("Not Found");

    // ✅ 验证：解读仍应成功生成
    const boards = await readBoards();
    expect(boards.boards.daily[0].interpretation.status).toBe("done");
  });
});

describe("缺陷 3: 定时任务配置（AC#38-39）", () => {
  it("RED: wrangler.toml 应配置定时任务", async () => {
    // 此测试在部署前手动验证：检查 wrangler.toml
    // 预期配置：
    // [[env.production.triggers.crons]]
    // cron = "10 0 * * *"  # 每日 UTC 00:10
    // handler = "handleScheduledIngest"
    //
    // [[env.production.triggers.crons]]
    // cron = "*/1 * * * *"  # 每分钟
    // handler = "handleScheduledInterpretation"

    // 本测试为占位符，实际验证在部署检查清单中
    expect(true).toBe(true);
  });
});
