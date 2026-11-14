# §FE-98 · 未接线空态 `PlayByKind.tsx` `.pk-` 门面化——验收记录

## 这次做了什么

`PlayByKind.tsx`（§14 kind-not-wired 诚实空态）从裸 Tailwind（5 处）改为 `.pk-` 门面族（5 定义）。"还没有可玩的投影"照实说——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/play-by-kind-visual-style.test.ts → 8 passed
```

零行为恒等：page→`6148c8d38cf2e46abbd26dd05f1d3ab883ab633c69770478ddfe52eef03c61d8`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
