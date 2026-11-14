# §FE-49 · `GamePanel.tsx` `.gp-`（+ 复用 `.wd-*`）门面化——验收记录

## 这次做了什么

`GamePanel.tsx`（§54 Game Design System：11 类实体 + 开放数值 + 有向引用）从全裸 Tailwind（52 处）改为 `.wd-*`（复用 §44 面板族谱，39 原子）+ `.gp-*`（补 19 个专有原子）。
零行为：gameStore.ensure/edit、GAME_KIND_STATUS/AGENT 分支、linkEntities/removeRef/countRefsFor——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/game-panel-visual-style.test.ts → 11 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`ad814925e156832577e25e0349514d46f76ad776c045bf98761ee4de1768832d`，与改前（git HEAD）逐字节一致。

## 细节

- 复用决策：`.wd-*` 的 §44 面板族谱 vs §54 的 52 处裸原子——完全对应，同一族谱（wd- 进入从 WorldPanel 被 GamePanel 直接消费）。只为 §54 专有原子新开 `.gp-*`（19 定义，`.gp-*` 段紧跟 `.wd-*` 段尾）。
- 对应语义：`wd-growBasis` 吃了 `basis-28`（7rem）与 `max-w-full`（max-width:100%）；`wd-ghostBtnSm` 只替换圆角（borderless 3px），hover→bg-3 不 bg-2。
- `.gp-hrMt` 对照 `mt-2 border-t pt-1`；`.gp-tag` 对照 `mt-2 inline-block` 尾部的 AGENT 已落标签；`.gp-warnMt2` 对照 `mt-2 text-11 text-warn-ink`。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；linkEntities/removeRef/linkEntities→reference/refCount 未在本轮重放。
