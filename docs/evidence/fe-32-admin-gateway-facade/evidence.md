# §FE-32 · `/admin/gateway` `.gw-*` 冻结——验收记录

## 这次做了什么

`/admin/gateway`（§SC-40 网关态势）：外层布局/排版原子（`flex`/`gap-5`/`max-w-[1180px]`…）迁入 `.am-*`
wrapper/layout 族；SC-40 的 `.gw-*` 九种视觉原语冻结；`.gw-root` 死 marker 删除；
`.gw-skeleton` 自带 5.75rem 高度（markup 不再写 `h-[92px]`）；新增 `.gw-ident(2)`（mono+tabular-nums+fg-1/2）。
denial×2 复用 `.adm-*`。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <3 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-gateway-visual-style.test.ts → 13 passed
npx vitest run apps/web/test/gateway-view.test.ts gateway-pure gateway-client → 54 passed（既有）
```

零行为恒等（redact：EOL 归一 + className 任意形态归一 @）：page→`be946472…`，panel→`7922f441…`，均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；网关 smoke（verify:gateway）未重跑。
