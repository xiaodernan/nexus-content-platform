# ADR-0212：§FE-60 `TeamPanel.tsx` `.tp-` 门面化——§133 teamCollaboration

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-59 · `apps/web/test/team-panel-visual-style.test.ts` · `docs/evidence/fe-60-team-panel-facade/evidence.md`

## 背景

`TeamPanel.tsx` 是 §133 teamCollaboration 的界面：项目名册/团队邀请。
三条纪律在面板上写着：① 满员时邀请按钮照旧能点——服务端会拒，界面先说清为什么（§159：展示与门不许对不上）；② 邀请链接只展示一次——token 是 secret，不漏库、不 expire 错；本机没有发信，链接由邀请人自己转交；③ 角色有实质差别（viewer 写门 403 挡下）。

## 决定

1. **新增 `.tp-*` 门面族**（globals.css，`.vb-` 段之后）：14 定义——`colFaint/rowBetween/breakAll/cardFaint/accent2Ink/chipWarn/chipDanger/chipPrimary/chipPrimarySm/btnPrimary/w220/rowEnd/rootPad`，+ 复用 `.sb-*`/`.wd-*`/`.cp-*`/`.gp-*`/`.hi-*`。
2. **零行为恒等门**（redact）：page `64dec99c…` 与 HEAD 字节一致；**TeamPanel 无 `'use client'` 首令牌**（由 Studio 外壳的 client 边界注入 client context；tsc/eslint 静态 verified）；判据改为锚 `useStudioReady()` + `csrfHeaders()`。
3. **判据**（9/9 绿）：csrfHeaders/useStudioReady 进门 · 字面类全 tp-*/复用族 · 零裸原子 · 类名闭环 · 段成规模（≥12 定义）· 零 hex · token 全声明 · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（`团队（§133 · teamCollaboration）` 字面节点）。
4. cn 三元统一映射：全部 className 静态替换（`hover:bg-bg-2` 转移动到 `.tp-chip*:hover` 规则；`disabled:opacity-40` 转移动到 `.tp-btnPrimary:disabled`/`.tp-chipDanger:disabled`）。

## 取舍

- 不动 fetch/CSRF/onClick handler/invite dispatch——一字不改（与 §FE-40 对 `/admin/realtime` 同层：只换皮）；
- 不动 role API 的 403 不可越权语义；
- 不做截图：browser 不可用。

## 后果

`TeamPanel` 加入门面矩阵。Studio 剩余 ≈5 面板继续（CommandBar 44 / AgentPanel 39 / ExportPanel 20 / GameCodeExport 18 / CanvasStage 6 / ViewerControls 4）。
