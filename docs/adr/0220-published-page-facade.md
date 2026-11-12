# ADR-0220：§FE-67 公开分享页 `page.tsx`——`.np-` 门面化（§56/§14）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-66 / §SC-NEW · `apps/web/test/published-page-visual-style.test.ts` · `docs/evidence/fe-67-published-page-facade/evidence.md`

## 背景

`/n/[handle]/[slug]` 是公开分享页——NEXUS 被分享给陌生人的第一眼 surface。展示作者名/项目名/发布版本/`?viewport=`（三态）+ 热点点击导航 + `publicationState` 点赞/投币按钮，一行横杠+粘贴口令，不承担任何状态写入。
**未登录访问者看得到**是 public 的承诺；unlisted 才 noindex。JSON-LD 注释和 comment 一样是前端**数据**不是样式。

## 决定

1. **新增 `.np-*` 门面族**（globals.css）：`np-root/np-header/np-title/np-meta/np-headerAside/np-brand/np-actions/np-stage/np-variant/np-note/np-entry/np-playLink/np-storyboardLink/np-entryHint/np-notice`。
2. **保留 `.pb-` 共享类**（pb-root 500+ Scroll/fade 等门面 ADR-0176 已应用到停止；直流pb-variant 继续、直接应用 `--nexus-shadow-brand`等）——本片 §FE-67 新增 `.np-` 并行命名空间，pb- 已固定（Studio Path）。
3. **零行为恒等门**（redact）：page `216de1f8…` 与 HEAD 字节一致。
4. **判据**（9/9 绿）：className 全 `np-*/pb-`；钩子守恒（data-published-* 的11 个 named 数据钩子全在场）；.np- 段存在；零裸 Tailwind；token 全声明；零 @media / transition / @keyframes；SHA256 守恒。**没有任何颜色 hex**；没有任何带 hover 的 pb- / np- / StoryLink（只在 pb hover→ hover: none;本次未加 "：active hover transition"）。

## 取舍

- 不动 `PublicationActions` / `ReportControl` / `VisitMeter`——它们自己的 facade（`.pb-…` 长期固定使用哨兵）已处理；
- 不动 `publishedVariantsStyle()` 的 `<style data-published-auto>` 的输出——§14 ADR-0069/0074 承诺；
- JSON-LD script tag 保留——它不是 className，不归 redact 门辖；
- `getPublishedPage` / `recordView` / `buildPublishedSeo` 全路径保留。

## 后果

`/n/[handle]/[slug]` 加入门面矩阵——第 36 个 FE 序列完结。Studio-FE 收官 + 面板门面全线落地。
