# §FE-89 · 导入面板 `ImportPanel.tsx` `.ip-` 门面化——验收记录

## 这次做了什么

`ImportPanel.tsx`（§144 NO LOCK-IN 反向那一寸）从裸 Tailwind（20 处）改为 `.ip-` 门面族（17 定义）。"每一个数字来自服务端回执""拒收逐条列 issues""资产失败点名"——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/import-panel-visual-style.test.ts → 9 passed
```

零行为恒等：page→`741a5c91de6b93015d8ddd4a4aedc0025eda55867812b5a81140ded2bb208948`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live 导入（POST /api/projects/import，真实 zip）未实跑。
