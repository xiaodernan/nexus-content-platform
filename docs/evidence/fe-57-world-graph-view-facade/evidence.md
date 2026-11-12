# §FE-57 · `WorldGraphView.tsx` `.wg-` 门面化——验收记录

## 这次做了什么

`WorldGraphView.tsx`（§45 世界图视图。SVG 渲染有向图 + terrainMode/拖圆台 + 按钮/输入派发）从全裸 Tailwind（27 处）改为 `.wg-*` 门面族（33 定义）+ 复用族。
SVG 顶点本色常量 `KIND_FILL`（9 类世界实体）/ `#20242e` 未知 kind 回落——**用户本色数据**，原样保留（hex 判据放开到这 10 个字面量）；SVG `fill-*` 映射到 `.wg-axis10/11/12`（表达字面量 0.625/0.6875/0.75rem 对应 10/11/12px fill）；CSS 视觉段零 hex。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/world-graph-view-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`e8728bcd470232de38798a7d2dd5585f5e955f36eee4015da4d574e48837590a`，与改前（git HEAD）逐字节一致。

## 细节

- `.wg-selOn` 用 `--nexus-color-accent-2`（bp fg=accent-fg）承载"选中状态" — 与 Studio 相同 accent-brand 语义应用；.wg-blk/crosshair/clickable/grab/grabbing 内联指令完全保留。
- 安全扫描（synthetic / fine）： SVG 上的 `fill-fg-*` 替换为 fill-fg-* （CSS color 属性不会被 TS 视为 fill attribute）。

## 事故记账

- KIND_FILL/saveState 边界：(1) `data-graph-state` 分支漏掉裸 `'ml-auto font-mono text-11'`——转换为 `.wd-monoFaintEnd` + `wd-dangerText` 三元映射；(2) `#20242e` 未知 kind 回落独立进 hex 判据白名单。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；worldStore 派发 plateau 点击数学未重放。
