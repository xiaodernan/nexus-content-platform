# ADR-0199：§FE-47 `DesignSystemPanel.tsx` `.ds-` 门面化——§12/§13 设计系统面板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-46 · `apps/web/test/design-system-panel-visual-style.test.ts` · `docs/evidence/fe-47-design-system-panel-facade/evidence.md`

## 背景

`DesignSystemPanel.tsx` 是 §12/§13 的设计系统面板：token 是设计语言的真值——改一处全线跟着动；
所有改动都走 `studio.execute`，所以改 token 和改节点一样可撤销（§148）。面板同时显示"有多少节点引用它"：删掉一个正在用的 token 会留下断链，与其让人删了再等 lint 报错，不如直接不让删。token-usage.ts 的 O(节点×prop) 计数（`useMemo([document])`）本就不在这件事里重做。

## 决定

1. **新增 `.ds-*` 门面族**（globals.css，`.sb-` 段之后）：69 定义——根/head/label/mono 系列（mono10/monoFaint(M|MShrink|Mt1)/mb1mono/mb3）、
   布局（root/head/section/sectionInset/scrollCol/colGap3/colMt1/row1/row2/rowGap3/rowMt1|3/wrap1/wrapCenter1/wrapMt1|3/componentCard/rowCard）、
   token 链（tokenInput/growInput/wfullInput/w16…/valueInput/addTokenInput/modeInput72/typeSelect/colorWell/swatch12|14/instanceChip）、
   按钮一族（btn/btnMono/btnGhostMono/btnGhostMonoEnd/btnGhostMode/linkBtnFaint/accentBtnSm/iconSm(+Ready/+Idle)）——零动效、零 hex、零 @media。
   - `w-[72px]/h-5/w-6/h-3.5/w-3.5/inline-block h-3 w-3` 全部 rem 等价量化（4.5rem/1.25rem×1.5rem/0.875rem/0.75rem）。
   - `px-[2px]/py-[2px]` → 2px 字面量（无 token 档，与 FE-45/46 一致）；`gap-[3px]` → 3px 字面量同口径。
2. **cn 三元统一映射**：token 删除键拆 `.ds-iconSm`（base，无 color）+ `.ds-iconSmReady`（hover bg-2 + danger-ink 文字）+ `.ds-iconSmIdle`（cursor:not-allowed + opacity .3）——与旧 `removable ? 'text…danger-ink' : 'cursor-not-allowed opacity-30'` 逐字节行为一致。
3. **零行为恒等门**（SHA256）：redact（EOL+空白归一 + className 任意形态归一 @ + cn()整体归一）后 page `9fb3d054…` 与 HEAD 逐字节一致。
4. **判据**（10/10 绿）：client + studio.execute(三条语句逐字钉进 `删除 token`/`新增 token`/`存为组件`) 进门 · 字面类全 ds-* · 零裸原子（含 `ml-auto`/`px-` 扫描）· 类名闭环 · 段成规模（69 定义）· 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒**。

## 取舍

- 不动 `parseInput`/`resolveColor`/`isColor` 原文；不动 `TOKEN_KEY` 正则；不动 `tokenUsage` memo 依赖——全是行为。
- `.ds-btnGhostMode` 专留 `disabled:opacity-50` 变体（内置/默认/引用中的 token 不动）；
- `.ds-accentBtnSm` 不做 hover 实底（原子无 hover 并无缺失——本片不美化）。

## 后果

`DesignSystemPanel` 加入门面矩阵。Studio 余 19 面板继承。
