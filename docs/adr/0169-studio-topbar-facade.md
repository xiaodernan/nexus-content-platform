# ADR-0169：Studio 顶栏 `.sp-` 门面基建——创作台家族门面化的开篇 + 两处判据自身修实

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0123（六红线）· ADR-0146（A11Y-1 forced-colors）· ADR-0154（code/clean 纪律）· ADR-0166（§CRIT-1 段边界修实）· ADR-0167（FE-18 首页门面）· `apps/web/src/studio/TopBar.tsx`

## 背景

用户长期点名"大幅提升前端的美观程度、魅力登峰造极 + 前后端协同"。FE-4~FE-18 已把公开门面矩阵
（discover / marketplace / home / search / profile / published / play / storyboard / 404 / credits /
notifications / analytics / earnings / reports / purchases / 市场交互原子）逐一收进 `.dv-`/`.mk-`/`.hp-`/
`.an-` 等门面命名空间，**唯独 `/studio/[projectId]` 创作台家族从未门面化**：`apps/web/src/studio/`
下 30+ 面板组件全是裸 Tailwind 平铺（TopBar 改前 14 处 className / 83 处裸原子类 / 46 去重）。

先分清占用：`globals.css` 里既有 `.ss-` 段是 **FE-8 公开分镜页** `/n/[handle]/[slug]/storyboard` 的门面，
与 Studio 创作台无关，不能复用也不能覆盖。创作台是作者停留最久、交互最密的核心工作面，也是全库
唯一未开垦的前端大陆。按用户"找不出事做就自己规划新内容填充扩充、持续丰富使其成为集大成者"，
本片开 `.sp-` 命名空间第一片。

选片取 `TopBar.tsx`：182 行 / 14 处 className（11 静态 + 3 `cn()` 动态）/ 仅 1 个 `lg:` 响应式断点 /
规模可控、状态机清晰，且是每次进 Studio 第一眼看到的视觉门面。StudioShell（415 行、多断点任意值、
手写 @media 风险高）、CommandBar（640 行）、ContextPanel（59 处 className）等留作后续机械推广，
本片立住判据范式与视觉语言，边际成本递减。

## 决定

### 一、纯视觉门面，剥类全文 SHA256 零行为

只把 14 处 className 换成 21 个 `.sp-*` 门面类；状态机（viewport / undo-redo / editingName /
saveState / railOpen）、`studio.*` 存储调用、事件处理（onChange/onBlur/onKeyDown/onClick）、2 个 `<a>`
href/title、4 个 data 钩子（`data-project-name`/`data-save-state`/`data-theme-mode`/`data-viewport`）、
aria 契约、全部诚实文案逐字节不动。三处 `cn()` 动态类只换字符串字面值，条件（`viewport === v.id` /
`props.active` / `props.disabled &&`）/ 标识符 / 比较 / 分支位置全保留。

**铁证**：剥 className 后全文哈希 `3f6bcdd8…` 在**改前**由真实产物算出并钉死为常量，改后匹配同一
常量——证明改动只落在类字面值里，其它一个字节没动。className 数 14、静态 11、3 `cn()` 全部守恒。

### 二、逐像素等价 + 六红线

`.sp-` 段全锚既有双主题 `--nexus-*` token + 克制 hover 过渡，零新增颜色 token、零写死 hex、不加
渐变墨字（TopBar 无标题，不扩 A11Y-1 forced-colors 面）。逐像素还原所有 Tailwind 计算值：
`h-space-10`(40px) / `z-60` / `w-220px` / `max-w-280px` / `min-h-6`(space-6=24px) /
divider `h-space-4 × w-1px` / `py-space-1` / `py-[2px]`→space-1 档、两档语义色（选中 brand+
accent-fg / 未选中 fg-3+hover）、保存态 error=danger-ink、disabled=cursor:not-allowed+opacity .4。
2 个 `<a>`（wordmark / 预览）+ 全控件 `:focus-visible` brand 环，新增 hover 过渡由
`@media (prefers-reduced-motion: reduce)` 真收口。

**响应式断点真值**：改前唯一 `lg:hidden`（railToggle）经 Tailwind 4 真编译 = `(min-width: 64rem)`
（1024px，见 `tokens.css --nexus-breakpoint-lg`），精确落 `@media (min-width: 64rem)` 内
`.sp-railToggle { display: none }`，错位即真实失真（承 ADR-0138 FE-16 48rem 断点教训）。

### 三、判据与验证（先红 → 绿 → 变异 → 浏览器 → 横向 → 工程门）

1. **先红 6/7**：新判据 13 门先跑，6 个视觉门（类名闭环/规模/零裸类/动态类条件/六红线/64rem
   断点）红、7 个对照门（零 hex/token 存在/零新增 token/剥类哈希/data 钩子/文案契约/定界符）本就绿
   ——证明判据有牙且不误伤。先红阶段当场修一处判据锚点假红（项目名文案是 `'未命名项目'` 单引号，
   误写成反引号），行为门回归应绿。
2. **绿 13/13**：改完生产 + CSS，判据全绿；剥类哈希守恒、className 数守恒。
3. **变异臂 8/8 KILLED**（判据自身的验伪器，每臂备份→断言锚命中唯一→写变异→断言字节真变→
   真跑门→断言目标门红→恢复→md5 核验恒等，全程生产/CSS 零残留）：A 剥类哈希（className 外动
   1 字节）/ B 零裸 Tailwind / C 动态类三元反转 / D hover 规则体删空 / E focus 环删选择器 /
   F disabled 语义反转 / G 64rem→48rem 断点错位 / H sp 段塞写死 hex。
