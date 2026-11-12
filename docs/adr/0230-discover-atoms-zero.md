# ADR-0230：§FE-77 发现页 `discover/page.tsx` 原子清零（叠加 `.dv-*`）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-76 · `apps/web/test/discover-page-visual-style.test.ts` · `docs/evidence/fe-77-discover-facade/evidence.md`

## 背景

§61 发现页：四个真的排得出来的排序（new/popular/trending/following）；AI Picks 排不出来原样说明，`result.method`（算法参数与候选集上限）与列表同屏显示——不糊。`.dv-*` 门面已在，裸原子仍叠在根容器/空态/边角。§FE-77 清零。

## 决定

1. 新增追加段（globals.css，`.ss-shotPad` 之后）：`dv-root/dv-narrow/dv-hint11/dv-inlineLink/dv-bodyInk/dv-gapList`；`max-w-md` → `.dv-narrow { max-width: 28rem; }`（Tailwind 字节级等）。
2. **零行为恒等门**（redact）：`d52b3522…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：discoverCached/currentUserOrNull 进门 · `data-discover-*` 全钩守恒 · 字面类全 dv-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动排序谓词、不动 `hiddenAuthors` 过滤、不动 trending 分数展示逻辑；
- `dv-inlineLink` 保留 `ml-1` 的显式外边距（不折叠成 :first-child 优选器，避免结构假设）；
- 不新造分页/骨架 token。

## 后果

发现页文件级零裸原子。§61 公开面继续零原子化。
