# ADR-0142：公开试玩页登峰造极——三态门面 + 静态判据 + 双主题真浏览器

- 状态：已采纳（2026-11-11，§FE-7，承接 §FE-6 / ADR-0138）
- 关联：ADR-0123（前端六红线）、ADR-0009（发布钉住设计）、ADR-0138（FE-6 公开作品页）、
  ADR-0077（变异臂各有牙）、`apps/web/src/app/n/[handle]/[slug]/play/page.tsx`、
  `apps/web/src/app/globals.css`（`.pp-` 段）、`apps/web/test/play-visual-style.test.ts`（本片新增）、
  `e2e/play-visual.spec.ts`（本片新增）
- 触发（user 长期点名最重的一条）：**前端美观 / 魅力登峰造极 + 前后端协同**。

## 背景

公开门面矩阵已升 discover / marketplace / home / /search / `/u/<handle>`（创作者主页）/
`/n/<handle>/<slug>`（公开作品页）——**唯独缺 `/n/<handle>/<slug>/play` 公开试玩页**：
访客从作品页点"试玩"进来的第一张脸，游戏作品的核心体验落点。改前三个状态全是零语义前缀的
裸 Tailwind：

- `live`（可玩）：header 一条素边、标题纯色、钉住版说明贴边、back 一块裸链接；
- `none`（这一版无可玩内容）：一行标题 + 一段说明，空旷无门面；
- `broken`（钉住的游戏读不出来）：诚实错误态，但视觉上和空态一样平。

FE-6 把作品页门面化后，访客点进"试玩"却掉回裸样式，门面矩阵在最核心的体验落点断开。FE-7 补上。

## 决定

**只动视觉（§159 / ADR-0123 六红线）**：给 `page.tsx` 叠加 `.pp-` 语义前缀类（与 `.pb-`/`.pf-`/
`.se-` 同 token 语言），在 `globals.css` 加 `.pp-` 段。结构、三态分支、文案、`data-play-*` 钩子、
读路径、SEO、`PublicPlay`（游戏运行时本体）、`VisitMeter`（访问心跳）**一字未改**。

- **三种状态各自有门面**：`pp-root` 共用根隔离；`pp-empty` 空态/错误态柔和径向辉光卡（不冒充有游戏）；
  `pp-broken` warn 左竖线强调"读不出来"是诚实结论；`pp-live` header 门面渐隐光带；
  `pp-issues` 校验问题 warn 提示条（"能投影的照常可玩，不假装干净"）。
- **渐变墨字标题**：`.pp-title` 用 fg-1→brand 渐变 + `background-clip:text` + `color:transparent`，
  浅色主题 fg-1 端起步（不是白字写白底）；**绝不挂** `text-fg-*` 等更高层颜色 utility
  （FE-6 真浏览器抓出的真 bug，固化成静态门）。
- **钉住版说明**：`.pp-pinned` 虚线隔离条，突出"分享链接玩的是发布那一刻钉住的设计，不随工作稿变"
  （ADR-0009 的用户可见承诺，值得门面给层次）。
- **back 控件门面**：`.pp-back` 胶囊 + hover 抬升辉光 + `:focus-visible` 键盘描边。
- **零新增颜色 token**：全锚 `tokens.css` 双主题 token + `color-mix`、零写死 hex；reduced-motion
  收口全部动效；双主题 AA。

## 判据（两层，先红→绿→变异臂有牙）

### 静态那一寸 `play-visual-style.test.ts`（10 门，纯内存零浏览器/真库/时钟）

先红 **5 红 5 绿**（视觉段未接上时，类名闭环/成规模段/reduced-motion/focus/层优先级 5 门红；
零 hex/token/三态钩子/守读路径/注释定界符 5 门本就过——区分度正确），实现后 **10/10**。10 门：

1. 类名闭环：page.tsx 每个 `pp-*` 类在 globals.css 有**基础定义**（只认后跟 `{`/`,` 的基础选择器、
   整段剔 reduced-motion，堵 FE-5 变异臂 A 的"出现过≠定义过"洞）；
2. `.pp-` 段成规模（≥12 个基础类，不是空壳）；
3. 零写死 hex（扫整段含续行）；4. 每个 `var(--nexus-*)` 都在 tokens.css 声明过；
5. 三态 9 个 `data-play-*` 钩子一个不丢（少一个=改了判据面，非纯视觉片）；
6. 动效用 prefers-reduced-motion **按规则块**真正关掉（不吃 FE-5 按行扫漏多行声明的亏；
   只认声明边界的 `transform:`，排除 `text-transform` 静态排版）；
7. 交互控件 back 有 `:focus-visible`；
8. **守住读路径与诚实三态**（FE-7 特有）：`force-dynamic`、复用 `getPublishedPage`（不抄第二份
   漂移谓词）、`GameDocumentSchema.safeParse`（读不出来如实说）、`compileForKind`/`validateGame`、
   `PublicPlay`/`VisitMeter` 交互组件、钉住版说明与三态诚实文案——一个都不能被动；
9. 层优先级：`.pp-title` 渐变墨字不被颜色 utility 覆盖；
10. globals.css 块注释定界符严格配对（堵 FE-6"静态全绿但真编译挂"的洞；用字符码构造定界符避自指）。

