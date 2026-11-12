# §FE-52 · `SketchPad.tsx` `.sk-` 门面化——验收记录

## 这次做了什么

`SketchPad.tsx`（§38 Sketch → Image 绘制面：草图原料采集）从全裸 Tailwind（11 处）改为 `.sk-*` 门面族（12 定义）。
本片纪律：白纸是内容色——`.sk-paper { background: #fff }` 是全片唯一写死 hex（canvas 底 `fillStyle='#ffffff'`，两主题一致，与墨迹 `#101014` 同源）；`PAD_SIZE=240`、`INK='#101014'`、`lineWidth=3`、`touchAction:'none'`——全部原样。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/sketch-pad-visual-style.test.ts  → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @）：page→`e6fa416efb21d02cb96586cc4e62d84a9571c6f93fd22cd2e8c60041219dac33`，与改前（git HEAD）逐字节一致。

## 细节

- `.sk-primary`（`bg-bg-3` + mono text-11 + 无 border）承载"从草图生成（DEMO · 扣 2 点）"按钮；`:disabled` 昏暗 .5；
- `.sk-btn` 承载"撤销一笔 / 清空"两颗危险度低的幽灵键；`:hover bg-2`；
- `.sk-row1` 只有 `display:flex; align-items:center; gap: space-1`——撤销+清空+计数行局部；
- 白纸注释进了 globals 段头（"SketchPad 段应有白纸=内容色的记账注释"有判据守）。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；绘制/toBlob/submit 路径未在本轮重放。
