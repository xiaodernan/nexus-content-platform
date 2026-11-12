# ADR-0228：§FE-75 公开可玩页 `play/page.tsx` 原子清零（叠加 `.pp-*`）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-74 · `apps/web/test/public-play-page-visual-style.test.ts` · `docs/evidence/fe-75-public-play-facade/evidence.md`

## 背景

§FE-7（ADR-0144 序列）已为本文件 chrome 建了 `.pp-*` 门面段——但原子类（`text-11 text-fg-3`、`max-w-[720px] px-6 py-16`、`text-[var(--nexus-font-size-21)] font-semibold` 等）仍叠在门面类旁。§FE-75 清零剩余原子，**不动**已接受的基建段（含其预存 `transition`/`@media`）。

## 决定

1. 新增追加段（globals.css，`.rc-hint` 之后）：`pp-h1xi/pp-narrow/pp-wide/pp-headerRow/pp-backInk/pp-body13/pp-list/pp-danger12/pp-hint11`——全 token 锚；`pp-narrow` 的 `padding: 64px …` 是 Tailwind `py-16` 的字节级等，空间 token 无 64px 档，固定 64px 如实。
2. **零行为恒等门**（redact）：`75276d27…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：读路径（GameDocumentSchema/compileForKind/PublicPlay/VisitMeter）进门 · data-play 系列钩守恒 · 字面类全 pp-* · 零裸 Tailwind（含 `text-[`/`max-w-[`） · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 pp-title 的渐变墨（§FE-7 已定）；`pp-h1xi` 与 `pp-title`/`pp-emptyTitle` 同元素挂载：同特异性后者先赢权重 650→600——恰好等于原来 Tailwind 层（utilities 层）赢过 author 样式的次序，零视觉漂移；
- 不动三态分支/PublicPlay/VisitMeter/读路径——本片只动 className；
- `60px/64px`：刻意不造新 token。

## 后果

公开可玩页文件级零裸原子；§FE-7 基建 + §FE-75 追加 = 本文件门面化完结。
