# §FE-58 · `GameGraphView.tsx` `.wg-` 复用——验收记录

## 这次做了什么

`GameGraphView.tsx`（§52 Game Design System 图视图。§44 世界图同一 SVG 系列：拖拽 / 删除 / 派发）从全裸 Tailwind（20 处）改为 **`.wg-*` 零新增 CSS 复用**（§FE-57 既成族）。
HTML/CSS 行为零变更（唯一代码变更 `ml-auto font-mono text-11`→`wd-monoFaintEnd` cn 三元重钉）。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/game-graph-view-visual-style.test.ts → 8 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`75c1fd00a82746799bdcee944fdb31652ddc10b7f9081b19ef679bc510acd4d7`，与改前（git HEAD）逐字节一致。

## 细节

- `.wg-head`/`wb-blk` —— `.wg-*`§FE-57 既有族；`emptyState` 的 `justify-center` 等。
- `GAME_KIND_FILL` 保留原 hex（用户本色数据）；`KIND_FILL` 未知回落 `#20242e` 保留——`hex 判据只拦 CSS 段`。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；graph pick/unpick 未在本轮重放。
