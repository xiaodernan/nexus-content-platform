# §FE-29 · `/admin/moderation` `.am-` 门面化——验收记录

## 这次做了什么

`/admin/moderation`（§131 人工复核台）从全裸 Tailwind 改为 `.am-` 族（复用 + 8 个小件）：
denied 分支宽逐字（45rem/61.25rem）、`listReviewQueue()` 与 MODERATION_LIMITS 的呈现、机检覆盖不到的部分明写、
findings rule mono、拒绝=danger 锚。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json              → TSC_EXIT=0
npx eslint <3 文件> --max-warnings=0                    → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-moderation-visual-style.test.ts → 11 passed
```

零行为恒等（redact 三步序见测试）：page→`585733e5…`，resolve→`1917a942…`，均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；机检规则与裁决链路未重跑（皮线不碰域逻辑）。
