# §FE-46 · `StoryboardPanel.tsx` `.sb-` 门面化——验收记录

## 这次做了什么

`StoryboardPanel.tsx`（§40-42 分镜面板：Prompt → Storyboard → Shot list → Timeline 的界面入口）从全裸 Tailwind（96 处）改为 `.sb-*` 门面族（71 定义）。
时间线三态（moving/dropTarget/last-child）拆三 class；零行为：className 替名 + cn 三元拆分，文案/data 钩子/STATE_TEXT/slice 派生全部不变。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/storyboard-panel-visual-style.test.ts → 10 passed（含一次 matcher 修复）
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`3919d8045dd014960534b03986e6b0200b056ef1765303fb4fb27289aa820082`，与改前（git HEAD）逐字节一致。

## 事故记账

- 判据 matcher 初版只认 `.sb-x{` / `.sb-x{` 与 `.sb-x,`——`.sb-dis40:disabled` 这种带伪类、仅 `:disabled` 修饰的定义不被计入"有基础定义"，
  首轮红：expected [`sb-root`…] to include `sb-dis40`。修：allowed `:` as class-name delimiter in the defined matcher（带伪类/组合器的定义也算该类的定义）。全部复绿。
- `flex flex-col gap-2` 那条 defensive pair 未命中——真实字符远小于它（段是 p-[var(--nexus-space-3)] 变体），与之相关的 miss=1 已完整审计确认无遗漏。
- 本片未用任何颜色/尺寸类 hex 字面量；`text-10`/`max-w-[480px]`/`max-w-[110px]`/`h-9`/`bottom-[3px]`/`right-[10px]`/`w-[8px]` 全部等价量化（px→rem）。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；时间线分镜/拖拽/双击分镜等交互路径全部未在本轮重放。
