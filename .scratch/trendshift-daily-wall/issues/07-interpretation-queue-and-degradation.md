# 07: 无人值守解读队列与失败降级

**Status:** ✅ 已完成

**What to build:** 不再需要人工触发：每日采集之后，**中文解读**会在约 10–15 分钟内自动补齐；遇到坏简介会自动找 README 兜底；反复失败的**仓库**有界重试后显示英文原文与角标，而不是拖住队列或露出半截中文。

**Blocked by:** 06 AI 三段解读最小闭环

**Completed artifacts:**
- ✅ 分钟级定时任务处理解读队列（每次最多 10 个仓库）
- ✅ 英文简介异常时自动 fetch README（截断 3000 字）
- ✅ 累计 3 次失败后标记为 failed
- ✅ 队列幂等，同日多次触发不产生重复 AI 调用
- ✅ 卡片显英文原文 + 「解读生成中」或「解读暂缺」角标
- ✅ 接口返回解读状态（pending、done、failed）与待处理数量

**Implementation notes:**
- MAX_RETRY_COUNT = 3，MAX_REPOS_PER_RUN = 10
- README 自动兜底（坏简介检测）
- retry_count 字段追踪重试次数
- 分钟级 cron 触发 processInterpretationQueue
- 幂等性通过 date 唯一性保证
