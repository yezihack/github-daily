# TrendShift 中文看板

每天自动采集 TrendShift 的 6 个 GitHub 榜单，用 AI 生成三段中文解读，并用一个全屏卡片墙展示。前端由 Cloudflare Worker 直接托管，数据存 D1，无账号、无服务端用户数据。

## 功能

- 六个榜单：日榜、周榜、月榜、年榜、当日提及榜、GitHub 趋势历史榜（各 25 条）
- AI 三段解读：简介 / 解决的问题 / 目标用户（OpenAI 兼容接口，可换供应商）
- 全屏 3×2 卡片墙，移动端单列；点击条目打开详情抽屉
- 按 UTC 日期回看历史期次；采集失败自动沿用上一期并标记状态
- 浏览器本地收藏（`localStorage`），不需要登录
- 定时任务：每日 UTC 00:10 采集，每 10 分钟处理 6 个解读（429 自动退避 15 分钟）
- 页面右上角「运维」面板：输入 `ADMIN_TOKEN` 后可手动采集、跑解读、重跑失败项并查看运行日志
- 管理端点需 `ADMIN_TOKEN` 鉴权；公开读取接口带缓存头

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite 7 |
| 后端 | Cloudflare Workers（含 Assets） |
| 数据库 | Cloudflare D1（SQLite） |
| 测试 | Vitest 4 + MSW + `@cloudflare/vitest-plugin` |

## 本地开发

```bash
npm install
```

创建 `.dev.vars`（已在 `.gitignore` 中，不会提交）：

```ini
ADMIN_TOKEN=local-dev-token
# 可选，AI_API_KEY / AI_BASE_URL / AI_MODEL
```

初始化本地 D1 并启动两个终端：

```bash
npx wrangler d1 migrations apply trendshift-daily-wall --local
npx wrangler dev          # API: http://localhost:8787
```

```bash
npm run dev               # 前端: http://localhost:5173，/api 自动代理到 8787
```

验证：

```bash
npm run typecheck
npm test                  # 40 个测试
npm run build
```

## 部署

完整步骤（D1、定时任务、各类 Token 配置、冷启动、运维命令、排错）见 **[DEPLOYMENT.md](./DEPLOYMENT.md)**。

最简流程：

```bash
npx wrangler login
npx wrangler d1 create trendshift-daily-wall       # 把返回的 id 填进 wrangler.toml
npx wrangler d1 migrations apply trendshift-daily-wall --remote
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

部署后首次需要手动触发一次采集：

```bash
curl -X POST https://trendshift-daily-wall.<你的子域>.workers.dev/api/admin/ingest \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

## API

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/boards[?date=YYYY-MM-DD]` | 公开 | 六榜数据、可用日期、数据新鲜度 |
| POST | `/api/repos/bulk` | 公开 | 按 owner/name 批量查询仓库详情 |
| POST | `/api/admin/ingest` | Bearer | 立即采集（别名 `/api/admin/refresh`） |
| POST | `/api/admin/interpretations/process` | Bearer | 手动跑一次解读队列 |
| POST | `/api/admin/interpretations/retry` | Bearer | 重跑失败的解读 |
| GET | `/api/admin/status` | Bearer | 查询待解读数量 |

## 目录结构

```
src/app/          React 前端（App.tsx / Drawer.tsx / styles.css）
src/worker/       Worker 入口、采集、RSC 解析、解读队列
src/shared/       共享类型与榜单定义
migrations/       D1 迁移脚本 0001–0004
tests/            HTTP 缝集成测试（唯一测试缝）
docs/adr/         架构决策记录
.scratch/         工单、规格、验收与进度记录
```

## 许可证

MIT，见 [LICENSE](./LICENSE)。
