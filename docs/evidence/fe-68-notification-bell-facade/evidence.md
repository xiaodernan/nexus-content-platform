# §FE-68 · `components/NotificationBell.tsx` `.nb-` 门面化——验收记录

## 这次做了什么

`NotificationBell.tsx`（§163 实时 + §164 顶栏铃铛，公开/Studio/Marketplace 页顶 header 一条共用）从全裸 Tailwind（4 处）改为 `.nb-*` 门面族（3 定义）。零行为：useRealtime/onReconnect/refresh 四名——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                    → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                           → ESLINT_EXIT=0
npx vitest run apps/web/test/notification-bell-visual-style.test.ts → 9 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @）：page→`4e478645cce2ae54b6a9a79cbfaf00369aa5daaab763985eb5f2e1bfbd72e364`，与改前（git HEAD）逐字节一致。

## 细节

- `text-11 text-fg-3` × 3 → `.nb-faint`；`flex flex items-center gap-2` → `.nb-row`；`text-accent-2-ink underline` → `.nb-link`；
- `.nb-link` 无 `:hover`、无 transition，符合本片"铃铛节制"；
- 钩子守恒 5 项：failed/loading/ready（三态）+ unread + realtime。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；未验证 401/429/500 三态 stub。
