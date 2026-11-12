# §FE-42 · `ContextPanel.tsx` `.cx-` 门面化——验收记录

## 这次做了什么

`ContextPanel.tsx`（§66-71 Context Engine 面板）从全裸 `white/N`/`bg-black`/任意值字典atom/红绿 amber 原子换成 `.cx-*` token 锚定族（超过 40 新类）。workspace/context/八分支pill三态/corpus【整个§49 语料库】三处零行为 unchanged。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                  → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/context-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL//s 归一 + className 任意形态归一 + cn()整体归一）：page→`9a24d764d1bd607c717cd07e1f3fee8a441b25f0e82acb41317acebe153c5fec`，与改前（git HEAD）逐字节一致。

## 事故记账

- 本片在 **同一行**内同时失败过两次：① `--nexus-font-size-10` 不在 tokens 里（使用字面量 `0.625rem` 与 FE-37 一致）；② 零行为 hash 钉错（test 的 redactClasses 忘记 `.replace(/className=("@"|\{@\})/g, 'className=@')` 最后一行——RED/green cycle 中发现并修正）。
- **`.workbuddy/memory/2026-11-12.md` 文件被 git 警告 "CRLF will be replaced by LF" 提示**：本编辑器日志，不动。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；load 走 `/api/projects/:id/context` 未在本轮重放；语料库分块也未重放。
