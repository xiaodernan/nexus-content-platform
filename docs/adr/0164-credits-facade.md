# ADR-0164：/credits 额度与消费页 `.cr-` 门面化——账本语义色守恒 + 响应式 48rem 断点（FE-16）

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0154（静态判据的真代码纪律/注释剥离）· ADR-0158~0163（FE-10 ~ FE-15 `.mp-/.mi-/.me-/.mr-/.an-/.tc-` 门面化）· ADR-0123（六红线）· ADR-0146（forced-colors 联动——**本片未触发，无渐变墨字**）· §168（"账记成谎话画在页面上不行"）

## 背景 / 缺口

`/credits` 是"账号 — 额度 — 账本"链路上最讲诚实的一页消费者：余额由流水加出来、
无消耗方的类别不报单价、最近 20 行不等于全部余额。它同时是**全库剩余裸 Tailwind 密度
最高的一页** server 纯展示页面：58 处 className / 38 个去重原子类 token / 525 次出现。
门面化前的结构 58 处里这就压了两条容易漏的：

- 响应式断点：原 `grid-cols-2 ... md:grid-cols-4`——Tailwind 4.3.5 默认 `md` 真编译为
  `(width >= 48rem)`（768px），**不是 FE-14 `.an-defs` 的 40rem**。4 列提前 128px 触发即失真，
  故 `.cr-balanceGrid` 基础 2 列、`@media (min-width: 48rem)` 切 4 列。
- 字号串档：`text-13`（13px）与 `text-12`（12px）两组分别落在 `cr-lede/cr-empty`（13px）
  与 `cr-body/cr-limits`（12px），不可并类否则必有一组失真。

## 决定（只换 className，文案/data 钩子/业务分支一字不动）

1. **本页 className 归 `.cr-` 家族**：`.cr-page/.cr-pageAnon/.cr-head/.cr-section/.cr-title/.cr-h2/.cr-lede/.cr-body/.cr-limits/.cr-note/.cr-window/.cr-empty/.cr-backlink`；
   **余额网格** `.cr-balanceGrid`（2 列→48rem 4 列）— 与该表浅层 `.cr-balanceCard/.cr-balanceLabel/.cr-balanceValue/.cr-balanceFoot`；
   **表** `.cr-table/.cr-theadRow/.cr-th/.cr-thLast/.cr-tdTs/.cr-tdKind/.cr-tdDelta/.cr-tdReason/.cr-tdTask/.cr-td/.cr-tdLast`；
   **档位表** `.cr-planCurrent/.cr-planOther/.cr-youBadge/.cr-enforced`；
   **账本正负语义色** `.cr-deltaNeg`（danger-ink）/ `.cr-deltaPos`（accent-2-ink）——负=消耗、正=发放，
   双主题均 AA，两两不同（§168）。
2. 全锚既有双主题 token + `color-mix`；**零新增颜色 token、零写死 hex**（ADR-0123）。
3. `:focus-visible` 只补在**唯一 Link**（回首页登录）上；本页无 hover 动效，无 reduced-motion 门需求
   （FE-12/FE-14/FE-15 同口径：纯静态无动效片不立假门）。
4. 剥 className 全文哈希按切片工作注释 + 测试 `credits-visual-style.test.ts` 的独立 SHA256 断言钉死——
   **本提交会话实跑静态门 14/14 全绿；哈希值接切片自己的 735592fb…，未自行独立重算**（见"诚实边界"）。

## 验证

- **静态门 14/14**（`apps/web/test/credits-visual-style.test.ts`，去注释代码判据）
- **`tsc -p apps/web --noEmit` exit 0**
- globals.css 注释段含配对的 `§FE-16 / ADR-0164` 标记、断点说明与账本色守恒段（本 ADR 与之一致）
- **`npx playwright test --config e2e/pw-fe16.config.ts` → 4 passed**（`e2e/credits-visual.spec.ts`）：
  双主题语义色真上屏（`.cr-deltaNeg`=danger-ink、`.cr-deltaPos`=accent-2-ink ≠ 混用、两两不同）、
  48rem 真分档（≤767px 2 列 / ≥768px 4 列实测 gridTemplateColumns 拆数）、`.cr-backlink` 键盘 `:focus-visible` 真生效、
  `bg-0` ≠ 卡片 `bg-2`、零 console error——全部在真 Chrome 里实测。

## 诚实边界（接手切片，不是原作者）

- **本片由并行会话起写（代码 + 静态门 + 71 行 `.cr-` CSS），于中途状态停下**；本次接手完成收尾：
  静态门全绿确认、tsc 0、补本 ADR、**补 `e2e/credits-visual.spec.ts` 并跑通 4/4（48rem 断点 + 语义色 + focus ring）**——
  **不自建其未完成的变异臂证据**；`.fe16-scan.mjs` 的 `.cr-*` 仍是原作者的 working notes，
   保留在工作区、不上 Git（`pw-fe16.config.ts` 因 spec 落地而转为永久入口——其初稿标注的"提交前删"已被复核废止）。
- 剥 className 全文哈希（正文 `735592fb…` 来自切片自己的注释）**本提交会话未自行独立重算**。
- 无 dev server 常亮、无生产构建截图；视觉侧确认除 e2e 的断点/语义色断言外，记为待干净窗口。
- axe 级判定仍归 `a11y-internal.spec.ts`；本片不重复那扇门。

## 后果

- credits 页（全库裸 Tailwind 密度最高的 server 纯展示页）className 归 `.cr-` 家族，与 FE-10~15 的 `.mp-/.mi-/.me-/.mr-/.an-/.tc-` 同级——§FE 家族的"门面化"序列至此**覆盖全部公开/账号内 server 展示页**。
- 双主题 AA、账本正负色不可互传同一人的色温——两种读屏用户与打印黑白同款 AA。
- admin 系统侧（已于 §A11Y-3/§A11Y-4 升级导航与首页）与 §FE 家族回归剩余裸页到零。
- ADR-0165+：变异臂独立复算、以及 spec 与真 dx SAMPLE 从逆向反推的**治理级**对账（SAMPLE 是手写镜像，非产物 JSX 的机械转译——drift 仍靠剥 className SHA256 兜底）。
