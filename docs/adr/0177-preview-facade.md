# ADR-0177：§FE-25 `/preview/[projectId]` `.pv-` 门面化——§124 只读模型投影、sticky bar 逐字平移

- 状态：Accepted
- 日期：2026-11-12
- 关联：§FE-24（ADR-0176）· §124 / ADR-0063（状态层只读投影）· `apps/web/test/preview-visual-style.test.ts` · `docs/evidence/fe-25-preview-facade/evidence.md`

## 背景

`/preview/[projectId]` 是 §124/ADR-0063 的"只读模型投影"——与公开页同一渲染管线（同参数、
同断点解析 `breakpointFromParam`、同几何 `resolveLayout`、同 paintOrder），但只有鉴权作者
本人可进、没有选择框/编辑控件，且只有靠 `data-state` 兑现的 loading/error/success 三态能当场
演示（hover/active/focus 要真实伪类，这里不假装）。此前全裸 Tailwind：sticky `bg-bg-1/95` +
`backdrop-blur` 的常驻 bar、状态预览条（两个三态 chip）、`overflow-x-auto` 画布。

## 决定

1. **新增 `.pv-*` 门面族**（globals.css，`.rt-` 段之后）：`.pv-page/.pv-bar/.pv-back/.pv-meta/
   .pv-statebar/.pv-stateNote/.pv-stateOption/.pv-stateOptionActive/.pv-canvas`。
   - **`bg-bg-1/95` 与 `bg-1/70` 的不透明度**：用 `color-mix(in srgb, var(--nexus-color-bg-1) 95%|70%, transparent)`
     落到既有 bg-1 token 上，**零新增 token**。
   - **sticky bar 逐字平移**：`position: sticky / top: 0 / z-index: 10 / backdrop-filter: blur(8px)` 原样搬进 `.pv-bar`。
   - 三态 chip 的 active/idle 两个模板分支分别锚 `.pv-stateOptionActive` / `.pv-stateOption`；
     hover 态（bg-2）保留——是基线就有的 behavior。
   - 内联 `style`（scale transform / 版式盒占位 / frame 几何）不属于 className 面，红线保留。
2. **零行为恒等门**：page 剥 className 后 redact SHA256 与 git HEAD 一致（`1d8e84b5…`）。
   鉴权三处（requireUser、projectVisibleTo、notFound×N）、断点/缩放、stateStyleSheetFor、
   paintOrder 游走、ViewerControls 挂载点、`data-state` 闸门（只给真定义了该状态的节点挂）全部进门守。
3. **判据**（12/12 绿）：server 组件门（含 3 处 notFound + ViewerControls）· 字面/模板类全 pv-* ·
   零裸 Tailwind · 类名闭环 · 成规模（≥8）· 零 hex · token 全在 · 零新增颜色 token ·
   零 transition/animation/@keyframes/@media · sticky/backdrop-blur 逐字平移 ·
   focus-visible 覆盖 back/stateOption/stateOptionActive · **SHA256 守恒** · 钩子守恒。

## 取舍

- 不动 ViewerControls（与公开 viewer `/n/[handle]/[slug]` 共用，若动它等于改公开页，超出本片）。
- 不做截断提示/beforeunload 之类的"增强"——行为不是样式。
- 不引入 backdrop-filter 的 reduced-motion 特殊处理：blur 不是动效（无时间性），不触发。
- 不做浏览器截图：browser 不可用。

## 后果

矩阵又补齐一页。剩余裸 Tailwind：Studio 30+ 面板（FE-19 序列进行中）与 `components/` 里零散的几处。
