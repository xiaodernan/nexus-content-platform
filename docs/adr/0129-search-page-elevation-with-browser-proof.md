# ADR-0129：FE-4 全平台搜索页登峰造极——零新增 token、双主题真浏览器验电

- 状态：已采纳（2026-11-11，§FE-4）
- 编号沿革：本文件初稿占过 `0128`，与并行会话的 `0128-java-domain-service-speaks-on-the-wire.md`
  撞号；2026-11-11 本轮让位重编为 `0129`（标题号同步改），全仓 ADR 编号恢复唯一。会话的 Java realtime
  文档未动。
- 关联：ADR-0122（FE 公开面先升）、ADR-0123（FE 登峰造极六条红线）、
  §FE-1（`/discover`）/§FE-2（`/marketplace`）/§FE-3（`/` 首页）、
  `apps/web/src/app/search/{page,SearchBox}.tsx`、`apps/web/src/app/globals.css`（`.se-` 段）、
  `e2e/search.spec.ts`（本片新增）、`style-tokens.test.ts`（既有门禁）
- 触发（user 长期点名）：**前端的美观程度、魅力程度登峰造极**；同时不牺牲前后端协同（搜索逻辑一字未动）。

## 背景

FE-1/2/3 已把 `/discover`、`/marketplace`、`/` 首页升到顶流，剩下公开面里流量最大、最该精致却
最朴素的是 `/search`（§165 全平台搜索，发现链路的第二个公开入口）。改前它的观感：标题是纯文本
`text-[21] font-semibold`、搜索框是裸 `bg-bg-1` 输入 + 一个 `bg-accent-2` 方钮、结果分组标题无层次、
命中行只是 `bg-bg-1 + hover:bg-bg-2` 的平块、空态与范围说明都是一色文字。功能与可访问性逻辑
（原生 GET 表单、建议来自真命中、历史只在本机、429 静默期、combobox 键盘）都已完善，**这一片只动视觉**。

## 决定（守 ADR-0123 六条红线）

1. **公开面先升**：`/search` 是游客能到的公开页，与 FE-1 `/discover` 同优先级。
2. **颜色 token 不增**：全部效果锚在 `tokens.css` 已定义、深/浅双主题都成立的名字上
   （`brand`/`accent-1`/`accent-2`/`accent-fg`/`fg-*`/`bg-*`/`border-*`/`warn`/`motion-*`/`shadow-*`），
   渐变与辉光一律 `color-mix(in srgb, …)` 或既有 token，零写死 hex。
3. **不动信息架构**：不改路由、文案、分组口径、`data-*` 判据钩子、搜索逻辑；只换 className 与加 CSS。
4. **不动 Studio/业务面**：只碰公开 `/search` 页与其两个组件、globals.css 的一段。
5. **可访问性**：交互元素保留 focus-visible 描边；`prefers-reduced-motion` 下关掉所有 transform/transition；
   渐变墨字标题用 `fg-1` 端起步（浅色下不是白字写白底），fg-3 小字沿用已过 AA 的对比度。
6. **真浏览器验电**：新增 `e2e/search.spec.ts`，深/浅双主题各一条 @smoke，真 Chrome 跑。

### 落地（`.se-` 前缀，与 `.dv-`/`.mk-`/`.hp-` 同语言）

- **门面**：标题渐变墨字 + 一道 brand→accent-2 渐变压边；适用身份（登录/未登录范围）收成中性 pill；
- **搜索框**：整块门面 + 聚焦时 brand 辉光环（`:focus-within`），提交键 brand→accent-1 渐变 + hover glow + 微抬升；
- **分组**：标题带 brand→accent-1 竖线 + tabular-nums 计数 badge，"还有更多"自动靠右；
- **命中行**：accent-2 左描边 + hover 侧移 3px / brand 描边 / 渐显品牌左条 / 阴影；detail 省略号不撑破布局；
- **空态**：虚线框 + brand 14% 径向辉光；排法条 / 范围条各自有边界彩；
- **建议列表**：圆角 + 阴影门面，选中项 brand 淡染；历史 chip 化、hover brand 描边。

## 为什么这是"登峰造极"而不是堆效果

每一处效果都对应一个真实的可读性/层级问题：标题渐变把视线引到"这是搜索"；门面辉光让"我正在输入"有反馈；
分组竖线 + 计数 badge 让九类结果扫读有锚；命中行侧移 + 品牌描边让"这条可点、点了会走"一眼可见；
空态辉光让"没有结果"不是一堵灰墙。零装饰性动效、零诱导点击，全部服务于"打得准就能找到"。

## 验证（诚实分层）

- **静态门**：`style-tokens.test.ts` **24/24**（`.se-` 段所有 `var(--nexus-*)` 均已声明、fg-3 对比度过 AA）；
  `eslint`（`page.tsx` + `SearchBox.tsx`）**EXIT=0**；`tsc --noEmit -p apps/web/tsconfig.json` **EXIT=0**。
- **真浏览器**：`npx playwright test e2e/search.spec.ts --project=chrome` **2 passed**（1.1m，系统 Chrome）——
  - 深色：标题/表单/输入/提交/范围说明可见、GET 表单 action/method 正确、输入可聚焦、
    结果/空态二选一、`.se-` 门面钩子在场、**零 console error**；
  - 浅色：门面与提交键可见、标题计算色不是白字（浅色下可读）、**零 console error**。
- **看图（§159）**：深色匿名冷启动失败现场截图（修 matcher 前那次）已人工 Inspect——渐变标题、
  pill 范围、门面搜索框 + 紫色提交键、径向辉光空态、边界彩范围条全部正确渲染、无样式错乱，
  观感达到顶流公开页水准。该截图是 `toHaveAttribute` 等前置断言通过后、卡在我误用的
  `toBeFocusable()`（Playwright 无此 matcher）时留下的，属**判据 bug 非页面 bug**，已改 `evaluate` 修复。
- **未截到（如实记）**：本想再补"带结果命中行"的深/浅截图以 Inspect hover/计数 badge 实况，
  但单命令内起 Next dev + 双 Chrome 截图在本机多 agent 抢资源下被 SIGTERM 超时、未截到。
  命中行视觉**未人工看图**，只由 e2e 结构断言（href/属性/可见性）+ 静态 token 门覆盖，不宣称已看图。
  e2e 自身 2/2 是在早先 server 稳定运行时取得的，非这次超时脚本。
- 未 push。

## 后果与仍欠

**已交付**：`/search` 从公开面最朴素的一页升到与 FE-1/2/3 同语言；零新增颜色 token、零逻辑/信息架构变更；
深/浅双主题在真 Chrome 验过；首条 `/search` e2e 判据落地（此前这一寸零覆盖）。

**仍欠**：
- "带结果命中行 / hover / 计数 badge"的深/浅人工看图（待干净资源窗口补一张截图）；
- FE-1 的 `e2e/discover.spec.ts` 本轮之前写就但未跑，下一个干净窗口与 `search.spec.ts` 一并复跑；
- 公开面 `/u/[handle]`（创作者主页）、`/n/[handle]/[slug]`（作品页）等仍可按本片范式继续升，另立 FE 片。
