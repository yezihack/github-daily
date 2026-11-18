# 06: AI 三段解读最小闭环

**Status:** ✅ 已完成

**What to build:** 访客第一次在卡片上看到中文**简介**、在抽屉里看到完整的**解决问题**与**适用人群**，并明确知道这是「AI 解读」而非官方说明。运维配置一个 OpenAI 兼容接口后手动触发一次，就能为当前所有唯一**仓库**各生成一份三段**中文解读**；坏结果一律不入库。

**Blocked by:** 05 详情抽屉（元数据版）

**Completed artifacts:**
- ✅ AI_BASE_URL、AI_API_KEY、AI_MODEL 三配置项可换供应商或模型
- ✅ interpretations 表扩展 retry_count 字段
- ✅ OpenAI 兼容调用模块，带 prompt 约束和防注入
- ✅ 字数范围检查：简介 12–28、问题 40–80、人群 20–40
- ✅ 返回非 JSON、三段缺一或越界一律不入库
- ✅ 同一仓库跨榜、跨期共用一份解读
- ✅ 卡片显简介；抽屉显三段并标注「AI 解读」
- ✅ 未配置密钥时也能工作，条目显英文原文

**Implementation notes:**
- processInterpretationQueue 支持按需处理队列
- README 自动兜底（3000 字截断）
- 累计 3 次失败后标记为 failed
- 密钥配置在 wrangler.toml secrets，不进前端/D1
