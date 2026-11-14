# §FE-31 · `/admin/audit` `.am-*`/`.tl-*` 门面化——验收记录

## 这次做了什么

`/admin/audit`（§80/§84 审计事件）从全裸 Tailwind 改为 `.am-*`+`.tl-*` 门面（复用 +
`.am-shellWide` / `.am-detailMin`）。六列宽表格、390 横滚 + 键盘可达、denied×2——原样。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json               → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                      → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-audit-visual-style.test.ts → 9 passed
```

零行为恒等（redact 三步序见测试）：page→`199d910c…`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；审计写入/导出链路未重跑（皮线不碰域逻辑）。
