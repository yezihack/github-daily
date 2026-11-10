# Issue Tracker：本地 Markdown

本仓库的 issue 与 PRD 以 markdown 文件形式存放在 `.scratch/` 下。

## 约定

- 一个特性一个目录：`.scratch/<feature-slug>/`
- PRD 为 `.scratch/<feature-slug>/PRD.md`
- 实施 issue 为 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
- triage 状态记录为每个 issue 文件顶部的 `Status:` 行（取值见 `docs/agents/triage-labels.md`）
- 评论与对话历史追加到文件底部 `## Comments` 段落

## 当技能要求「publish to the issue tracker」

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则先创建）。

## 当技能要求「fetch the relevant ticket」

直接读取对应路径的文件；用户通常会给出路径或 issue 编号。
