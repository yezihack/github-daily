import { BOARD_ACCENTS, BOARD_LABELS, BOARD_ORDER } from "../shared/boards";
import type { BoardsResponse } from "../shared/types";
import {
  emptyBoards,
  ingestBoards,
  latestEditionDate,
  listEditionDates,
  readBoards,
} from "./boards";
import { processInterpretationQueue, retryFailedInterpretations, countPendingInterpretations } from "./interpretation";

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

function json(
  body: unknown,
  status = 200,
  freshness: "latest" | "historic" | "fallback" = "latest",
): Response {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
  
  // Add cache headers
  if (freshness === "latest") {
    response.headers.set("Cache-Control", "public, max-age=300"); // 5 minutes for latest
  } else {
    response.headers.set("Cache-Control", "public, max-age=86400"); // 1 day for historic
  }
  
  return response;
}

function checkAuth(request: Request, env: Cloudflare.Env): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth || !env.ADMIN_TOKEN) return null;
  if (auth === `Bearer ${env.ADMIN_TOKEN}`) return env.ADMIN_TOKEN;
  return null;
}

async function handleIngest(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (!checkAuth(request, env)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  try {
    const result = await ingestBoards(env.DB);
    if (!result.date) {
      return json({ error: "RSC_PAYLOAD_MISSING", warnings: result.warnings }, 502);
    }
    return json({ date: result.date, count: result.count, warnings: result.warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return json({ error: message }, 500);
  }
}

async function handleRetryInterpretations(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (!checkAuth(request, env)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  try {
    const result = await retryFailedInterpretations(env);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return json({ error: message }, 500);
  }
}

async function handleStatus(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (!checkAuth(request, env)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  try {
    const pending = await countPendingInterpretations(env.DB);
    return json({ pending });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return json({ error: message }, 500);
  }
}

async function handleProcessInterpretations(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (!checkAuth(request, env)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  try {
    const result = await processInterpretationQueue(env);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return json({ error: message }, 500);
  }
}

async function handleBoards(url: URL, env: Cloudflare.Env): Promise<Response> {
  const requested = url.searchParams.get("date");
  if (requested !== null && !DATE_PARAM.test(requested)) {
    return json({ error: "INVALID_DATE" }, 400, "latest");
  }

  const latest = await latestEditionDate(env.DB);
  const requestedDate = requested ?? latest;
  
  let date: string | null = requestedDate;
  let freshness: "latest" | "historic" | "fallback" = "latest";
  let fallbackDate: string | undefined;

  // If requested date doesn't exist in database, use it anyway (might be empty)
  if (requestedDate) {
    const dates = await listEditionDates(env.DB);
    if (dates.includes(requestedDate)) {
      // Check if any data for this date is a fallback
      // A fallback occurs when we have board_entries inserted with copied data from an earlier date
      // We detect this by checking if all repos for a board on this date also appear on exactly one earlier date
      
      let detectedFallbackDate: string | null = null;
      const boards = BOARD_ORDER;
      const fallbackBoards: { board: string; date: string }[] = [];
      
      for (const boardSlug of boards) {
        const currentEntries = await env.DB
          .prepare(`SELECT COUNT(*) as cnt FROM board_entries WHERE date = ? AND board = ?`)
          .bind(requestedDate, boardSlug)
          .first<{ cnt: number }>();

        if (!currentEntries || currentEntries.cnt === 0) continue;

        // Get all repos for this board on the requested date
        const currentRepos = await env.DB
          .prepare(
            `SELECT repo_id FROM board_entries WHERE date = ? AND board = ? ORDER BY repo_id`,
          )
          .bind(requestedDate, boardSlug)
          .all<{ repo_id: string }>();

        if (currentRepos.results.length === 0) continue;

        // For this board, check if all repos also appear on exactly one earlier date
        const repoIdList = currentRepos.results.map((r) => r.repo_id);
        const placeholders = repoIdList.map(() => "?").join(",");

        const dateFreq = await env.DB
          .prepare(
            `SELECT date, COUNT(*) as repo_count
             FROM board_entries
             WHERE date < ? AND board = ? AND repo_id IN (${placeholders})
             GROUP BY date
             ORDER BY date DESC
             LIMIT 1`,
          )
          .bind(requestedDate, boardSlug, ...repoIdList)
          .first<{ date: string; repo_count: number }>();

        // If all repos appear together on exactly one earlier date, it's a fallback
        if (dateFreq && dateFreq.repo_count === repoIdList.length) {
          fallbackBoards.push({ board: boardSlug, date: dateFreq.date });
          if (!detectedFallbackDate) {
            detectedFallbackDate = dateFreq.date;
          }
        }
      }

      if (fallbackBoards.length > 0 && detectedFallbackDate) {
        freshness = "fallback";
        fallbackDate = detectedFallbackDate;
      } else {
        // No fallback found, check if this is the latest or historic
        if (requestedDate === latest) {
          freshness = "latest";
        } else {
          freshness = "historic";
        }
      }
    }
  }

  const pending = await countPendingInterpretations(env.DB);

  const body: BoardsResponse = {
    date,
    dates: await listEditionDates(env.DB),
    labels: BOARD_LABELS,
    accents: BOARD_ACCENTS,
    boards: date ? await readBoards(env.DB, date) : emptyBoards(),
    data_freshness: freshness,
    ...(fallbackDate && { fallback_date: fallbackDate }),
    pending_interpretations: pending,
  };

  return json(body, 200, freshness);
}

function isValidRepoPart(value: string): boolean {
  if (!/^[a-z0-9_.-]+$/.test(value)) return false;
  if (value.startsWith(".") || value.endsWith(".")) return false;
  if (value.startsWith("-") || value.endsWith("-")) return false;
  return !value.includes("..");
}

async function handleRepositoriesBulk(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  if (!Array.isArray(payload)) {
    return json({ error: "PAYLOAD_NOT_ARRAY" }, 400);
  }

  // 标准化请求数据
  interface RepoRequest {
    owner?: unknown;
    name?: unknown;
  }
  const repos: Array<{ owner: string; name: string }> = [];
  for (const item of payload) {
    if (typeof item === "object" && item !== null) {
      const req = item as RepoRequest;
      const owner = typeof req.owner === "string" ? req.owner.toLowerCase() : null;
      const name = typeof req.name === "string" ? req.name.toLowerCase() : null;
      if (owner && name && isValidRepoPart(owner) && isValidRepoPart(name)) {
        repos.push({ owner, name });
      }
    }
  }

  if (repos.length === 0) {
    return json({ error: "NO_VALID_REPOS" }, 400);
  }

  // 从数据库获取仓库信息
  const repoDetails: Array<{
    owner: string;
    name: string;
    htmlUrl: string;
    descEn: string | null;
    homepage: string | null;
    language: string | null;
    tags: string[];
  }> = [];

  for (const { owner, name } of repos) {
    const repoId = `${owner}/${name}`;
    const result = await env.DB
      .prepare(
        `SELECT r.id, r.html_url, r.description_en, r.homepage, r.language
         FROM repositories r
         WHERE LOWER(r.id) = ?
         LIMIT 1`,
      )
      .bind(repoId)
      .first<{
        id: string;
        html_url: string;
        description_en: string | null;
        homepage: string | null;
        language: string | null;
      }>();

    if (result) {
      // 获取最新期次中该仓库的标签
      const tagsResult = await env.DB
        .prepare(
          `SELECT DISTINCT tags FROM board_entries
           WHERE LOWER(repo_id) = ?
           ORDER BY date DESC
           LIMIT 1`,
        )
        .bind(repoId)
        .first<{ tags: string }>();

      repoDetails.push({
        owner,
        name,
        htmlUrl: result.html_url,
        descEn: result.description_en,
        homepage: result.homepage,
        language: result.language,
        tags: tagsResult ? JSON.parse(tagsResult.tags) : [],
      });
    }
  }

  return json(repoDetails);
}

async function handleScheduledIngest(env: Cloudflare.Env): Promise<Response> {
  try {
    const result = await ingestBoards(env.DB);
    if (!result.date) {
      return json({ error: "RSC_PAYLOAD_MISSING", warnings: result.warnings }, 502);
    }
    return json({ date: result.date, count: result.count, warnings: result.warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return json({ error: message }, 500);
  }
}

async function handleScheduledInterpretation(env: Cloudflare.Env): Promise<Response> {
  try {
    const result = await processInterpretationQueue(env);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return json({ error: message }, 500);
  }
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);

    if ((url.pathname === "/api/admin/ingest" || url.pathname === "/api/admin/refresh") && request.method === "POST") {
      return handleIngest(request, env);
    }
    if ((url.pathname === "/api/admin/interpretations/retry" || url.pathname === "/api/admin/interpret") && request.method === "POST") {
      return handleRetryInterpretations(request, env);
    }
    if (url.pathname === "/api/admin/interpretations/process" && request.method === "POST") {
      return handleProcessInterpretations(request, env);
    }
    if (url.pathname === "/api/admin/status" && request.method === "GET") {
      return handleStatus(request, env);
    }
    if (url.pathname === "/api/boards" && request.method === "GET") {
      return handleBoards(url, env);
    }
    if (url.pathname === "/api/repos/bulk") {
      return handleRepositoriesBulk(request, env);
    }

    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Cloudflare.Env): Promise<void> {
    // Scheduled event handlers
    // Different cron jobs can be differentiated by timing or via handler name
    const now = new Date();
    const minutes = now.getUTCMinutes();
    const hours = now.getUTCHours();

    // Daily ingest at 00:10 UTC
    if (hours === 0 && minutes === 10) {
      try {
        await handleScheduledIngest(env);
        console.log("[Scheduled] Daily ingest completed");
      } catch (error) {
        console.error("[Scheduled] Daily ingest failed:", error);
      }
    }

    // Interpretation processing every minute
    try {
      await handleScheduledInterpretation(env);
      console.log("[Scheduled] Interpretation queue processed");
    } catch (error) {
      console.error("[Scheduled] Interpretation processing failed:", error);
    }
  },
};
