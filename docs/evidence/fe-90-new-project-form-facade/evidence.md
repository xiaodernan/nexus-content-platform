# §FE-90 · 新建项目 `NewProjectForm.tsx` `.npf-` 门面化——验收记录

## 这次做了什么

`NewProjectForm.tsx`（§2 新建项目）从裸 Tailwind（5 处）改为 `.npf-` 门面族（5 定义）。零 AI 生成、issues[] join 真话——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/new-project-form-visual-style.test.ts → 9 passed
```

零行为恒等：page→`1c2c07cd09fa38b3abd03d6b60d6d7d4e1f8c3460e3a50fe3a15902c2674cdfd`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live POST /api/projects 未实跑。
