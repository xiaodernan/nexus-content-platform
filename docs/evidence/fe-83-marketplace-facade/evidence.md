# §FE-83 · 市场店面 `marketplace/page.tsx` 原子清零——验收记录

## 这次做了什么

`marketplace/page.tsx` 剩余裸 Tailwind 九处清零：`mk-pageRoot`(1080px/100vh)、`mk-col2`、`mk-h16`、`mk-grid`(1fr)、`mk-sectionTop`×2、`mk-mt4`、`mk-mineList`、`mk-hint11`、`mk-hint12`。列表只出 public/free、我的物品所有者读路——谓词一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/marketplace-page-visual-style.test.ts → 9 passed
```

零行为恒等：page→`7e92d21dea7ffc2cc71ff5d1311be10e32e92c4b06d6e45cc9b6d0c861c273bd`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live marketplace 读路（含下载限度计数）未实跑。
