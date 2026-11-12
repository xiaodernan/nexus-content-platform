# §FE-79 · 搜索框 `SearchBox.tsx` 原子清零——验收记录

## 这次做了什么

`SearchBox.tsx` 剩余裸 Tailwind 六处清零：`se-boxRoot`、`se-pauseNote`、`se-suggestTitle`（truncate 字节级等）、`se-historyRow`、`se-hint11`、`se-clearBtn`（+hover）。建议真实命中、历史本机、GET 免 JS 三个诚实性语义——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json               → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                      → ESLINT_EXIT=0
npx vitest run apps/web/test/search-box-visual-style.test.ts → 9 passed
```

零行为恒等：page→`dffdb64e95d503da137510dfe8bb28d0653c1b4dc71029e9455266626fee63ea`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- 429 暂停/suggest live 未实跑。
