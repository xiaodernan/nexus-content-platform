# §FE-73 · `PublicationActions.tsx` `.pu-` 门面化——验收记录

## 这次做了什么

`PublicationActions.tsx`（§59 作品页互动条：Like / Follow / Remix / Save / Share / Comment）从裸 Tailwind（18 处字面）改为 `.pu-` 门面族（13 定义）。busy gating / CSRF / notice 真话语义一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                     → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                            → ESLINT_EXIT=0
npx vitest run apps/web/test/publication-actions-visual-style.test.ts → 9 passed
```

零行为恒等：page→`23a9bb100afeb26e6bd8c43f7fabbef2655d3257ea69facefe10b2cead9b66cf`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live interact（点赞/评论/分叉）未实跑。
