import type { BoardsResponse } from "../shared/types";
import { ingestDailyBoard, latestDailyDate, readDailyBoard } from "./daily";

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function refresh(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return json({ error: "ADMIN_TOKEN_NOT_CONFIGURED" }, 503);
  }
  if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const result = await ingestDailyBoard(env.DB);
  if (!result.date) {
    return json({ error: "RSC_PAYLOAD_MISSING", warnings: result.warnings }, 502);
  }
  return json({ date: result.date, count: result.count, warnings: result.warnings });
}

async function boards(url: URL, env: Cloudflare.Env): Promise<Response> {
  const requested = url.searchParams.get("date");
  const date =
    requested && DATE_PARAM.test(requested) ? requested : await latestDailyDate(env.DB);
  const daily = date ? await readDailyBoard(env.DB, date) : [];
  const body: BoardsResponse = { date, boards: { daily } };
  return json(body);
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/admin/refresh" && request.method === "POST") {
      return refresh(request, env);
    }
    if (url.pathname === "/api/boards" && request.method === "GET") {
      return boards(url, env);
    }

    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
