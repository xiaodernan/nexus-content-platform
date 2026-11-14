# ADR-0218：§FE-66 `CanvasStage.tsx` `.cs-` 门面化——§8 画布外壳收官

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-65 · `apps/web/test/canvas-stage-visual-style.test.ts` · `docs/evidence/fe-66-canvas-stage-facade/evidence.md`

## 背景

`CanvasStage.tsx` 是 §147 选中响应的最末环：上条 Abort面板交付所有像素/定位/重绘决策；本片是视觉收官。
视觉派发全走 `style={{}}`、本色派生走 `nodeStyle`/`nodeStyle()`——只换皮 className 6 处。

## 决定

1. **新增 `.cs-*` 门面族**（globals.css，`.vc-` 段之后）：7 定义——`loader/mono13/stage/fitBtn(+:hover/:focus-visible)/virtualized/emptyState`。
2. **原原色派发保留**：`hatching`/`linear-gradient`/`grid` 的 hatching 命中通过 `style={{ position: 'absolute', pointerEvents: 'none', ... }}` 内联（§8 snap 在属性上的派发）——不动；
3. **零行为恒等门**（redact）：page `5037c3f6…` 与 HEAD 字节一致。
4. **判据**（9/9 绿）：client + studio/hitAt/setPan/moveSelectionBy 进门 · 字面类全 cs-/复用族 · 零裸原子 · 类名闭环 · .cs- 段存在（零 @media/transition/@keyframes/hex）· token 全声明 · `cs-fitBtn :focus-visible` 存在（键盘可见）· `cs-emptyState` 是 dashed border 实体 · **SHA256 守恒** · 钩子守恒（data-canvas-surface/virtualized/overlay/resize-handle）。
5. **Accidental correction**：原本 `border-border-subtle` 在 `border-float` atom 里不可匹配任何 Tailwind 规则——本片统一落为 `.cs-emptyState` 的 dashed `border-subtle` Token，完全保原样。

## 后果

`CanvasStage` 加入门面矩阵——`apps/web/src/studio/` **剩余裸原子 = 0**。
Studio 门面化系列（`.sp-` 起手 → `.cs-` 完）：FE-19, 37-66，封榜。下一步（若继续）：verify Java 栈的干净窗口实跑 + Spring Cloud 检查 + 真实 Spring Cloud Gateway + Redis + Mini MQ 端到端连通测试取证。
