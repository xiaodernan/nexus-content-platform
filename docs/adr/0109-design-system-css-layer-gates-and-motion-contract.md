# ADR-0109：设计系统 CSS 层的门、motion 契约，以及一个静默失效的 11px 徽标

- 状态：accepted
- 日期：2026-11-12
- 版本片：v676
- 关联：ADR 0090（门钉标识符/边界/同源，不钉今天恰好相等的字面值）、ADR 0094 X4（门不许惩罚
  正当改动，也不许逼谁造无意义的消费者）、ADR 0095（注释/门声称的语义必须有门去读它声称的那件事）、
  `apps/web/test/style-tokens.test.ts`（§12 token 引用 + §90 WCAG 对比度门）、§122 motion token、
  `globals.css` / `tokens.css`（设计系统权威定义）

## 背景：前端的"登峰造极"在无法渲染验证的宿主上怎么落地

用户要求"大幅提升前端美观，使其登峰造极"。但本宿主**做不了渲染级/截图验证**（screenshot harness
没有可见桌面窗口，lane 自己的 cont.35 也把 pixel judgement 留给 Review pane），而"好看"又无法确定性
断言——强行加一道"必须好看"的门只会钉住某句 CSS 字面值（违反 ADR 0090/0094）。

并行 lane 的 11-12 品牌化 wave 还在逐页推 `page.tsx`（api-tokens/analytics/blocks/search/home/
notifications/credits/preview/play/storyboard/game/world/invites/u ...），最后一笔 `43df71e` 就在本轮
v675 期间。碰具体 `page.tsx` 冲突风险高，且改了也无法在本机验"更好看"。

**所以本片选了唯一能拿出门证据、且零 page.tsx 冲突的形状**：设计系统的**共享 CSS 基底**
（`globals.css` / `tokens.css` / `style-tokens.test.ts`）。逐 commit stat 核实这三个文件自
10-28～11-11 未被 lane 动过，是安全的公共层。目标不是"加一个渐变"，而是补两处**可验证的真实空洞**。

## 探针实测：两处空洞，其中一处是真 bug

纯 Node 探针（`globals.css` + `tokens.css` + 全 `.tsx/.ts` 扫 `var(--nexus-*)` vs `tokens.css` 定义）：

1. **CSS 层在 token 引用门的射程外**。`style-tokens.test.ts` 的"引用必须已定义"门只扫 `.tsx/.ts`，
   而 `globals.css` 的 `@theme` 块映射了 30+ 个 token、`tokens.css` 自己层叠引用——这两处写错名字
   同样静默失效（拼错的 `var()` 不报错，只是那条工具类再也不起作用），却没有任何门看着。这正是
   `style-tokens.test.ts` 文件头讲的 §45 旧案（"选中态写成不存在的 `--nexus-color-accent`，静默失效"）
   在 CSS 层的重演。
2. **一处真实的静默失效（本片抓到并修复）**：把门一扩到 CSS/TSX 全体，立刻抓到
   `apps/web/src/app/page.tsx:58` 引用 `--nexus-font-size-11`，而字号阶梯从 12 起（8 档）⇒ 这个
   `var()` **从未定义过**，home 页 "LIVE PROVIDER / DEMO MODE" 徽标的字号一直回落到继承值。
   全站仅此 1 处用 11 档。它是 lane 11-11 改 home 时手写的，旧门没接 CSS 却也该从 .tsx 抓到——
   说明这行是在上一次门跑绿之后新增的，正说明"逐页改 + 静态门频率"之间的缝。
3. **motion token 整族孤儿**：`--nexus-motion-fast/base/slow/ease` 四个 token 全站 0 个 `var()`
   消费者——§122 把动效节奏写进了权威文件，屏幕上一帧都没兑现，`prefers-reduced-motion` 兜底也
   因此几乎空转（block 在，却没东西可兜）。其余孤儿（breakpoint / z-index / radius-full /
   shadow-sm/lg）各有正当理由（breakpoint 注释明说仅供 JS 读、z 层待用），**不一律判为浪费**。

## 决定：三件可验证的事 + 一条诚实边界

1. **token 引用门扩到 CSS**（`styleFiles` 收 `.css`，与原 `tsxFiles` 同一套判据）：全站 `.tsx/.ts/.css`
   里的 `var(--nexus-*)` 都必须已在 `tokens.css` 定义。附两条验电臂：① 把一个 `@theme` 映射换成
   未定义名 ⇒ 门红（证明 CSS 确实被扫，不是空门）；② 把 11px 档从定义集合拿掉 ⇒ home 那条 `var()`
   被判坏引用（钉住这次修复不静默回退）。
2. **修复 11px 静默失效**：**补 `--nexus-font-size-11: 11px` 进设计系统**（字号阶梯 8→9 档），
   并在 `@theme` 暴露 `--text-11`。选补档而不是改 `page.tsx` 那行 → `-12`：① lane 的设计意图明确
   要一个比 12 更小的 font-mono 大字距小标签；② 补档尊重该意图，且给全站想要 11px 小标签处一个
   合法出处；③ **零 page.tsx 冲突**（不碰 lane 领地）。全站只此一处用 11 档，没有门钉"8 档"这个
   数量（tokens.css 注释里的"8 档"是描述，不是断言），补档不触红。
