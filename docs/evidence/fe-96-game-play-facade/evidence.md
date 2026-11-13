# §FE-96 · 游戏 HUD `GamePlay.tsx` `.g2-` 门面化——验收记录

## 这次做了什么

`GamePlay.tsx`（§51 HUD/Quest/事件流/Playtest chrome）38 处裸原子清零：`.g2-*` 24 定义（col/hud/canvas/twoCol auto-fit/seedInput/tableWrap/eventList/…）。§54 阻断屏语义、Playtest 降位诊断、provenance 原文——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/game-play-visual-style.test.ts → 8 passed
```

零行为恒等：page→`a286820a0859da1f5e0f720fc229617cbe84ecdaef93ce742168ae14e0c6c9d1`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live playtest 未实跑。
