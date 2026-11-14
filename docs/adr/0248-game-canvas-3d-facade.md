# ADR-0248：§FE-95 `game2d/GameCanvas3D.tsx` `.g3-` 门面化——§51 3D 视角 chrome

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-94 · `apps/web/test/game-canvas-3d-visual-style.test.ts` · `docs/evidence/fe-95-game-canvas-3d-facade/evidence.md`

## 背景

§51 3D 视角是**同一个游戏的第二种画法**（sim 仍是 2D、同一个 `step`、同一份 plan、HUD 共用 `GamePlay`）。本片只动 3D 入口三个状态的 chrome：probing / unavailable（明说"这台设备给不出 WebGL"，不退回 2D 冒充 3D）/ live 容器。

## 决定

1. 新增 `.g3-*` 门面族（globals.css，`.pe-monoHint` 之后）：`g3-probing/g3-unavailable/g3-lede/g3-hint/g3-frame`——token 全锚。
2. **零行为恒等门**（redact）：`e9876d4c…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + three 栈进门 · probing/unavailable/live 三态钩守恒 · 字面类全 g3-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 KIND_COLORS/#hex 场景常量（它们是渲染栈参数不是 className，且 `#0b0d12` 是 §FE-7 明确约定的地面清屏色）；
- 不动 PaintProbe（e2e "画出来了" 的诚实标记）；
- 不造 `KindColors`→token 迁移——3D 调色板是 user-data-adjacent 的设计自由，迁移属于另一片。

## 后果

`GameCanvas3D` 加入门面矩阵。§51 3D surface 全部零裸原子。
