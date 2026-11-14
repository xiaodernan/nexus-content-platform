# §FE-76 · 公开分镜页 `storyboard/page.tsx` 原子清零——验收记录

## 这次做了什么

`/n/<handle>/<slug>/storyboard` 剩余裸 Tailwind 清零：`ss-narrow`/`ss-wide880` 容器、`ss-headerCol`/`ss-titleRow`/`ss-shotsList`/`ss-list` 布局、`ss-h1xi`(21px/600)、`ss-backInk`、`ss-body13`、`ss-pre13Ink`/`ss-pre12Ink`、`ss-mono11`、`ss-danger12`、`ss-shotPad`(唯一真生效原子——镜头卡无胖丁 base padding）。§FE-8 基建不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                        → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                               → ESLINT_EXIT=0
npx vitest run apps/web/test/public-storyboard-page-visual-style.test.ts → 9 passed
```

零行为恒等：page→`5d9e9168178f720680f3f44ddde64d2618f13db9dc7909ecce8350bae6e4a941`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live 钉住分镜渲染未实跑。
