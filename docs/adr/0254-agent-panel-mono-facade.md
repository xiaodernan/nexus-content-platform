# ADR-0254：§FE-101 `AgentPanel.tsx` 残余裸原子收尾（`font-mono` → `.ag-monoOnly`）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-62 / §FE-100 · `apps/web/test/agent-panel-visual-style.test.ts`（SHA 不变） · `docs/evidence/fe-101-agent-panel-mono-facade/evidence.md`

## 背景

FE-100 之后全树原子普查（三个 sweep 脚本：census2/precise/4）只剩一处真原子：`studio/AgentPanel.tsx:221` 里 `cn('font-mono text-12', REAL_TIME_TONE[realtime.state] ?? 'ap-faint')`。
`REAL_TIME_TONE` 三个 tone 类都**不含 font-family**——`font-mono` 是唯一生效的来源，不能直接删。

## 决定

1. 新增 `.ag-monoOnly { font-family: var(--nexus-font-mono); }`（globals.css，§FE-101 小锚，`.ww-swatchLg` 之后）——**只**复刻原来 `font-mono` 那一件事的生效语义；不带 font-size/color（它们由 tone 类决定，加了会破坏 unlayered 竞争次序）。
2. `cn('font-mono text-12', …)` → `cn('ag-monoOnly', …)`。
3. **FE-62 的 SHA256 门天然覆盖**——`cn(...)` 在 redact 里整体归一为 `cn()`，所以 AgentPanel 文件哈希**零变化**：`2903b96cf86b79aceb0cbe9bc214d1a44e21836df1594d25b408b8f926006183`，该测试 10/10 原样绿。
4. 零新增颜色 token；零 hex；tokens 全声明（`--nexus-font-mono`）。

## 取舍

- 不造 `.ag-mono12`（之前 `.vb-mono12` 明明白白带 color——会改变竞争次序）；
- StudioShell `left-[44px]` 是注释里的量词（`//` 行内），不属于 className 范畴——不动；
- AdminNav / GameGraphView / CanvasStage 普查残余全为注释/函数体字面，非 className——不动。

## 后果

`apps/web/src` 全树 **className 字面零裸 Tailwind**（以三个普查脚本为准，2026-11-13 实测）。表态：门面矩阵全构件收数。
