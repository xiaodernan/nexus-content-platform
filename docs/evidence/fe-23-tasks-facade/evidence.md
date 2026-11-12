# §FE-23 · `/tasks/[projectId]` `.tl-` 门面化——验收记录

## 这次做了什么

`/tasks/[projectId]`（§112 任务账本活半页）从全裸 Tailwind 改为 `.tl-` 门面族：
`components/TasksLedgerLive.tsx`（表 + 实时订阅）+ `components/TaskRetryButton.tsx`（每行重试）。
路由 page.tsx 本来零样式，本片零改动。globals.css 新增约 22 行 `.tl-*`（`.iv-` 段之后）。
显式保留：表格 `border-separate` 默认间距（不补 padding/border）、横滚区 `role="region"`+`tabIndex={0}`
（键盘可达）、实时 chip、重试按钮细边框。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json               → TSC_EXIT=0
npx eslint <3 文件> --max-warnings=0                     → ESLINT_EXIT=0
npx vitest run apps/web/test/tasks-visual-style.test.ts  → 13 passed
npx vitest run apps/web/test/tasks-ledger.test.ts        → 22 passed（既有）
npx vitest run apps/web/test/tasks-ledger.integration.test.ts → 22 passed（既有）
```

零行为恒等（redact 三步序见测试）：TasksLedgerLive.tsx→`1e7aa68d…`，TaskRetryButton.tsx→`b90012c2…`，
page.tsx→`bd7e0e61…`，均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸（真渲染/深浅主题/截图）未做：本会话不连 desktop browser。
- 既有 tasks-ledger 单测/集成（44 例）绿；e2e 未跑。
- 零 @media 是有意保持行为与基线一致；横滚区+min-width 策略原样保留。
