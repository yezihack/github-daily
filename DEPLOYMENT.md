# 部署到 Cloudflare Workers

本项目是一个 Cloudflare Worker：Worker 同时提供 API（`src/worker/index.ts`）和前端静态资源（`dist/`，通过 `ASSETS` 绑定托管）。数据存 D1，定时任务由 Wrangler 配置注入。

以下所有命令都在项目根目录执行；本地用 `npx wrangler` 即可，不必全局安装。

---

## 一、Token 一览

先弄清楚要配哪几个 token，避免混淆：

| Token | 用途 | 放哪里 | 是否必需 |
| --- | --- | --- | --- |
| GitHub 登录凭据（`gh` 或 PAT） | 把代码 push 到 GitHub | 本机 git 凭据，不入库 | 必需（推送时） |
| Cloudflare API Token | CI/CD 自动部署 | 环境变量 `CLOUDFLARE_API_TOKEN` | 仅 CI 需要 |
| `ADMIN_TOKEN` | 管理接口鉴权 | Worker Secret / `.dev.vars` | **必需** |
| `AI_API_KEY` | 调用 OpenAI 兼容接口生成解读 | Worker Secret / `.dev.vars` | 可选 |
| `AI_BASE_URL` / `AI_MODEL` | 指定接口地址和模型 | Worker Secret / `.dev.vars` | 可选 |
| GitHub Token（读 README） | 抓取仓库 README 作解读输入 | **不需要**，代码读公开 `raw.githubusercontent.com` | 不需要 |

### 1. GitHub 推送凭据

推荐用 GitHub CLI（本机已登录）：

```bash
gh auth login                    # 勾选 repo 权限
gh auth status                   # 确认 active account
```

本仓库远端目前是 SSH 地址，如果 22 端口被网络拦截，改用 HTTPS：

```bash
git remote set-url orign https://github.com/yezihack/github-daily.git
git push orign main
```

也可以用 Fine-grained PAT 代替 `gh`：在 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens 创建，只给本仓库 `Contents: read and write`。然后用它作为 HTTPS 密码（用户名任意），并交给凭据管理器保存，**不要写进代码或 wrangler.toml**。

### 2. Cloudflare API Token（本地手动部署可跳过）

本地执行 `npx wrangler login` 会打开浏览器授权，不需要 API Token。

GitHub Actions 等 CI 场景才需要创建 API Token：Cloudflare Dashboard → My Profile → API Tokens → Create Token，使用 `Edit Cloudflare Workers` 模板，或自定义权限：

- Account → Workers Scripts: Edit
- Account → D1 Databases: Edit
- Account → Account Settings: Read

然后在 CI 里设置两个 secret：

```
CLOUDFLARE_API_TOKEN=<上一步生成的 token>
CLOUDFLARE_ACCOUNT_ID=<Dashboard 右侧的 Account ID>
```

Wrangler 会自动读取这两个环境变量，无需写进配置文件。

### 3. 应用密钥（ADMIN_TOKEN / AI_*）

生产环境用 Secret 注入，Secret 不会出现在源码、构建产物或 D1 中：

```bash
# 生成一个随机令牌（任选一种方式）
openssl rand -hex 32
# 或：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npx wrangler secret put ADMIN_TOKEN      # 粘贴上一步生成的值，回车

# 以下三项可选；不配则页面显示英文原文 + “解读生成中/解读暂缺”
npx wrangler secret put AI_BASE_URL      # 例：https://api.openai.com/v1
npx wrangler secret put AI_API_KEY       # 例：sk-...
npx wrangler secret put AI_MODEL         # 例：gpt-4o-mini
```

换 AI 供应商只改这三个 Secret，不用改代码、不用重新构建前端。

本地开发不要写 Secret，改用 `.dev.vars`（已在 `.gitignore` 中）：

```ini
ADMIN_TOKEN=local-dev-token
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

> 如果误把 `.dev.vars` 提交了，立即轮换对应密钥并从历史中移除。

---

## 二、首次部署

### 步骤 1：登录 Cloudflare

```bash
npx wrangler login
npx wrangler whoami                 # 确认账号和 Account ID
```

### 步骤 2：创建 D1 数据库

```bash
npx wrangler d1 create trendshift-daily-wall
```

命令会输出一个 `Database ID`。把它填进 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "trendshift-daily-wall"
database_id = "这里替换成真实 ID"
migrations_dir = "migrations"
```

> `wrangler.toml` 里目前的 `00000000-0000-0000-0000-000000000000` 是占位符，不替换会导致部署后 API 报数据库错误。

