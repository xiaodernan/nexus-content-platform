# ADR-0190：§FE-38 `AnnotationsPanel.tsx` `.np-` 门面化——§111 钉只钉选中的，批注不被删除抹掉

- 状态：Accepted
- 日期：2026-11-13
- 关联：§111 · `apps/web/test/annotations-panel-visual-style.test.ts` · `docs/evidence/fe-38-annotations-panel-facade/evidence.md`

## 背景

`AnnotationsPanel.tsx` 是 §111 的浮在画布上的批注面板：批注只钉 `state.selection.length === 1` 那一个元素；节点被删批注不消失（列表标注"节点已不在文档里"）；批注随 AI 请求发给模型时走服务端派生路径（见 server/ai/assemble.ts）。本片只换皮；行为/文案/data 钩子/pointerdown stopPropagation——一字不动。

## 决定

1. **新增 `.np-*` 门面族**（globals.css，`.ch-` 段之后）：`.np-root/.np-toggle/.np-panel/.np-lede/.np-name/.np-input/.np-submit/.np-resolved/.np-list/.np-item/.np-bodyOff/.np-bodyOn/.np-meta/.np-actions/.np-linkBtn/.np-removeBtn`——双主题 token、零 hex、零 @media、零动效；CTA `.np-submit` 锚 accent-2+accent-fg（唯一带底色的决定性动作）；`.np-removeBtn` 的 hover 锚 danger-ink（删除是不可逆，视觉提示以危险色退场）。
2. **判据**（11/11 绿）：'use client' 保留 + studio 三态调用进门 + 只钉选中一个进门 · 字面类全 np-*/am-* · 零裸 Tailwind · 类名闭环 · 零 hex · token 全在 · 零新增颜色 token · 零 transition/@media · **SHA256 守恒（49f6fff9…）** · 钩子守恒（12 个 data/-resolved-filter/-remove/-resolve）。
3. **零行为恒等门**：page 剥 className 后 SHA256 与 git HEAD 一致（`49f6fff9…`）。

## 取舍

- 不动 `state.annotations.filter`/`resolveAnnotation(/addAnnotation)`/data 钩子。
- 不引入 hover-danger 之外的任何强调色变体（`.np-linkBtn` 复用 hover fg-1）。
- 不做截图：browser 不可用。

## 后果

`AnnotationsPanel` 加入门面矩阵。Studio 余 26 个面板继续。
