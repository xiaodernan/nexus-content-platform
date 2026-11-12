# §FE-67 · `published/[slug]/page.tsx` `.np-` 门面化——验收记录

## 这次做了什么

公开分享页（`/n/<handle>/<slug>`）从全裸 Tailwind（17 处）改为 `.np-*` 门面族。
访问者打开 NEXUS 分享链接的唯一表面；红/黄/绿三态投放 `?viewport=` 自动选档 `auto` 由媒体查询选一份——不 JS、不登录、不 noindex (unlisted 才是)。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                           → TSC_EXIT=0
npx eslint 'apps/web/src/app/n/…/page.tsx' + test 文件 --max-warnings=0  → ESLINT_EXIT=0
npx vitest run apps/web/test/published-page-visual-style.test.ts       → 9 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @）：page→`216de1f858cbd61d0e09ef82840ed08d8e11ceca6701e25cd4acd11cd5aadf43`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser、未截任何截图。
- e2e/viewport=auto 四档媒体查询未在本轮验证——与 Studio policies §FE-61 §14 的 verdict 等同。
