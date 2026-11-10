# 直接解析 TrendShift 首包 HTML 的 RSC 载荷

TrendShift 没有公开榜单 API，但 2026-11-09 实测六个榜单页的服务端响应都内联了完整的 `self.__next_f.push` RSC 载荷（`initialData` 命中日/周/月/年榜，`repositories` 命中 GitHub 趋势历史榜，`initialMentions` 命中当日提及榜，每榜 25 条），所以 Worker 用一次普通 `fetch` 加「分块 JSON 解码 + 括号配对提取数组」即可取数，不引入无头浏览器。参考技能用 headless Chrome `--dump-dom` 是因为本机 `curl` 会截断流式响应，而 Worker 的 `await response.text()` 会读完整响应体；解析不到 `initialData` 时以 `RSC: 1` 请求头重试，仍失败则沿用上一期次。

**Considered Options**: Cloudflare Browser Rendering（真实执行 JS，但需付费绑定且慢）、本机定时脚本抓取后回推 Worker（多一个部署单元与一条上传链路）。
