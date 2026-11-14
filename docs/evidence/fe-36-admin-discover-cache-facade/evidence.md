# §FE-36 · `/admin/discover-cache` `.dc-*`/`.gw-*` 冻结——验收记录

## 这次做了什么

`/admin/discover-cache`（§SC-43 发现页缓存态势）：外层布局/标题/笔记原子从裸 atom 迁入 `.am-*`（`.am-shellXl`/`.am-titleLg`/`.am-subNote`）；
SC-43 的 `.gw-*`/`.dc-*` 十一原语冻结不动；`.dc-ledgerLabel`/`.dc-busHeadline` 两个补充类落在 `.dc-` 段；
`.gw-skeleton` 自带 5.75rem 高（markup 不再携带 `h-[92px]`）。
denial×2/shell/title 全部复用 `.adm-*`/`.am-*`。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <3 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-discover-cache-visual-style.test.ts → 12 passed
npx vitest run apps/web/test/discover-view.test.ts                     → 51 passed（既有，未动）
```

零行为恒等（redact：EOL 归一 + className 任意形态归一 @）：page→`2f1974be…`，panel→`25cdf8a1…`，均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；`describeDiscoverCache`/`isKnownReadout` 未重放（皮线不碰域逻辑）。
