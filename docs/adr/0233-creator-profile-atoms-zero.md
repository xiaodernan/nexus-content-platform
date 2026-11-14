# ADR-0233：§FE-80 创作者主页 `u/[handle]/page.tsx` 原子清零（叠加 `.pf-*`）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-79 · `apps/web/test/creator-profile-page-visual-style.test.ts` · `docs/evidence/fe-80-creator-profile-facade/evidence.md`

## 背景

§60 创作者主页：`.pf-*` 门面已齐，仅根容器带裸原子（`mx-auto flex max-w-[980px] flex-col gap-[…space-6] px-6 py-10`）。§60 每栏只放真公开东西（注销账号连首字母也不显示、作品仍挂公网、@屏蔽语义）——不动。

## 决定

1. 新增追加段（globals.css，`.se-clearBtn:hover` 之后）：`pf-pageRoot { margin-inline: auto; display: flex; max-width: 980px; flex-direction: column; gap: var(--nexus-space-6); padding: var(--nexus-space-10) var(--nexus-space-6); }`——`.pf-root`（position:relative）与 `.pf-pageRoot` 双类语义拆开，不碰基建。
2. **零行为恒等门**（redact）：`c2b4aaa3…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：profileOf/currentUserOrNull 进门 · `data-profile-*` 全钩守恒 · 字面类全 pf-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 `pf-root` 基建类；不新造 `980px` token（spacing 尺度无 980 档，固定 px 如实）；
- 不动 FollowButton/BlockControl（下一片/下两片）；
- 不引入容器查询：本页无断点变体（§60 原始设计），不在本片加。

## 后果

创作者主页文件级零裸原子。§60 public 面继续推进。
