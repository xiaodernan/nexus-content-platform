# §FE-85 · 主题 FAB `ThemeToggle.tsx` `.tt-` 门面化——验收记录

## 这次做了什么

`ThemeToggle.tsx`（§120 暗↔浅 FAB）从 21 个裸原子（fixed/z-40/backdrop-blur/9999px 正圆/36px）改为 `.tt-fab`（color-mix 90% bg-2、8px blur、hover 提升 ink、focus-visible accent 环）。水合屏障 `data-theme-toggle-ready`、localStorage 静默失败——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/theme-toggle-visual-style.test.ts → 8 passed
```

零行为恒等：page→`985713fd22f0a5761ce7a17e9f11f9e1dcabfb82f471c916e9b6fe7dc6f5e0d3`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- 双主题实渲染未目验。
