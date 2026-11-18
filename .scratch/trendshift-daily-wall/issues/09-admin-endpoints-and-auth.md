# 09: 运维端点与鉴权

**Status:** ✅ 已完成

**What to build:** 运维可以用令牌保护的三个端点手动触发采集、重跑失败解读、查询状态；部署完空库时可立刻手动触发一次让首页有数据，不必等第二天；公开读取带上缓存头。匿名访客依然没有任何写操作入口。

**Blocked by:** 07 无人值守解读队列与失败降级

**Completed artifacts:**
- ✅ POST /api/admin/ingest（采集触发，校验 ADMIN_TOKEN）
- ✅ POST /api/admin/interpretations/retry（重跑失败解读）
- ✅ GET /api/admin/status（查询采集和解读状态）
- ✅ 无令牌返回 401，有令牌返回 200
- ✅ 公开读取接口带缓存头：历史期次 1 天、最新一期 5 分钟
- ✅ 部署说明覆盖 wrangler.toml、D1 创建、env 配置、定时任务、冷启动步骤
- ✅ 首页不出现刷新按钮

**Implementation notes:**
- checkAuth 函数校验 Bearer 令牌
- handleIngest、handleRetryInterpretations、handleStatus 三个端点
- 缓存头根据 data_freshness 分别设置
- 更换 AI 供应商只改配置变量，不改代码
- 部署文档见 DEPLOYMENT.md
