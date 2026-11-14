# ADR-0251：§FE-98 `play/PlayByKind.tsx` `.pk-` 门面化——§14 未接线 kind 的诚实空态

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-97 · `apps/web/test/play-by-kind-visual-style.test.ts` · `docs/evidence/fe-98-play-by-kind-facade/evidence.md`

## 背景

§14 的 kind-not-wired 空态：这一版标的类型"还没有可玩的投影"——照实说，不画假入口（§159）。五个裸原子位点。

## 决定

1. 新增 `.pk-*` 门面族（globals.css，`.g2-provenanceBlock` 之后）：`pk-card/pk-h2/pk-note12/pk-hint/pk-hint2`；`rounded-lg` → `var(--nexus-radius-lg)`。
2. **零行为恒等门**（redact）：`6148c8d3…` 与 HEAD 字节一致。
3. **判据**（8/8 绿）：三钩守恒（kind-note/kind-not-wired/kind-reason） · 字面类全 pk-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不加 icon/插图——空态就是空态；
- 不造 `pk-cta`（本片没有行动按钮——它就是诚实说明）。

## 后果

`PlayByKind` 加入门面矩阵。public 面门面化推进。
