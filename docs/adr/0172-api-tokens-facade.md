# ADR-0172：§FE-20 `/api-tokens` `.at-` 门面化——唯一一次明文展示那一页登台，零行为门钉死

- 状态：Accepted
- 日期：2026-11-12
- 关联：§FE-17（ADR-0165 通知页范式）· §FE-16（ADR-0164 分析页）· §FE-19（ADR-0169 Studio 顶栏）· `apps/web/test/api-tokens-visual-style.test.ts` · `docs/evidence/fe-20-api-tokens-facade/evidence.md`

## 背景

`/api-tokens` 是 §188 M8（MCP / 外部 Agent / 公开 API）的账号侧入口：发得出、认得出、收得回
给平台外程序用的凭据。这一页及其面板 `ApiTokensPanel.tsx`（49 处 className）此前全裸 Tailwind
平铺，是公开门面矩阵（FE-4~FE-19 已收口公开路由 20+ 张页面）里最后几张未门面化的账号页之一。
裸类散布在：页头（at-title/at-lede）、签发表单（name/days 输入、主按钮）、scope 复选行、
明文一次性展示框、"试一下"三按钮、列表读失败/空态/加载态、列表表格（10 个 `<th>/<td>` +
状态色三元）、吊销行内文字按钮、脚注；外加面板内 20+ 处 `data-token-*` / `data-try-*` 钩子。

## 决定

1. **新增 `.at-*` 门面族**（globals.css，`.notif-` 段之后）：`.at-page/.at-head/.at-title/.at-lede/
   .at-codeInline/.at-backlink/.at-panel/.at-formRow/.at-label/.at-input/.at-inputNarrow/
   .at-btnPrimary/.at-btnGhost/.at-btnDanger/.at-btnGhostSm/.at-btnGhostSmWarn/.at-scopesRow/
   .at-scopeItem/.at-scopeNote/.at-issued*/.at-tryRow/.at-error/.at-note/.at-warnNote/.at-loading/
   .at-empty/.at-table/.at-thRow/.at-th/.at-thLast/.at-td/.at-tdMono/.at-tdSecondary/.at-tdTight/
   .at-statusBad/.at-statusWarn/.at-statusOk/.at-textLink(+Tight)`——全部双主题 token 锚定、
   零 hex、零新增颜色 token、零动效、零 @media；交互件全部补 `:focus-visible` 环 + `:disabled`
   真禁用语义。`.at-btnGhostSmWarn` 与 `.at-btnDanger` 用 `color-mix` 从既有 danger/warn token
   调出透明边，不发明颜色。
2. **零行为恒等门**：`ApiTokensPanel.tsx` 剥 className 后全文 SHA256 与改前（git HEAD）逐字节
   守恒（`6ae5d7c55c769ceb1a19f793665798f1e312a46ff6573b7592ff26a228f0904e`）。redact 顺序三步
   （`className="…"` → `className="@"`；`className={\`…\`}` → `className={@}`；其余 `className={…}`
   → `className={@}`）与钉死常量那一次完全一致，测试里逐字写明。此门保证：除 className 字面值外
   一字未动；任何未来行为改动都必须显式 bump 常量并随 ADR 说明理由。
   - 为此把表格行底线的 `<tr className="at-tr">` 改回无类写法，改用
     `.at-table tbody tr` 纯选择器落边框——保持"纯换类不加属性"的红线。
   - "再读一次"行内按钮的 `ml-2`（裸 Tailwind）改为 `.at-textLinkTight`（`margin-left:
     var(--nexus-space-2)`），不夹带 `{' '}` 文本节点。
   - 吊销/再读一次两个行内文字按钮统一用 `.at-textLink`（原 `.at-linkRevoke` 改名去掉
     "Revoke" 语义污染——它同样服务"再读一次"）。
3. **page.tsx** 纯 server 组件，全 `.at-*` 类，`force-dynamic`、`currentUserOrNull` + `redirect('/')`
   守卫、`data-api-tokens-page` 钩子、`ApiTokensPanel` 挂载点一字不改。
4. **判据**（16/16 绿，`apps/web/test/api-tokens-visual-style.test.ts`）：服务端组件门 /
   panel 保留 `'use client'` / 字面类全 `.at-*` / template 只认 `at-td`+三状态色 / 零裸 Tailwind
   原子类 / 类名闭环（每个 `.at-*` 在 globals.css 有基础定义）/ 视觉段≥28 类 / 零 hex /
   token 声明全存在 / 零新增颜色 token / 零 transition / 零 @media / 六红线 focus-visible+disabled /
   剥 className SHA256 守恒 / 21 个 data-* 钩子守恒 / 诚实文案守恒（"唯一一次"/"读不到"）。

## 取舍

- 不做响应式门：面板此前没有任何 `@media`，本片也不引入——零 @media 就是真实行为守恒。
- 不做 e2e/浏览器截图：browser 不可用（本会话不连 desktop browser）；本片只承诺 HTTP 级与静态门。
- SHA256 门的维护成本：默认 bump 需要 ADR；好处是"半夜没人 review 的类名替换"不可能夹带行为改动。

## 后果

- `/api-tokens` 视觉层与平台门面矩阵同源；行为、文案、钩子、CSRF、签发/吊销/试一下语义零变化。
- 后续 30+ 裸 Tailwind 账号/设置页（如 /blocks、/game、/world、/preview）按同一纪律机械推广。
