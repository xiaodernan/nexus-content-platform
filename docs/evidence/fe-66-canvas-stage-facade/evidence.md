# §FE-66 · `CanvasStage.tsx` `.cs-` 门面化——验收记录

## 这次做了什么

`CanvasStage.tsx`（§8 画布外壳：缩放/平移/框选/吸附/8 手柄/污点/padlock/§147 双向裁剪）从全裸 Tailwind（6 处）改为 `.cs-*` 门面族。**Studio 剩余 Studio litter 历史性归零。**零行为：matrix/系列 parse 像素推导——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/canvas-stage-visual-style.test.ts → 9 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @）：page→`5037c3f6917b447075a52920ee702e5d49f887d40875e2c72d53025d841950c5`，与改前（git HEAD）逐字节一致。

## 细节

- **6 张裸原子归零** —— 画布上原生无样式承载，所有像素派发原生 style。本片把所有"页面级"外壳 atom（`fit canvas`/`virtualized`/`empty canvas`/`loader`/mono13/stage）推到双主题 token-safe facade；
- `data-canvas-overlay` z-order 与下面的 padding: 0/aside 派生（screenLive/badgeStyle/resize handles）仍由派发器生成，JS 树和 CSS 数值零 engagement；
- `border-border-subtle` 原原子 `border-[var(--nexus-color-border-subtle)]px` 修正：本片统一收口 `.cs-emptyState` 明规范性一行（**该残片原本不可见，行为上从来不渲染**），不影响渲染结果，只重建像素文字/真相源。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；resize 外壳-OK事件、"空页面 + 框 6 slot" 的 user 渲染实际两态未在本轮重放。
