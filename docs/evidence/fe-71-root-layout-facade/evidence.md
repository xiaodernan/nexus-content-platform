# §FE-71 · `app/layout.tsx` `.rx-` 门面化——验收记录

## 这次做了什么

根布局 `<body>` 从四个裸原子（`min-h-screen bg-bg-0 text-fg-1 antialiased`）改为 `.rx-body`。ThemeScript/theme 的顺序一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/root-layout-visual-style.test.ts → 7 passed
```

零行为恒等：page→`368e57a553c733f940737e533b66a353c50ae58a4deb6fb7b31c3108ff633205`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
