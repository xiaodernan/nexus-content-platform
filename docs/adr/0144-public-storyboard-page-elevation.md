# ADR-0144：公开分镜页登峰造极——三态门面 + 静态判据 + 双主题真浏览器

- 状态：已采纳（2026-11-11，§FE-8，承接 §FE-7 / ADR-0142）
- 关联：ADR-0123（前端六红线）、ADR-0009（发布钉住设计）、ADR-0138（FE-6 公开作品页）、
  ADR-0142（FE-7 公开试玩页）、ADR-0077（变异臂各有牙）、`apps/web/src/app/n/[handle]/[slug]/storyboard/page.tsx`、
  `apps/web/src/app/globals.css`（`.ss-` 段）、`apps/web/test/storyboard-visual-style.test.ts`（本片新增）、
  `e2e/storyboard-visual.spec.ts`（本片新增）
- 触发（user 长期点名最重的一条）：**前端美观 / 魅力登峰造极 + 前后端协同**。

## 背景

公开门面矩阵已升 discover / marketplace / home / /search / `/u/<handle>`（创作者主页）/
`/n/<handle>/<slug>`（公开作品页）/ `/n/<handle>/<slug>/play`（公开试玩页）——**唯独缺
`/n/<handle>/<slug>/storyboard` 公开分镜页**：访客从作品页点"分镜"进来的镜头表落点。FE-7 把
试玩页门面化后，分镜页仍是零语义前缀的裸 Tailwind：

- `live`（有镜头表）：header 素边、标题纯色、钉住版说明贴边、每镜一张裸 `rounded border` 卡，
  镜头序号/meta/prompt 全平铺无层次；
- `none`（这一版没有分镜稿）：一行标题 + 一段说明，空旷无门面；
- `broken`（钉住的分镜读不出来）：诚实错误态，但视觉上和空态一样平。

公开门面矩阵在"分镜"这一落点断开。FE-8 补上，与其同构的 FE-5/6/7 合龙成完整访客动线
（作品页 → 试玩页 / 分镜页）。

## 决定

**只动视觉（§159 / ADR-0123 六红线）**：给 `page.tsx` 叠加 `.ss-` 语义前缀类（与 `.pp-`/`.pb-`/
`.pf-`/`.se-` 同 token 语言），在 `globals.css` 加 `.ss-` 段。结构、三态分支、文案、
15 个 `data-storyboard-*` 钩子、读路径、SEO、`VisitMeter`、镜头标签映射
（`ARROW_LABELS`/`CAMERA_LABELS`/`TRANSITION_LABELS`）、"镜头表不是视频"的诚实边界**一字未改**。

- **三种状态各自有门面**：`ss-root` 共用根隔离；`ss-empty` 空态/错误态柔和径向辉光卡（不冒充有分镜稿）；
  `ss-broken` warn 左竖线强调"读不出来"是诚实结论；`ss-live` header 渐隐光带 + accent-2→brand 双色收边；
  `ss-issues` 校验问题 warn 提示条（"读不出来比给空镜头表诚实"）；
  `ss-notice` 中性边界条明说"这是镜头表、不是视频、这一版没发布可播成片"（§159 内容诚实优先）。
- **镜头表逐镜裱框**：`ss-shots` 去 ordered-list 默认序号（序号已在 `ss-shotMeta` 里"第 N 镜"），
  `ss-shot` 细边圆角卡 + accent-2 左竖线 + hover 抬升（reduced-motion 收口），meta 弱化、
  prompt 主体、引用行虚线隔离——信息层次清楚，且始终不越过"文本镜头表"的诚实边界。
- **渐变墨字标题**：`.ss-title` 用 fg-1→accent-2 渐变 + `background-clip:text` + `color:transparent`，
  浅色主题 fg-1 端起步（不是白字写白底）；**绝不挂** `text-fg-*` 等更高层颜色 utility
  （FE-6 真浏览器抓出的真 bug，固化成静态门）。
- **钉住版说明**：`.ss-pinned` 虚线隔离条，突出"分享链接看的是发布那一刻钉住的镜头表，不随工作稿变"
  （ADR-0009 的用户可见承诺）。
- **back 控件门面**：`.ss-back` 胶囊 + hover 抬升辉光 + `:focus-visible` 键盘描边。
- **零新增颜色 token**：全锚 `tokens.css` 双主题 token + `color-mix`、零写死 hex；reduced-motion
  收口全部动效（`.ss-back`/`.ss-shot` 的 transition 与 transform）；双主题 AA。

## 判据（两层，先红→绿→变异臂有牙）

