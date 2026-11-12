# §FE-87 · 注销面板 `AccountDeletionPanel.tsx` `.adp-` 门面化——验收记录

## 这次做了什么

`AccountDeletionPanel.tsx`（§144 注销入口）从裸 Tailwind（22 处字面）改为 `.adp-` 门面族（15 定义）。注销≠删除收据、清单现取、确认词可见的失败、不强制导出——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/account-deletion-panel-visual-style.test.ts → 9 passed
```

零行为恒等：page→`c9eb10c380f18243a4ba4cdecd134037ca2547ec425cc7aa6b2c26b1aca9e714`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live DELETE /api/account 未实跑（破坏性，未触发）。
