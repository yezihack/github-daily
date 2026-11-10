import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

export const network = setupNetwork();

beforeAll(() => network.enable());
beforeEach(() => {
  // 兜底：测试若意外请求真实上游，直接失败，而不是穿透到外网
  network.use(
    http.get("https://trendshift.io/", () =>
      HttpResponse.text("unexpected upstream request", { status: 503 }),
    ),
  );
});
afterEach(() => network.resetHandlers());
afterAll(() => network.disable());
