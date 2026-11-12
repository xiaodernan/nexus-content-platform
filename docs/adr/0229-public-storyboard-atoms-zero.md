# ADR-0229：§FE-76 公开分镜页 `storyboard/page.tsx` 原子清零（叠加 `.ss-*`）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-75 · `apps/web/test/public-storyboard-page-visual-style.test.ts` · `docs/evidence/fe-76-public-storyboard-facade/evidence.md`

## 背景

与 §FE-75 同一形状：§FE-8 已为本文件 chrome 建 `.ss-*` 门面段，裸原子仍叠在门面旁。§FE-76 清零剩余原子，**不动** §FE-8 基建段（含其预存 `transition`/`@media`）。

## 决定

1. 新增追加段（globals.css，`.pp-hint11` 之后）：`ss-narrow/ss-wide880/ss-headerCol/ss-titleRow/ss-shotsList/ss-list/ss-mono11/ss-hint11/ss-body13/ss-pre13Ink/ss-pre12Ink/ss-danger12/ss-h1xi/ss-backInk/ss-shotPad`——全 token 锚。
   - `.ss-shotPad` 只带 padding 12px（§FE-8 无 padding；atom `p-[var(--nexus-space-3)]` 是唯一真正生效的层叠——utilities 层无 unlayered 对手）。镜头卡 `rounded border bg-bg-1` 两个原子被 unlayered 规则整体覆盖，删掉零计算差。
2. **零行为恒等门**（redact）：`5d9e9168…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：读路径（StoryboardDocumentSchema/CAMERA_LABELS/VisitMeter）进门 · 17 个 data-storyboard-* 钩守恒 · 字面类全 ss-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 `.ss-shot` 基建（border-left 结构性 3px accent，ADR-0144 §FE-8 已定）；
- 不动三态分支/VisitMeter；
- 与 §FE-75 平行的 `pp-narrow/ss-narrow` 双胞胎刻意各自入家族，不抽跨家族通用层——双主题 AA 已逐族验证，不在本片引入共享依赖。

## 后果

公开分镜页文件级零裸原子；§FE-8 基建 + §FE-76 追加 = 本文件门面化完结。`/n/...` 三面公开页（分享/可玩/分镜）全部零裸原子。
