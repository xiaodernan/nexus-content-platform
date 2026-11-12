# §FE-28 · `/admin/marketplace` `.am-` 门面化——验收记录

## 这次做了什么

`/admin/marketplace`（举报工单 + 市场审计日志）从全裸 Tailwind 改为 `.am-` 门面族（约 33 行）+
`.adm-*`（denied×2/shell 复用）。`TriageButtons` 的三态处置（受理/结案/驳回）与
409 原样念语义不动；只给 note input 补了 focus-visible 环（基线缺）。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <3 文件> --max-warnings=0                      → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-marketplace-visual-style.test.ts → 13 passed
```

零行为恒等（redact 三步序见测试）：page→`84052785…`，triage→`03379155…`，均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；既有市场相关的 123 集成测试未重跑（皮线不碰域逻辑）。