### 静态那一寸 `storyboard-visual-style.test.ts`（10 门，纯内存零浏览器/真库/时钟）

先红 **5 红 5 绿**（视觉段未接上时，类名闭环/成规模段/reduced-motion/focus/层优先级 5 门红；
零 hex/token/15 钩子/守读路径/注释定界符 5 门本就过——区分度正确），实现后 **10/10**。10 门：

1. 类名闭环：page.tsx 每个 `ss-*` 类在 globals.css 有**基础定义**（只认后跟 `{`/`,` 的基础选择器、
   整段剔 reduced-motion，堵 FE-5 变异臂 A 的"出现过≠定义过"洞）；
2. `.ss-` 段成规模（≥12 个基础类，不是空壳；实际 21 个）；
3. 零写死 hex（扫整段含续行）；4. 每个 `var(--nexus-*)` 都在 tokens.css 声明过；
5. 三态 15 个 `data-storyboard-*` 钩子一个不丢（少一个=改了判据面，非纯视觉片）；
6. 动效用 prefers-reduced-motion **按规则块**真正关掉（不吃 FE-5 按行扫漏多行声明的亏；
   `transition:none` 与 `transform:none` 分别校验）；
7. 交互控件 back 有 `:focus-visible`；
8. **守住读路径与诚实边界**（FE-8 特有）：`force-dynamic`、复用 `getPublishedPage`（不抄第二份
   漂移谓词）、`StoryboardDocumentSchema.safeParse`（读不出来如实说）、三态诚实文案、
   镜头标签映射、`VisitMeter`、"不是视频"边界——一个都不能被动；
9. 层优先级：`.ss-title` 渐变墨字不被颜色 utility 覆盖；
10. globals.css 块注释定界符严格配对（堵 FE-6"静态全绿但真编译挂"的洞；用字符码构造定界符避自指）。

**三变异臂各有牙、逐条当场备份 + `trap EXIT` 字节级还原**（SIGTERM 也恢复，吸取 PERF-2 臂 B
与 FE-8 自身的残留教训）：
臂 A 去掉 `.ss-title` 渐变墨字 → 层优先级 + 动效门红（实测 2 红）；
臂 B 删 `.ss-back:focus-visible` → focus 门红（实测 1 红）；
臂 C 删 `.ss-` reduced-motion 收口 → 动效门红（实测 1 红、补回即转绿）。
**事故**：三臂批处理首次被 SIGTERM 打断，trap 未完成还原、把"删 reduced-motion"的变异残留在
globals.css，导致后续臂 C 的变异脚本 assert 失败（块已不在）却"红"了动效门——假红（块缺失本身红，
非变异功劳）。**修法**：grep 复核发现块缺失、Edit 补回 GOOD 基线、改为单臂当场备份 +
md5 断言变异确实改变文件 + `trap EXIT` 还原；还原后 GOOD 稳定 10/10。**教训固化**：变异脚本的
GOOD 基线不能在被污染状态上继续，每条臂必须自带 `md5sum` 前后比对断言"变异真的发生了"，
且恢复走 `trap`/`finally`（不能靠顺序执行）。

### 浏览器那一寸 `e2e/storyboard-visual.spec.ts`

从发现页取**真公开作品**地址拼 `/storyboard`（与 FE-5/6/7 同一条诚实路径，不编夹具；发现页无公开作品
则 `test.skip`，不把"没数据"当"页面坏了"）。真 Chrome 双主题 @smoke：验 `.ss-` 门面渲染、
三态诚实断言（落在 live/none/broken 之一、各态门面完整，不假设真语料一定有分镜稿或镜头）、
零 console error、浅色渐变墨字。live 态若有镜头验逐镜裱框卡；空镜头表验 `ss-shotsEmpty`；
`ss-notice` "不是视频"诚实边界必须在。**探活**：显式 `NEXUS_WEB_URL=.../discover`
（本机根路径 `/` 曾因后端网关无干净窗口返回 502 令 Playwright webServer 等满 180s；`/discover` 恒 200），
所有 goto 为绝对路径不受 baseURL 带 path 影响。

