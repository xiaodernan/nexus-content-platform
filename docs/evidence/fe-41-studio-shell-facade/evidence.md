# §FE-41 · `StudioShell.tsx` `.se-` 门面化——验收记录

## 这次做了什么

`StudioShell.tsx`（创作台外壳）从全裸 Tailwind 改为 `.se-*` 门面族（约 42 类）。
三态翻转（`railOpen` / `inspectorOpen` / `inspectorFolded`）随原有逻辑原样；四个持久化线（load/flush beforeunload）和六个保险丝不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                  → TSC_EXIT=0  (修完 parallel c866cf32 的 NODE_ENV readonly 后)
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/studio-shell-visual-style.test.ts → 12 passed
npx vitest run apps/web/test/ai-client.test.ts                → 13 passed (parallel c866cf32 的 5 臂修绿)
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一、cn()整体归一）：page→`52806156…`，与改前（git HEAD）逐字节一致。

## 事故记账（parallel c866cf32 善后）

- `c866cf32`（并行会话）落了 dev-模式 aiServiceUrl 缺省 + 5 臂新判据 → 其测试文件 `ai-client.test.ts` 用 `delete process.env.NODE_ENV` 触发 `@types/node` readonly → `tsc -p apps/web` 直接红。
- 本片顺手修：`process.env` 改写经 `Record<string, string|undefined>` 断言；5 臂保持（13/13 绿）。该片未被改走、未被抢 commit。
- **client.ts 不在本片提交里**：依然未并入；平行会话自己可以选择重跑并入（需要 authorization）。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；Studio 拖拽/具体缩放/Profiler 回调的真实性能未在本轮重放。
