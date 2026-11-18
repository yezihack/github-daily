# 03: 全屏六榜卡片墙

**What to build:** 访客打开首页，六张榜单卡片铺满整个视口、一眼分清信息来自哪个榜；页面本身不滚动，每张卡片内部可独立滚到该榜第 25 条；手机上退化为单列也能用。顶栏骨架一并立起，后续任务把日期与状态控件填进去。

**Blocked by:** 02 六榜全量采集与归一化

**Status:** ✅ 已完成

- [x] 1920×1080 视口下六卡铺满视口，整页无滚动条
- [x] 每卡内部独立滚动，可到达该榜第 25 条
- [x] 六个**榜单**各有固定配色；增长数与**收藏**态位置使用荧光绿作信号色
- [x] 数字使用等宽字体、中文有系统字体回退；无外部字体请求、无入场动画
- [x] 移动端回退为单列纵向滚动，内容仍完整可读
- [x] 顶栏骨架含站名、日期位与数据状态位，控件本身尚未启用
- [x] 「全屏」是铺满视口的 CSS 布局，不调用浏览器 Fullscreen API
- [x] 浏览器人工验收通过；不引入 Playwright 等第二条自动化测试缝

**实现说明：**
- 使用 CSS Flexbox + Grid 实现 100vh 全屏布局
- 3×2 网格，每卡 `overflow-y: auto` 独立滚动
- 六榜配色通过 CSS 变量 `--accent` 动态设置
- 荧光绿 `#c8f751` 专用于 `.gain` 类
- 等宽字体 `var(--mono)` + `font-variant-numeric: tabular-nums`
- 中文字体回退链：Microsoft YaHei → Noto Sans CJK SC → PingFang SC
- 移动端 `@media (max-width: 720px)` 单列 flex 布局
- 无动画、无外部字体、无 Fullscreen API 调用

**验收文档：** `03-acceptance.md`
