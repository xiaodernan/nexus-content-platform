# ADR-0135：FE-5 创作者主页登峰造极——门面化 + 静态判据 + 双主题浏览器验电

- 状态：已采纳（2026-11-11，§FE-5）
- 编号沿革：本片 ADR 初稿占 `0134`，落盘前查重发现并行会话已落 `0134-redis-cancel-strips-pending-list.md`
  （§SC-57）；沿用 SC-51/FE-4 的撞号纪律让位重编 **0135**（标题号同步改），会话文档未动。
- 关联：ADR-0122（FE 公开面先升）、ADR-0123（FE 登峰造极六条红线）、ADR-0129（FE-4 `/search`）、
  §FE-1（`/discover`）/§FE-2（`/marketplace`）/§FE-3（`/`）、
  `apps/web/src/app/u/[handle]/page.tsx`、`apps/web/src/app/globals.css`（`.pf-` 段）、
  `apps/web/test/profile-style.test.ts`（本片新增，静态那一寸）、
  `e2e/profile-visual.spec.ts`（本片新增，浏览器那一寸）、
  `e2e/profile-tasks.spec.ts`（既有，axe + 390 布局）、`style-tokens.test.ts`（既有门禁）
- 触发（user 长期点名）：**前端的美观程度、魅力程度登峰造极**，同时前后端协同、不牺牲可访问性。

## 背景

FE-1/2/3/4 已把 `/discover`、`/marketplace`、`/` 首页、`/search` 升到顶流。创作者主页 `/u/<handle>`
是**访客从发现页 / 搜索结果点进一个作者时看到的第一张脸**（§60），公开面里"个人门面"这一格，
却仍是零语义前缀的裸 Tailwind 原子类：头像无环、名字纯色小标题、handle 裸文本、作品卡一层薄边框、
世界/角色/游戏是贴着页边的无样式列表。功能与结构判据都已完善（§85 `profile-tasks.spec.ts` 已量过
axe + 390 布局，21 个 `data-profile-*` 钩子齐全），**这一片只动视觉**。

为什么这页非升不可：前四片升的是"平台货架"，这一片升的是"人"——一个创作者被陌生人第一次看见的
那一眼，观感直接决定对方会不会点开作品、会不会关注。裸列表把作品与世界/角色/游戏摊成同一层灰度，
没有主次、没有可点提示、没有身份感。

## 决定（守 ADR-0123 六条红线）

1. **公开面先升**：`/u/<handle>` 是游客能到的公开页，与 FE-1/4 同优先级。
2. **颜色 token 不增**：全部锚在 `tokens.css` 已定义、深/浅双主题都成立的名字上
   （`brand`/`accent-1`/`accent-2`/`accent-fg`/`fg-*`/`bg-*`/`border-*`/`warn-ink`/`motion-*`/`shadow-*`），
   渐变与辉光一律 `color-mix(in srgb, …)` 或既有 token，**零写死 hex**。
3. **不动信息架构 / 文案 / 结构钩子**：不改路由、文案、`data-*` 钩子、可见性判定逻辑；只换 className 与加 CSS。
   `page.tsx` 的 diff 是纯 className 替换——21 个 `data-profile-*` 钩子逐字仍在，所有文本节点逐字仍在。
4. **不碰交互逻辑**：`FollowButton` / `BlockControl` 是带 `data-*` 与交互的客户端组件，本片**一个字未改**，
   page.tsx 仍以原样引用它们。
5. **可访问性**：作品卡与试玩链接保留 `:focus-visible` 描边；`prefers-reduced-motion` 下关掉所有
   transform/transition；渐变墨字名字用 `fg-1` 端起步（浅色下不是白字写白底）；fg-3 小字沿用已过 AA 的对比度。
6. **静态 + 浏览器双层验电**：新增 `profile-style.test.ts`（零浏览器、确定性的"渲染前"不变式）与
   `e2e/profile-visual.spec.ts`（真 Chrome 深/浅双主题）。

### 落地（`.pf-` 前缀，与 `.dv-`/`.mk-`/`.hp-`/`.se-` 同语言）

- **门面 hero 卡**：brand 12% 径向辉光底 + 渐变压边；头像 brand→accent-1 渐变环；
  名字渐变墨字（`fg-1`→`accent-1`）、handle 中性 pill、bio 限宽 52ch；右侧粉丝数 tabular-nums badge。
