# §FE-35 · `/admin/observability` `.am-*` 门面化——验收记录

## 这次做了什么

`/admin/observability`（观测读侧：进程内计数器 + 库里三本账跨重启）从全裸布局 atom 改为 `.am-*` 补件
（`.am-shellGapXl`/`.am-tableNarrow`/`.am-monoMuted`/`.am-headRowTight`/`.am-ledgerTitle`/`.am-ledgerGrid`）；
两张表复用 `.tl-tableScroll`/`.tl-table`/`.tl-thRow`；ledger 首列三元 `j === 0 ? 'am-monoCell' : undefined`。
横滚 region/snapshot()/readLedger(24)/两张表不合并的纪律——原样。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-observability-visual-style.test.ts → 11 passed
```

零行为恒等（redact：EOL 归一 + className 任意形态归一 @）：page→`de5043a1…`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；snapshot/readLedger 未在本轮重放（皮线不碰域逻辑）。
