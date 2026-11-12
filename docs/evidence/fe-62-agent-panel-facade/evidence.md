# §FE-62 · `AgentPanel.tsx` `.ag-` 门面化——验收记录

## 这次做了什么

`AgentPanel.tsx`（§112/§29 上架前这份多步作业的面板）从全裸 Tailwind（39 处）改为 `.ag-*` 门面族（23 定义）+ 复用族。
**首次共存**：`STATUS_TONE`/`REAL_TIME_TONE` 两 Map 值从 raw Tailwind 字符串改为 facade 命名——分段参与 hash 守恒（cn() 雕刻只管理 className 值不管理 Map 本身）。tone 等价（`text-fg-3`→`ap-faint`/`text-accent-2-ink`→`ag-accent2Ink`），不新增任何颜色。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/agent-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一 + 两组 tone Map 雕刻 `@TONE`）：page→`2903b96cf86b79aceb0cbe9bc214d1a44e21836df1594d25b408b8f926006183`，与改前（git HEAD）redact 字节一致。

## 细节

- `STATUS_TONE`：`pending→ap-faint`、`running→ag-accent2Ink`、`done→hi-ink`、`failed→wd-danger11`、`skipped→cp-warn11`；
- `REAL_TIME_TONE`：`idle→ap-faint`、`connecting→cp-warn11`、`open→ap-faint`、`closed→wd-danger11`；
- `.ag-runBtn`（'跑着…'/'跑一次检查'）→ accent-1→accent-2 热格，busy=gate 背景 bg-3；
- `.ag-dangerCallout` = color-mix(danger 10%) 饱和底，与 studio 其它 `.stg-*` risk row 同纪律。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；accept-step dispatch failure 路径（patch 拒绝）未重放。