- **分区卡**：世界 / 角色双栏各自成 panel，标题带 brand→accent-1 左竖线；竖线用 `top:15%+height:70%`
  居中而**不用 transform**（transform 只留给动效，免得 reduced-motion 门分不清静态居中与要关的位移）。
- **作品卡**：accent-2 左描边 + hover 抬升 3px / brand 描边 / 渐显品牌左条 / 阴影；网格 `auto-fill minmax(15rem,1fr)`，
  窄屏自然落单列；计数行 tabular-nums + fg-3。
- **列表**：世界/角色/游戏项 hover 淡染、brand 圆点、来源元信息退 fg-3；空态也有独立样式。
- **游戏**：试玩链接 chip 化 + hover 微抬升；"只有设计稿"中性 pill（不把没有的版本画成有）；
  隐私说明走 accent-1 边界条。
- **注销 banner**：brand 中性底 + warn-ink 左描边（§144/ADR-0025 的诚实提示，视觉更醒目但不吓人）。

## 为什么这是"登峰造极"而不是堆效果

每处效果对应一个真实层级/可读性问题：hero 辉光把"这是一个人的门面"和下面的货架分开；
渐变墨字 + 头像环把视线锚到"人"；分区竖线 + panel 让世界/角色/游戏各有归属、不再糊成一页灰字；
作品卡 hover 侧移 + 品牌描边让"这条可点、点了进作品"一眼可见；试玩 chip 与"只有设计稿" pill
把"能玩"与"只有设计稿"两种诚实状态在视觉上也分开。零装饰动效、零诱导点击，全部服务于"看清一个人"。

## 判据（静态那一寸：`profile-style.test.ts` 8 条，零浏览器/零真库/零时钟）

先加判据跑 **4 红 4 绿**（类名闭环 / `.pf-` 段规模 / reduced-motion 收口 / focus-visible 四红，
精准命中"视觉段还没落地"），再写实现转 **8/8 绿**。8 条钉：

1. page.tsx 用到的 29 个 `.pf-` 类**全部有基础规则定义**（不只是"类名出现过"——伪类/reduced-motion
   里出现不算，否则删掉 `.pf-workCard {…}` 主规则也会绿着漏掉空壳类）；
2. globals.css 有 ≥18 个成规模 `.pf-` 定义（不是空壳）；
3. `.pf-` 段**零写死 hex**；
4. `.pf-` 段每个 `var(--nexus-*)` 都在 tokens.css 声明过；
5. **21 个 `data-profile-*` 结构钩子一个不少**（纯视觉片的硬边界）；
6. `FollowButton` / `BlockControl` 两组件文件未被内联重写、钩子仍在；
7. 用了 `transition`/`transform`/`animation` 的 `.pf-` 类都被 `prefers-reduced-motion` **按规则块**
   收口（transition:none / transform:none 必须在同一条规则里点名对应类）；
8. 作品卡 / 试玩链接有 `:focus-visible` 键盘描边。

**四条变异臂各有牙、逐条还原**（ADR-0077；脚本跑完自动恢复 `globals.css` 为字节相同的 GOOD）：

- 臂 A 删 `.pf-workCard {…}` 主规则 → 红 2（类名闭环 + 规模门）；
- 臂 B 在 `.pf-` 段写死一个 hex → 红 1（零 hex 门）；
- 臂 C 删掉 `transition:none` 那条 reduced-motion 规则、只留 `transform:none` → 红 1（收口门）；
- 臂 D 删 `.pf-gamePlay:focus-visible` → 红 2（focus 门 + 收口门联动）。

**判据自身的两处真缺口由变异臂抓出并修正（诚实记录，不掩盖）**：
① "类名存在性"门最初按"出现过"算，臂 A 删主规则后仍被 `::before`/`:hover` 蒙混过关 → 改为
**剔掉 reduced-motion 段、只认基础选择器**（`.pf-x` 后紧跟 `{`/`,`，排除 `:` 伪类后缀）；
② reduced-motion 门最初按"行"扫，而 `.pf-workCard {` 的 `transition:` 写在**后续无 `.pf-` 字样的行**上
被 `pfRules()` 丢掉，导致 `transitioned` 空集、臂 C 假绿 → 改为**按完整规则块（`selector{decls}`）**解析。
这两处修正让判据更严而非放水：修正后 GOOD 8/8 绿、四臂全红、GOOD 字节级恢复。

