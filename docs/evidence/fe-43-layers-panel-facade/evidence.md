# §FE-43 · `LayersPanel.tsx` `.ly-` 门面化——验收记录

## 这次做了什么

`LayersPanel.tsx`（§5 图层树）从全裸 Tailwind 改为 `.ly-*` 门面族（约 24 条）。行结构、键盘语义、
多选/拖拽/重命名/过滤都原样。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/layers-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`a3ae9c9b…`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；图层树重命名/落锚未在本轮重放。
