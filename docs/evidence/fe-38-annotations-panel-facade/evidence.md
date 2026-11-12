# §FE-38 · `AnnotationsPanel.tsx` `.np-` 门面化——验收记录

## 这次做了什么

`AnnotationsPanel.tsx`（§111 画布批注、浮在画布上的面板）从全裸 Tailwind 改为 `.np-*` 门面族（约 24 行）。「只钉选中的那一个」「批注不被删除抹掉」「随 AI 请求派生服」三条纪律——原样不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/annotations-panel-visual-style.test.ts → 11 passed
```

零行为恒等（redact 三步序见测试）：`49f6fff9a6e5fe55fcfec76276ef99a6c9d416ec68f83ac443ead3c2decef22f`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑。
