# 世界「AI 续写编年」真 provider 实测（2026-11-21）

新模块：WorldPanel 增「AI 续写编年」按钮，走 web 侧 `/api/ai/world-fill`（`chronicle:true`），
模型只在世界**已有纪元字面**下补一条 story；自造的纪元名降级为「未标纪元」，不替作者发明历史分期。

真浏览器路径（Playwright，1440×900）：建项目 → World 面板建骨架 → 写一句世界概述 → 点「AI 续写编年」→ 等待回执。

| 检查点 | 实测 |
|---|---|
| provider | `gpt-6.2-sol`，capability=real（非 DEMO） |
| 回执 | 「已续写「未标纪元」·《潮退时的异纪盐》，编年页可看」 |
| 落库 | `GET /api/projects/:id/world`：story 条目 1 → 2，新条目 body 非空，`lore.order = 0` |
| 零错误 | 无 pageerror，无 5xx |

**调试中的真问题与修正**：空世界（无 era、只有一句话概述）时模型按"没有依据"直接返回 `[]`，
按钮点了没反应。提示改为"只要概述有一句可用前提就必须写一条，连概述都是空的才返回 `[]`"，
同条件下重测拿到 `{title, body, era:""}`，落库成功。这不是放宽真实性——内容仍只来自给定概述。

纯函数门：`parseChronicleReply` 3 条（挑中已有 era / 自造 era 降级 / 空列表与无条目）；
WorldPanel 视觉门重钉 `8cae6bdc`；`apps/web` tsc exit 0。探针：`scratch/chronicle-e2e.mjs`。