3. **让 motion 契约变活**（`globals.css` 的 `@layer base`）：
   - `:where(a, button, [role='button'])` 一条**零特异性**过渡基底，`transition-duration: var(
     --nexus-motion-base)`、`timing-function: var(--nexus-motion-ease)`，覆盖 color/bg/border/shadow/
     transform 四类交互态；`:active` 用 `var(--nexus-motion-fast)` 的 `scale(0.98)` 触觉反馈。
     它只决定"状态切换花多久"，不决定"长什么样"，所以 lane 逐页的颜色/渐变/布局完全不受影响。
   - `prefers-reduced-motion` 兜底**补全**：原块压了 duration/iteration/scroll，但漏了
     `animation-delay`/`transition-delay`——带延迟的动画在"减少动态"下仍会迟滞出现；补 `0ms` 两条，
     并在 reduce 下把 `:active` 的 `scale` 直接 `transform: none !important`（减少动态不只是变快，
     而是不做位移）。这是可访问性**硬收益**，且静态可验。
   - **motion 消费者门**：钉 fast/base/ease 三档交互节奏各有全站 `var()` 消费者（防退回"整族
     孤儿"），**刻意不强求 slow 档**——它是给将来大转场预留的慢节奏，此刻无消费者是合法现状，
     门不许为了点云数逼谁造一个没意义的长动画（ADR 0094 X4 的反向纪律）。reduced-motion 完整性门
     钉兜底块必须同时压住 duration 与 delay、并消掉 `:active` 位移；两条都只钉语义，不钉"写在
     globals.css 第几行/哪条选择器"，lane 换一条正当动效实现仍绿。

**诚实边界（写死在 ADR 里）**：本片**没有**对"页面是否真的更美"做任何断言——本宿主无法渲染/截图
验证，pixel judgement 留给 hosted Review pane（与 lane cont.35 同一条边界）。本片证明的是：设计系统
的 CSS 层不再有静默失效的 token 引用、motion 契约不再是死 token、减少动态兜底完整。这三点可确定性
验证，是"登峰造极"的地基而非成品。

## 验证（本机 2026-11-12）

- `style-tokens.test.ts` **29/29**（原 25 + 新 4：CSS 覆盖门 + 11px 回退验电 + motion 消费者门 +
  reduced-motion 完整性门；另把消费者门的空集验电算在原结构里）；原门零回归。
- `code-index.test.ts` + `style-tokens.test.ts` 合并 **47/47**（code-index 读 tokens.css 自定义属性，
  11px 新档不影响其符号判据）。
- 窄 tsc（`style-tokens.test.ts`）exit 0；eslint（同文件，足堆）exit 0；
  `verify:record-encoding` exit 0（**0 chargeable lines over 2241 graded files**——新 CJK 注释未引入
  未 pin ISLAND 行；graded 从 v675 的 2238 涨到 2241，正是本片三文件入扫）。
- **census 不漂移**：本片零新增 `docs/evidence/*`、零新增 `verify:*`；`git ls-files -- docs/evidence`
  = `git ls-tree -r HEAD -- docs/evidence` = **163**，population 未变，disposition 表不动，不新建独立
  变异臂 `.mjs`（那会变 unclassified 逼着改 census README 计数）。验电臂因此内联在门文件里，与该文件
  通篇"验电：旧值必须不及格"的既有纪律一致。
- 临时窄 tsconfig 跑完即删、从不暂存。

## 仍欠（如实记）

1. **无本机渲染级/截图验证**：`:where(...)` 过渡与 `scale(0.98)` 的实际观感、`prefers-reduced-motion`
   在真浏览器下的行为，留给 hosted Review pane / axe e2e（`e2e/theme-toggle.spec.ts` 等覆盖主题，
   但 motion 的浏览器断言尚未加）。本片只做静态可验的地基。
2. `--nexus-motion-slow` 仍是预留档、0 消费者（门明确不强求）；将来若加页面级大转场，应走这个
   token 而非写死毫秒。
3. 其余 13 个孤儿 token（z 层 5 / breakpoint 5 / radius-full / shadow-sm+lg）——各有正当待用理由，
   本片没逼它们"变活"，也没把"0 消费者"一律判为缺陷（避免 ADR 0094 X4 式误伤）。
4. `verify:evidence-census` 本体本宿主未重跑（主堆外 spawn 30s 扫描常 SIGTERM，资源非账本红）；
   用上面"population 163=163、零 evidence 改动"的静态证明代替，不谎称本机跑绿。
5. 11px 档是新纳入阶梯的第 9 档；若设计侧认为 home 徽标应统一到 12px，正解是**先改 design 决策、
   再两端一起改**（删档 + 改那一行），不是留一个没人用的孤儿档——这条语义未定，本片按当前 lane
   设计意图补档，不替设计侧拍板。

## 纪律沉淀

- **无法验证"好看"时，去做能验证的地基**：token 引用完整性、motion 契约是否有消费者、减少动态
  兜底是否闭环——这些都是"美观/无障碍"里可确定性断言的部分，比堆一段无人验"好看"的渐变扎实。
- **静态门抓真 bug 的价值高于门本身**：扩 CSS 覆盖那一跑就抓到 home 的 11px 静默失效——一个
  逐页品牌化 wave 里手写错、旧门看不见、屏幕默默回退的真缺陷。门的第一次运行就回本。
- **补设计系统 vs 改调用点**：遇到"调用点写了个不存在的 token"，先问设计意图——若意图正当
  （这里确实要更小的标签），补权威定义比改调用点更对，且零 lane 冲突；若意图是手滑，才改调用点。
- **门不许逼消费者**：motion slow 档、z 层、breakpoint 的"暂无消费者"是合法现状；门钉"整族不
  孤儿"或"交互实需的三档已兑现"，不钉"每个 token 必须有消费者"，否则会诱发一堆无意义实现。