**三变异臂各有牙、逐条 `trap EXIT` 字节级还原**（SIGTERM 也恢复，吸取 PERF-2 臂 B 残留教训）：
臂 A 去掉 `pp-title` → 类名闭环 + 层优先级红；臂 B 删 `.pp-back:focus-visible` → focus 门红；
臂 C 删 `.pp-` reduced-motion 收口 → 动效门红。

### 浏览器那一寸 `e2e/play-visual.spec.ts`

从发现页取**真公开作品**地址拼 `/play`（与 FE-5/FE-6 同一条诚实路径，不编夹具；发现页无公开作品则
`test.skip`，不把"没数据"当"页面坏了"）。真 Chrome 双主题 @smoke：验 `.pp-` 门面渲染、三态诚实断言
（落在 live/none/broken 之一、各态门面完整，不假设真语料一定有游戏）、零 console error、浅色渐变墨字。

**真浏览器那一寸最终 `2 passed`（2.9m，系统 Chrome，`dark` 34.9s / `light` 12.5s，非 skip、非 fail）**：从发现页一件真公开作品地址整条拼 `/play` 进访客试玩页，双主题 @smoke 全部验过——`.pp-root`/`.pp-back`/`[data-play-back]` 三态共用门面在、落在 `live|none|broken` 之一且那一态门面完整（live 验 `.pp-header`/`.pp-title`/`[data-play-title]`/`.pp-pinned`/`[data-play-pinned]`，浅色另验 `.pp-title` 的 computed `background-image` 含 `gradient` 且 `color=rgba(0, 0, 0, 0)`——`background-clip:text` 的透明字是预期，不是 bug；none/broken 验 `.pp-empty`/`.pp-emptyTitle`、broken 另验 `[data-play-issue]`）、零 console error。

**webServer 排障（诚实读数，非 FE-7 代码问题）**：Playwright `webServer.url` 与 `use.baseURL` 共用 `WEB_URL`，默认根路径 `/` 返回 **502**（后端网关依赖本机无干净窗口；`/discover` 才 200）——默认探测点等满 180s 超时、零测试执行，第一次如实记为环境问题。改用 `NEXUS_WEB_URL=http://localhost:3100/discover` 把探测点指到确实 200 的路径，**零改共享 `playwright.config.ts`**（`baseURL` 同变，但 spec 里所有 `goto` 都是绝对路径 `/discover` 与 `${workPath}/play`，`new URL(absolute, baseURL)` 覆盖 path，不受影响）；`reuseExistingServer:true` 复用已 curl 确认 HTTP 200 的 3100 Next dev server。第二次两主题一次通过。⚠️ `test-results/`（43 文件）与 `playwright-report/` 为 gitignored 运行产物，未进提交。

## 验证（诚实分层）

- 静态门：`play-visual-style` **10/10**（先红 5/5 → 10/10）、合并 `style-tokens` 横向门 **34/34**；
- 三变异臂各有牙（A/B/C 全红、逐条字节级还原）；
- 工程门：`eslint`（page.tsx + 新测试）**EXIT=0**、`tsc --noEmit -p apps/web` **EXIT=0**、
  page.tsx `transpileModule` 语法 **0 错误**；
- **横向回归**：FE-5/FE-6 的 style 判据在同 worktree 复跑全绿——关键耦合：`.pp-` 段插在 `.pb-`
  段之后，导致 FE-6 `pbSegment`（截断到 layer 顶格闭合 `}`）文本含 `.pp-` 段；逐门核验 FE-6
  零 hex/token 门因 `.pp-` 段同为零 hex/token 合规而过、动效门只提 `.pb-` 前缀类名不受影响、
  reduced-motion `.find` 仍取首个含 `.pb-` 的块。静态推演之外实跑 `published-style`/`profile-style`
  确认（**28/28，3 文件全绿**）。

## 诚实边界

- hover 态只由 CSS + 静态门覆盖，**未逐帧看图**（本机多 agent 抢资源下真浏览器 hover 逐帧不稳）；
- `e2e` 取真公开作品为语料，若那一刻无公开作品会 skip——诚实记录，不伪造数据；
- 空态/错误态门面**不冒充有游戏**（`pp-empty`/`pp-broken` 无 `pp-title`），这是内容诚实，不是视觉降级；
- 多实例、真库/真 Redis 套件本机无干净窗口，未硬跑、不编绿灯；未 push。

## 协作边界

开工时并行会话 SC-61（operator-token probe）正在提交、占用 ADR-0141，其提交消息明示"避让共线会话的
未提交 §PERF-2"；本片 ADR 让位 **0142**。本片只改 `play/page.tsx` + `globals.css` + 新静态判据 +
新 e2e + 本 ADR + ROADMAP/CURRENT-STATE/memory 增量登记；不卷入会话的 realtime / java 文件、
`test-results-mine*`、`META-INF/`。文档基准取自最新 HEAD（含会话 SC-61），只追加不 rewrite。

## 仍欠

- hover 态逐帧人工看图；
- `a11y-*` / `interactive-work.spec.ts` 判据面未改，留干净窗口复跑；
- 分镜页 `/n/[handle]/[slug]/storyboard` 可按本片范式继续门面化（公开门面矩阵下一块）。
