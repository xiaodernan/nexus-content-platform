# §FE-82 · 自助治理 `BlockControl.tsx` `.bc-` 门面化——验收记录

## 这次做了什么

`BlockControl.tsx`（§132 主页屏蔽/拉黑）从裸 Tailwind（6 处）改为 `.bc-` 门面族（6 定义）。POST/DELETE 谓词、router.refresh、mute≠block 文案——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/block-control-visual-style.test.ts → 9 passed
```

零行为恒等：page→`3825924d5d5949b2c0eb952e4fb0dd5ea1b55a5cb77a4775ea14fa12a47adfb3`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live /api/blocks 未实跑。
