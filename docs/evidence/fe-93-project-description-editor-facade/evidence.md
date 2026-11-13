# §FE-93 · 项目简介 `ProjectDescriptionEditor.tsx` `.pe-`/`.adp-` 复用——验收记录

## 这次做了什么

`ProjectDescriptionEditor.tsx`（§49 项目简介）从裸 Tailwind 改为**复用** §FE-87/91 的 `.adp-*`/`.pe-*`（9 个唯一类），本片仅新增 `.pe-monoHint` 与 `.adp-btnSm:disabled` 两处增量（后者不影响任何既有调用——已逐行确认）。空串="清空"而非"没改"语义、展开前收起语义——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/project-description-editor-visual-style.test.ts → 7 passed
```

零行为恒等：page→`15830c42919d01e746852a3dc53e349604c3e6f7c604891afbad08be8308df9b`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live PATCH /api/projects/<id> 未实跑。
