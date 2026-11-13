# ADR-0220：§FE-67 公开分享页 `page.tsx`——`.pub-` 门面化（§56/§14）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-66 / §SC-NEW · `apps/web/test/published-page-visual-style.test.ts` · `docs/evidence/fe-67-published-page-facade/evidence.md`

## 背景

`/n/[handle]/[slug]` 是公开分享页——NEXUS 被分享给陌生人的第一眼 surface。展示作者名/项目名/发布版本/`?viewport=`（三态）+ 热点点击导航 + `publicationState` 点赞/投币按钮，一行横杠+粘贴口令，不承担任何状态写入。
**未登录访问者看得到**是 public 的承诺；unlisted 才 noindex。JSON-LD 注释和 comment 一样是前端**数据**不是样式。

## 决定

1. **新增 `.pub-*` 门面族**（globals.css）：`pub-root/pub-header/pub-title/pub-meta/pub-headerAside/pub-brand/pub-actions/pub-stage/pub-variant/pub-note/pub-entry/pub-playLink/pub-storyboardLink/pub-entryHint/pub-notice`。
2. **保留 `.pb-` 共享类**（pb-root/pb-variant 等）用作既定发布流的候选样式与 pb-publisher 历史传承——不动 §FE-3/0141 承诺的 pb-芽屏。
3. **零行为恒等门**（redact）：page `216de1f8…` 与 HEAD 字节一致。
4. **判据**（9/9 绿）：className 全 `pub-*/pb-`；钩子守恒（data-published-* 的 11 个 named 数据钩子全在场）；pub- 段存在；零裸 Tailwind；token 全声明；零 @media / transition / @keyframes；SHA256 守恒。
5. **编码表**：`.pub-title` 用 `background-clip: text` 焦墨字（透明+渐变 fg-1→brand 92%），`.pub-playLink`/`pub-storyboardLink` 有 :focus-visible 描边与 color-mix hover 描边；`prefers-reduced-motion` 独立收口于 `§FE-67-A` 段（零 motion 时 reduce 无事可停，所有动效天然为零）。

## 取舍

- 不动 `PublicationActions` / `ReportControl` / `VisitMeter`——它们自己的 facade（`.pb-…` 长期固定使用哨兵）已处理；
- 不动 `publishedVariantsStyle()` 的 `<style data-published-auto>` 的输出——§14 ADR-0069/0074 承诺；
- JSON-LD script tag 保留——它不是 className，不归 redact 门辖；
- `getPublishedPage` / `recordView` / `buildPublishedSeo` 全路径保留。

## 后果

`/n/[handle]/[slug]` 加入门面矩阵——第 67 个 FE 序列完结（2026-11-13）。Studio-FE 收官 + 面板门面全线落地。

> 附录：本文件名曾写 ".pub-"，早期误称 "np-"（因最初并轨名误写）；全文档已于同一次 commit 更正为 .pub-*。
