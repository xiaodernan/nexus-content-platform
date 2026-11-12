# §FE-26 · `/admin` 总览 + AdminNav `.adm-` 门面化——验收记录

## 这次做了什么

`/admin`（§A11Y-4 总览：denied×2 + 十卡矩阵）与 `components/AdminNav.tsx`（磨砂胶囊导航 11 入口）
从全裸 arbitrary atom 改为 `.adm-*` 门面族（约 40 行 globals.css，`.pv-` 段之后）。
删唯一行为面：`const ITEM` 未再使用的模板常量（3 行，§A11Y-3 遗留；语义全并入两个 CSS 定义）。
`group`/`group-hover:` 工式标记 → 后代选择器（`.adm-card:hover .adm-cardTitle`）。
`admin-home-style.test.ts` 三条老门就地迁移到 `.adm-` 段（其余七条原判据原样）。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json                  → TSC_EXIT=0
npx eslint <4 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-hub-visual-style.test.ts  → 15 passed（新判据）
npx vitest run apps/web/test/admin-home-style.test.ts        → 10 passed（旧判据迁移后）
```

零行为双门（redact：className 任意形态归一 + 注释占位）：
- page.tsx `2731ed49…` == HEAD 原样；
- AdminNav.tsx `a1c6b390…` ==「HEAD 雕刻 ITEM 块后」的值（雕刻块本体逐字断言 HEAD 里确实存在）。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。灯影玻璃化（backdrop-blur）在 headless 环境下
  视觉回归未截图；两条 @media（40/64rem）未目视。
- admin 其余 18 文件未动（realtime/users/marketplace/…），按后继 FE-27.. 收尾。
- e2e 未跑；既有 capture-admin-home.mts 走 data 钩子，不受皮线影响。
