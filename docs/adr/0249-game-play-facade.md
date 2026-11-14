# ADR-0249：§FE-96 `game2d/GamePlay.tsx` `.g2-` 门面化——§51 HUD/Quest/事件流/Playtest chrome

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-95 · `apps/web/test/game-play-visual-style.test.ts` · `docs/evidence/fe-96-game-play-facade/evidence.md`

## 背景

§51 游戏面的脚上那一层：HUD（任务/事件流/结果）、§54 校验阻断屏（"补齐设计后回到这一页会重新编译"——不画假关卡）、Playtest（自动跑一遍只用于降位诊断，不依赖模型）。38 处裸原子位点。

## 决定

1. 新增 `.g2-*` 门面族（globals.css，`.g3-frame` 之后）：24 定义（col/hud/canvas/twoCol/seedInput/tableWrap/eventList/well/provenanceBlock…）。`sm:grid-cols-2` → auto-fit minmax(15rem,1fr)（无 @media）；`max-h-[9rem]` → `.g2-eventList { max-height: 9rem; overflow-y: auto; }`；ul 系列显式 preflight 归零。
2. **零行为恒等门**（redact）：`a286820a…` 与 HEAD 字节一致（含一次遗漏修正——`data-game-controls` 位点补进 `.g2-note`）。
3. **判据**（8/8 绿）：client + `data-game-*`/playtest 钩守恒 · 字面类全 g2-*（38/38） · 零裸 Tailwind（含 max-h-/w-/gap-/sm: 全灭） · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- `.g2-smallBtn` 文字继承（原 `text-11` 无色——保持）；
- 不做放大/缩小 Playtest 表格的响应式装饰；
- 不动 Playtest 语义、provenance 段落原文、"先给你个演示关卡"的否定语气。

## 后果

`game2d/GamePlay.tsx` 加入门面矩阵。§51 游戏运行时 surface 全部零裸原子。
