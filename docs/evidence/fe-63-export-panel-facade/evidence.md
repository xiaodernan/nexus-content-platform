# §FE-63 · `ExportPanel.tsx` `.pb-*` 复用——验收记录

## 这次做了什么

`ExportPanel.tsx`（§58 Export 打包面板——SE/Surface Engine submit 按钮、SUBMIT 的 `text-left` 摘要文本样式）从全裸 Tailwind（20 处）改为 **`.pb-*` 既存族复用**（FE-54）+ 新增 `.pb-popPanel360`（360px 弹层形态，520px 那档唯一 @media）+ `.pb-runBtn`（accent-2 实底 + `:disabled` 昏暗 .5）。
零行为：PARTS/SUBMIT textContent/CSRF/fetch/run() 路径——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/export-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一 + HEAD 雕刻 cn 一行）：
carved-HEAD === 改后 redact（`8cf979c52c94923126781ccdcbb96c0691c6dfbd7f2b67176d836466a80dac87`）。测试内嵌雕刻判据（不钉死绝对常量路径——直接 prove carved-HEAD ≡ curr）。

## 细节

- `.pb-popPanel360`：`max-width:360px/max-h-[72vh],border strong,shadow-lg` → 520px 下 same-pattern `position: fixed; left/right: 12px; top: 52px; width: auto`（与 PublishPanel 同位置纪律，仅宽量=360px）；
- `.pb-runBtn`：`flex-1` min-w 0 text-left leading-tight（导出摘要视觉常驻）；
- `cn` 一行在只一处 call（submit 按钮）被替换线程后，全文件未再消费它——FE-45/53/56 同口径（头上 eslint 抓出 dead import，删掉）。

## 事故记账

- 一次性替换误把 `textContent` `run()` 路径当成 className 值替；`sed` 后 tsc 看着报了但很快确认只有 ESLint `cn` 一项——和 FE-45/56 同型 **"cn 雕刻到底、js 死代码判据"** 的强制执行。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；Submit dispatch 路径、PARTS 选择逻辑未在本轮重放。
