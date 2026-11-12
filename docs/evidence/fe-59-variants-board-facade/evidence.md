# §FE-59 · `VariantsBoard.tsx` `.vb-` 门面化——验收记录

## 这次做了什么

`VariantsBoard.tsx`（§29 多方案并排比较板）从全裸 Tailwind（30 处）改为 `.vb-*` 门面族（40 定义）+ 复用族。
零行为：studio.switchBranch(§28) 派发 / task 锁 checkProvider 路径 / DEMO 不假装出现——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/variants-board-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`7d791e4951e30d9be870caf48d1c94499c1915698857ded1a1a889486f5a941e`，与改前（git HEAD）逐字节一致。

## 细节

- `.vb-grid` 保留 `grid auto-fill minmax(360px,1fr)` 字样（custom-properties，零 token）；
- `.vb-pickBtn` 双态：pickOn(实底 bg-3 fg-1)/pickIdle(fg-3/hover bg-2)；`.vb-adoptLive` 同；`.vb-adoptCurrent` 为 cursor-not-allowed fg-3。
- `.vb-warnMt2` 对照 text-warn-ink 承载"并行态冲突"的明确提示。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；switchBranch dispatch + 自然 scroll 未重放。
