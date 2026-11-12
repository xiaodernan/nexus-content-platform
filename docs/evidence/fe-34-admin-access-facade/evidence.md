# §FE-34 · `/admin/access` `.am-*` 门面化——验收记录

## 这次做了什么

`/admin/access`（§188 M8 第三片欠格：全局访问账）从全裸布局 atom 改为 `.am-*` 补件（windowNav/windowChip/StrongText/linkImplicit）。
TOP_N 榜、窗口三档、双 CSV 导出不截断——原样。denied×2/表头/表体全部复用 `.adm-*`/`.tl-*`。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json              → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                     → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-access-visual-style.test.ts → 12 passed
```

零行为恒等（redact：EOL 归一 + className 任意形态归一 @）：page→`761cfec7…`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- 端点 export CSV 未在本轮 curl 实跑（皮线不碰域逻辑）。
