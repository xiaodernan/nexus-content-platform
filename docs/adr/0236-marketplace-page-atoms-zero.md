# ADR-0236：§FE-83 创作者市场店面 `marketplace/page.tsx` 原子清零（叠加 `.mk-*`）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-82 · `apps/web/test/marketplace-page-visual-style.test.ts` · `docs/evidence/fe-83-marketplace-facade/evidence.md`

## 背景

§127/§128 创作者市场店面：列表只出 public/free 两类（domain 同一谓词）；「我的物品」走所有者视角读路——私密草稿谁的界面里都不该消失（#154）；已下架仍不在列；下载交付 #120 已接。裸原子九处：根容器/h2/网格/两处 section 顶边/mine 列表/sign-in 提示/limits 边注。

## 决定

1. 新增追加段（globals.css，`.pf-pageRoot` 之后）：`mk-pageRoot/mk-col2/mk-h16/mk-grid/mk-sectionTop/mk-mt4/mk-mineList/mk-hint11/mk-hint12`；`grid-cols-1` → `grid-template-columns: 1fr`；ul 显式 preflight 归零。
2. **零行为恒等门**（redact）：`7e92d21d…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：listMarketplaceItems/listOwnedMarketplaceItems/listReportedItemIds 进门 · `data-marketplace-*` 全钩守恒 · 字面类全 mk-/dv- · 零裸 Tailwind（含 `text-[`/`p-[`） · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 `dv-searchPill` 复用（店面导航沿用发现页胶囊语言——既定设计语言，不改其归属）；
- 不动 `font-mono`（mk- 既有规则承袭，注意本片 `.mk-pageRoot` 自己写了 font-family mono，与前场一致）；
- `.mk-grid` 显式 `list-style: none` 代替 preflight 假设。

## 后果

市场页文件级零裸原子。§127/§128 public 面继续推进。