### 步骤 3：执行迁移

```bash
npx wrangler d1 migrations apply trendshift-daily-wall --remote
```

这会按顺序执行 `migrations/0001_init.sql` 到 `0004_interpretations.sql`，创建 `repositories`、`board_entries`、`editions`、`interpretations` 四张表。

> `wrangler deploy` **不会**自动执行 D1 迁移；新增迁移文件后需要再次手动执行上面的命令。

### 步骤 4：配置 Secret

按“一、Token 一览”中的命令设置 `ADMIN_TOKEN`（必需）和可选的 `AI_*`。注意本项目只有一个环境（顶层配置），所以 `secret put` / `deploy` **都不要加 `--env production`**。

### 步骤 5：构建并部署

```bash
npm install
npm run deploy            # = npm run build && wrangler deploy
```

`npm run build` 先做 TypeScript 类型检查再构建前端到 `dist/`，Worker 通过 `ASSETS` 绑定直接托管它，不需要单独部署前端。

部署前可以先检查产物：

```bash
npm run deploy:dry-run
```

部署成功后得到地址：`https://trendshift-daily-wall.<你的子域>.workers.dev`。

### 步骤 6：定时任务

`wrangler.toml` 顶层已配置两条 cron：

```toml
[triggers]
crons = ["10 0 * * *", "*/1 * * * *"]
```

| 任务 | Cron | 说明 |
| --- | --- | --- |
| 每日采集 | `10 0 * * *` | UTC 00:10（北京时间 08:10）抓六个榜单 |
| 解读队列 | `*/1 * * * *` | 每分钟最多处理 10 个仓库 |

部署后在 Cloudflare Dashboard → Workers & Pages → 你的 Worker → Triggers 中确认两条 cron 出现。Worker 的 `scheduled()` 处理器会在每日 00:10 额外触发采集，其余分钟只处理解读队列。

---

## 三、冷启动

部署完成后 D1 是空的，首页会显示空状态。手动触发一次采集：

```bash
curl -X POST https://trendshift-daily-wall.<你的子域>.workers.dev/api/admin/ingest \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

成功响应类似：

```json
{ "date": "2026-11-18", "count": 150, "warnings": [] }
```

随后分钟级任务会自动补齐三段解读，100+ 个仓库大约需要 10–15 分钟。查看进度：

```bash
curl https://trendshift-daily-wall.<你的子域>.workers.dev/api/admin/status \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
# {"pending": 12}
```

---

## 四、日常运维

```bash
BASE=https://trendshift-daily-wall.<你的子域>.workers.dev
TOKEN=<ADMIN_TOKEN>

# 公开看板数据
curl "$BASE/api/boards"
curl "$BASE/api/boards?date=2026-11-18"

# 手动跑一次解读队列 / 重跑失败解读
curl -X POST "$BASE/api/admin/interpretations/process" -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/api/admin/interpretations/retry"    -H "Authorization: Bearer $TOKEN"

# 查看 D1 中的数据量
npx wrangler d1 execute trendshift-daily-wall --remote \
  --command "SELECT date, COUNT(*) AS n FROM board_entries GROUP BY date ORDER BY date DESC LIMIT 5"
```

公开读取接口带缓存头：最新期次 5 分钟，历史期次 1 天。修改 Secret 后新版本会自动生效；必要时重跑 `npm run deploy`。

回滚：Dashboard → Worker → Deployments → 选择历史版本 → Rollback。

---

## 五、排错

| 现象 | 原因与处理 |
| --- | --- |
| 管理接口返回 `401 {"error":"UNAUTHORIZED"}` | `Authorization` 必须是 `Bearer <ADMIN_TOKEN>`，且 Secret 已设置；检查是否误加了 `--env production` 导致 Secret 放错环境 |
| 部署后所有 API 报数据库错误 | `wrangler.toml` 的 `database_id` 还是占位符，或没执行 `--remote` 迁移 |
| 首页空白 | 新库无数据，执行“冷启动”的采集命令 |
| 采集返回 `502 RSC_PAYLOAD_MISSING` | TrendShift 页面结构变化或被限流；该榜沿用上一期次，查看 `warnings` 和源站可用性 |
| 定时任务没执行 | 在 Dashboard → Triggers 确认 cron 存在；Cron 使用 UTC，不是北京时间 |
| 解读一直“生成中” | 未配置 `AI_*` 或额度不足；用 `/api/admin/status` 看 pending 数量 |
| `wrangler` 命令找不到 | 用 `npx wrangler ...`，或 `npm install -g wrangler`（不是 `@cloudflare/wrangler`） |
