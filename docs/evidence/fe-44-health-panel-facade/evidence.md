# §FE-44 · `HealthPanel.tsx` `.hp-` 门面化——验收记录

## 这次做了什么

`HealthPanel.tsx`（§178 项目健康面板，Studio 常驻 + 发布弹层共用）从全裸 Tailwind 改为 `.hp-*` 门面族（约 37 定义）。
零行为：文案/aria/data-health-* 钩子全部不动；STATE_MARK（✓/✗/—）不动；worker 重算路径（useHealthReport）不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/health-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：page→`d3a649c245bc0ca89cbd30ca52e3c1983ce6568221fefe492739419bd69df54d`，与改前（git HEAD）逐字节一致。

## 细节

- chip 字号用字面量 0.625rem（tokens 尺度无 10px 档，FE-37/FE-42 口径一致）。
- `.hp-rowFail` 用 color-mix(danger 10%) 10%：与 Studio 其余 warn/error 行遮罩统一，不新增裸实底。
- `.hp-row` 带 bg-2 作 pass 行底色；fail 行被同优先级 `.hp-rowFail` 重写（文件内出现顺序靠后）。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；健康门禁的 worker 装载路径未在本轮重放（测试用合成 report）。
