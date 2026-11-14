# ADR-0253：§FE-100 `world3d/WorldWalk.tsx` `.ww-` 门面化——§15 3D 行走 chrome

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-99 · `apps/web/test/world-walk-visual-style.test.ts` · `docs/evidence/fe-100-world-walk-facade/evidence.md`

## 背景

§15 3D 行走：WebGL 探测 → probing / unavailable（明说给不出，不降级冒充 3D）/ live（stage、HUD、传送门 talk、标签、nearby 面板、图例、限制说明）。裸原子 33 处（含两处背景透明度 mixer：bg-bg-1/85/90/95 与 pointer-events 系）。

## 决定

1. 新增 `.ww-*` 门面族（globals.css，`.st-bullet` 之后，两段插入分别见 `apply-fe100.cjs` / `apply-fe100-leftover.cjs`）：`ww-probing/ww-unavailable/ww-stage/ww-labelsLayer/ww-label/ww-swatch/ww-capNote/ww-hudLayer/ww-hudPanel/ww-hudTitle/ww-note2/ww-miniBtn/ww-input/ww-legend/ww-legendItem/ww-dot/ww-nearbyLayer/ww-nearbyCard/ww-strong12/ww-kindNote/ww-focusedBody/ww-chipWrap/ww-chipBtn/ww-limits/ww-talkMount/ww-swatchLg`；复用 `.g3-*`/`.g2-*`。
   - `bg-bg-1/85|90|95` → `color-mix(in srgb, var(--nexus-color-bg-1) 85/90/95%, transparent)`；
   - `pointer-events-*` 原样入门面（pointer-events 是合法非颜色属性）；
   - `-translate-x-1/2/-translate-y-full` → `transform: translate(-50%, -100%)` 字节级等。
2. **零行为恒等门**（redact）：`042ed851…` 与 HEAD 字节一致。
3. **判据**（8/8 绿）：client + WebGL 三态钩守恒 · 字面类全 ww-/g3-/g2- · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 HUD/nearby/talk Sim 路径与颜色 per-entity（内联 `style` 的 label color 是数据，不是 Tailwind）；
- `.ww-limits` 显式 preflight 归零（原 ul 依赖 preflight）；
- 不动 `focus-within/focus-visible` 现状（本面原本即无键盘环，加不属于"换皮"范畴）。

## 后果

`WorldWalk` 加入门面矩阵。public 面门面化推进（§FE-67…FE-100 全绿）。
