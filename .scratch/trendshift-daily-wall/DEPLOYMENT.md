# TrendShift 榜单中文看板 · 部署说明

## 前置条件

- Cloudflare Workers 账户与升级后的计费计划
- Node.js 18+ 与 npm
- `wrangler` CLI 已全局安装或通过 npm 脚本调用

## 初始部署步骤

### 1. D1 数据库创建与绑定

```bash
# 创建新数据库
wrangler d1 create trendshift-daily-wall

# 命令输出包含一个数据库 ID，形如：
# Database ID: xxxx-xxxx-xxxx-xxxx

# 复制该 ID，编辑 wrangler.toml，替换 database_id 字段
```

编辑 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "trendshift-daily-wall"
database_id = "xxxx-xxxx-xxxx-xxxx"  # ← 替换为实际 ID
migrations_dir = "migrations"
```

### 2. 运维密钥与 AI 配置

通过 Secrets Manager 注入敏感信息（生产环境）：

```bash
# 注入管理员令牌（用于触发采集、重跑解读、查询状态）
wrangler secret put ADMIN_TOKEN
# 输入密钥后按 CTRL+D

# 注入 AI 密钥
wrangler secret put AI_API_KEY
# 输入 OpenAI 兼容 API 密钥

# 注入其他 AI 配置
wrangler secret put AI_BASE_URL
# 输入 API 端点，如 https://api.openai.com/v1

wrangler secret put AI_MODEL
# 输入模型名称，如 gpt-4o
```

本地开发：创建 `.dev.vars` 文件（**勿提交到版本控制**）：

```
ADMIN_TOKEN=dev-token-12345
AI_API_KEY=sk-proj-xxxx
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o
```

### 3. 数据库迁移

首次部署时自动运行：

```bash
wrangler d1 execute trendshift-daily-wall --remote --file=migrations/0001_init.sql
wrangler d1 execute trendshift-daily-wall --remote --file=migrations/0002_editions.sql
wrangler d1 execute trendshift-daily-wall --remote --file=migrations/0003_homepage.sql
wrangler d1 execute trendshift-daily-wall --remote --file=migrations/0004_interpretations.sql
```

迁移需要手动执行一次（wrangler deploy 不会自动执行）：

```bash
wrangler d1 migrations apply trendshift-daily-wall --remote
```

详细步骤与 Token 配置见仓库根目录的 `DEPLOYMENT.md`。

### 4. 构建与部署

```bash
# 安装依赖
npm install

# 构建（Vite 前端 + 类型检查）
npm run build

# 部署到 Cloudflare Workers
npm run deploy

# 或使用 Dry Run 预览
npm run deploy:dry-run
```

部署成功后，Worker 将托管在 `https://<project-name>.<subdomain>.workers.dev`。

## 冷启动步骤

部署完成后，D1 尚为空库。首页将显示空状态说明。需要手动触发一次采集来获得初始数据：

```bash
# 触发采集（用 ADMIN_TOKEN 授权）
curl -X POST https://<project-name>.<subdomain>.workers.dev/api/admin/ingest \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 响应示例：
# {
#   "date": "2026-11-13",
#   "count": 150,
#   "warnings": []
# }
```

采集完成后，约 10–15 分钟内分钟级定时任务会自动补齐三段中文解读。可用以下命令查看解读生成进度：

```bash
# 查询解读队列状态
curl -X GET https://<project-name>.<subdomain>.workers.dev/api/admin/status \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 响应示例：
# { "pending": 5 }  # 还剩 5 个待生成
```

## 定时任务配置

两条自动化任务已配置在 `wrangler.toml`：

| 任务 | 触发器 | 职责 |
| --- | --- | --- |
| **日采集** | 每日 UTC 00:00 | 抓取六榜最新数据，同日覆盖期次 |
| **分钟级队列** | 每分钟 | 从待解读队列取最多 10 个仓库，调用 AI 生成三段解读 |

在 Cloudflare Workers 仪表板中配置这些触发器后，无需手动干预。

## 环境变量与配置

### 必需配置

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `ADMIN_TOKEN` | 管理员令牌，用于认证写操作 | `my-secret-token-abc123` |

### AI 配置（可选）

