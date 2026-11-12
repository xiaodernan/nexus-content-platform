# §FE-48 · `WorldPanel.tsx` `.wd-` 门面化——验收记录

## 这次做了什么

`WorldPanel.tsx`（§44 World Builder：九类世界条目 CRUD + 3D 模型饰@ 选择 + 高 plateau 生殖参数 + 条目连接线计数）从全裸 Tailwind（55 处）改为 `.wd-*` 门面族（54 定义）。
零行为：nine-kind WORLD_KINDS/labels 表、`worldStore.ensure` 项目对齐、`edit` 模式、modelId 一致性校验——全部不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/world-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`ee3fadec114cbdfccb569f7f57be756957c2847401a8f076e980bb7137e3c905`，与改前（git HEAD）逐字节一致。

## 细节

- save-state 徽标拆 `.wd-monoFaintEnd` + `.wd-dangerText`；state badge 的 `:disabled` 未排序（原原子未带 `:disabled`），维持。 
- `mt-2 text-[11px]` 构成的 one-off 行（`wd-dangerMt2`）承当 `mt-2`+danger；
- placeholder/row label `加载中` 等 STATE_TEXT 不动。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；九类 CRUD/模型选择/世界元数据台会话未在本轮重放。