4. **离线真 Chrome e2e 6/6**：`page.setContent` 注入真实产物字节（tokens + `.sp-` 段），不访问 URL、
   不依赖后端/会话/夹具；验双主题渲染 + 4 data 钩子 + viewOn/viewOff 两态计算样式可分 + divider
   `1px×16px` + topbar `z-60` + 真键盘 Tab 聚焦 `<a>`/`<button>` 有 brand outline + disabled 语义 +
   64rem 两侧 railToggle 真切换 + 零 console。
5. **横向门**：15 份 style/visual 静态判据（含 A11Y-1 forced-colors）零回归。
6. **工程门**：`eslint` 改动文件 RC=0、`tsc -p apps/web --noEmit` RC=0、`tsc -p e2e` RC=0、
   eslint e2e 与 forced-colors 判据 RC=0。

### 四、三处判据自身修实（本片真问题，不藏着）

1. **§CRIT-4 forced-colors 门裸尾假红（伴生根治）**：`.sp-` 段插在 A11Y-1 forced-colors 块之后，
   `forced-colors-style.test.ts` 第 144/150 行的 `clean.slice(块起点)`（裸取到 EOF）把 `.sp-` 段的
   `var(--nexus-*)` 误算进"forced-colors 块内 token"，触发假红；第 161 行的非贪婪 `\n\s*\}`
   还会在内层规则闭合处提前截断、删不干净整块。修法：新增按**括号深度配平**的 `forcedColorsBlock()`
   （复用同门 `forcedColorsRules` 的深度扫描、承 ADR-0166 §CRIT-1 段边界修实纪律），把三处撒点统一
   收敛到"块本身"，段头/后续插段怎么变都不误吞。**零生产代码改动**，只动 1 个判据文件；门修实后
   forced-colors 9 门 + FE-19 13 门合计 22 绿。这是 ROADMAP 已记"其余视觉门段边界枚举范式为
   系统性遗留（§CRIT-4）"的一次真实发作与根治样本。
2. **hover 门空规则体假绿（变异臂 D 抓出）**：门 8 原只 `toContain('.sp-viewportOff:hover')`，删空
   规则体成 `.sp-viewportOff:hover { }` 仍假绿。修为锚"选择器 + 非空 `background` 规则体"的正则，
   变异臂 D 从 SURVIVED 转 KILLED。
3. **变异臂 executor 假臂（基础设施 bug）**：首版臂脚本用 `execFileSync('npx', …)`，Windows/Git Bash
   下 npx 是 shell wrapper → ENOENT、npx.cmd → EINVAL，vitest 从未真跑起、8 臂"1 秒全 SURVIVED"是
   假臂（承 ADR-0133 FE-16 S12 教训：臂必须先证明到达目标断言）。修为 `process.execPath` 直接调
   `node_modules/vitest/vitest.mjs`（冒烟真跑 13/13），并三重防假：每臂先删 outputFile、跑后断言 JSON
   新鲜生成且耗时 ≥400ms、executor 异常显式抛错不静默判色。修实后真跑 8/8 KILLED。

### 五、诚实边界 / 仍欠

1. 纯视觉门面 + 判据自身修实，**零 Studio 业务状态机/数据钩子/文案/交互行为变化**（剥类 SHA256 +
   3 `cn()` 条件守恒 + 双段哈希钉死）；e2e 验的是离线承载（`setContent`）的"结构 + CSS 因果"，
   **不等于真起服务登录进 Studio 走一遍真实交互**（当前需会话/库/文档，待干净窗口补真页面 e2e）；
   样本锚门保 e2e SAMPLE 的 data 钩子/文案/两态类名不脱节。
2. 新增的克制 hover 过渡在 reduced 下关掉，但未逐帧人工看图，真读屏器听读 focus 顺序仍欠。
3. **本片只门面化 TopBar 一个组件**，Studio 家族余下 30+ 面板（StudioShell / CommandBar /
   ContextPanel / AgentPanel / CanvasStage …）仍是裸 Tailwind，按同一套 `.sp-` 纪律逐片推广为后继储备。
4. 其余 13 个视觉门 `xxSegment` 段边界枚举/裸尾范式仍有异构（本片只根治了 forced-colors 这一处，
   见 §CRIT-4），系统性统一另立片。
5. 真库 / 真 Redis / 真 MQ 全套与墙钟性能实测仍待干净窗口；未 push（main ahead origin）。
6. **协作**：开工 HEAD `92cd41a2`，并行会话仍在实时编辑 `scripts/live-design-smoke.mts`（§AILIVE-3
   半成品，mtime 18:09→18:13、69→101 行），本片刻意避开该活跃区、`package.json`、
   `docs/evidence/ai-live-design/**`，纯 `apps/web` 前端 + 判据 + 文档与之正交。精确 stage 只列本片
   文件，避开 `.next-dev-archives/`/`test-results-mine*`/`test-results/`/`.git/` 临时臂脚本与 JSON 报告；
   文档只追加不 rewrite。ADR 编号 0169（最大已占 0168）。
