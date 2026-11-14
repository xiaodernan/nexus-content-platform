# §FE-97 · RPG 分支 `RpgPlay.tsx` `.g2-` 复用——验收记录

## 这次做了什么

`RpgPlay.tsx`（§51 RPG 分支渲染入口，与 GamePlay 同义同族）39 处裸原子清零——**复用** §FE-96 的 `.g2-*` 全套（零新 CSS；longest-first 替换防前缀吞并）。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/rpg-play-visual-style.test.ts → 6 passed
```

零行为恒等：page→`fd117da3187f50877875c485ff5d47b6a02736d564879cb414213a9781b83041`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live RPG 分支渲染未目验。
