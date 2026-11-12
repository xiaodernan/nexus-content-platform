# §FE-72 · `InteractiveSurface.tsx` `.is-` 门面化——验收记录

## 这次做了什么

`InteractiveSurface.tsx`（`InteractiveHotspots` 热点铺设 + `InteractiveEnd` 走通上报）从裸 Tailwind（3 处）改为 `.is-` 门面族（`.is-hotspot` 三态 box-shadow ring、`.is-endNote`、`.is-endStrong`）。几何（inline style 绝对坐标）与上报逻辑一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                    → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                           → ESLINT_EXIT=0
npx vitest run apps/web/test/interactive-surface-visual-style.test.ts → 9 passed
```

零行为恒等：page→`bc99e41107e15a8352bc183612ee922d8a8a81e436d7a9f12afae83322c13bcb`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- 上报 live（`/api/published/work-complete`）未实跑。
