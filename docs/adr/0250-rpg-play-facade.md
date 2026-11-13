# ADR-0250：§FE-97 `game2d/RpgPlay.tsx` `.g2-` 复用——§51 RPG 分支 chrome

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-96（ADR-0249）· `apps/web/test/rpg-play-visual-style.test.ts` · `docs/evidence/fe-97-rpg-play-facade/evidence.md`

## 背景

`RpgPlay.tsx` 与 §FE-96 同义、同族、同语义的 RPG 分支渲染入口（§51 第三项：同一份 sim、HUD/Playtest chrome 一字不差）。裸原子 39 处，全部与 GamePlay 逐字同形。

## 决定

1. 不新增任何 CSS：直接复用 `.g2-*` 全套（应用 longest-first 替换——`flex flex-col gap-1` ⊂ `mt-1 flex flex-col gap-1`，`text-11 text-fg-3` ⊂ `mt-1 text-11 text-fg-3`，避免前缀吞并错类）。
2. **零行为恒等门**（redact）：`fd117da3…` 与 HEAD 字节一致。
3. **判据**（6/6 绿）：client + 钩守恒 · 字面类全 `.g2-*`（39/39，24 唯一类全 globals 闭环） · 零裸 Tailwind · token 全声明 · **SHA256 守恒**。

## 取舍

- 不新造 `.rpg-*`——两件同义件共享一个族是这对文件的设计本意；
- 不动任何 sim/HUD 语义。

## 后果

`RpgPlay` 加入门面矩阵（复用↑）。§51 游戏运行时三面全部零裸原子（FE-95/96/97）。
