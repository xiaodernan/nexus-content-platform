# ADR-0217：§FE-65 `ViewerControls.tsx` `.vc-` 门面化——§14 查看器控件行

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-64 · `apps/web/test/viewer-controls-visual-style.test.ts` · `docs/evidence/fe-65-viewer-controls-facade/evidence.md`

## 背景

`ViewerControls.tsx` 是 §14 查看器控件行：公开页与预览页同一排、同一套参数名；**全是服务端渲染 `<a>`**——零 JS 也生效、可收藏、可分享，与页面同一份 `resolveLayout`（§16）。
行内盒 + 24px 下限——目标是手机上拇指能点（WCAG 2.5.8 24×24 下限）。

## 决定

1. **新增 `.vc-*` 门面族**（globals.css，`.ge-` 段之后）：4 定义——`vc-row/vc-pill/vc-pillOn/vc-pillIdle(:hover)`。
2. **模板字符串常量三件套**：`const pill = 'vc-pill'`；`const active = 'vc-pill vc-pillOn'`；`const idle = 'vc-pill vc-pillIdle'`——逐字面量（Tailwind 模板字面量消失）。
3. **零行为恒等门**（redact：HEAD 雕刻 pill/active/idle 三组模板常量后字节一致）：page `f5a04b02…` 与 HEAD 雕刻字节一致；测试内嵌雕刻判据。
4. **判据**（9/9 绿）：**server 组件无 'use client'**；`liveBreakpoints`+`viewerHref` 进门；WCAG 2.5.8 `min-height: 1.5rem`+`:hover { background: bg-2 }`；字面类全 vc-/复用族；钩子守恒 13 件 data-viewer-* 全在场。

## 取舍

- 不动 hydrate=`' use client'`——它一开始就没有，控件全是 SSR `<a>`；不动 `liveBreakpoints` 派生；不动 `ZOOM_STEPS` 派生表；
- `min-h-[24px]` → 字面量 `1.5rem`（24px），WCAG 2.5.8 直白非任意值；
- `pt-[space-2] px-[space-4] gap-[space-2] text-12` 全走 `--nexus-space-*`/size-… 既有命名；
- 不做截图：browser 不可用。

## 后果

`ViewerControls` 加入门面矩阵。Studio 仅剩 1 面板（CanvasStage 6 atom）。
