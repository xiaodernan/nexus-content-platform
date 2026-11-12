# §FE-50 · `HistoryPanel.tsx` `.hi-` 门面化——验收记录

## 这次做了什么

`HistoryPanel.tsx`（§27/§108 用户项目历史 Snapshot 面板：快照列表 + compare/restore + 分支切换 + jumpTo）从全裸 Tailwind（49 处）改为 `.hi-*` 门面族（64 定义）。
零行为：STATE_TEXT / restore 二次确认 / jumpTo/DiffRow 派生 / switchBranch / createBranch / duplicateProject——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                         → ESLINT_EXIT=0
npx vitest run apps/web/test/history-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`3a3f9d024bc28f5d53e13062344cffed502aee6d412025f8c832fad6eb2eaf50`，与改前（git HEAD）逐字节一致。

## 细节

- cn 三元映射：kind badge(`removed`/`added`/idle) → `hi-diffBadge` + 三态色；source chip ai→`hi-sourceAi`、else→`hi-sourceIdle`；compare/restore 共用 `.hi-chipSm` 双态，`hi-restoreWarn`(warn) 在 pending 分支；entry current row → `.hi-entryCurrent`。
- `space-y-[2px]` → `display:flex; flex-direction:column; gap:2px`（Tailwind 工具类不进门）；`.hi-diffListCapped` 只在 `entry.diff.length > 0` 时加（`max-height: 15rem` ≈ 240px）。
- `accent-[var(--nexus-color-brand)]` 的 var canonical passthrough → 复用 FE-45 `.pp-checkBrand`，本片不新开。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；restore/compare/branch 全路径未在本轮重放。
