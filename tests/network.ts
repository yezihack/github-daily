import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { BOARDS } from "../src/shared/boards";
import { EMPTY_SHELL_HTML } from "./fixtures/boards-rsc";

export const network = setupNetwork();

beforeAll(() => network.enable());
beforeEach(() => {
  // 默认六个榜单都返回不含 RSC 载荷的外壳；测试用 network.use 覆盖需要的榜
  for (const board of BOARDS) {
    network.use(http.get(board.url, () => HttpResponse.html(EMPTY_SHELL_HTML)));
  }
});
afterEach(() => network.resetHandlers());
afterAll(() => network.disable());
