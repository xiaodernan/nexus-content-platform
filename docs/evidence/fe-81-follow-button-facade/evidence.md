# §FE-81 · 关注按钮 `FollowButton.tsx` `.fw-` 门面化——验收记录

## 这次做了什么

`FollowButton.tsx`（§60 创作者主页关注按钮）从裸 Tailwind（3 处）改为 `.fw-` 门面族（3 定义）。csrfHeaders/POST 流/error 边注语义——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/follow-button-visual-style.test.ts → 9 passed
```

零行为恒等：page→`64a5481439cc92e74eb9e82bb3b6830b3f2abf8a5edb50aae9b2d4860c2868e9`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live POST /api/follow 未实跑。
