# §FE-92 · 删除项目 `ProjectDeleteCard.tsx` `.adp-` 复用——验收记录

## 这次做了什么

`ProjectDeleteCard.tsx`（§74 删除项目）从裸 Tailwind 改为**复用** §FE-87 的 `.adp-*` 族（8 个唯一类）——本片零新 CSS。确认词=项目名原值、公开页 404/快照保留/回收站可恢复——不一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/project-delete-card-visual-style.test.ts → 7 passed
```

零行为恒等：page→`92c28cc1d88fb1b57b28db9c7169f0690c0cc49c7a84c19593d0b7198f2c8bcc`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live DELETE /api/projects/<id> 未实跑（破坏性，未触发）。