## 验证（诚实分层）

- **静态门（零浏览器、确定性）**：`profile-style.test.ts` **8/8**（先红 4→实现后 8/8，四变异臂全红且
  GOOD 字节级恢复）；`style-tokens.test.ts` **24/24**（`.pf-` 段所有 `var(--nexus-*)` 均已声明、
  fg-3 对比度过 AA）；`eslint`（page.tsx + 新测试）**EXIT=0**；`tsc --noEmit -p apps/web/tsconfig.json`
  **EXIT=0**；`tsc --noEmit -p e2e/tsconfig.json` **EXIT=0**。
- **真浏览器（本片交付，FE-4 欠的那一步这里补上）**：`npx playwright test e2e/profile-visual.spec.ts
  --project=chrome --reporter=line` **2 passed（2.4m，系统 Chrome）**——深 / 浅双主题各一条 @smoke，
  **非 skip**：从发现页一件真公开作品 `/n/udac7ccfa/…` 取到 handle，量的是访客真正看到的那张脸
  （非 `isSelf` 分支）。验：作者名 / 关注键 / `.pf-header` hero 卡 / `.pf-name` 渐变墨字 / `.pf-twin`
  双栏 / `.pf-panel` / `.pf-sectionTitle` 全可见；有作品 ⇒ `.pf-workCard` 带 href + `.pf-workName` 可见，
  无作品 ⇒ 空态可见；浅色下名字计算色不是白字；**两主题零 console error**。发现页无公开作品时
  `test.skip`（不把"没数据"假绿成"页面坏了"），本次有数据、真渲染、真过。
- **看图（§159，本片补上 FE-4 未截到的那一寸）**：深 / 浅两张真 Chrome 截图人工 Inspect——
  深色：hero 微辉光底 + brand→accent-1 渐变压边、头像 brand→accent-1 渐变环（首字母 G）、
  渐变压字名、handle 胶囊、粉丝数 tabular-nums badge、作品卡 accent-2 左描边、世界/角色双 panel、
  分区左竖线、隐私说明 accent-1 边界条、游戏区，全部正确渲染、无样式错乱；浅色：同一套在白底上
  名字是深色墨字（不是白字写白底）、hero 淡紫辉光克制、文字对比清楚。截图来自本次 pass 的
  Playwright 产物，归档于 `docs/evidence/fe-profile-elevation/{profile-dark,profile-light}.png`
  （`screenshots/` 与 `test-results/` 被 .gitignore 排除，按 FE-1 约定落到 `docs/evidence/<slice>/`）。
- **未硬跑**：全仓 vitest / 真库集成套件本机多 agent 抢同一 Postgres 无干净窗口，未硬跑、不编绿灯；
  既有的 `e2e/profile-tasks.spec.ts`（axe + 390 布局）本片未改动、未单独复跑，视觉升级不改变其判据面，
  但它下一个干净窗口值得随本片 e2e 一并复跑（列仍欠）。未 push。

## 后果与仍欠

**已交付**：创作者主页从裸 Tailwind 列表升为顶流个人门面（hero 卡 / 渐变墨字 / 作品卡 / 双栏 panel /
chip 化试玩 / 诚实标注），零新增颜色 token、双主题 AA、结构/文案/`data-*`/交互逻辑一字未改；
静态判据用确定性的"类名闭环 + 零 hex + token 真存在 + 21 钩子 + reduced-motion + focus-visible"
钉住"只动视觉"，四变异臂证明每道门都有牙；双主题真浏览器 2 passed + 双截图人工看图。

**仍欠**：
- 既有 `profile-tasks.spec.ts`（axe + 390 布局）下个干净窗口随本片一并复跑（本片未改其判据面，但值得回归一次）。
- 作品卡 hover 态（侧移 / 渐显品牌左条）与试玩 chip hover 只在 CSS + 静态门覆盖，双截图拍的是静态态，
  hover 视觉未逐帧看图（FE-4 同类边界，不编）。
- `/n/<handle>/<slug>` 作品页、`/n/<handle>/<slug>/storyboard` 分镜页仍是裸视觉，可按本片 `.pf-` 范式
  另立 FE 片（另开 ADR）。
