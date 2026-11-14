# §FE-94 · 回收站恢复 `RestoreProjectButton.tsx` `.adp-` 复用——验收记录

## 这次做了什么

`RestoreProjectButton.tsx`（§74 回收站恢复）从裸 Tailwind 改为**复用** `.adp-*`（3 唯一类，零新 CSS）。成功后不写"已恢复"的假状态语义——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/restore-project-button-visual-style.test.ts → 7 passed
```

零行为恒等：page→`f080d95f579f468f26a5021c62cc017c27fac888f9482685ba8d14a25bd33256`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live POST /api/projects/<id>/restore 未实跑。