若不配置 AI，采集与页面仍正常工作，但条目将显示英文原文 + 「解读生成中」或「解读暂缺」角标。

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `AI_BASE_URL` | OpenAI 兼容 API 端点 | `https://api.openai.com/v1` |
| `AI_API_KEY` | API 密钥 | `sk-proj-xxxxx` |
| `AI_MODEL` | 模型标识 | `gpt-4o` |

### 更换 AI 供应商

只需改动以上三个变量，代码无需修改。例如切换到 Anthropic Claude：

```bash
wrangler secret put AI_BASE_URL
# 改为 https://api.anthropic.com/v1

wrangler secret put AI_MODEL
# 改为 claude-3-5-sonnet-20241022

wrangler deploy
```

## 运维接口

### 触发采集

```bash
curl -X POST https://<project-name>.<subdomain>.workers.dev/api/admin/ingest \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

- 无令牌：返回 401
- 成功：返回采集结果与任何警告
- RSC 载荷缺失：返回 502，该榜单沿用上一期次

### 重跑失败的解读

```bash
curl -X POST https://<project-name>.<subdomain>.workers.dev/api/admin/interpretations/retry \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

- 把所有标记为 `failed` 的仓库重置为 `pending`
- 分钟级队列会重新处理它们

### 查询队列状态

```bash
curl -X GET https://<project-name>.<subdomain>.workers.dev/api/admin/status \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

- 返回待解读（`pending`）的仓库数量

## 公开读取接口与缓存

所有 `/api/boards` 请求均包含缓存头：

| 情景 | 缓存策略 |
| --- | --- |
| 最新期次 | 5 分钟（`Cache-Control: public, max-age=300`） |
| 历史期次 | 1 天（`Cache-Control: public, max-age=86400`） |
| 降级期次 | 5 分钟 |

## 常见问题

### Q: 部署后首页为空

A: 这是正常的首次空状态。运行冷启动步骤中的采集命令即可填充数据。

### Q: RSC 载荷解析失败

A: 如果某个榜单返回 502 错误，检查：
1. TrendShift 源站是否可用
2. User-Agent 是否被拒
3. 是否有速率限制

该榜单会沿用上一期次数据，不会导致整个采集失败。

### Q: AI 解读生成缓慢

A: 分钟级队列每次最多处理 10 个仓库。若有 100+ 个新仓库，需要 10+ 分钟补齐。可手动调整 `MAX_REPOS_PER_RUN` 参数（需重新构建与部署）。

### Q: 如何清空数据库重新开始

A: 直接删除旧数据库，重新创建：

```bash
# 删除
wrangler d1 delete trendshift-daily-wall

# 重建并更新 wrangler.toml 中的 database_id
wrangler d1 create trendshift-daily-wall
```

然后运行冷启动步骤。

## 监控与日志

Cloudflare Workers 仪表板提供：

- **Requests** 标签：请求计数与响应时间
- **Logs** 标签：Worker 运行时的 `console.log()` 输出
- **Analytics Engine**：可选的自定义指标

监控建议：

1. 每日采集后检查 `/api/admin/status` 以确认没有卡死在队列
2. 监听 `console.warn()` 输出，查看采集警告与解读失败
3. 定期检查 D1 存储使用量（可在 Workers 仪表板查看）

## 回滚与升级

### 升级 wrangler 版本

```bash
npm install -g wrangler@latest
npm install --save-dev wrangler@latest
```

### 回滚到上一个部署版本

Cloudflare Workers 自动保留最近的部署历史。在仪表板中：

1. 打开 Worker → **Deployments** 标签
2. 选择想要回滚的版本
3. 点击 **Rollback**

## 成本估计（2026 年）

| 项目 | 单价 | 月估计 |
| --- | --- | --- |
| Workers 请求 | ¥ 0.05 / 百万 | ¥0–¥5（依流量） |
| D1 存储 | ¥ 0.0096 / GB | ¥0.01–¥0.05 |
| D1 行读写 | ¥ 0.0004 / 百万 | ¥0–¥1 |
| AI API（若使用） | 按供应商 | ¥50–¥500 |

**注：** 不计算 TrendShift 源站的外网流量或 GitHub README 抓取的额外成本。

## 支持与反馈

遇到问题或需要功能调整，请参考：

- 工单列表：`.scratch/trendshift-daily-wall/issues/`
- 项目 Spec：`.scratch/trendshift-daily-wall/SPEC.md`
- 进度跟踪：`.scratch/trendshift-daily-wall/PROGRESS.md`