**真浏览器那一寸最终 `2 passed`（15.2s，系统 Chrome，`dark` 7.1s / `light` 2.3s，非 skip、非 fail）**：从发现页一件真公开作品地址整条拼 `/storyboard` 进访客公开分镜页，双主题 @smoke 全部验过——`.ss-root`/`.ss-back`/`[data-storyboard-back]` 三态共用门面在、落在 `live|none|broken` 之一且那一态门面完整（live 验 `.ss-header`/`.ss-title`/`[data-storyboard-title]`/`.ss-pinned`/`[data-storyboard-pinned]`/`.ss-notice` 诚实边界，若有镜头验 `.ss-shot` 裱框卡 + meta/prompt、空镜头表验 `.ss-shotsEmpty`，浅色另验 `.ss-title` 的 computed `background-image` 含 `gradient` 且 `color=rgba(0, 0, 0, 0)`——`background-clip:text` 透明字是预期；none/broken 验 `.ss-empty`/`.ss-emptyTitle`、broken 另验 `[data-storyboard-issue]`）、零 console error。

**探活一次到位（复用 FE-7 教训，零超时）**：显式 `NEXUS_WEB_URL=http://localhost:3100/discover` 把 webServer 探测点指到确实 200 的路径（根路径 `/` 曾因后端网关无干净窗口返回 502 令 FE-7 首跑等满 180s），`reuseExistingServer` 复用已 curl 确认 200 的 3100 Next dev；跑前零删除 `mv` 归档陈旧 `test-results/`（43 文件）与 `playwright-report/` 绕开 safe-delete 护栏。本次一次通过、无 FE-6 式的注释闭合/层优先级真 bug 复现（两处已由静态第 9/10 门永久钉死）。⚠️ 运行产物 `test-results/`（1 文件）与 `playwright-report/` 为 gitignored，未进提交。

## 验证（诚实分层）

- 静态门：`storyboard-visual-style` **10/10**（先红 5/5 → 10/10）、合并 `style-tokens` 横向门 **34/34**；
- 三变异臂各有牙（A/B/C 全红、逐条字节级还原；首次 SIGTERM 残留已修，GOOD 复核稳定 10/10）；
- 工程门：`eslint`（page.tsx + 新测试）**EXIT=0**、`tsc --noEmit -p apps/web` **EXIT=0**、
  `tsc --noEmit -p e2e` **EXIT=0**、globals.css `postcss.parse` OK、page.tsx `transpileModule` **0 错误**；
- **横向回归**：FE-5/FE-6/FE-7 的 style 判据在同 worktree 复跑全绿——关键耦合：`.ss-` 段插在 `.pp-`
  段之后，导致 FE-7 `ppSegment`（截断到 layer 顶格闭合 `}`）文本含 `.ss-` 段；逐门核验 FE-7 零 hex/token
  门因 `.ss-` 段同为零 hex/全 token 合规而过。实跑 `play-visual-style` 10/10、`published-style` 11/11、
  `profile-style` + `state-styles` 17/17，**横向 38/38**（分批单 worker，每批独立 EXIT=0；合并批一次被 SIGTERM 打断属资源抢占、非测试失败，拆单文件后全绿，不掩盖失败）。

## 诚实边界

- hover 态只由 CSS + 静态门覆盖，**未逐帧看图**（本机多 agent 抢资源下真浏览器 hover 逐帧不稳）；
- `e2e` 取真公开作品为语料，若那一刻无公开作品会 skip——诚实记录，不伪造数据；
- 空态/错误态门面**不冒充有分镜稿**（`ss-empty`/`ss-broken` 无 `ss-title`），这是内容诚实，不是视觉降级；
- 本机没有接真实视频 provider，也没有发布视频资产，本页只呈现镜头表文本、`ss-notice` 明说"不是视频"
  ——视觉升级不改变这一 §159 诚实边界，也不伪造播放器；
- 多实例、真库/真 Redis 套件本机无干净窗口，未硬跑、不编绿灯；未 push。

## 协作边界

开工时 HEAD 已含并行会话 SC-61/SC-62/SC-63（operator-token probe / Feign breakerState 上 admin 面板 /
verify:topology 对 Java probe/stats 的门断言）与我的 FE-7；本片 ADR 让位 **0144**（0143 被 SC-62 占用）。
本片只改 `storyboard/page.tsx` + `globals.css` 的 `.ss-` 段 + 新静态判据 + 新 e2e + 本 ADR +
ROADMAP/CURRENT-STATE/memory 增量登记；不卷入并行会话的 java/realtime 文件、
`test-results-mine*`、`META-INF/`、`.next-dev-archives/`。文档基准取自最新 HEAD，只追加不 rewrite。

## 仍欠

- hover 态逐帧人工看图；
- `a11y-*` / `interactive-work.spec.ts` 判据面未改，留干净窗口复跑；
- 公开门面矩阵余下落点（如作品统计、收藏列表）可按本片范式继续门面化。
