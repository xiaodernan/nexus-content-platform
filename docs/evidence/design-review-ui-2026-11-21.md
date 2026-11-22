# §GRAPH-3 自查开关 UI 实测（2026-11-21）

真浏览器（Playwright，1440×900）走完用户路径：建项目 → Studio → 勾「让 AI 自查一遍」→ 填一句修改要求 → 点「执行」。

| 检查点 | 实测 |
|---|---|
| `data-ai-review` 复选框 | 存在 1 个，可勾上（`isChecked() = true`） |
| 发出的请求 | `POST /api/ai/run`，body 里 `"review": true`、`"intent": "design-edit"` |
| 界面读数 | 出现自查相关文案；无 pageerror |
| 状态 | 提交后显示「执行中…」和任务号；大上下文（约 34.5 万 token）+ 审稿多一轮，15s 观察窗内未完成，不代表失败 |

配套证据：`design-review-live-2026-11-21.md`（同一开关在 ai-service HTTP 层的 1→2 调用与累计计量）、
`tests/test_design_review_graph.py`（23/23 行为臂）。

探针脚本：`scratch/review-ui-e2e.mjs`。
