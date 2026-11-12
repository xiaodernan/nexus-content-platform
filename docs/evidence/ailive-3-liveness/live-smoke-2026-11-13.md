# Live AI Smoke — wkapi.pro / gpt-6-sol — 2026-11-13 真实调用复跑

`npm run live:ai-smoke -- --confirm-real` **真实通过**了一条端到端路径：
注册 → 建项目 → `/api/ai/run`（provider 真调用）→ capability=real。

stdout 摘录（含 key 已脱敏）：
```
capability: "real", provider: "openai-compatible", model: "gpt-6-sol",
explanation: "WCAG AA 对正文（普通文本）的最低对比度要求是 4.5:1；大号文本可为 3:1。",
usage: { tokensIn: 8820, tokensOut: 51, latencyMs: 3501.4, costUsd: 0, demoMode: false }
```

本门 Ν≈真模型。DEMO 在生产部署中不假冒 real。

注意：Python 侧 liveness 通过 mock test 覆盖所有探测分支（`test_liveness.py` 12 条断言）；
live embedding 调用（`text-embedding-3-small`）网关答 `model_not_found`——**这不是 web 代码错误**，
是它不支持那条具体模型。`llm=capability=real` 已被真链证明。
