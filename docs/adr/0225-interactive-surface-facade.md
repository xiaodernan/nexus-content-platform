# ADR-0225：§FE-72 `InteractiveSurface.tsx` `.is-` 门面化——§167/§168 互动运行时

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-71 · `apps/web/test/interactive-surface-visual-style.test.ts` · `docs/evidence/fe-72-interactive-surface-facade/evidence.md`

## 背景

`InteractiveSurface.tsx` 是公开发布页的互动运行时：`InteractiveHotspots`（按发布快照绝对坐标铺热点按钮）与 `InteractiveEnd`（终点页上报"走通"，一人一版一次）。几何全走 inline `style`，className 只管 focus/hover/note。

## 决定

1. 新增 `.is-*` 门面族（globals.css）：`is-hotspot`（含 `:focus-visible` 2px 外环 box-shadow、`:hover` 2px 内环 inset box-shadow、`is-endNote`/`is-endStrong`）。
   - Tailwind `ring-2` = `box-shadow: 0 0 0 2px`；`ring-inset` = `inset 0 0 0 2px`；box-shadow 原样保留 ring 语义，零 transition。
2. **零行为恒等门**（redact）：`bc99e411…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrfHeaders/visitorKey/sessionStorage 进门 · 钩子守恒（hotspot/target/end/record 四个） · 字面类全 is-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 inline `style` 几何与 `cursor: pointer`；不动 module-level `outcomes` Map（StrictMode 双跑去重语义是载重墙）；
- `focus:outline-none` → `.is-hotspot:focus { outline: none }`（保留）；
- 不补 `transition`——本片是"按了就走"的控制点，不打羽化。

## 后果

发布页互动运行时加入门面矩阵。§167/§168 surface 全部零行为换皮。
