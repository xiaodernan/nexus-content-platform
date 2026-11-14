# §FE-74 · `ReportControl.tsx` `.rc-` 门面化——验收记录

## 这次做了什么

`ReportControl.tsx`（§132 举报入口）从裸 Tailwind（9 处字面）改为 `.rc-` 门面族（10 定义）。issues join 回话、两句界面事实、REASONS 七项——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/report-control-visual-style.test.ts → 9 passed
```

零行为恒等：page→`590a2c657d2e2e43e968ef9b17c2825551274d4030340e094f5cb0e346173f92`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live report POST 未实跑。
