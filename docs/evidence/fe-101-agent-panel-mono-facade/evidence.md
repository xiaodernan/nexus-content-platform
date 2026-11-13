# §FE-101 · AgentPanel 残余裸原子收尾——验收记录

## 这次做了什么

全树普查（census2/precise/4 三个脚本）只剩一处裸原子：`AgentPanel.tsx:221` 的 `cn('font-mono text-12', …)` → `cn('ag-monoOnly', …)`（新增 `.ag-monoOnly`：仅复刻 font-family，不含 size/color——tone 类决定那些）。

## 验证（本地实跑，2026-11-13）

```
npx vitest run apps/web/test/agent-panel-visual-style.test.ts → 10 passed（SHA256 门不变：2903b96cf86b79aceb0cbe9bc214d1a44e21836df1594d25b408b8f926006183）
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint apps/web/src/studio/AgentPanel.tsx --max-warnings=0 → ESLINT_EXIT=0
node census2.cjs / census3.cjs / census4.cjs              → 无 className 裸 Tailwind 残余（余项均为注释/函数体字面）
```

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- 普查脚本是字面级的——`cn()` 内联参数、常量模板串里的“"语法只能靠人工复核；本片逐处已看（见 ADR-0254）。
