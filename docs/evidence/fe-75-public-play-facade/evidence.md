# §FE-75 · 公开可玩页 `play/page.tsx` 原子清零——验收记录

## 这次做了什么

`/n/<handle>/<slug>/play` 剩余裸 Tailwind（16 处）清零：`pp-narrow`(720px 三态空/错态)、`pp-wide`(1180px live 态)、`pp-headerRow`、`pp-h1xi`(21px/600)、`pp-backInk`、`pp-body13`、`pp-list`、`pp-danger12`、`pp-hint11`。叠加于 §FE-7 预存 `.pp-*` 之上。钉住版语义（ADR-0009）、三态分支——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/public-play-page-visual-style.test.ts → 9 passed
```

零行为恒等：page→`75276d27a3f07a30959e42e50e35d20409e51200787ae8e9edc90a2d4feda3c1`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live 钉住文档渲染未实跑。
