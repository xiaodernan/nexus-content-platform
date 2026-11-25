# 新手漫游端到端复核（2026-11-21）

真浏览器（Playwright，1440×900）打开 `/onboarding`，逐个点击 7 个步骤的 `[data-onboarding-done]`：

| 检查点 | 实测 |
|---|---|
| 步骤数 | 7 |
| 进度文本 | `7 / 7` |
| 各按钮 `aria-pressed` | 7 个全 `true` |
| localStorage `nexus-onboarding-done` | 已写入（97 字节） |
| 刷新页面后进度 | 仍是 `7 / 7` |
| pageerror | 0 |

注意：按钮是**开关**（toggle）而非一次性标记，重复点同一个会取消；脚本按索引逐一点七个不同按钮。
回归脚本：`.scratch/onboarding-e2e2.mjs`。
