# ADR-0198：§FE-46 `StoryboardPanel.tsx` `.sb-` 门面化——§40-42 分镜面板首片

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-45 · `apps/web/test/storyboard-panel-visual-style.test.ts` · `docs/evidence/fe-46-storyboard-panel-facade/evidence.md`

## 背景

`StoryboardPanel.tsx` 是 §40-42 的入口：Prompt → Storyboard → Shot list → Timeline。
整页分镜链路依赖 store/trial；原本 96 处裸原子。本次零行为：className 替名；
cn 三元拆 base + 双态；`sb-saveBadgeError` 保留 `bg-warn + accent-fg` 的原义；`.sb-timeSeg` 三态（moving/dropTarget/last-child）拆三 class。

## 决定

1. **新增 `.sb-*` 门面族**（globals.css，`.pp-` 段之后）：71 定义——布局（root/scroll/section-border-top|bottom/col1..colPad3/boxMt2/row/rowMt2/rowEnd/wrap2）、
   字号（label/label12/mono 系列/faint11/ink11/warn11/danger11/faintMt1|2/inkMt1|1-12/dangerMt1|2/accent2ink/body11|12）、
   chip/btn（chip/fg1/cap64/max110/dis40/dis50/btn2/btn2dis/btn2faint/box/inputMtResize/btnDis/accentBtn/demoChip）、
   轨道/timeline/resize（track/trackMt/timeBar/indexChip/cornerNote/footNote/resizeHandle/srOnly/saveBadge(+Error)/shotCard/shotLinked/timeSeg/timeSegMoving/timeSegDropTarget/selfStart）。
   - 字面量：0.625rem 只出现在 `.sb-demoChip`（token 尺度无 10px）；`px-[5px]` 未出现；`max-w-[480px]` → 30rem；`max-w-[110px]` → 6.875rem；`h-9` → 2.25rem；`left-[2px]/bottom-[3px]/right-[10px]/w-[8px]` → 2px/3px/10px/8px。
   - **className 替换后 cn() 部分整体归一，literal 全部逐枚映射为 sb-，零行为。**
2. **零行为恒等门**（SHA256 守恒，redact 三步 + cn()整体归一）：句 `3919d804…` 与 HEAD 字节一致。
3. **判据**（10/10 绿）：client + storyboardStore 依赖链进门 · 字面类全 sb-* · 零裸原子 · 类名闭环 · 段成规模（≥55 定义）· 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 数据钩子守恒（含 `data-storyboard-shot-linked`、`data-timeline-drop-target`）。
4. `sb-srOnly` 采用与 Tailwind sr-only 同义的标准 clip 定义（width/height 1px + rect clip），零行为。

## 取舍

- 不动 `shots.map` 的渲染顺序、id/拖拽句柄、`STATE_TEXT` 原文、`data-*` 钩子集——行为。
- `.sb-timeSegMoving` 只带 z-10/opacity 0.6（原 `moving` 分支不再选中 `bg-bg-1`）；`.sb-timeSegDropTarget` 独占 `bg-bg-1`；
- `.sb-resizeHandle:focus-visible` 用 color-mix(accent-2 50%) 与原 `focus-visible:bg-accent-2/50` 同阶，不动 hover 的 40% 档；
- hug/fill 语境拆 `.sb-segOff` / `.sb-segOffQuiet` 的教义在本片续用，未新增 `.sb-segQuiet` 变体。

## 后果

`StoryboardPanel` 加入门面矩阵。Studio 剩余 ≈18 面板按同一纪律继续。
