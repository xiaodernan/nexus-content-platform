# §FE-20 · `/api-tokens` `.at-` 门面化——验收记录

## 这次做了什么

把 `/api-tokens` 公开 API 凭据页（`page.tsx` + `ApiTokensPanel.tsx`，49 处 className）从全裸
Tailwind 平铺改为 `.at-` 门面族；`globals.css` 插入 `.at-*` 视觉段（`.notif-` 段之后，~70 行 CSS）；
新增静态门测试 `apps/web/test/api-tokens-visual-style.test.ts`（16/16 绿）。行为、文案、
data 钩子、CSRF/签发/吊销/试一下语义一字不改。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json        → TSC_EXIT=0
npx eslint <3 个变更文件> --max-warnings=0        → ESLINT_EXIT=0
npx vitest run apps/web/test/api-tokens-visual-style.test.ts  → 16 passed
npx vitest run apps/web/test/api-tokens.test.ts                → 19 passed
```

零行为恒等：panel 剥 className 后 SHA256 与改前（git HEAD）一致：
`6ae5d7c55c769ceb1a19f793665798f1e312a46ff6573b7592ff26a228f0904e`（redact 三步序见测试注释）。

## 判据结构（16 门）

server 组件门 / client 保留（panel）/ 字面类全 at-*/ template 只认 at-td+三状态色 / 零裸 Tailwind /
类名闭环 / 成规模≥28 / 零 hex / token 全在 tokens.css / 零新增颜色 token / 零 transition /
零 @media / focus-visible+disabled / SHA256 守恒 / 21 数据钩子守恒 / 诚实文案守恒。

## 边界（如实）

- 浏览器那一寸（真渲染、深/浅主题、`playwright screenshot`）未做——本会话不连 desktop browser。
- e2e 未跑；只保证静态门 + 既有 19 单测绿。
- 面板仍无 `@media`：行为与基线一致，不是缺陷，也不是"补齐了响应式"。
- 并行会话文件（apps/web/src/lib/env.ts、test/env.test.ts、
  src/server/ai/health-cache.ts、test/ai-health-cache.test.ts、docs/adr/0171-*.md）未碰、未提交。
