# 10: 采集容错与数据状态可见

**Status:** ✅ 已完成

**What to build:** 上游返回坏页面、某个**榜单**解析为空、或首次部署还没有数据时，访客看到的仍是一个可读的页面和准确的数据新鲜度说明，而不是空白或误导；顶栏把「更新于 X 日 UTC」「解读生成中 N 项」显示出来。这是把所有降级口径收口并做全链路验收的最后一环。

**Blocked by:** 03 全屏六榜卡片墙；09 运维端点与鉴权

**Completed artifacts:**
- ✅ RSC 缺失时以 RSC: 1 请求头重试；仍失败则该榜沿用上一期次
- ✅ 单个榜单解析为 0 条时该榜沿用上一期次
- ✅ 顶栏显示「更新于 X 日 UTC」与「解读生成中 N 项」
- ✅ 沿用上期时响应里带 data_freshness = "fallback"
- ✅ 首次部署或 D1 无数据时显示明确空状态
- ✅ 任何降级都返回可用数据而非空结果
- ✅ 全链路验收对齐 spec 的 22 条标准
- ✅ 术语表与 ADR 的约束在接口字段、界面文案与测试中保持一致

**Implementation notes:**
- data_freshness 字段：latest / historic / fallback
- pending_interpretations 计数返回
- BoardsResponse 扩展两个新字段
- 降级逻辑完全保守（不删除、不隐藏、不伪装）
- 完整验收清单见 TESTING.md（22 条）
