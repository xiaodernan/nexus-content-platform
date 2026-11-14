# §FE-21 · `/blocks` `.bk-` 门面化——验收记录

## 这次做了什么

`/blocks`（§132 我的已拉黑/已屏蔽清单）从全裸 Tailwind 改为 `.bk-` 门面族：
page.tsx（server，requireUser + force-dynamic）+ UnblockButton.tsx（唯一 client 交互面）。
globals.css 新增约 25 行 `.bk-*`（`.at-` 段之后）。零行为：文案、data 钩子、读路径、CSRF 一字不改。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json                  → TSC_EXIT=0
npx eslint <3 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/blocks-visual-style.test.ts     → 14 passed
npx vitest run apps/web/test/blocks.integration.test.ts      → 11 passed
npx vitest run apps/web/test/blocks-route.integration.test.ts → 9 passed
```

零行为恒等（redact 三步序见测试）：page.tsx→`05890c4b…`，UnblockButton.tsx→`6b50e8c5…`，
均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸（真渲染/深浅主题/截图）未做：本会话不连 desktop browser。
- e2e 未跑；既有 blocks 单测/route 集成测试（20 例）绿。
- 零 @media 是有意保持行为与基线一致，不是遗漏。
