# ADR-0167：首页 `app/page.tsx` `.hp-` 门面化收尾——FE-3 只覆盖 Hero 一族，本片延伸至正文五 section（FE-18）

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0123（六红线）· ADR-0154（静态判据真代码纪律）· ADR-0158~0166（FE-10 ~ FE-17 家族 + A11Y-3/4）· ADR-0164/0165（FE-16/FE-17 段式与 SHA256 判据）

## 背景 / 缺口

首页（§FE-3；`apps/web/src/app/page.tsx`）是平台的唯一入口——匿名冷启动的第一句话、登录后启动屏、
Auth Tab 内嵌注册/登录表单、控制台与 Hero 拼合。FE-3 门面化把它收进了 `.hp-*` 的
8 个类（Hero 标题、pill navlink、柔光空态、demoChip）——视觉语言已经建立，但
正文五个 section（账号/项目/回收站/我的主页/Provider 状态）仍是**全裸 Tailwind 平铺**（64 处 className、
171 处裸原子类、43 个去重 token、全 server 组件）。

本片是补齐这一段，把 FE-3 已立的精致语言（柔光行卡 + hover 抬升 + brand focus-visible 环 + 语义色徽标）
从 Hero 一贯地延伸到正文：

- 行卡族：`.hp-rowCardInteractive`（亮起+hover 辉光+border-color 渐变）、`.hp-rowCardStatic`（回收站静态
  行）、`.hp-rowCardMuted`（未解锁收藏）、`.hp-rowCard`（Provider 行）、`.hp-RowName/Muted/Meta/Indent` 等字号族；
- 语义徽标族：`.hp-statusBadge`（Provider caps）、`.hp-healthRow/Kind/Status`（AI health budget 流水）；
- section 族：`.hp-section/SectionTitle/SectionGap/sectionNote/sectionNoteLoose/profile*` 接线；
- 全 SECTION 统一在 `@media (prefers-reduced-motion: reduce)` 收口。

## 决定

1. page.tsx 所有 64 处 className 改 `.hp-*` 门面类（保守 1 对 1 映射；动态类映射保留唯一的 caps.live 三元输出不变）；
2. globals.css 新增 `.hp-` 段 58 个类（全锚既有 `--nexus-*`；无 hex、无新增颜色 token、无渐变墨字——
   A11Y-1 forced-colors 不重复开例）；`@media (min-width: 820px)` 不设新断点（Hero 一家仍在 FE-3 的 820 档）。
3. 数据/钩子/aria/links/诚实文案一字不动；零 fetch 新增、零分支改。

## 验证（如实记）

- **`vitest run apps/web/test/home-visual-style.test.ts` → 12/12 GREEN**（类名闭环/零 hex/token真存/零新颜色 token/
  零裸 Tailwind/动态类条件守恒/剥 SHA256 全文/钩子精确集合/块注释定界符配对）；
- **`tsc -p apps/web --noEmit` exit 0**
- **`e2e/home-visual.spec.ts`（本片同时附带，详见 pw-home.config.ts）**：offline setContent 注入真实产物字节；
  深/浅双主题各自真渲染、两个 ellipse badge 与行卡 hover 辉光计算值真比对、`hp-rowCardInteractive:focus-visible` 真在；0 console error；
- 视觉风格截图（深浅 × 两个 section）不在本片：下游的真 Chrome 渲染归 a11y-internal/后续 FE 清点。

## 诚实边界

- 没有接近"login state"（账号分支的会话侧由 `Authorization` 夹具另管，本片不并入任何凭据/请求路径）。
- `.hp-` 不重复声明 FE-3 既有类（.hp-hero, .hp-navlink, .hp-demoChip, .hp-emptySection），但 6 个 `<a>`
  统一 brand focus-visible 环——FE-3 `hp-navlink` 已有焦点环，本片补足 `hp-rowCardInteractive` 与 `hp-profileLink`。
- 不触动渐变墨字（Hero 那一条是 FE-3 唯一：FORCED-COLORS 回退继续由 forced-colors-style.test.ts 守）。
- 未 commit `e2e/home-visual.spec.ts`？——本 ADR 所在 commit 同时收录此 spec（与其专用 config `e2e/pw-home.config.ts`）。

## 后果

- 首页的视觉头->正文首次统一在同一套 token 语言上——Hero→nav→账号→项目→回收站→我的主页→Provider 都对得上；
- FE-3 唯一的 forced-colors 墨水用户被尊重，新的 `.hp-` 段零 `.hp-*` 渐变色字——A11Y-1 forced-colors 与本片无耦合。
- 本片附的 e2e 用最少篇幅补足浏览器那一寸，不宣称 aria 级判定——那仍归 a11y-internal / screen-reader 套件。