# ROADMAP
  单文件 8/8 绿；tsc / eslint 0。
  - **搜索的档数与刻度对齐了（2026-10-22，格 13）**：相关度从四档扩到**六档**，
    刻度**严格递减** 6/5/4/3/2/1 ⇒ 说"六档"就得真有六级分值。
    - **早先的谎**：刻度是 4/3/2/1，详情与正文**并列 1 分** ⇒ 那不是四档而是三档，
      「只在简介里有」与「只在正文里有」会并列，而页面写的是四档（§159：说法与事实要对上）。
    - **正文/语料库改用关联子查询（`exists`）而不是 join**：join 会把结果行按快照数与块数
      **翻倍**——一个 10 快照的项目同一个设计稿出 10 行。凭证：集成测多一条
      （存 1 份快照 ⇒ N 条命中；再存 2 份 ⇒ 命中数不变）。
    - **另一处真 bug**：`sql.join([])` 空数组产生尾逗号 → SQL 变成 `greatest(x, )` → **语法错**，
      整条查询报错。是在真库上跑出来的，不是猜的。
    - **新增两档的来源**：第 5 档 = `snapshots.search_text`（文档正文，迁移 0035）；
      第 6 档 = `knowledge_chunks.content`（§49 语料库）。
    - 凭证：`search.integration.test.ts` 16 → **20 条全绿**（真库）；全仓 **2539 条全绿**
      （194 个文件，单 worker 跑——并行会 OOM 把 postgres 一起带走）；
      `npm run lint` 全绿。
  - **同款自证提醒**（2026-10-22）：「通关过」那一格也会说**"只有你自己通关过"**
    ⇒ 与「只有你自己看过」同一句纪律：如果那些"人"就是作者自己，这串数就不能当
    "有人玩得下去"的证据（否则创作者能自己通关把数撑起来）。判定与访客现场同一种
    （`bool_and(user_id = ownerId)`），页面上是行内的一小行字（`data-analytics-self-completed`），
    导出里多一列「只有自己通关」。凭证：游戏侧 completion 的集成测多一条（作者自己通关 ⇒
    那句提醒出现；匿名访客通关 ⇒ 那句提醒不出现）。
  - **"为什么没人看"那条分析也用上了新数**（2026-10-22）：规则表新增第 4 条
    ——「可玩的那一类 · 有人来过但没人玩到结局」。
    - **它与第 3 条不是同一件事**：第 3 条说的是"滚到了页面的几成"（滚动完成度），
      这一条说的是"有没有人玩到结局"（通关）⇒ 混起来就成了两句话说同一件事 ⇒
      证据里写的是"玩到结局"，不是"完成度"。
    - **不说做不到的话**：数据只说没人走完，没说为什么 ⇒ 结论里明写"这不能直接说
      这游戏不好玩"，动作落在平台真支持的事上（自己先在公开可玩页上走一遍：几步之内
      能不能走到结局？走不通的那一步就是访客掉下去的地方）。
    - **三道不许说的门**：不是可玩的那一类（没有通关这回事，拿一条不存在的尺子量它）⇒
      不说；看过的人只有作者自己（那是"还没别人来过"）⇒ 不说；有人玩到结局了 ⇒ 不说。
    - **事实里多带一个 `hasGame`**（发布那一刻钉住游戏设计 ⇒ `Publication.hasGame`，
      不用多查一次库）。
    - **凭证**：`analytics-agent.test.ts` 多 4 条纯规则用例（正例 + 三道不许说的门）⇒
      该文件 20 条全绿；`analytics-agent.integration.test.ts` 多 1 条（真库：存一份游戏设计
      再发布 ⇒ 事实里 `hasGame` 为真 ⇒ 真人访客来过而没人通关 ⇒ 那条发现真的出现）⇒
      该文件 6 条全绿。
# ROADMAP

来源需求：`docs/specs/MASTER_DIRECTIVE.original.txt`（§181-188 里程碑）。
执行原则：§190 `BUILD SMALL → VALIDATE → EXPAND`，§192 每个里程碑必须 `Run / Test / Screenshot / Inspect / Fix / Commit`。

状态标记：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 已验证并 commit · `[!]` 被阻塞（需 secret/付费授权/人工决策）

## M0 — 地基（当前）

- [x] 环境勘察 → `docs/ENVIRONMENT.md`
- [x] Git 仓库 + hooks 约束确认
- [x] docs 体系（PRODUCT / ARCHITECTURE / DESIGN_SYSTEM / STUDIO / RUNTIME / AGENTS / SECURITY / TESTING）
- [x] monorepo 脚手架（npm workspaces：`@nexus/design-model` `@nexus/schemas` `@nexus/web`）
- [x] 基础设施容器（pgvector 已起于 55433；redis/minio 在 `full` profile，按需启动）
- [x] `@nexus/design-model` 类型 + 布局求解 + Command 事务 + 测试（86 tests green，`npx vitest run`）
- [x] 数据库 Schema + 迁移（29 表 / 149 语句，`scripts/db-migrate.mts` 已在空库验证幂等）

## M1 — NEXUS STUDIO 竖向切片（§181）

必须打通的闭环，**这是当前唯一的最高优先级目标**：

```
Create Project → Prompt → AI Design → Canvas → Layers → Properties
→ Design System → AI Edit → Code → Live Preview → Screenshot → Publish
```

- [x] Studio 布局（顶栏 / 左面板 / Canvas / 右属性面板 / 底部 AI 命令栏）
- [x] Canvas：zoom / pan / select / multi-select（框选）/ drag / resize / snapping / grid / guides / viewport 切换
- [x] 直接操作：属性编辑即时回写 design model（§15-16）
- [x] Undo / Redo，AI 操作作为单个可撤销事务（§148-150）
- [x] Mock AI（DEMO MODE 明确标注，补丁双端 schema 校验，§160）
- [x] Live Preview 只读投影 + 截图脚本（§33/87，`scripts/capture-studio.mts`）
- [x] Design System 面板（§12/§13：token 分组浏览、改值/改 mode、引用计数、增删自定义 token，全部可撤销）
- [x] AI Service（FastAPI, `apps/ai-service`）：契约强制 + Provider 抽象 + Model Router + OpenAI 兼容适配器 + 删除类审批门
- [~] AI Service 任务队列 / 异步生成作业（§162）— **两侧现在接上了**：ai-service 那侧有真 worker（入队 / 执行 / 状态，
  9 条 python 测试钉着），web 这侧有消费者（提交、按游标翻译活动、把观察到的终态落进账本，见 M6 那条）。
   仍欠：Redis 后端跨实例（今天默认内存）、embedding/RAG、图像/视频 provider
   （界面上的提交入口已接上：提交/取消/重试与账本实时见 2026-09-26 / 10-09 那两条）
- [x] Design Agent：意图 → Plan → design patch → 画布更新 → AI Diff 说明（§20/25/151，DEMO MODE 确定性规则；真实模型规划待 line 43 的 provider）
- [x] Design → Code（React + TS + Tailwind，`packages/design-model/src/codegen.ts` + Studio 代码视图）
- [x] Code → Design（受限 JSX 解析，不可逆区域保留为 code-only，§17-19，`packages/design-model/src/code-parse.ts`）
- [x] Snapshot 服务端：列表 / 创建 / 恢复，恢复自身留下一条历史（§27/§108）
- [x] Compare：快照与当前文档的字段级差异，复用 AI Diff 的条目形状（§27/§151）
- [x] Branch / Duplicate：分支线、切换、整份项目副本（§27/§28）
- [x] 多方案 A-B-C 并排比较 + "取 A 的布局 + C 的视觉"合成（§29）
- [!] 方案生成的真实 provider 路径：代码这一侧已经全通（`providers/openai_compatible.py` + Model Router +
  契约校验 + §162 队列，`/healthz` 会按 key 如实报 real/unavailable），差的是**一份真凭据**与联网联调。
  没 key 时不假装跑过：DEMO MODE 标注常驻（§160），队列里那种请求会如实落成 `failed / provider-unavailable`
- [x] Publish + 分享 URL `/n/<handle>/<slug>`：Public/Unlisted/Private、发布锁定快照、取消发布即失效（§56-57）
- [x] 免注册首次体验（§137）：guest 会话即可 Create → Design → Publish
- [x] 资产服务（位图）：上传 → magic-bytes 判定 → 元数据剥离 → 对象存储 → 鉴权路由 → 画布/预览/发布四条投影同源（§38/§80/§101/§182）
- [x] 注册 / 登录 + 认领 guest 项目：bcrypt 口令哈希、会话轮换/吊销、双提交 CSRF、滑动窗口限流、就地升级认领（§137/§80）

**M1 进度记录（2026-09-22，Branch / Duplicate）**：§28 的分支线 = `branches` 表里一条有名字的快照线，
`apps/web/src/server/domain/branches.ts` 提供 list / create / switch / duplicate。**没有加"当前分支"这一列**：
`projects.currentSnapshotId` 已经说明工作区停在哪份快照上，head 指回它的就是当前分支——多存一份状态就多一处会漂移。
代价是新分支必须有自己那条 head 快照（否则两条分支同时指回同一个 id，"当前分支"就由查询顺序决定了），
所以开分支会留下一条"开分支「X」"历史，这条记录本身也是用户想知道的（从哪儿分出来的）。
这条代价不是理论问题：第一版先插分支行、后建 head 快照，中间那一刻 main 与新分支都指着起点快照，
`currentBranchId()` 的 `.limit(1)` 于是随机挑中新分支，"把现场存回原分支"被当成没必要而跳过——
切回 main 就看不到自己刚做的东西。单测跑一遍过、跑第二遍才偶发。**现在改成插入时 head 留空、由
`createSnapshot` 补上，并且先问清"离开的是哪条分支"再插入**；`currentBranchId` 也按 `createdAt` 排序，
真撞上脏数据时答案是可复现的而不是随机的。集成测试里加了一条"各分支 head 必须互不相同"的断言钉住它。
语义按 `checkout -b` 对齐：不指定起点就带着当前现场切过去；指定 `fromSnapshotId` 就落到那份快照上，
而离开前的现场先存回原分支（`source: 'branch'`，"分出「X」前的现场"）——两种情况都不丢东西。
内容与该分支 head 一致时不重复存，所以反复切换只多两条"切换到「X」"标记，不会堆噪音。
Duplicate（§27）走 `duplicateDocument`：页面 id 与组件 id 在库里是全局主键，副本必须换号，
连 interaction 目标、变量作用域这类引用一起重映射（点名式重写迟早漏一处，所以整棵树扫）。
验证：`npm test` 172（新增 8 条分支集成测试 + 3 条 `duplicateDocument` 单测）、9 @smoke
（新增"开分支 → 两个方向 → 来回切换各自现场仍在 → 副本是另一个项目且源项目没被动过"）、
截图 `history-branch.png` / `history-branch-main.png` / `duplicate-project.png` 人眼确认。
已知边界：切分支与恢复一样会清空本地撤销栈（如实提示）；快照列表仍按时间全量展示并在每行标出所属分支，
"只看当前分支"没做。（§29 的并排比较见下一条记录。）

**M1 进度记录（2026-09-22，多方案 §29）**：一条方案 = 一条分支 + 它 head 上的那份文档，
没有另立"变体表"——§28 已经规定方向是分支线，再造一套并行状态就多一处会漂移的地方。
`packages/design-model/src/concepts.ts` 把"方向"拆成两个能各自搬走的轴：**结构**（`CONCEPT_STRUCTURES`：
居中开场 / 左右分栏 / 三卡并列 / 导航开场，只动节点）与**视觉语言**（`CONCEPT_LANGUAGES`：
编辑部 / 影院 / 赛博 / 暖阳，只动 token 与 visualDna）。拆成两轴是为了让"取 A 的布局 + C 的视觉"
这句话有指代；前提是节点颜色一律引用 token（§12），否则换语言就得逐节点改写。
圆角与间距也是可换的旋钮：`ConceptLanguage.geometry` 落 `radius.*` / `space.*`（任务 #25 之前这里是句谎话）。
`generateVariants` / `mergeVariants` 都**不动工作区**（`createSnapshot` 新增 `advanceWorkspace:false`），
所以"生成 4 个方案"不会把用户手上的稿子换掉；点"切到这个方向"才走 §28 的切换。
比较板是第三个视图（画布 / 方案 / 代码），每张卡用与画布、预览同源的 `resolveLayout + nodeStyle` 投影，
命令栏在这个视图里收起来——它改的是工作区那一份，摆在这儿会让人以为改的是某张卡。
过程中修掉三处真实问题：① 采纳一条方案会顺手把项目改名（方案名属于分支与快照，不属于文档）；
② `mergeVariants` 的 finally 少一次 commit，按钮永远停在"生成中…"；
③ `loadDocument` 每次都把 `metadata.createdAt` 写成"现在"（createDocument 的默认值没被覆盖回来）。
验证：`npm test` 192（新增 12 条 concepts 单测 + 8 条方案集成测试）、10 @smoke
（"生成四条 → 都是真投影 → 工作区没被动过 → 合成 A 布局 + C 视觉 → 采纳才换画布 → 切回 main 原样"）、
截图 `variants-board.png` / `variants-merged.png` / `variants-adopted.png` 人眼确认。
已知边界：方案来自确定性配方（UI 常驻 DEMO MODE 说明），不是模型输出；真实 provider 接入后
换掉的是"往哪个方向改"，落地方式仍然是一条分支一份 head 快照。

**M1 进度记录（2026-09-22，Publish / Share）**：§56 的 `/n/<handle>/<slug>` 与 §57 的三档可见性落地，
`apps/web/src/server/domain/publish.ts` + `publish` 路由 + 公开页 `app/n/[handle]/[slug]/page.tsx`。
一条 path 只有一行 `published_projects`（唯一索引），重新发布是就地换版本，
URL 指向的是**发布那一刻的快照**（`snapshot_id`）而不是工作区——所以作者之后怎么改都不会把已发出去的链接换掉，
这条用第二个浏览器标签页实测过（改成 22px → 公开页仍是 66px → 重新发布才变）。
private 的公开 URL 对所有人 404，包括作者本人（作者看自己那一版走 /studio），不靠"看身份放行"。
guest 首次发布时补一个稳定 handle（`u<id 前 8 位>`），URL 才真的能分享。
门禁当时只列真能自动跑的三项（模型自洽 / 对比度等 lint / 有内容），
性能预算、键盘可达性、视觉回归明确列在"未运行"里（§179 要求全绿，§159 要求别假装绿——
现在的做法是：能查的查并挡住，查不了的说出来，不把没查的写成通过）。
这三项后来被 `analyzeHealth()` 的七行取代，口径不变（见 M2 的 §178/§179 进度记录）。
`moderation` 仍然写 'pending' 并在面板上注明"审核管线尚未接入"。
过程中修掉一处真实遮挡：顶栏下拉被右侧属性面板（同为 z-50）盖住，点不到——发布面板需要 z-[60]/[70]。
验证：`npm test` 199（新增 7 条发布集成测试）、11 @smoke
（"发布 → 第二标签页看到 66px → 改成 22px 公开页不动 → 重新发布换版本 → 取消发布 404"）、
截图 `publish-panel.png` / `published-page.png` 人眼确认。

**M1 进度记录（2026-09-22，Design System 面板）**：左侧第三个页签（图层 / 设计系统 / 历史），
`apps/web/src/studio/DesignSystemPanel.tsx`。按类型分组列出 token，每行给：色块、key、
**被多少节点引用**、默认值输入框、色值取色器，以及该 token 有 modes 时的 light/dark 输入行。
所有改动都走 `studio.execute`（`setToken` / `addToken` / `removeToken`），所以改 token 与改节点一样
进撤销栈——实测改 `color.primary` → 绑定的按钮立刻变粉 → Ctrl+Z 立刻回到原色。
内置 token 的删除按钮禁用（改值可以，删掉会留下断链）；自定义 token 只在引用数为 0 时可删。
引用计数匹配的是 `"{color.primary}"` 这种花括号绑定而不是裸 key——第一版按裸 key 数，
结果满屏"未使用"，而画布上明明正用着它。
验证：12 @smoke（新增一条：引用计数 → 改值全线跟随 → 撤销 → 非法名如实拒绝 → 自定义 token 增删 →
刷新后仍在库里）、截图 `design-system.png` / `design-system-applied.png`（后者按像素扫过 #ff4d6d 确认
按钮真的换了色）。已知边界：还不能新建带 modes 的 token（表单只填默认值），也没有"哪些节点在用它"的
点选跳转。

**M1 进度记录（2026-09-22，资产服务 · 位图）**：§38/§80/§101/§182 的第一条竖向切片。三条边界钉死：
节点 paint 只持 `assetId`（字节/URL 不进设计，§16），文件名只当展示文本、object key 一律服务端按 id 生成，
字节入库前必须过 magic-bytes 判定 + 元数据剥离（§80）。落点：
`server/storage/{images,config}.ts`（手写 PNG/JPEG/WebP/GIF 的识别与结构化剥离，不引原生图像库）、
`server/domain/assets.ts`（上传→去重→存储→行；作者/公开两套取字节；Duplicate 的资产换号 `copyProjectAssets`）、
四个路由（项目资产 GET/POST、`/api/assets/[id]` DELETE、`/api/assets/[id]/file` 作者取、
`/api/public/[handle]/assets/[id]` 匿名取——后者要求"该项目有 public/unlisted 发布行 + 钉住的快照确实引用它"，
否则 404，被设计删掉的素材不会一直挂在公共 URL 上）。
投影一致性用一条规则保证：`assetContextFor(document, urlFor)` —— 只有文档自己的资产清单列出的 id 才解析成 URL，
清单里没有就返回 null，渲染层据此跳过该层而不是画破图（§159）；画布 / 变体比较板 / 预览 / 公开页四条 `nodeStyle`
调用点都注入同一份上下文。属性面板的填充区给图片 paint 单独一行（缩略图 / fit 选择 / 换图 / 移除），
"+ 图片"走 `studio.uploadImageAsFill`——一次上传 = 一个事务（`addAsset` + `set(style.fills)` 绑在一起撤销），
失败不产生任何事务且原因原样摊在面板上。
过程中修掉一处真实 bug：`readImageSize` 的 JPEG 分支把高/宽读偏了 2 字节（SOF 段高在 `+5`、宽在 `+7`，
不是 `+7`/`+9`），真机上传会存错尺寸——是 image-safety 单测用手搓的合规 SOF 逼出来的。
还修了 `.gitignore` 里未锚定的 `storage/` 把 `apps/web/src/server/storage/` 源码整目录忽略掉的坑。
验证：`npm test` 245（新增 image-safety 14 条 + assets 集成 8 条 + `remapAssetIds` 2 条）、
@smoke 新增一条"上传图片 → 画布投影出真实资产 URL → 浏览器 `naturalWidth>0`（证明剥离后字节仍可解码）→
剥离回执显示 eXIf → 撤销一次整层消失 → 重做 → 预览路由同源"，截图 `asset-on-canvas.png` 人眼确认
青色图块确实落在 Headline 背后。已知边界：只做结构化剥离不重编码；只接位图；DELETE 有服务端与测试但暂无 UI 入口。

**M1 进度记录（2026-09-23，认证 §137/§80）**：M1 竖向切片的最后一块——注册 / 登录 / 登出 + 认领 guest 项目。
决策与取舍见 `docs/adr/0002-password-hashing-and-csrf.md`。四条边界：
① **口令**走 SECURITY.md 允许的 bcrypt 回落分支（`bcryptjs` 纯 JS，cost=10），算法封在 `server/domain/password.ts` 一个文件后面，
`verifyPassword` 按 `$2` 前缀分派，将来换 Argon2id 只改这一处、旧串仍可验证；登录对"邮箱不存在"也跑 dummy-hash 对齐时序，防账号枚举。
② **认领用就地升级**：guest 的项目/快照/资产全挂在该 user id 下，注册时把同一行改成真实账号（写 email/password_hash/claimed_at、guest=false），
归属一条都不搬，自然不漏——e2e 实测"游客建项目 → 注册 → 项目仍在名下、回执显示已认领 1 个"。
③ **会话防固定**：middleware 用客户端可见的 cookie 值签发 guest 会话，所以 register/login 一律 `rotateSession`——删旧 token 会话行、发新随机 token，
否则攻击者事先种下的已知 token 会在提权后变成真实账号的会话；登出删会话行 + 清 cookie（吊销）。
④ **CSRF 双提交** + **滑动窗口限流**：`server/security/{csrf,rateLimit}.ts`。CSRF 靠 middleware 另发一个前端可读的 `nexus_csrf` cookie，
状态变更请求要在 `x-csrf-token` 头原样带回并比对（会话 cookie 的 SameSite=Lax 是第一道防线）；限流是 `RateLimiter` 接口 + 内存驱动，
形状对齐 Redis 有序集，登录按 IP+邮箱（10/15min）、注册按 IP（10/h）。
踩到的坑：middleware 跑在 Edge runtime，一开始从 `session.ts` 引 `SESSION_COOKIE`，把 `node:crypto` 与 postgres 驱动一起拉进 Edge 包报
`Native module not found`——把 cookie 名字抽到零依赖的 `server/security/cookieNames.ts` 解决。
验证：`npm test` 264（新增 password 6 + rateLimit 7 + auth 集成 6，auth 集成打真库断言就地升级/邮箱唯一/重复注册拒绝/口令校验/会话轮换吊销）、
`npm run test:e2e:smoke` 15 @smoke（新增两条：游客认领→注册升级→登出换新游客→登录找回；错误口令被拒且文案不泄露邮箱是否存在）、
`npm run lint` 通过，截图 `account-member.png` 人眼确认成员态（回执 + 已登录邮箱 + 登出 + 认领的项目在列）。
已知边界（如实记，见下方技术债）：Argon2id 未启用（走 bcrypt 回落）；限流是单实例内存版。CSRF 双提交已铺到全部写路由（见任务 #20）。

**M1 进度记录（2026-09-22，Compare）**：§27 的"比较"落在 `packages/design-model/src/diff.ts` 的
`diffDocuments(before, after)`：产出与 AI Diff（§151）同样的 `DiffEntry[]`，所以历史面板两套清单共用一个行组件。
差异停在"最浅的、真正不同的那一层"（`style.fills` 变了就报这一条，不拆成 `fills[0].color.value`），
增删整节点归为 added/removed 并给摘要而不是倾倒整个对象，父子关系与 children 变化归为 moved；
超过 300 条时截断并如实标 `truncated` + 总数（§159）。快照行新增"比较"，方向是"从那份快照到现在改了什么"。
`sameValue` 从 code-parse 提到 `nodes.ts` 共用——假回写、假 diff、假快照是同一个 bug 的三张脸。
验证：`diff.test.ts` 11 条（含"键顺序不同不算改动"）、`npm test` 161、8 @smoke（快照用例现在覆盖创建 → 比较 → 恢复 → 刷新）、
截图 `history-compare.png` 人眼确认窄面板下路径不被截断。

**M1 进度记录（2026-09-22，Snapshot 服务端）**：§27/§108 的"用户项目历史"落到 `snapshots` 表：
`apps/web/src/server/domain/snapshots.ts`（list / create / read / restore）+
`/api/projects/[id]/snapshots[/…/restore]` 三条路由（归属先过 `projectBelongsTo`，跨项目读一律 404）。
快照存整份 `DesignDocument`，所以恢复 = 原样写回而不是回放补丁；恢复前服务端先把当前状态存成
"恢复前自动保存"，恢复动作自己再留一条"恢复到「X」"——恢复永远不丢东西，也不假装没发生过。
历史面板底部新增快照区（命名创建 + 两步确认恢复），并如实说明恢复会清空本地撤销栈；
客户端恢复前先 `flushSave() + save()`，避免把未落库的编辑静默丢掉。
验证：`npm test` 150（含 5 条真实数据库快照集成测试）、`npm run test:e2e:smoke` 8 @smoke
（新增"创建 → 编辑 → 恢复 → 刷新仍是恢复值"）、截图脚本 `history-snapshot.png` / `history-restored.png` 人眼确认。
踩到的坑：`restore` 用 `JSON.stringify` 判断"当前是否等于目标"会误判——jsonb 不保留对象键顺序，
`loadDocument` 重建的文档键顺序是代码里的字面顺序，快照里那份是 Postgres 重排后的顺序，
于是每次恢复都多写一条无用快照；改为键顺序无关、且忽略 `undefined` 字段的比较（`stableKey`）。

**M1 进度记录（2026-09-22）**：Studio 工作台竖向切片已验证——
`npm test` 86 tests、`npm run test:e2e:smoke` 6 @smoke（`playwright.config.ts` 已固定 `workers: 1`）、
`npm run lint`（= 四个 tsconfig 全量 typecheck）通过，
截图检查（`screenshots/studio.png` / `studio-mobile.png` / `preview.png`）确认：
文本与按钮文案已投影到画布与预览；按钮 `fills` 作背景、`typography.color` 作字色；
hug 尺寸把 padding 计入；响应式断点下属性面板如实显示实际帧尺寸。

**M1 进度记录（2026-09-22，AI Service）**：`apps/ai-service`（FastAPI, 3200）已跑起来并通过
`/healthz` 与 `/v1/ai/run` 的真实进程验证（无 key 时如实返回 `provider-unavailable`）；
契约由 zod 单一来源导出到 `contracts/`，Python 侧 `jsonschema` 运行期校验，漂移由单测拦截。
验证：pytest 26 项、`npm test` 103 项、`npm run test:e2e:smoke` 6 项，首页 `home.png` 显示
AI Service 行与逐 provider 能力/原因。真实 key 到位前，真机 provider 调用只做过 httpx 传输层桩验证。

**M1 进度记录（2026-09-22，Design → Code）**：`generateProject()` 从设计模型确定性产出
`styles/tokens.css` + 每页一个 `components/nexus/<Page>.tsx` + 索引；token 引用写成 `var(--nx-*)`
（前缀刻意避开 Studio 自己的 `--nexus-*`），几何只来自模型的 size/layout/style/typography/responsive。
Studio 顶栏下新增 画布/代码 切换（`CodePanel`），选中的元素会在代码里高亮并滚动到自己那一行。
验证：`npm test` 121 项（新增 18 项 codegen 单测，含用 `ts.transpileModule` 证明生成的 TSX 无语法诊断）、
`npm run test:e2e:smoke` 7 项、`npm run lint` 通过；`screenshots/code.png` 人眼检查后修掉了
浮层遮挡文件标签的问题，并补 `app/icon.svg` 消除 dev overlay 报的 favicon 404。
**Code → Design 已落地（2026-09-22）**：`packages/design-model/src/code-parse.ts` 自带受限 JSX 扫描器
（不 import React / DOM / typescript，因此能进客户端包），把页面组件的类名反解回同一份设计模型，
只产出 `set` 补丁并经 `studio.execute('代码编辑', ops)` 作为单个可撤销事务应用。
边界如实呈现：结构性变更（加删节点、改标签、重排、改父级）不回写，识别结果必须能被重投影复现，
否则放弃该节点；解析不了的片段进 code-only 清单。
关键验收是往返恒等 —— `codeToPageOps(generatePage(page), page)` 零补丁、零 unmapped。
验证：`npm test` 145 项（code-parse 24 项）、`npm run test:e2e:smoke` 7 项、`npm run lint` 通过；
`screenshots/code-applied.png` 人眼检查发现并修掉了一类假回写：模型经服务端 schema 序列化后对象键顺序变化，
`JSON.stringify` 比较把"没改"当成改动，改为不受键顺序影响的深度相等。

**M1 验收**：新开项目输入一句 prompt，60 秒内（§138）在画布上看到可编辑设计，改属性能落库，
点 Code 能看到可编译的 React，点 Preview 能在 iframe 里真实运行，Screenshot 能出图，Publish 能拿到可访问 URL。

**M1 状态（2026-09-23）**：§181 的竖向闭环已全部打通并有 @smoke 覆盖（Create → Prompt → AI Design →
Canvas → Layers → Properties → Design System → AI Edit → Code → Preview → Screenshot → Publish，
外加资产上传与注册/登录认领）。Design Agent 的"意图→Plan→patch→画布→AI Diff→可撤销"由确定性规则实现，
UI 常驻 DEMO MODE。**唯一未闭合的是 line 43「方案/AI 生成的真实 provider 路径」——需要付费 provider 授权（§194 暂停条件），
用户提供 key 前不伪装真实生成。** line 35（Redis 任务队列 / embedding / RAG）是 M2/M3 前置，随其落地。

就绪判定已做到 correct-by-design（ADR 0003，commit 45880e8）：web 侧的 `getAiCapabilities`/`isDemoMode`
和 `/api/ai/run` 的路由不再看 web 自己进程有没有 key，而是查询 ai-service `/healthz` 的 provider 就绪状态——
key 只活在 ai-service 进程（符合 SECURITY.md「web 永不接触 key」）。所以 line 43 一旦闭合，
用户只需给 ai-service 配 `NEXUS_OPENAI_API_KEY`（+ 可选 `NEXUS_MODEL_FAST/BALANCED/REASONING/VISION`），
无需在 web 重复配置，首页能力行与 DEMO MODE 标识会自动翻到 real。

## M2 — 图像与资产（§182）
- [~] Nexus Image Studio（五条箭头，逐条记状态；本机没有图像 provider，像素一律来自本地确定性合成器并挂 DEMO 标识）
  - text→image：**已通**（`POST /api/projects/[id]/images` → 额度门 → 任务行 → 与上传同一道摄取门 → 真资产行 → 扣点；
    面板入口 + e2e @smoke，见上面 §38 第二、三格）
  - reference→variation：**已通**（参考图按归属取字节、量主色作色相锚点、锚点参与身份哈希；卡片上有按钮 + e2e。
    边界：钉住的是身份与元数据，"画面看着像参考图"没有被钉住）
  - character→scene：**已通**（锚点取自角色档案 visualIdentity.palette，assets.character_id 第一次有写入方；
    一致性有可测定义；角色面板上有"生成场景"按钮，e2e @smoke 点过一遍）
  - image→image：**已通（DEMO 语义的前半截）**（参考图的 `extractVisualDna` 统计值喂进合成器扰动并参与身份哈希：
    同一参考两次不同变体、各自逐字节可复现；e2e 的"生成变体"按钮点过）。边界：改的是色调与构图参数，
    不是参考图像素本身——"照原图改一笔"要真 provider 的图生图
  - sketch→image：**已通（DEMO 语义）**（资产库面板的 SketchPad 绘制面导出 PNG，走与上传同一道摄取门；
    服务端量出落墨占比/笔画密度参与合成与身份哈希；与参考图/肖像互斥，且草图必须属于本项目本用户）。
    边界：草图管**构图密度与明暗**，不管形状本身也不钉色相（黑白线稿的"主色"是纸白，钉上去就是谎）；
    "照草图轮廓画"同样等真 provider
  - 换成真 provider 时改的是 `image-synth.ts` 里那一格像素来源，前后每一环（门、账、摄取、投影）不重写（§76-79）
- [x] Asset Library（图片/视频/音频/3D/组件/设计系统统一编目）— 清单在模型里（`document.assets`），
  Studio「资产库」面板只是它的投影：列出/缩略图预览/引用计数/删除。删除走 `removeAsset` 模型级事务，
  跨所有页面剥引用、可撤销；字节清除是尽力而为的第二步（撤销恢复不了文件，回执如实说明）。
  非位图 kind 目前无摄取通道，见下方资产服务债 2。
- [x] Reference Image → Visual DNA 提取（§30/172-174）（取舍见 `docs/adr/0004-visual-dna-local-extraction.md`）—
  确定性**本地像素统计**：PNG 解码（8 bit，全滤镜）后
  测亮度/对比/饱和/冷暖/留白/边缘密度 + 主色板，落成 `document.visualDna`（一条 `setVisualDna` 事务，可撤销）。
  §174「所有 AI 生成遵循它」已可观测：DEMO MODE 的 palette-transfer 规则读文档 DNA 而非内置色板，
  e2e 用参考图的 `#14b8a6` 压过内置 cinematic `#05060a` 证明。不支持的编码（16 bit / interlaced / 非 PNG /
  带透明）返回中文原因而不是半截数据。排版/圆角/动效**从位图测不出来，因此不填**（`source.notes` 明说），
  `source.method` 区分 `pixel-stats` / `vision-model` / `concept-language`；风格形容词（"Cinematic"、"Soft glass"）
  要真视觉模型才能给，随 line 43 的 provider 授权补齐。
- [~] 角色一致性生成（§39）— **接线与界面都通了，欠的是像素那一半**：档案四栏（身份/穿着/画风/特征）进 prompt 与任务行、进知识索引；角色面板有「生成场景」与「生成肖像」两个入口（肖像完全由档案驱动，不给输入框）；**角色自己的肖像可以当它下一个场景的参考**（服务端验归属：参考图必须是这个角色的肖像），带参考图时色相锚点取**量自那张图像素**的值。可测的一致性今天只有色调那半——DEMO 合成器只认 prompt 哈希与一个色相，换真 provider 时这一格不必重接。逐条凭证见文末三节补记。

**M2 进度记录（2026-09-23，项目健康 §178 / Quality Gate §179）**：`packages/design-model/src/health.ts`
的 `analyzeHealth()` 是这一项唯一的算法出口：七行读数、0-100 分、`state = pass | fail | not-run`。
Studio 左栏「健康」页签与 Publish 弹层显示它，服务端 `runPublishGate()` 也调它——
屏幕上那分和服务器上挡发布的那份是同一个函数算的，不会各说一套（§16）。
检查规则没有重造轮子：结构走 `validateDocument`，设计体检走 `lintDesign`，
再补上只有设计模型就能静态算的性能预算（节点数/树深/位图字节/缺尺寸位图/动效数）
和模型内可查的风险（疑似明文凭据、code 节点危险写法、http 明文外链）。

三条不能商量的口径：
1. **没测的不能是绿勾**——Tests 与 AI QA 至今没有本地可算信号，`score = null` + `not-run` + `gating = false`，
   UI 显示"未评估"；把"没有发现"写成"通过"就是 §159 禁止的假绿；
2. **分数来历要能读**——每行带 `basis`（这项到底检查了什么）与可展开的真实发现，
   单行最多列 40 条、其余计进 `omitted` 并写明"另有 N 条（计分已计入）"，截的是显示不是问题；
3. **门禁只挡往外公开的方向**——切成 `private` 是下架，门禁没过也放行，否则坏页面收不回来。

顺带修掉一个真 bug（不是新增功能）：`lintDesign` 的对比度规则把未解析的 `"{color.text}"` 直接喂给
`contrastRatio`，而它对解析失败返回 1:1 —— 于是**每一处正确使用 token 的文本都被误判成不达标**，
同时按钮是拿自己的背景填充当文字颜色在比。新增 `measureContrast()`：先解析 token、沿祖先链合成真实背景、
按钮/输入卡取 `typography.color`，任何一边算不出来就返回 null 不报（算不出却报个数是造假）。
修好后暴露出内置起手页与四套概念语言自己就不达 WCAG（白字压 `#7c5cff` 只有 4.35:1、
warm 方向奶油字压亮橙 3.35:1、cyber 的 light 模式是深底配深字 1.08:1）——
按比值重算色板而不是下调 80 分线，`nodes.ts` / `concepts.ts` 的默认值因此变了（codegen/render/e2e 三处钉死旧色值的断言同步更新）。
`applyConceptLanguage` 另修一处：语言只给 `value` 时上一套配色的 light/dark 会漏进来，现在收敛到该语言自己的值。

验证：`npm test` 313（本项新增 16 条：`health.test.ts` 11 条——门槛两侧 82/76、error 一票否决、
40 条截断与 omitted、凭据脱敏后报文里查不到原文、localhost 不算明文外链、断链不崩；
`measureContrast` 5 条——token 解析、祖先合成、半透明先合成、按钮取正文色、渐变返回 null）、17 条 @smoke 全绿；
浏览器实测：起手页七行全过 → 把 `color.text/on-primary` 压成暗灰 → Accessibility 掉到 76 并列出
"Headline 2.06:1（#454a58 on #12151d）" → 点发布被挡（`门禁未通过：Accessibility 76 分，低于门槛 80`）
→ 同一份文档切私有放行、报告照旧列失败项。取舍见 `docs/adr/0005-health-score-and-gate.md`。

**M2 进度记录（2026-09-23，规模基准 §146 / 热点路径 §147）**：`scripts/perf-baseline.mts` 造 100/1000/10000
节点的文档，对七条模型层热点路径取 median-of-3，数字与噪声说明一起进 `docs/PERFORMANCE.md`
（**不断言阈值**：这台机器上 median-of-3 的散布就有 ±30%，写死断言的下场是被人删掉）。
第一轮实测就把真问题挖出来了：`execute + undo` 在 10k 节点上要 861ms/次——`runPatches` 应用一遍补丁、
`buildEntry` 为求逆与算 diff 又从头应用一遍，而 `applyPatch` 每条补丁 `structuredClone` 整份文档。
改成"`buildEntry` 顺带把过程中的文档交回来"（一次编辑一次应用）+ `clone()` 走自写递归拷贝
（纯对象/数组走快路，`Date`/`Map`/类实例仍回落 `structuredClone`；**保留 `undefined` 键与数组空洞**——
`JSON.parse(JSON.stringify())` 会丢，undo 之后节点形状就变了，这条有回归测试）。
净效果：一次编辑 + 撤销，100 节点 4.0ms→0.54ms、10k 节点 861ms→129ms；
其余路径前后的差落在测量噪声内，文档里明说了别把它们读成回归。
§147 剩下的如实挂着：整份拷贝仍是那 129ms 的主体（下一步是结构共享）、画布没有虚拟化/增量渲染、
画布侧没有 worker；浏览器端指标 2026-09-24 起由 `npm run perf:browser` 量（数字与限定见 `docs/PERFORMANCE.md`）。
验证：`npm test` 313（克隆的 `undefined` 键 / 数组空洞 / 非纯对象回落，以及"一次 execute 只应用一遍"各一条回归）、
17 条 @smoke 全绿（编辑—撤销—自动保存那条走的就是被改过的路径）。

**M2 进度记录（2026-09-23，几何 token 化，任务 #25）**：修掉一处"声称能做其实做不到"。
§29 的视觉语言此前只带颜色与字体，`cyber` 写着「直角」、`warm` 写着「圆角」，
而节点上的 `cornerRadius: 10` 是钉死的数字——那两个词没有指代（§159）。现在：
起手页 / 四个结构方向新增的区块 / DEMO 配方生成的 section 全部引用 `{space.*}` 与 `{radius.*}`
（默认栅格补了 `space.20=80`、`space.24=96`），`ConceptLanguage.geometry` 成为第三个旋钮。
三件配套缺一不可，否则就是新的谎：
1. `lintDesign` 的 `hardcoded-style` 扩展到几何（非零的 gap/padding/cornerRadius 字面量），
   起手页必须 0 命中——这条规则是"以后不许再钉死"的守门人，而不是一次性清洁；
2. `code-parse` 学会把 `var(--nx-space-6)` 反解回 `{space.6}`。此前 gap/padding/圆角**只认 px 字面量**，
   几何一旦绑 token，§19 的往返恒等（`parse(generate(page))` 零补丁零 unmapped）在起手页上就破了；
   认回**引用**而不是认成数字，才既保住恒等又不会把绑定改写成常量（删掉 token 绑定的圆角类不再写 0，有测试钉住）；
3. DNA 的 `radius` / `spacingScale` 改为从落好 token 的文档里读，不再抄一份常量表——
   否则"项目遵循的视觉语言"会停在抄的那份数字上。
顺手修掉一处面板说谎：Design System 的输入框草稿提交后不清除，撤销或 AI 改动之后仍显示旧数字；
现在 blur 即丢草稿。
验证：`npm test` 320（新增 6 条：旋钮落 token、两套语言在同一份结构上给出不同圆角、DNA 从文档读、
新增卡片也引用 token、起手页无硬编码几何、字面几何会被记下来）、17 条 @smoke 全绿；
浏览器实测方案板 `main 10px / editorial 2px / cinematic 8px / cyber 0px / warm 20px`，
改 `radius.md=26` 画布按钮立刻 26px、撤销回 10px 且面板显示真值。

## M3 — 世界 / 角色 / RAG（§183）
- [~] World Builder（Lore/History/Geography/Factions/Characters/Creatures/Items/Quests/Story）—
  世界文档（九类）+ 存储 + Studio「世界」面板已落地，见下方进度记录；
  **§44 的 AI 生成那半没做**（要真 provider），没接之前面板只给模板骨架，正文一律留空。
- [x] World Graph 可视化 + 可拖拽节点（§45）— 关系（有向、可带标签）与拖拽位置都存在世界文档里，
  Studio 第四个视图「世界图」画出来；见下方进度记录。自动避障 / 缩放 / 多选没做，不在 §45 的验收里。
- [~] Character System + Character Agent 对话（§46-47）— §46 档案（含关系、声音、视觉标识）已落地，
  见下方进度记录；§47 的"跟角色说话"的 provider 侧与 web 传输在 2026-10-06 接通，界面对话入口同日落地（见文末「§47」一节）。
- [x] Memory 四类（Session/Character/World/User）可查看可删除（§48）— 见下方进度记录。
  四类都能记、能列、能单条删、能按类清空；**没有"全部抹掉"的入口，也没有搜索框**（检索要 embedding，§49）。
- [~] pgvector RAG：hybrid retrieval + rerank（§49/93）— 语料索引（世界条目/角色档案/记忆 →
  `knowledge_chunks`）+ 混合检索（tsvector 全文 + 子串 + 词覆盖度的确定性融合）**已落地并跑通
  真库集成测试**，见下方进度记录。**两件事没做，也不假装做了**：① embedding 列没有 provider 时
  保持 null、返回 `vectorAvailable: false`，所以**没有语义检索**——pgvector 的 HNSW 索引和
  `vector` 列都在库里，只等真实 embedding provider 写入；② §49 的 "Reranking" 要真模型，
  现在给的是**规则重排**（融合分数 + 新近），不是模型重排。所以此处仍是 `[~]`：
  做的那一半已验证，没做的那一半要真 provider。

**M3 进度记录（2026-09-23，World Builder 第一切片，§44）**：新开一个纯模型包
`packages/world-model`（与 design-model 同一条纪律：无 React / 无 IO，浏览器与服务端跑同一份校验）。
世界文档 = 九类条目（lore/history/geography/factions/characters/creatures/items/quests/story），
每类若干条 `{id, kind, title, body, updatedAt}`；改动一律换出新文档，不原地改。
存储：`worlds` 表那列从没被读过的 `lore` jsonb 换成 `document`（迁移 `0002_world_document`），
整份 JSON 存——世界文档是文字为主的小文档，没有按节点查询的需求，
拆成规范化行只会多一处会不同步的地方（设计文档拆行是因为它要按页/节点取）。
读写都过 `@nexus/schemas` 的 zod + `validateWorld`，**库里躺着读不出来的东西不可接受**：
契约不符时 GET 返回 500 + 可读原因，面板显示错误而不是假装"还没有世界"。
`packages/schemas/test/world-contract.test.ts` 逐字对齐九类清单（z.enum 要字面量，
两处各有一份是没办法的事，漂移必须在测试里炸）。

两条刻意的边界，界面上也写着：
1. **不做假生成**：§44 的示例是「Create a dark fantasy world」→ AI 填出九类内容，那要真 provider。
   没接之前面板只给**模板骨架**（九类各一条空条目、正文一律空串），文案里明说这是模板不是内容；
   集成测试断言"除我加的那条，其余正文仍为空"，防止哪天有人往模板里塞预设世界观。
2. **不进撤销栈**：§150 的 Command 事务目前只覆盖设计文档，世界编辑用显式"保存到库"（失焦即写），
   面板脚注写明 Ctrl+Z 只管画布。等世界也要事务化时再做，不假装已经符合。

`GET` 不写库：没有世界返回 null，由面板上的「创建世界骨架」发起一次 PUT——
"还没有"和"有一份空的"是两件事，而 GET 顺手建数据会让每次刷新都在库里留痕。
验证：`npm run lint`（typecheck 多了 world-model 一项）、`npm test` 339
（world-model 12 条 + 契约 4 条 + 真库集成 5 条）、@smoke 18 条全绿
（新增一条：建骨架→填一条→加一条→reload 后仍是库里那份）。

**M3 进度记录（2026-09-23，World Graph §45）**：世界文档加 `links`（`{id, from, to, label}`，有向）
与 `positions`（条目 id → 坐标）。位置与内容分开存是刻意的：换视图、重排一次图不该改写谁写过的正文（§16）。
`autoLayout` 按类分列、列内按加入顺序堆叠，**确定性**排布——同一份文档每次打开排成同一个样子，
否则"刷新之后图乱跑了"会被当成 bug，其实只是随机数。`worldGraph()` 是视图读的投影，
指向已删条目的边在投影里自然消失，同时 `validateWorld` 报 `missing-endpoint`：画不出来和要说清楚是两件事。
`linkWorldNodes` 对自环 / 端点不存在 / 重复关系**不写库但一定给原因**，面板上以回执条显示（§159 不许静默丢弃）。
Studio 加第四个视图「世界图」（画布 / 方案 / 代码 / 世界图）：点两个节点连线（顺序即箭头方向）、
拖节点改位置（松手即写库）、点边删除关系。拖 ≠ 选：拖完那一下的 click 被吞掉，否则每拖一次都会顺手选中端点。

一条 e2e 失败挖出的真实数据丢失链，三处一起修（缺一处都只是把窗口挪个位置）：
1. **卸载时丢最后一次写**：写库是"一次在飞 + 防抖补发"的，而防抖定时器在页面 unload 后不会跑——
   刚点完「加一条」就刷新，那次改动就没了（§44 那条 e2e 就是这么挂的）。
   改成在飞时只记一笔"还欠一次写"，前一个响应落地后**立刻**链式补发；`flushSave()` 在卸载时
   若还有请求在飞，就直接再发一次 `keepalive` 的 PUT（正文 < 60KB 才用 keepalive，超了退回普通请求）。
2. **乱序到达让旧内容赢**：卸载时同时有两个 PUT 在飞，谁后落地谁生效是不确定的。
   服务端 `saveWorld` 现在按 `document.updatedAt` 拒掉比库里更旧的写，集成测试专门验这条。
3. **旧请求的响应盖回新编辑**：`put()` 成功/失败都只在"这份文档还是当前那份"时才改本地状态，
   用户刚敲进去的内容不会被一个迟到的响应换掉。

还有第四处，是同一条 e2e 挂掉后顺着 console 追出来的：StrictMode 把 effect 跑两遍，
同一个项目发出两次 GET；第二次（迟到的）返回 `world: null`，把用户刚点出来的骨架从界面上擦掉了。
修法是两条纪律一起：`ensure()` 对同一项目的进行中载入不重复发请求；
读结果回来时若本地已经有这份世界（用户在建/在改），**保留本地**而不是覆盖成服务端那一刻的读数。
`apps/web/test/world-store.test.ts` 用假 fetch 把这两个时序钉住（并发只发一次、迟到不擦本地、
契约外的文档根本不发请求），不靠浏览器运气。

另外把工具条与回执移出滚动区：它们跟着画布横滚时，"已保存"和「连一条」会在往右拖之后消失。
e2e 因此**故意在拖完立刻 reload**（不等落地）来验上面那条写库链，另一条 §44 的用例则等 `pending=false` 再刷新——
两条各管一件事。

验证：`npm test` 350（world-model 新增 6 条关系/布局/投影用例，集成新增 2 条：旧形状仍可读、旧写入被拒，
store 新增 3 条时序用例）、@smoke 19 条全绿；浏览器实测截图确认三节点连线、拖拽、重复连线的回执都按预期显示。

**M3 进度记录（2026-09-23，§46 Character System）**：角色档案进 `@nexus/world-model`（`character.ts`）：
名字 / 外观 / 性格 / 背景故事 / 目标[] / 恐惧[] / 关系[] / 声音（语域·语速·口头禅）/ 视觉标识（色板·轮廓·母题·参考资产）。
**没有 `memory` 字段**——§48 的记忆是按 scope + subjectId 索引的独立存储，档案里塞一个文本框
就会造出第二个"记忆真值"，两边迟早对不上；面板上把这句话写着，免得被当成漏做。
关系的目标是世界条目 id（从下拉里选，不手抄），`validateCharacterAgainstWorld` 能报断链；
没给角色名单时不判，免得把"还没加载完"冤枉成断链。

存储上收掉一处历史遗留：`characters` 原来有 profile / visual / voice 三个谁也没读过的 jsonb 杂物袋，
现在合成一列 `profile`（迁移 `0003_character_profile`）。同时定死一条：**一份文档只有一个 id**——
世界与角色的模型 id 都以库里的 uuid 为准（读回来时覆盖模型里那个临时的 `chr_…` / `world_…`），
否则"角色挂的 worldId"和"世界文档自己的 id"会变成两个说法，迟早有人拿错的那个去查。

面板是显式保存（不是自动保存）：角色编辑没进画布的 Command 撤销栈（§150 目前只覆盖设计文档），
自动保存会把没写完的半份档案写进库而撤销救不回来。草稿改动的唯一入口是 `patchProfile`，
基准必须是当前草稿而不是库里那份——拿库里的当基准，改一个字段会把其它没保存的编辑一起抹掉。
建档只给名字，其它字段一律空：AI 生成角色设定要真 provider，给一份"看起来像人"的模板就是假生成（§159）。

验证：`npm test` 368（world-model +8 档案/关系/断链用例、契约 +3、真库集成 +7）、
@smoke 20 条全绿（新增：建档→填档案→连一条世界关系→reload 仍是库里那份→删除）；面板截图人眼确认。

**M3 进度记录（2026-09-23，§48 Memory 四类）**：`memories` 表原来只有 `scope + subject_id`——
**没有归属列**，意味着任何人拿到 id 就能读能删，也没法按项目列出"我的"这批。
迁移 0004 补 `owner_id`（NOT NULL，硬边界）与 `project_id`（user / session 类不挂项目，留 null）+ 两个索引；
域层每个查询都带 owner 条件，跨用户既读不到也删不掉（集成测试逐条钉住）。

四类：本次会话 / 角色 / 世界 / 我的偏好。主体默认值讲清楚：user 类就是本人、
session 类跟着项目的工作过程走（`project:<id>`），world / character 类必须指明主体——
否则会长出"不知道在说哪个世界"的孤儿记忆。Studio「记忆」面板按类分组列出、
可记一条、可单条删、可"清空这一类"；**没有一键抹掉全部**：§48 要的是按类删除，
误点一次就清光用户全部记忆的按钮不该存在。

不假装能搜：面板上没有搜索框，`embedding` 没有 provider 时就是 null，
`embedded` 字段如实带在返回里。§49 的检索等真 embedding 接入再做。

过程中修掉两处自己造的 bug：
1. `POST /api/projects/:id/memories/clear` 与 `/memories/[memoryId]` 路径撞车，
   Next 把 clear 当成 memoryId 路由 → 405。改成 `DELETE /memories?scope=…`（集合上的 DELETE），
   少一个易撞车的段，也更贴 REST。
2. 世界类记忆的主体一度存进组件 state：切到别的类型再切回来时 state 被清空而 effect 依赖没变，
   「记下」按钮永远点不动。改成**推导**（`scope === 'world'` 时取当前世界 id），
   不存就不存在过期的一刻；e2e 现在专门"切走再切回来"记一条，把这个坑钉住。

验证：`npm test` 374（真库集成 +6：四类计数、主体必填、陌生人看不见删不掉、
跨项目只见全局不见项目记忆、按类清空、删项目后项目记忆级联消失而偏好留着）、
@smoke 21 条全绿；面板截图人眼确认三类分组、主体标签与清空入口。

**M3 进度记录（2026-09-23，§49 语料索引与混合检索）**：RAG 里**不需要模型**的那一半落地了。

切分与入库：世界条目（§44）、角色档案（§46）、四类记忆（§48）→ `knowledge_chunks`。
切分是确定性的（先按空行分段、攒到 700 字收尾、单段超 1200 才硬切，不重叠不随机）——
同一份内容每次切出同样的块，"重建一次看差异"才有意义。空正文的小节不进索引：
检索结果里出现一排「外观：（空）」比查不到更糟。
`syncProjectKnowledge` 走**全量删+重写**而不是增量对齐：多花一点写代价，
换掉"改了却还检索到旧内容"这类最难查的谎。写路径（存世界 / 存角色 / 记记忆 / 删角色 /
删记忆 / 清空记忆）都自动触发同步；面板另给一个显式"重建"按钮，自动同步保证不撒谎、
手动重建保证可核对。删记忆走的是 `deleteMemory` 的返回值判定，
「我的偏好」类不挂项目、不在任何语料库里，因此不触发重建（加与删都按这条判断）。

混合检索为什么必须留子串命中：`'simple'` 配置的 tsvector **不按词切中文**——
一整句中文是一个 token，于是全文检索对中文语料几乎不命中。只报 tsvector 分数会让
中文用户以为索引坏了。所以候选集 = 全文命中 ∪ 整句子串命中 ∪ 任一词条子串命中，
再在 TS 里算三个**可解释的加数**（fulltext / substring / coverage）融合排序，
返回里带 `matchedBy` 与 `parts`——分数不藏在黑盒后面。同分按新近。
语料按项目隔离；「我的偏好」类记忆 `project_id` 是 null，不进任何项目的语料库：
§49 的语料清单是 Lore/Characters/History/Locations/Items/Quests/Documents，用户偏好不在其中。

**明确不做、也不假装做的两件事**：① `embedding` 列没有 provider 时保持 null，
返回 `vectorAvailable: false`，面板顶部常驻「向量检索未接」——没有语义检索就说没有；
② §49 的 "Reranking" 要真模型才谈得上，现在给的是**规则重排**（融合分数 + 新近），
`reranker` 字段如实写 `deterministic-fusion`，不冒充模型重排。

**过程中修掉一个「静默返回空」的 bug（本轮，诊断被推翻过一次）**：检索的候选集条件
原来把词条拼成一个字符串再塞进 drizzle 的 `sql` 模板：

```ts
sql`${needles.map((n) => `lower(content) like ${'%' + n + '%'}`).join(' or ')}`
```

drizzle 把整个拼接结果当成**单个绑定参数**，生成的 SQL 是 `or $N`，$N 是文本。
**第一版诊断说这会让 Postgres 报错、任何查询都失败——这是错的**：文本参数落在
布尔位置时**不报错**，而是**恒为 false**（真库实测：即使传 `'true'` 也得到 false），
所以"任一词条命中"这一支成了死代码。

真实症状比崩溃更隐蔽：

| 查询 | 修复前 | 修复后 |
|---|---|---|
| `盐海` | 命中 | 命中 |
| `沉船` | 命中 | 命中 |
| **`盐海 沉船`** | **`[]` 空** | 命中 |
| **`王城 投降`** | **`[]` 空** | 命中 |

即**任何多词条查询（空格/逗号分隔）都静默返回空**。单词条查询正常——
因为整句子串那一支（`like '%盐海%'`）已经兜住了。
原有的 6 条集成用例**全是单词条查询**（`盐海`/`eclipse`/`巡逻路`/`打翻的镜子`），
所以一条都没抓到。这是覆盖缺口，不是测试写得不够。

发现它的方式是**不连库、只用 drizzle 的 `.toSQL()` 把渲染结果打出来看**；
但**真正确认症状要靠真库**——正是"先起 Postgres 再验证"这一步推翻了第一版诊断。
修法是逐条生成条件再 `or(...)` 起来，每个词条各自成为一个绑定参数。

防复发做了两层：
1. 条件构造抽成纯函数 `buildRetrievalFilter(projectId, query)`，补 4 条**不连库**的
   SQL 回归断言（参数里不允许出现 SQL 片段、占位符数与参数数一致、中英文查询都合法、
   项目隔离条件永远在场）——这层拦住"把 SQL 当参数"这个写法本身。
2. 补 2 条**真库**多词条用例（整句不匹配但各词条命中必须查到；混入不存在的词时
   仍按命中部分返回）——这层拦住"多词条静默返回空"这个症状。
   两条都已回退验证过：还原旧写法后，2 条集成 + 2 条单测共 4 条如期失败。

验证：`npm run lint` 通过；`npm test` **37 files / 393 tests 全绿**（真库集成 74 条此前
因 Docker 未运行而整体未执行，本轮首次全部跑通）；`knowledge.test.ts` 11 条 +
`knowledge.integration.test.ts` 8 条。

## M4 — 3D 与游戏（§184）
- [x] Three.js / React Three Fiber 运行时 — **2026-09-24 落地**：`three` + `@react-three/fiber`（没引 drei，
  文字标签要它就得先加依赖，所以先用"色块 + 路标柱 + DOM HUD"这套能说的表达）
- [~] 3D World Runtime（§140 的 walk / explore）— `/world/<项目>` 走进这个世界文档的投影：
  场景不是另存一份文件，而是 `buildWorldScene(世界文档)` 现算（§16）——位置就是 §45 那张图上摆过的坐标
  （图的 y 就是世界的 z），没摆过的按文档顺序排在同心环上并**标成线框 + 在 HUD 里报数**。
  WASD / 方向键走、按住拖动转视角；走近 9 个单位内展开那条正文；图例说明"颜色=九类之一，不表示危险或阵营"。
  WebGL 用不起来时页面明说进不去，也不退回 2D 还叫"世界"；库里那份世界读不出来时报原因，不给空场景。
  talk 已在 2026-10-06 接上：HUD「跟角色说话」展开的就是 §46 角色档案的对话——与角色面板共用
  `CharacterChat`（换人即换对话），名册在服务端取好传下去；**世界条目不是对话目标**这条边界
  写在 HUD 文案与组件注释里（世界条目是九类正文，档案才有人设与记忆）。
  **2026-10-07 碰撞与点击行走落地**：`world-model/scene.ts` 新增 `resolveWalkCollision` /
  `walkToward`（纯函数，与 isoProject 同一条理由：能被单测钉住的算术不埋进三维组件）——
  条目占位半径 1.2 + 行走者 0.8 的圆碰撞，逐条目按场景顺序解，站正中心沿 +x 推出（不抛异常不 NaN）；
  点击地面走过去（指针按下抬起几乎没动 = 点击，与拖视角共用同一对事件），直线 + 碰撞滑动，
  目标在占位里（点了条目身上）停在占位表面并报 arrived；被挡住原地蹭半秒就停，不说"已到达"。
  限度同步改口（`SCENE_LIMITS` 与 HUD）：**没有地形——模型里没有高程字段，脚下是平的**；
  点击行走不是导航网格，绕不过大障碍（反复走停在占位表面，单测复现这条算术边界）。
  **测试**：`walk.test.ts` 10 条（推出方向、两占位重叠、确定性、冻结输入不被改写、
  点击条目停在表面、撞墙驻点复现）；`@smoke 3D 世界` 加一格：HUD 暴露 `data-walk-at`，
  按住方向键位置读数必须变化——把"碰撞解析在真帧循环里跑着"钉在真浏览器里（14.5s live 模式过）。
  **2026-10-07 高程落地（第二片）**：`WorldPoint.elevation`（0–6，模型常量 `WORLD_ELEVATION_MAX`）——
  高程是**条目的视觉属性**，不是可走地形：条目浮在图上写的高度上，柱子从地面把它撑起来；
  脚下的地没有坡，走近高处的条目是它浮着，不是你在爬山（限度随场景一起说）。写入端两条纪律：
  `setWorldNodePosition` 省略 elevation 时**保留原值**（拖动平面坐标不打回地面）；
  `setWorldNodeElevation` 只收摆过位置的条目、不合法就交回原因（面板显示）、高度 0 不落键
  （贴地 = 缺省，库里不留显式缺省）。面板每条目一个"高度"输入（没摆位置时禁用并说明为什么）。
  **测试**：`elevation.test.ts` 6 条（没摆位置不收、合法写入、越界/NaN 拒绝、拖动保留、
  越界钳到界内、投影与 fallback 归零）；world-model 56 条全绿。
   可走的地形已在 2026-10-10 第四片（圆台）落地，2026-10-15 第五片补上坡（cone 剖面）——
   记录见文末「§140 第五片」一节与欠账清单第 6 条。
   条目名字已经用 DOM 投影标签解决（没引 drei）。
   **2026-10-09 第三片：3D 模型资产接通（§34 × §140）**。`WorldNode.modelAssetId` 与
   `WorldWalk.ModelAsset` 早就写着，但**那条路是断的**：URL 拼的是
   `/api/assets/<projectId>/<assetId>`，而真路由是鉴权的 `/api/assets/<assetId>/file`
   （两段 vs 一段）——每个模型都 404，控制台刷一屏 warn，`return null` 之后条目位置上
   只剩一个**看不见但挡路的气墙**（碰撞体还在）。而且面板里没有任何挂资产的入口，
   `modelAssetId` 从 UI 到不了。这一片三件事：URL 改走 `apiAssetUrl()`（assetId → 地址的
   唯一投影，§16）；加载中与失败都退回**类别占位几何体**（线框盒，不再留空白）；
   `setWorldNodeModelAsset()`（world-model，null = 删键不是空串——"没挂"与"挂了空 id"
   是两种状态）+ WorldPanel 每条目一个「3D 模型」选择器（只列本项目 kind='model' 的资产，
    归属在面板那一端保证，模型侧只管形状）。测试：`model-asset.test.ts` 5 条
    （挂/摘/空串拒绝/不存在条目/不碰位置高程），world-model 61 条全绿。
   **2026-10-09 同日晚：高程在 wire 上被静默剥掉的断链**（`WorldPointSchema` 没有
   `elevation`，zod 剥未知键——面板写的高度存盘后再打开回到地面，无报错无提示）。
   契约补上该栏 + `elevation.test.ts` 新 3 条（过得去且不被剥、越界拒、上界与
   `WORLD_ELEVATION_MAX` 同源）+ 真实库往返 2 条（写 3.5 读回 3.5、高度 0 不落键）。
   **2026-10-10 第四片：可走的地形（圆台高度场）**。与 elevation 的分工写进模型注释：
   elevation 是**条目的视觉属性**（浮多高、柱子是标架），terrain 是**地本身的高度**——
   走近圆台是站在台面上。三层全落地：① 模型 `WorldDocument.terrain?`（kind: 'plateaus'，
   缺省 = 平地，老世界照常读得出）、`setWorldTerrain` 整份写入（不合法就不写、原因交回、
   null = 收掉）、`validateWorld` 新 `bad-terrain`；② 场景投影 `terrainHeightAt`
   （覆盖取**最高**，不平均不后画赢——确定性与"没有半个台阶"）、`SCENE_LIMITS` 改口；
   契约 `WorldPlateauSchema`/`WorldTerrainSchema`，PUT 进读回来还在；③ 3D：相机高度 =
   眼高 + 地形高度（`EYE_HEIGHT = 3.2`），**半透明盘 + 高度柱 + 台沿圈**三件套
   （半透明是免得把台子上的条目挡成黑影），点击地面的落点改走地形感知的
   `pickGroundPoint`（先按地平求候选再拿候选点问高度，两次迭代收敛）；
   `data-walk-height` 进读数。WorldPanel 新增地形区（x/y/半径/高度四输入 + 加/删 +
   收掉地形——**没有画布可以把圆台拖来拖去，位置用数字填，界面不假装有拖动**）。
   测试：`terrain.test.ts` 18 条 + 真实库往返 1 条 + `@smoke 3D 世界` 加一段
   （面板加 r=200 h=3 盖住出生点 → 进 3D → `data-walk-height` = '3' → 截图
   `world3d-terrain.png`：绿色圆台与 HUD 新限度）。**踩过的真坑**：`sceneTerrain()`
   一度带一个 `heightAt` 函数，而 WorldScene 是服务端组件作为 props 传给客户端 3D 组件的——
   Next 运行时报 "Functions cannot be passed directly to Client Components"，3D 页白屏；
   投影改成纯数据（查询用模块级 `terrainHeightAt`），并加一条「场景投影是纯数据」的
    typeof 断言防 Regression。仍欠：**在地形上直接画地形的编辑器**（今天是数字输入，
    拖拽画圆台要等世界图支持）与真正的坡地/高度场（圆台是硬边，缝怎么走写在限度里）。
    取舍与踩过的坑：`docs/adr/0034-world-terrain-walkable-plateaus.md`。
- [x] Game Studio：2D / 2.5D / 3D / 探索 / Interactive Story / RPG 原型 / Puzzle / Visual Novel（§51）
  — **2026-09-25 第一片（2D 可玩）落地**：`packages/game-model` 新增 `play.ts`（编译关卡计划）与
  `sim.ts`（纯函数模拟器），`/game/<项目>` 用 canvas 把它跑起来，Studio 的「游戏」面板上有「试玩这份设计 →」。
  **这一片守的是 §16：试玩读的就是那份 §54 文档，没有第二份"关卡文件"**——改完数值回这一页刷新，
  跑起来的东西跟着变（e2e 就钉这条：把敌人 `health` 从 10 改成 999，同一套按键就打不死了）。
  八种类型里 2D、「互动故事 / 视觉小说」与 2.5D 这四种有构建管线，其余四种只有清单没有投影，
  界面上照实这么说（§51 要的是"至少支持"，今天支持四种就写四种）。
  **2026-09-25 第二片（公开可玩）**：`published_projects.game_document`（迁移 0012）在发布那一刻把当时的
  游戏设计钉进 publication 行，`/n/<handle>/<slug>/play` 只读这一列（取舍与理由见 `docs/adr/0009-…`）。
  作品页上的「试玩这一版」只在钉住了的时候才出现——不给一个"点进去说没有内容"的链接；
  可见性判定整个复用 `resolvePublishedPath`（private / 被人工拒绝 / 项目已软删一律不可达），不抄第二份谓词。
  钉的是**原样 jsonb**：解析不了就在公开页明说"这一版的游戏读不出来"并列出前几条原因，
  不悄悄变成"这个游戏没内容"。老发布行不回填——回填等于替历史宣布"当时发布的就是现在这份工作稿"。
  §168 顺接上了：`/play` 挂同一个 `VisitMeter`，玩一次就是一次真访问，游戏类作品的 play time 从此有来源
  （`completion` 仍然是"最远滚到的高度比例"，对一屏画布的游戏没有额外含义，不冒充通关率）。
  **2026-09-26 第三片（类型进了文档，对话那条管线有了实现）**：`GameDocument.kind` 成为字段（§16：
  类型决定这份设计走哪条管线，所以要跟着文档与快照发布），`packages/schemas` 的契约同步加上
  `GameKindSchema`，缺省按 `2d` 读——那是这一格加进来之前唯一存在的管线，不是随手挑的默认值。
  `compileStory` 把「互动故事 / 视觉小说」那句话变成真的：正文＝对话实体的「设计说明」（空就是空，
  不替作者写开场白），选择＝它指向其它对话的引用；忽略的非对话实体个数、悬空引用、空正文、
  没有出边、多条互不相连的线全部进 `notes` 照实说。`compileForKind` 是"类型 → 管线"的唯一分派点，
  作者试玩页与公开试玩页共用它（`apps/web/src/play/PlayByKind.tsx` + `StoryPlay.tsx`）：
  没接的那四种给出原因，不给空场子、也不拿 2D 关卡顶上。Studio「游戏」面板的类型下拉
  把 `GAME_KIND_STATUS.note` 原样显示，所以"面板说能玩、点进去没得玩"这两句话不可能同时出现。
  测试：`story.test.ts`（10 条，含一条拿状态表当准绳的分派对齐）、`game-contract.test.ts`（+4 条，
  含"kind 会被未知键剥掉"那次的反向对照与老文档缺省）、`game-publish.integration.test.ts`（+1 条
  往返：存 interactive-story → 钉住那份读出来还是它 → 分派出 story）、
  `@smoke §51 类型分派`（真浏览器里换类型 → 对话播放器 → 点选项跳到空正文那段 → 改成 3D 后同一页
  照实说"还没接"，三张截图核对过长相）。
  **2026-09-27 第四片（2.5D 有了真投影，"同一条计划换画法"落地）**：`GAME_KIND_STATUS["2.5d"]`
  从 `pipeline: null` 改成 `pipeline: "topdown"` + `view: "isometric"`——2.5D **不是第二套规则**：
  `compileForKind` 照样派 `compileGame` 出来的那份计划，`GamePlay` 只换绘制函数，循环 / 输入 / HUD /
  §53 的 playtest 全部共用，所以"2.5D 玩起来不一样"这句话在这里说不出口，它就是同一个游戏。
  等轴测算式放在 `play.ts`（`isoView` / `isoProject` / `isoDepth` / `isoGroundRadius`）而不是组件里：
  位置本来就是这一层排出来的，投影写进渲染层就会变成"浏览器算一遍、单测算另一遍"，
  两处不一致时没人说得清玩家看到的坐标是不是设计里的那个（§16）。
  2:1 等轴测，场地四角带边距落回同一块 1200×760 画布，标记按 `x + y` 排远近。
  **限度跟画法一起显示**（`ISO_VIEW_NOTES`，进页面上的 `data-game-note`）：规则与 2D 走同一个 step、
  地面网格不参与碰撞、标记不随远近缩放也没有转身——模型里没有尺寸与朝向，它们仍是类别标记不是 3D 模型。
  面板那句"接没接"、页首的"等轴测投影"、画布上的 `data-game-view` 全部读同一张 `GAME_KIND_STATUS`。
  **测试**：`iso.test.ts` 新增 7 条（方向、单射、远近序、2:1 比例、限度三条在不在）；
  `story.test.ts` 的分派对齐用例加上"表说等轴测，分派出来就不许是俯视"；
  `@smoke §51 类型分派` 多一格（换 2.5D → 等轴测页 → 像素断言 → 截图 `story-play-isometric.png`），
  同一趟把 `§50 试玩` 与 `§50 公开可玩` 两条 2D 回归一起跑了（3 passed）。
  **这一格顺带修的一条测试纪律**：截图前必须 `game.bringToFront()`——后台标签页的 rAF 不跑，
  画布会是空的；第一版就是这样，断言（DOM 可见 + 页首文字）全绿而像素一张没画出来。
  那条断言现在数的是画布上"非背景色像素 > 1000"，DOM 存在不再等于画出来了。
  **仍欠的三种**（是还没做，不是做不了；面板上照这三种各自的原话写）：RPG 原型（模型里没有
  成长/战斗循环的语义）、探索、解谜。
  **2026-10-22 核过：这一行过期了**——这三种都接上了（RPG 原型 2026-10-07 第八片、
  探索 2026-10-06 第六片、解谜 2026-10-07 第七片；`GAME_KIND_STATUS` 八型今天全是
  `pipeline` 非 null）⇒ 那一行留着只是当时的快照，不再是欠条。
  **2026-09-29 第五片（3D 有了真投影，立体视角一条规则都不改）**：`GAME_KIND_STATUS["3d"]` 从
  `pipeline: null` 改成 `pipeline: "topdown"` + `view: "3d"`——3D 与 2D / 2.5D 是**同一条计划**的第三种画法：
  `compileForKind` 照样派 `compileGame` 的产物，规则仍在地平面上那个 `step` 里判定。
  渲染换成 `apps/web/src/game2d/GameCanvas3D.tsx`（three.js + React Three Fiber，与 `/world` 同一个栈）：
  球=玩家、方=敌人、菱=物品、锥=NPC，与 2D 的圆/方/菱/三角一一对应，颜色抽到 `game2d/palette.ts` 两处共用
  （各写一份颜色就是两份真值，同一个人换个画法变个色看起来就是两个游戏，§16）。
  **循环的分叉点是 `GamePlay` 的 rAF 里一句 `view === '3d'` 就退出**：两个循环各推一次 step，
  同一份状态每帧被推进两遍、规则悄悄快一倍而两边的单测都还是绿的——这条比"画不出来"更难发现。
  血条与触发器冷却圈的判据与 2D 同源（满血当分母、`readyAt > t`）；按住拖动转视角，WASD 跟着相机朝向走，
  所以"往上"永远是"往画面深处"——与 2D 的屏幕方向同一套语义，不是另学一套操作。
  限度写在页面上（`data-game-kind-note="3d"`）：判定仍在地平面上、几何体是类别标记不是 3D 美术模型、
  3D 不画名字标签（名字在 HUD、任务列表与事件流里都还在）；WebGL 拿不到上下文时明说并**不**退回
  2D 画法冒充（与 `/world` 同一条口径）。同一句"接没接"在面板与试玩页是同一份 `GAME_KIND_STATUS`。
  **测试**：`story.test.ts` 的分派用例改成"3D 派出的计划必须与 2D 逐字段相等"（换画法不换规则），
  对齐用例照旧遍历状态表（表说 `view: "3d"`，分派出来就不许是俯视）；
  `@smoke §51 类型分派` 多一格（换 3D → 立体视角页 → **数玩家球颜色的像素 > 20** → 截图
  `story-play-3d.png`），反向对照改用 puzzle（真没接的类型仍然不许退回 2D 关卡）。
  3D 那格的像素断言数的是**玩家球的颜色**而不是"非背景 > 1000"：铺了地面之后非背景几乎恒真，
  断言会变成一句空话；为此 `Canvas` 开了 `preserveDrawingBuffer`（默认关掉时 `readPixels` 读到的是
  已清空的缓冲，同样会把断言变成谎话）。教训照记：DOM 里有 canvas 只说明组件挂上了。
  **2026-10-06 第六片（探索有了真投影：走近才看得见是画法，不是第二种游戏）**：`GAME_KIND_STATUS["exploration"]`
  从 `pipeline: null` 改成 `pipeline: "topdown"` + `view: "exploration"`——探索与 2D / 2.5D / 3D 是**同一条计划**
  的第四种画法：`compileForKind` 照样派 `compileGame` 的产物，规则仍在同一个 `step` 里（单测钉死 plan 逐字段相等）。
  揭示的算式放在 `play.ts`（`revealedNow` 欧氏距离、`discoverableIds` 四类清单、`EXPLORATION_REVEAL_RADIUS = 150`），
  不进组件——位置本来就是这一层排出来的（与 2.5D 投影同一条理由）。
  绘制不另写第二个函数：`drawTopdown` 加一道 `revealed` 过滤，探索就是"只画看见过的"俯视；玩家不参与发现。
  「看见过」是视图层的 `Set`（`useRef`），不进模型也不进库——模型里没有探索进度这个字段，刷新就重摸一遍；
  限度三条随画法一起显示（`EXPLORATION_VIEW_NOTES` 进 `data-game-note`）：规则与 2D 走同一个 step、
  发现不进文档也不进库、可发现的只有摆上场的那四类（§54 文档说有什么就有什么，探索不发明新东西）。
  HUD 多一个读数 `data-game-discovered="x/y"`（分母 = `discoverableIds(plan).length`），restart 清空集合从头摸。
  **测试**：`exploration.test.ts` 新增 5 条（半径 0 圆心取等、欧氏而非曼哈顿/切比雪夫——106+106 照得见
  120+120 照不见、可发现清单就是四类且不含玩家、换画法 plan 逐字段相等、半径是常量不随场地缩放）；
  `story.test.ts` 的分派用例加探索格，"没接"清单从三种减为两种（RPG 原型 / 解谜）；
  `@smoke §51 类型分派` 多一格（换探索 → 走一步 → **发现计数单调不减** → 像素断言玩家在场 → 截图
  `story-play-exploration.png`），用例标题同步改成"标探索出走近才看得见"。
  **2026-10-06 第七片（解谜有了真投影：机关连线是画法，任务判定多了「激活」这一格）**：`GAME_KIND_STATUS["puzzle"]`
  从 `pipeline: null` 改成 `pipeline: "topdown"` + `view: "puzzle"`——解谜与 2D / 2.5D / 3D / 探索是**同一条计划**
  的第五种画法：`compileForKind` 照样派 `compileGame` 的产物，规则仍在同一个 `step` 里。
  `PlayQuestGoal.kind` 新增 `"activate"`：引用了触发器的任务按首次踩到的时刻判定完成；
  `SimState.activated: Record<string, number>` 记每个机关首次被踩到的模拟时刻；
  `puzzleLinks(plan)` 把作者连了的引用画成连线（机关→目标），没连的就是孤立的开关。
  GamePlay 的 `drawTopdown` 新增 `links` 参数：激活过的机关连线实线黄色、未激活虚线淡黄，
  激活过的机关范围圈实线圈（不再是虚线）。HUD 多一个读数 `data-game-activated="x"`（已激活的机关数）：
  「激活」是模拟里唯一可判定的谜题动作，它必须有一个能被断言的读数，不能只靠看图。
  限度三条随画法一起显示（`PUZZLE_VIEW_NOTES` 进 `data-game-note`）：
  规则与 2D 走同一个 step、连线只画作者连了的引用、模型里没有表达顺序的字段所以不假装支持「按正确顺序踩」的谜题。
  **测试**：`puzzle.test.ts` 新增 9 条（goal kind 是 activate、判不出 NPC/对话、首次踩到记账、
  再次踩到不重复、无任务时纯记账、连线只画场上有的目标、没连的目标没有这条线、空文档返回空数组、
  移除实体后连线消失）；`story.test.ts` 的分派用例加解谜格，"没接"清单从两种减为一种（只剩 RPG 原型）；
  `play.test.ts` 更新 why 文案断言（"不是敌人、物品或触发器"）。
  `@smoke §51 类型分派` 多一格（换解谜 → 向右走一步 → **激活计数从 0 变正**——模板骨架那一个触发器
  恰好排在场地正右方，单实体同心环 angle=0，所以敢断言"变多"而不是只验单调 → 截图
  `story-play-puzzle.png`），反向对照改用 rpg-prototype（唯一没接的类型仍然不许退回 2D 关卡），
  用例标题同步改成"标解谜出机关连线"。
  **仍欠的一种**：RPG 原型（模型里没有成长/战斗循环的语义）。
  **2026-10-22 核过：这一行也过期了**——下面那一片（2026-10-07 第八片）就把 RPG 原型接上了，
  八种今天全部派得出真管线 ⇒ 这一行留着只是当时的快照。
  **2026-10-07 第八片（RPG 原型接上，八种全部派得出真管线——这一格从此 `[x]`）**：
  `GAME_KIND_STATUS["rpg-prototype"]` 拿到第三条管线 `pipeline: "rpg"`——不是 topdown 的又一种画法，
  加的是规则层。战斗逐字复用 `sim.step`（移动/追击/接触伤害/挥击与 2D 同一套算术），`rpg.ts` 只加成长：
  经验来自作者写的 `xpReward`（数值是自由 Record，xpReward 只是建议键），敌人没写用投影兜底
  `XP_PER_KILL_FALLBACK=10` 并逐个标 `default`，任务没写就不发——管线不替设计补经验；
  升级曲线是投影常量（`xpToNext = XP_BASE + (level-1)×XP_STEP`，每级生命上限 +10 并回复、伤害 +1），
  `RPG_RULE_NOTES` 随 plan.notes 原样上页面；任务上的 `requiredLevel` 按等级门解释。
  **等级门是帧序敏感的**：底层 step 在同一帧里「标记完成 → 判胜」，门在帧后删除 questDone
  拦不住已经宣布的通关——所以门扣下的那一帧要同时把 won 撤回；升到级的下一帧底层 step 重判
  （goals 每帧重评），不需要第二套判定。伤害加成走派生的 `planAtLevel`（plan 是常量，不改原对象）。
  web 侧 `RpgPlay` 复用 GamePlay 的 `drawTopdown`（画法不抄第二份），HUD 有等级/经验/伤害（含加成）
  读数与逐敌人的经验 provenance 清单；`describeProjection` 页首写「RPG 成长循环（战斗与 2D 同一个 step）」
  与兜底个数。
  **测试**：`rpg.test.ts` 20 条（provenance 两向、任务经验无兜底、曲线常量、纯函数确定性、
  等级门过/不过对照对——25 经验同一次击杀升级过门 vs 10 经验被扣且 questDone 保持为空但敌人已死、
  状态表对齐）；game-model 112 条全绿；全仓 typecheck + eslint 绿。
  `@smoke §51 类型分派` 的「还没接」反向对照换岗：rpg-prototype 现在断言它派的是自己的播放器
  （`data-rpg-root` / `data-rpg-level`，不是 2D 画法也不是对话播放器顶上），截图 `story-play-rpg.png`。
- [~] Game Agent + Playtest Agent（§52-53）
  — **2026-09-25 §53 的可确定那一半落地**：`packages/game-model/src/playtest.ts` 用四种固定走法
  （站着不动 / 冲向最近的敌人并挥击 / 一直躲开 / 定种子随机游走）把一份设计各跑 60 秒，
  报告写清每种走法的结局、秒数、承伤与输出、拾取与任务数。试玩页上「跑四种走法」就是它，
  不需要人操作、也不需要模型或 provider。
  **报告的限度和结果一起显示**（这是它可信的唯一理由）：四种走法不是穷举——
  "0 种通关"绝不写成"不可能通关"，"1 种通关"也不写成"好上手"；到时间上限只记"跑到时间上限"，
  不冒充失败；随机游走用定种子（默认 7），所以同一份设计两次报告逐字段相同（换种子才是换一次抽样）。
  三条具体能点出的毛病：没有可判定条件（说的是"任务没连上敌人或物品"，不是"太难"）、
  玩家没有伤害来源（"打倒"类条件永远满足不了）、站着不动也会死（察觉半径或伤害过高）。
   **2026-10-09 第二片（试玩报告覆盖另外两条管线，八种类型都有了着落）**：
   四种走法此前只在 topdown 那五种的 `GamePlay` 上有按钮——RPG 与对话两种页面连入口都没有。
   - RPG：`playtestRpg` 跑的是 `rpgStep`（与 HUD、手动试玩同一个函数）——经验、升级、等级门
     参与判定。关键对照钉在测试里：同一份带 99 级门的文档，底层 `playtest(rpg.base)` 会宣布通关，
     `playtestRpg` 扣成 0 种通关（门没开、完成被撤回）——只跑底层战斗的报告在 RPG 页面上就是谎。
     报告多两列（等级/经验、过了哪些等级门）与一个最高等级读数；兜底经验与"没过门"各是
     findings 里一条（"等级不够还是条件没满足，报告分不开这两种"）。
   - 对话管线：`playtestStory`——这一格**没有"走法"**（四种空间走法对着一段对话什么都不是），
     能确定回答的是"点不点得到"：按引用连线 BFS 可达、停点数、空正文数、走不到的段落点名。
     限度头一条就说这不是玩家行为测试（§53 的 Detect bugs 要浏览器与模型，那两格仍欠）。
   - 共用口径抽成 `summarize()` + `PLAYTEST_BASE_LIMITS`：2D 与 RPG 的 findings 不说两遍。
   - UI：RpgPlay / StoryPlay 各一个区块，与 GamePlay 同一套 `data-playtest-*` 属性。
   - 测试：`playtest.test.ts` 9→17 条（门开/不开对照、兜底两向、确定性与限度；可达正反两向、
     停点与空正文、成环、跑不起来）；game-model 120 条全绿；`@smoke §51` 多两格
     （对话页查可达性 2/2 + 截图 `story-play-playtest.png`；RPG 页跑四种走法 + 限度含 rpgStep
     + 截图 `story-play-rpg-playtest.png`；真浏览器 26s 通过）。
  **2026-10-15 §53 第三片（限度里那句"换种子才是换一次抽样"变成页面上做得到的事）**：
  上面第二条限度教作者换抽样看看稳不稳，而 `playtest` 里**根本没有种子这个入参**——
  那句话在界面上做不到，等于一份空头支票（§159 那一类）。
  - **种子是入参，也是报告的一部分**：`playtest(plan, policies?, seed?)` 与 `playtestRpg` 同形状收 seed，
    报告带回 `seed` = **实际跑了的那个**（不是输入框里那个）。回落规则只有一处（`effectiveSeed`）：
    非有限值 → 默认 7，小数**取整**不四舍五入（`12.7` 用的是 12 那份抽样，与 13 是两份）。
  - **限度文案由常量插值**：那句"默认 7"来自 `PLAYTEST_DEFAULT_SEED`；测试把数字从文案里**抠出来**
    与 `report.seed` 比——谁把默认值挪走而文案留着，这一条就红。
  - **只有随机游走那条吃随机数**，所以换种子时 `idle`/`beeline`/`flee` 三条必须逐字段不变，
    而 `wander` 的终点必须变（双向钉；只钉前一半等于允许"种子根本没参与"）。
  - UI：GamePlay / RpgPlay 各一个「随机种子」输入框，页面上印的那句来自 `playtestSeedNote(report.seed)`
    （两个面板共用一处措辞，"就是默认那一个"与"换一次抽样"互斥到不能互相冒充）。
  - **真浏览器量出一个界面谎**：`Number('')` 是 **0**，所以清空输入框会把"没填"变成种子 0——
    界面显示 0、跑的也是 0 那份抽样，而 0 是个**合法种子**，不是回落暗号。修法是清空送 `NaN`
    （模型层那条回落路径本来就为它而写），并补一条单位用例钉"0 是真种子、不是没填"。
  - 测试：`playtest.test.ts` 17→21 条（默认值与文案同源、换种子只换 wander、非有限值与取整、
    0 是真种子、`playtestSeedNote` 两向）；game-model 201 条全绿；
    `@smoke §50 试玩` 多一段（默认 7 → 填 11 → 清空回 7，三个读数与两句话都断），
    `@smoke §51 类型分派` 的 RPG 那格多钉两行（这一页没有第二套说法）；真浏览器两条 28.8s 通过。
    截图 `game-playtest-seed-11.png`。见 `docs/adr/0040-playtest-seed-is-input-and-reading.md`。

  **2026-10-11 §52 第一片（Game Agent 有真产物，产物有一个真去处）**：`game` 成为编排的第五种步骤
  （`STEP_KINDS` / `READINESS_STEPS` 各加一条，名册里 `game` 那位声明的 `game.write` 就是这一步的要求）。
  - **草稿来自确定性配方而不是模型**：`lib/agent-game-draft.ts` 那张表编出一份 RPG 原型
    （8 个实体 / 2 个敌人 / 1 条任务），id 只从 seed 派生（换时间戳不动 id，换种子才换 id），
    目标文本只改标题不动任何数值。界面上"四种脚本走法里有几种通关"是 `playtestRpg` 跑出来的读数，
    报告自带的限度与它同屏显示（只报"2 种通关"会被读成"这设计好上手"）。
  - **草稿存在任务行里**（`result.steps[].draft`，形状直接用 `GameDocumentSchema`），所以刷新之后还在、
    别的实例也读得到；编排那五步**仍然只读**——跑完之后 `countGames` 还是 0，集成测试钉着这一条。
  - **落地只由用户点那一下**：`POST /api/projects/<id>/agent/draft`，请求体只有 `taskId`——
    那份文档由服务端从任务行读出来，所以调用方贴不进任意一份设计；
    `saveGame(..., { createOnly: true })` 在项目已有游戏设计时**拒绝覆盖**（409 + 说清已有哪一份），
    拒绝之后库里那份整列 JSONB 一字未动。两种落地形状（审批门补丁 vs 显式接受整份文档）
    的取舍见 `docs/adr/0035-agent-artifact-landing-shapes.md`。
  - 测试：`agent-game-draft.test.ts` 19 条（纯层：配方≠理解、确定性、可玩性、经验跨等级门）；
    `agent-draft-accept.integration.test.ts` 7 条打真库（CSRF 前不碰库 / 三种问法同一个 404 /
    无草稿 409 + 拒绝审计 / 只认 taskId / 不覆盖且字节相同 / 放行审计按本次那份文档查）；
    `games.integration.test.ts` 的 createOnly 五道含**两条对照**（同一份草稿不带 createOnly 就写得进去，
    证明拒绝来自这道门而不是文档本身；项目里那份是 2020 年存的而草稿是刚刚跑的，
    证明挡着覆盖的**只有**这道门——前一种排布下"更旧的写"那道守卫会顺手替它挡下来）；
    `agent-orchestration.integration.test.ts` 五步全绿 +
    草稿落任务行 + `countGames===0`。e2e `@smoke`：跑 → 刷新草稿还在 → 点接受写库 →
    游戏面板读得到同一份 → 再点不覆盖，截图 `agent-accept.png` / `agent-accept-refused.png`；
    步数断言全部改成从服务端计划里读（原来写死 4，配方加一步就会假绿）。
    七条变异臂（摘门 / 丢草稿 / 掺随机 / 换顺序 / 收请求体文档 / 归属改 409 / 措辞兑现承诺）
    各自点名哪几条红，读数在 `docs/TESTING.md`；**摘门那一条第一轮只红在措辞上**，
    于是补了上面那道"旧设计 + 新草稿"的对照——守卫的独证是量出来的，不是想出来的。
   **2026-10-12 §52 第二片（链子往前走一格：Combat Design 吃上一格的草稿）**：`combat` 成为编排的第六种步骤，
   见 `docs/adr/0036-combat-design-deterministic-tuning.md`。
   - **规则层是常量不是判断**（`packages/game-model/src/combat.ts`，8f4944a）：五条目标带
     （有路可通 / 不是一照面就结束＝最快通关也要打满 18 秒 / 赢家要付出代价＝最少挨 2 点 /
     站着不动不能赢 / 一直躲不该几秒就死）、
     七条杠杆（其中"加厚敌人"是敌人 +4 与玩家 +8 **成套**动的）、每条的上下界与步长全部写死在
     `COMBAT_RULES` / `COMBAT_LEVERS`。界面上与 notes 里都点明：**这些阈值是这一格自己的定义，
     不是需求里写好的验收标准**；改的只有数值，不动布局、不加实体。
   - **读数不是估的**：每一轮改完都重跑 §53 那份定种子报告（四种走法、跑的是 `rpgStep`）。
     保留条件只有一条：`读数变好 && 没把已达标的挤破`；撤回的轮次照样留在 `rounds` 里并写明破了哪条，
     撤回的杠杆标成用尽（不许同一杠杆反复试）。
   - **产物还是草稿**：存在这一步自己的结论行（`result.steps[].draft`），编排仍然只读
     （跑完 `countGames === 0`）。拿不到上游草稿时这一步**直接 failed**，不另编一份设计来"调"。
   - **接受入口不再写死步骤**：`{ taskId, stepId? }`——给了就点名要那一步的那一份，没给取链末那份；
     点名的那一步必须真留了草稿，否则 409 并把"当时哪几步有草稿"写进拒绝审计与那句话里。
     `createOnly` 一字未动：两份草稿、一份项目，第二下点击必然被拒且库不变。
   - 测试：`combat.test.ts` 26 条纯层 + `agent-runtime.test.ts` 多两条（combat 一开始不就绪、
     game 失败只带走 combat）+ 编排 6 条（combat 的计数/摘要，且**读数从库里那份草稿重算**，
     不许这一步自己给自己打分）+ 接受 9 条（`stepId` 点名 / 点了没草稿的步骤）+ e2e 真浏览器点 `combat` 那一格。
     七条 game-model 变异臂 + 八条 web 侧变异臂的读数在 `docs/TESTING.md` 2026-10-12。
   **2026-10-13 §52 第三片（链子走到 Level Design：布局第一次成为设计里的值）**：`level` 成为编排的第七种步骤，
   见 `docs/adr/0037-level-design-authoring-positions.md`。
   - **先补模型层那个缺失的概念**（`play.ts`）：`POSITION_STAT_KEYS` / `hasAuthoredPosition` /
     `authoredPosition`——文档里写了 `x` `y` 就用作者摆的位置，没写才退回到同心环；
     玩家只在**没被写过位置**时钉在正中。HUD 的来历那一栏改成从 `PLAY_PROVENANCE_SLOTS` 派生，
     画面上每个位置都说得出是「文档写的」还是「兜底排的」（§16：投影不改真值）。
   - **规则层同样是常量**（`packages/game-model/src/level.ts`）：四条几何目标
     （先把布局写成设计值 / 别叠在一起＝间距不小于 `2 * ACTOR_RADIUS` / 别把白拿的目标摆在出生点上 /
     开局到最近敌人的距离落在 120–520 这条能反应的带里，正中 320）、四条杠杆一条对一条、
     分开时多留 8 像素、最多 12 轮，全部写死在 `LEVEL_RULES` / `LEVEL_LEVERS`；
     **改的是坐标，战斗数值、冷却、升级曲线、实体增减与引用图一个都不动**。
   - **这一格必须是独立的一格**（不是"数值格顺手做掉"）：同一份「机关贴着玩家、目标压在出生点」的文档，
     `tuneCombat` 用尽七条杠杆修不好「站着不动不能赢」（那是布局问题），`designLevel` 一轮修好——
     这条对照用**同一份文档跑两遍**，换文档等于没证。
   - **不许弄坏上一格的成绩**：保留条件仍是 `读数变好 && 没把已达标的挤破`，但 `broke` 的范围
     扩到**进入这一格时已达标的战斗目标**；位置会改变四种走法的读数，打架时布局让路。
     `moves[].kind` 分 `author`（原样写成坐标，一个像素都没挪，四种走法的报告必须逐字节相同）
     与 `shift`（真的挪了个体），界面上分开报数。
   - **产物还是草稿**、编排仍然只读；拿不到 combat 那份草稿就 `failed` 并点名"没留下 draft"，
     不另编一份设计来摆。接受入口今天面对三份草稿，`stepId` 缺省仍取链末那一份。
   - 顺手修掉一类会自己长大的错账：AgentPanel 那句作业介绍原本手写「五步作业」，
     配方早就有七步——现在步数从 `READINESS_STEPS.length` 派生。
   - 测试：`level.test.ts` 27 条纯层（多的一条钉"作者已经摆过的位置不许被列进本格改动清单"）+
     编排 3 条（守卫 / **除了坐标与时间戳两份草稿逐键相等** /
     跑不起来那份按存进任务行的那份重算达标条数且 0 轮 0 处改动）+ 接受层三步都留草稿 +
     e2e 真浏览器点 `level` 那一格（判别证据是"库里有作者坐标而 combat 那份一个都没有"）。
     13 条 game-model 变异臂 + 接线 6 臂 + 只在真浏览器里量的那一臂（把派生步数改成手抄的 5 →
     e2e 红在 `Expected substring: "7 步作业"`）的读数，与**两条最初是绿的臂**
     （一条是分支不可达、一条是"覆盖与跳过读数等价"）都在 `docs/TESTING.md` 2026-10-13。
   **仍欠**：§53 的 Capture screenshots / Fix 两格（要接浏览器与模型）、§52 那条链的
   最后一格 Code（产物要能下载、**不得在主机执行**，§81）——Level 这格今天落地了，
   但它只把投影排好的位置写成设计值并按写死的几何目标摆开，摆出来的布局不是美术成品。
   前置条件已经好了：`sim.ts` 是无头、定步长、可复现的（同一份计划 + 同一段输入 = 同一个状态，有测试钉住）。

   **2026-10-14 §52 最后一片（Code：产物能下载，而且真的能玩）**：链子的最后一格落地，
   见 `docs/adr/0038-code-cell-transcription-and-browser-parity.md`。
   - **转写而不是复用**：产物里的引擎是 `sim.ts` 的转写（同一段推进逻辑，ES5 形状、能独立打开），
     四个规则数与那句拒绝**由 `sim.ts` 的导出插进模板**——模板里不许出现对应的字面量，
     否则就是两处各写一遍，改一处另一处不会跟着红。
   - **§81 的守法形状**：生成侧只有字符串拼接（不 eval、不起子进程、不读写文件、不联网）；
     产物自带 CSP `connect-src 'none'`；见证把字节交给 **loopback 上另一个源的浏览器**跑，
     主机自己从不执行它（`scripts/game-code-parity.mts`，`npm run parity:game-code`）。
   - **"转写等价"这句话第一次被结账**：那条见证 13 条判决首跑就报出**产物里所有敌人开局就是死的**
     （`initialState` 用了 `cloneActors(plan.*)`，而计划里没有 `active` / `readyAt`）——
     不追、不打、物品捡不起来，页面摘要却照样写"进行中"。当时那 17 条比对常量与键名的静态闸**全绿**。
     补了与 `sim.ts` 的 `actor()` 同形的 `startActors`，并留下一道读结构的闸 + 反向控制。
     修完之后：**979 帧、980 个状态、1 771 994 字节的轨迹与平台引擎逐字符相同**，
     末态摘要逐字相同，五条分支各自跑到（伤害 2 / 挥击 3 / 输出 4 / 拾取 1 / 机关 52、事件流停在 40 条上限）。
   - **出口是只读的**：`GET /api/projects/<id>/game/code` 从库里那份设计现算，归属先判、响应体有上限（超了 413 并报字节数）；
     界面（`GameCodeExport`）把 `CODEGEN_LIMITS` 那四句原样念出来，一个文件一个文件用 Blob 落盘。
     2026-10-21：落盘那一步与导出面板、市场条目统一到 `src/lib/download.ts` 的 `saveBlob`（回收对象 URL 的
     时机只写一处；同一 tick 回收到底会不会截断，先在真浏览器里量过——Chrome 上没有复现，详见 ADR-0047 补记）。
   - **e2e 又抓到一格界面在撒谎**：这一格读库里那份，而 PUT 还在飞时屏上已经有 11 个实体了——
     第一版按钮照样能点，于是"刚建完骨架就生成"回一句「这份项目还没有游戏设计」。
     现在库里没跟上屏上（`dirty` / `saving`）时它点不动并写着原因；变异臂（把 `behindLibrary` 摘掉）
     红在 `expect(locator).toBeDisabled()` / `Received: enabled`。
   **2026-10-15 §52 最后一片的补刀（ZIP 那一格接上，并补上从没红过的字节上限）**：
   - **整份拿走**：`GET .../game/code/zip` 走的是**同一道闸口**（`projectGameCode`：同一个 404/500 判定、
     同一份库里设计），出口形状换成 store zip。界面多一颗「打包成一个 zip 下载」，
     它与「生成可玩产物」**共用同一只手**（库里没跟上屏上时两颗都点不动）。
   - **上限取两档，而且都撞得开**：`MAX_CODE_JSON_BYTES` 1MB / `MAX_CODE_ZIP_BYTES` 4MB。
     4MB 不是拍的——它是按 schema 自己那条 5000 实体上限反着挑的，保证"合法范围内的最大一份"
     真能撞上这一档（实测 5000 实体 → 5 590 780 字节）。取到 8MB 以上就是一个永远不会红的装饰性拒绝（§159）。
     中间档同样实测过：1500 实体 → 1 686 178 字节，JSON 出口回 413、zip 出口回 200。
     因为包用 store 不压缩，413 那句"把这一份拆成几份设计"才是真话。
   - **这一片的四臂变异电池**（读数在 `docs/TESTING.md`）：对照臂 10 条全绿；
     zip 那档降到 JSON 那档 → 2 条红；把整份产物塞进 413 的拒答 → 1 条红；
     把归属判定那一行删掉 → 3 条红（红的正是三条归属见证，413 那几条一动不动）。
   - **修掉一个让 HEAD 变红的提交洞**：`e8c652f` 用了 `slug`，而让它可被 import 的那一行
     （`export function slug`）没跟着进 commit——机检的 pre-commit 跑的是**工作树**上的 `npm run lint`，
     树里有那一行所以绿，HEAD 里没有（还原成 HEAD 那一份再 tsc → `TS2459`，exit 2）。
     纪律进 ADR-0038：**pathspec 列表里必须有"让这个里程碑自己绿"的那一行，工作树绿不等于 HEAD 绿**。
   **2026-10-15 §52 最后一格接进编排链（`code` 成为第八种步骤：报投影的读数，什么也不留）**：
   - **链到这一格才真的通**：`context / seo-audit / qa-audit → report` 三份检查与汇总，
     `game → combat → level → code` 四格产物。作业现在能替用户报出"这份设计投影出来是几份文件、多少字节"，
     而这句话与作者随后在「游戏」面板点那颗按钮拿到的产物**同一个生成器**算出来。
   - **它是投影不是草稿**：`dependsOn: ['level']`、拿不到 level 那份草稿就**整步失败**并点名缺的是谁
     （绝不现编一份再投影）；它**不留 `draft`、不写库**，所以接受入口仍然只有 game / combat / level 三颗按钮，
     缺省那份仍是链末的 level。这一句在 e2e 里有正反两面：`[data-agent-accept-step="code"]` 数为 0，
     而同屏 `="level"` 可见；面板上那句 summary 与服务端读回来的那份**逐字相同**。
   - **这一步不许自己给自己打分**：集成测把库里 level 那份草稿**再投影一遍**，
     用另一次调用的 `files` / `bytes` / `notes` 数对账，并再断一次"同一份设计两次投影字节相同"（没有时钟）。
   - **限度随读数一起进结论**：`CODEGEN_LIMITS` 那四句（转写 / 没有 Studio 界面 / 不联网 / 不执行任何东西）
     原样列在 notes 里——只报"生成成功"就是作业在替产品撒谎（§81/§159）。
   - **这一片的六臂变异电池**（对照臂 41/41 全绿，读数在 `docs/TESTING.md`）：拆守卫 1 红；
     让它也留草稿 → 3 红（红的两条在**接受入口**身上）；依赖从 level 改成 game → 14 红（这一格真拿不到上游）；
     整条从配方删掉 → 11 红；`counts.bytes` 报 0 → 1 红；notes 丢掉限度四句 → 1 红。
   - 顺带把一条写死的读数改成派生：`agent.activity` 原来钉 `toHaveLength(15)`（"现在是七步"），
     现在是 `1 + 2 * result.steps.length`——写死的版本加一步时只会红得没有信息量。
   **仍欠**：§53 的 Capture screenshots / Fix 两格（要接浏览器与模型）。
   **2026-10-16 §53 的四种走法接进链（`playtest` 成为第九种步骤，与 `code` 并列而不是排在它后面）**：
   - **接法本身是这一片的新决策**（ADR-0042）：这一格与 `code` **都只依赖 `level`**，不是串成
     `level → code → playtest`。理由是仓库那条比"看起来完整"更硬的规矩——**计划里那条依赖箭头必须有数据可交接**，
     而 `generateGameCode` 从头到尾不读试玩报告。串起来的唯一后果是"这份设计太难"变成"这份产物拿不走"。
   - **两个方向各有一条纯层用例**：正向（level 炸 → `playtest` 与 `code` **两格**都是 skipped、
     `because` 各是 `['level']`、通知说"1 步失败，2 步被跳过"）分辨不出谁依赖谁，
     所以补了反方向那一条——**`playtest` 自己炸时 `code` 照跑**（`blockedIds` 为空、`readyIds` 仍是 `['code']`、
     通知只说"1 步失败"）。那条边没画出来，这条才会绿。
   - **形状与 `code` 那格同律**：拿不到 level 留下的草稿就**整步失败**并点名缺的是谁，
     守卫失败时 `counts` 是空对象、`notes` 是空数组——"没跑"不许渲染成"0/4 种通关"；
     它**不留 `draft`、不写库**，所以接受入口仍是 game / combat / level 三颗，缺省那份仍是链末的 level。
   - **跑的是 RPG 那条管线**（`playtestRpg(compileRpg(草稿))`，与试玩页、HUD 同一个 `rpgStep`）：
     用底层 `step` 跑这份草稿会得出"任务过了"而等级门其实扣着的假报告。种子**固定用默认值**——
     作业里每一步要逐次可比，换种子是试玩页那一格的事，notes 里那句话写着去哪儿换。
   - **三档读数各自报数且能加回去**：`won + lost + unfinished === policies`。只报"几种通关"
     会把"跑到时间上限一直没结束"混进"通不了"里，而那是 §53 文件头写明的限度。
     限度五句（三条基础 + 跑的是 `rpgStep` + 升级曲线是投影常量）与 findings 一起进 notes，条数从报告读不写死。
   - **凭证**：纯层 `agent-runtime.test.ts` 18 → **19 条**（依赖表、就绪顺序、双向牵连、终态、交接、进度分母）；
     打真库的 `agent-orchestration.integration.test.ts` **15 条**，其中新的一条把库里 level 那份草稿
     **再跑一遍** `playtestRpg` 对账（走法数 / 三档 / 最高等级 / 种子 / findings / limits 逐字段），
     所以这一步不许自己给自己打分；`agent-draft-accept.integration.test.ts` **9 条**一字未改就继续绿——
     它是"这一格不留草稿"的**外部差分**（`draftSteps` 仍是那三步）。
   - **e2e 多出一寸只有浏览器量得到的**：`counts` 与 `notes` 只在展开那一格时才渲染，集成测证得了
     服务端算出五句限度，证不了那五句**画得出来**。现在逐条要求 `[data-agent-step="playtest"]` 里读到
     服务端 notes 的每一句原文、`{key} {value}` 那几行逐行可见，并截展开态的图
     （`screenshots/agent-playtest-expanded.png`：`won 1 / lost 0 / unfinished 3 / policies 4 / seed 7 / limits 5`，
     同屏上一格 level 有「接受进项目」而这一格没有）。`e2e/agent.spec.ts` **2 passed**。
   - **这一片被自己那条钉红过一次**：限度那句我手抄成"不穷举"，真话是"不是穷举"——红的是测试不是产品，
     而这正是手抄的句子没有对照物的下场（§159）。改成从服务端 notes 派生后，e2e 里不再有一个抄来的数。
   - 步数从八到九：`agent.activity` 条数、库里结论份数、面板那句"N 步作业"三处**都是派生的**，
     加一步一条没红；红的是真该红的东西（依赖表、终态判定、交接清单、牵连清单）。
   - 起点是绿的才动手：`npm run lint`（typecheck 九个项目 + 全仓 eslint）**exit 0**，
     game-model 与纯层合跑 **220 条全绿**，DB 侧两套 15 + 9 全绿。
   **2026-10-22 链上那一型由请求显式给出（ADR-0052）：这条欠条的后一半付掉了**——
   2026-10-21 那格把**下游**修好（试玩格按草稿的 kind 派管线），这一格把**上游**也修好：
   - **上游也带 kind 了**：`gameDraft` 接受 `kind`（缺省 RPG 原型 ⇒ **今天那份逐字节不变**：
     改配方说明与数值之前先拍了快照，改完逐字节对过；纯层用例另外钉住关键句）；
     `gameStep` 按型编译与试玩，不再硬编 `compileRpg` + `playtestRpg`。
   - **型记在计划里**：`AgentPlan.gameKind` ⇒ 任务行读得出"这份作业当时编的是哪一型"，
     刷新后复看不用猜（§16）。
   - **一张配方表，每型一段变体**（不是两张表）：topdown 那五型把"经验/等级门"那几句**换掉**
     ——不是补一句"其实不参与判定"，那句会与前一句（"条件凑齐但没到级就不结算"）自相矛盾；
     数值同理：`xpReward` / `requiredLevel` 只有 RPG 管线读（`compileGame` 只读 `timeLimit`），
     留在别的型里就是"设计里写着要 2 级"而这一型根本不看等级。
   - **派发只留一处**：`playtestByKind` → `compileForKind`（上一格自己写了一遍 kind → pipeline，
     那是 §16 的两份真值，这一格收回来了）。
   - **对话那两种诚实拒收**：链上那份配方给的是战场与战斗，而对话要的是对话实体
     ⇒ 400 + 一句"链上还没有配方"，不做空草稿（§159）。
   - **凭证**：纯层 `agent-game-draft.test.ts` **19 → 23 条**（缺省那份不变 / 2D 那份的说明与数值 /
     对话那两种拒收 / 2D 那份仍是合法设计）；打真库的 `agent-orchestration.integration.test.ts`
     **18 → 21 条**（链上要 2D ⇒ 计划带型、草稿带 kind、试玩读 topdown 的数；对话那型拒收且不留任务行；
     不认识的型拒收并把八种说清楚）。
   **2026-10-22 界面上的类型选择器也接上了（ADR-0052 / ADR-0053 的最后一片）**：
   Agent 面板多一个「这一轮编哪一型」的下拉 ⇒ 请求带上 `gameKind` ⇒ 计划里记着那一型
   （`AgentPlan.gameKind`）⇒ 面板的回显说出那一型。
   - **八型今天全都编得出来** ⇒ 下拉里**不藏哪一型**（藏起来等于"看起来没有"）。
   - **缺省是链上的缺省型**（RPG 原型）⇒ 不选就与今天的行为一模一样。
   - **凭证**：e2e `agent.spec.ts` 多一条
     （`@smoke agent 面板上的类型选择器：选 2D 就跑 2D 那一型`）：
     缺省是 RPG 原型 ⇒ 选 2D ⇒ **服务端那一份计划里 `gameKind` 就是 `2d`**
     ⇒ 面板回显是 2D ⇒ 第一格摘要里是"2D 草稿"
     ⇒ 试玩格展开后 notes 里逐字出现 `topdown`（管线名在 notes 里，summary 的措辞是中性的）
     ⇒ 截图 `screenshots/agent-kind-2d.png`。
   **仍欠**：§53 的 Capture screenshots / Detect bugs / Fix 三格要浏览器与模型，本机不假生成（§159）。
   **2026-10-22 战斗格与布局格也按型派（补上 ADR-0052 那一格漏掉的两步）**：
   上一格只把**上游（编草稿）与试玩格**按型派了，战斗格与布局格当时还在 game-model 里
   **无条件** `compileRpg` + `playtestRpg` ⇒ 链上一份 2D 的设计被拿 **RPG 的判据**去读，
   报出来的"战斗目标达成没有""布局摆得开不开"不是这份设计那条管线的读数（§159）。
   ⇒ **改一半比不改更坏**：上游读的是自己那条管线、下游读的是 RPG 那条 ⇒ 同一份作业里两个口径。
   - **怎么改的**：战斗目标与布局目标读的都是**走法里的公共字段**
     （`status / seconds / damageTaken / policy`）⇒ 类型从 `RpgPlaytestReport` 放宽成
     `PlaytestReport`（RPG 那条是它的子类型）⇒ 两边的 `evaluate` 改成走 `compileForKind` 分派。
   - **RPG 那条路径逐字不变**：`compileRpg` 的 `base` **就是** `compileGame(document)`（`rpg.ts`）
     ⇒ 杠杆读到的 `enemies` / `player` 一模一样 ⇒ **既有那批 combat / level 用例的断言一个字没改就绿**
     （只把一个测试辅助函数的参数类型放宽容）。布局格那个只被搬运、没被读过的 `rpg` 字段直接去掉（§16）。
   - **读数来自哪条管线由模型层说**：`CombatTuning.pipeline` / `LevelDesign.pipeline` 跟着走
     ⇒ 链上那两格在界面上**说出**自己那条管线（RPG 那一条一个字都不加 ⇒ 今天的界面一个字不变）。
   - **凭证**：新建 `packages/game-model/test/kind-dispatch.test.ts`（3 条：2D 那份的战斗/布局读数
     **测试自己重算一遍**（`combatGoals(playtest(compileGame(doc)))` 那一对）⇒ 不许自证自成；
     对话那一型明说"没有战斗可调 / 没有位置可摆"）；打真库的
     `agent-orchestration.integration.test.ts` **21 → 22 条**（链上要 2D ⇒ 战斗格与布局格的读数
     与测试自己重算的那一份逐项相等，且两格都说出 topdown 那条管线）。
   **2026-10-22 对话那两种也进链了（ADR-0053）**：这一条欠条里的"对话管线在链上还没有各自的一格"
   至此付掉 ⇒ **八型今天全都编得出来** ⇒ 不再有"链上编不出来"的那一型。
   - **第二张配方表**（`GAME_DRAFT_SPEC_STORY`）：对话实体与战场实体**不是同一类**
     ⇒ 换表而不是换变体。六段对话、两个结局（"收下这张画" / "转身离开"）。
     **正文就是对话实体的说明**（`compileStory` 只读它当正文）⇒ 所以正文必须干净：
     "配方给的起点，不是成品"那句 caveat **不进正文**，它去文档 summary 与链上那一步的 notes。
   - **对话实体没有数值**：它的内容就是正文与选择（判定全在引用上）⇒
     "每个实体都有数值"那条纪律**对对话不适用**（战场那张表才适用）⇒ 这一条写进代码注释与 ADR。
   - **战斗格与布局格对对话型"原样交回"**：对话管线里没有战斗、没有场地 ⇒ 那两格不改任何东西、
     **不留读数**（counts 是空对象 ⇒ 界面上不会渲染成"0/5 条目标达标"——空读数与"0 条达标"是两件事），
     草稿照旧往下传 ⇒ **链的形状不变**（九步不变、依赖不变）。
   - **试玩格给对话那套数**：对话管线没有"走法"可言 ⇒ 读数是**按引用连线走不走得到**
     （可达几段 / 能停下几处 / 有几段正文是空的）⇒ 硬凑成"通关数"就是拿一条管线的说法去说另一条。
   - **模型层的派发加第三个成员**：`KindPlaytest` 变成三份报告的可判别联合
     （`PlaytestReport` / `RpgPlaytestReport` / `StoryPlaytestReport`）⇒ 按 `pipeline` 收窄 ⇒
     调用方不靠强转、也不会把某一型的字段当成别的型也有。
   - **凭证**：纯层 `agent-game-draft.test.ts` **23 条**（对话那份：正文不为空 / 起点是第一条 /
     两个结局 / 可达 6 段 / 空正文 0 / 八型都编得出来 / 结构校验过）；模型层 `playtest.test.ts`
     那条"对话那两种明说还没接"改成"走对话那条管线"（可达 2 段 / 1 个结局）；
     打真库的 `agent-orchestration.integration.test.ts` **22 → 22 条**（换掉了"对话那型拒收"那条：
     现在它编得出来 ⇒ 断言草稿带 kind / 战斗与布局两格原样交回且不留读数 /
     试玩格读的是对话那套数 / 最后一格照旧投影）。
- [~] 游戏设计系统：Player/Enemy/Weapon/Item/Quest/Dialogue/Trigger/NPC/Camera/Animation/Particle（§54）
  — **2026-09-24 落地模型层**：新开 `packages/game-model`（与 design-model / world-model 同一条纪律：
  无 React、无 IO，两端跑同一份校验）。11 类实体 + 数值旋钮 + 实体间引用 + 引用完整性校验 + 确定性投影，
  见下方 M4 进度记录。
  **2026-09-25 第二片（存库 + 面板）**：`packages/schemas` 加游戏文档契约（zod，与 `GAME_ENTITY_KINDS`
  逐字对齐）、迁移 `0007` 把 `games` 表换成与 `worlds` 同形的整份 JSON 存储、`domain/games.ts` +
  `/api/projects/[id]/game`（GET 不建档）、Studio 左侧「游戏」面板（`gameStore` + `GamePanel`）：
  11 类分组、实体说明、开放数值、有向引用的连与摘，全部只调模型层的纯函数。见下方"第二片"进度记录。
  **2026-09-25 第三片（引用图画布）**：主区第五个视图「游戏图」（`GameGraphView`）把 `referenceGraph`
  画成一张有方向的图，与左侧面板共用同一个 `gameStore`（不分叉真值）。位置按 11 类分列算出来、
  **不写进文档**（游戏文档没有位置字段，布局是视图的事）。见下方"第三片"进度记录。
  **2026-09-25 第四片（可玩投影）**：`play.ts` 的 `compileGame` 把文档编译成一份关卡计划，
  `sim.ts` 的 `step` 是唯一的规则来源（移动 / 追击 / 接触伤害 / 拾取 / 任务判定 / 胜负），
  `apps/web/src/game2d/GamePlay.tsx` 只管输入、绘制与 HUD——浏览器里玩到的和单测断言的是同一套算术。
  四条限度都同时显示在页面上（`data-game-note`）而不是只写在注释里：
  位置是投影按类别排在同心环上的（模型里没有坐标与地形）、所有个体一样大（没有尺寸字段）、
  形状只区分类别不是美术、触发器只记账不做效果（§54 说了它引用谁，没说触发之后发生什么）。
  **数值来路逐条可追**：每个用到的旋钮带 `provenance`（`design` / `default`），HUD 下面写
  "N 个实体的生命是投影兜底的"；玩家没有 `attackPower` 也没有引用到他的武器时，伤害就是 **0** 并说明
  "只能躲、不能打"——给一个看不见的 1 点攻击力就是造假数据（§159）。
  任务的完成条件同样只在"引用了敌人或物品"时才算可判定，判不出来的列在任务表里说清为什么，
  不悄悄算作自动完成，也不会因为它永远不满足而谎称"这版没有赢"以外的话。
  **仍欠（2026-10-20 核对后改口径）**：原句写的是「§52 Game Agent 与 §53 Playtest Agent 的编排、
   地形与碰撞、`talk`」——前两半**早已落地**（编排九步在 `server/agent/runtime.ts` 的 `RUNNERS`：
   `game / combat / level / playtest / code`，§52 四格 2026-10-12→10-15、§53 那格 2026-10-11）；
   `talk` 要 §47 的真 provider，按 §159 留白。
   **「地形与碰撞」这一半不是欠账，是过期行**——§54 原文那 11 类实体
   （Player/Enemy/Weapon/Item/Quest/Dialogue/Trigger/NPC/Camera/Animation/Particle）里
   **没有墙、也没有地形这一类**，`packages/game-model/src/sim.ts` 头部照实写着
   「地形与碰撞体：只有开阔场地，没有墙」，HUD 上那四条限度也照实说。
   换句话说：**是需求没要，不是我没做**。要加「墙」就得先改 §54 的实体清单（那是产品决定，不是实现欠账）；
   至于把 §140 的世界地形（台地/坡地）接进 2D 关卡当障碍或坡道——那同样是一个**新的产品决定**
   （两个独立文档怎么关联、语义怎么映射，用户没说过），**不是这里可以替他做的**。
  （公开可玩与 §168 的 play time 已在上面的"第二片"接上；`/game/<项目>` 仍是作者自己的试玩页，
  公网那一版走 `/n/<handle>/<slug>/play`。）

**M4 进度记录（2026-09-24，§54 游戏设计系统模型层）**：新包 `packages/game-model`，
照 world-model 的模板起（`package.json` / `tsconfig.json` 同形，接进根 `typecheck` 链与 vitest alias）。

模型：§54 原文列的 11 类实体一个不少（`GAME_ENTITY_KINDS` + 中文名表）。每类共用一份基底
（`id / kind / name / notes / tags / stats / refs / updatedAt`），差异体现在**数值**与**引用**上。

两个刻意的"不写死"，都是为了避免我替需求加它没写的东西：

1. **不预填任何数值**。`createGame` 给的模板骨架是 11 类各一个空实体，名字写着类名，
   `notes` / `stats` / `refs` 一律留空。编一套 `health=100 / damage=12` 出来就是替用户做设计，
   而且那套数字没有任何依据——§159 不许假生成，这条对"设计内容"同样成立。
   `fleshedOutCount` 因此能如实回答"11 类里有几个是真填过的"，而不是把模板当成内容。
2. **不写死属性表**。§54 只列了 11 类实体，没规定每类有哪些属性。所以 `stats` 是开放的
   `Record<string, number>`，只校验"值是有限数"（`NaN` / `Infinity` / `'100'` 一律拒）；
   另有 `STAT_HINTS` 给出**建议键名**供界面做占位提示。建议不写进校验里——
   写成校验就等于我把"多数游戏都有的旋钮"升格成了需求没写的约束，用户想加 `poise` / `iFrame` 会被无故拒绝。

**引用（refs）是这一层的重点**：实体之间有向引用（`武器 →装备于→ 玩家`），
`role` 说明关系种类、可留空，但 `to` 必须指向文档里真实存在的实体。
`linkEntities` 拒绝自引用、悬空端点、同一对之间重复的同一关系，且**绝不静默**——
`reason` 带回原因由面板显示。同一对之间允许并存多条**不同**关系（「装备于」与「由玩家挥动」是两件事），
所以摘除按引用自己的 `id`，不按"从哪到哪"。

与 world-model 的一处关键差别值得记下：世界的关系是**独立存**的（`document.links`），
删条目只要过滤那张表；这里的引用挂在**实体自己身上**，所以 `removeEntity` 必须两头都清——
自己发出的引用随它消失，**别人指向它的引用也要摘掉**，否则会留下一堆悬空引用。
摘入边等于改了那个实体的内容，所以它的 `updatedAt` 也一起更新（面板不该顶着旧时间戳显示"刚被改过"）。

校验（`validateGame`）覆盖：非 11 类的 kind、无名实体、id 重复、时间非法、
数值非有限数（消息里带实体名与键名）、自引用、悬空引用、重复引用。
投影给了 `gameCounts`（11 类计数，缺的补 0）、`referenceGraph`（节点 + 边；指向已删实体的边
在这里被自然丢掉，而校验同时报 `missing-ref-target`——渲染层不该看到画不出来的东西，
但校验必须知道它存在，两件事都要有）、`countRefsFor`（删实体前的确认文案用）。

验证：`npm run lint` 通过（新包已进 typecheck 链）；`packages/game-model/test/game.test.ts`
**39 条全绿**（11 类齐全与原文逐字核对、模板不编内容、CRUD 不可变、数值六种非法值被拒、
引用四类非法情形、删实体两头清理与时间戳、悬空边投影 vs 校验的分工）；
非库测试 **34 files / 434 tests 全绿**。本轮 Docker 未运行，13 个 `*.integration.test.ts` 未执行，
但本切片是纯模型包、不碰数据库，不受影响。

**M4 进度记录（2026-09-25，§54 第二片：存库 + Studio 面板）**：

- **契约**（`packages/schemas`）：`GameDocumentSchema` 等 5 个定义，进出服务端都过 zod；
  kind 枚举与模型层的 `GAME_ENTITY_KINDS` **逐字对齐并有测试盯着顺序**（两边各写一套迟早漂移）。
  `stats` 在契约层同样只认有限数（`NaN` / `Infinity` / 字符串值在读写两侧都被拒）。
- **存储**（迁移 `0007_game_document.sql`）：`games` 表原来是 `entities / scene / game_kind` 三列
  ——**没有任何代码读过它们**，等于一份没人认领的假数据。换成与 `worlds` 同形的
  `document jsonb + name + summary + owner_id`。切换前用 `select count(*)` 确认表里 0 行，
  所以没有"迁移丢数据"这回事；这一点写进了迁移文件的注释，不靠记忆。
- **读写**（`domain/games.ts` + `/api/projects/[projectId]/game`）：GET 没有游戏就返回 null，
  **不顺手建档**（"还没有"与"有一份空的"是两件事）；PUT 过 zod + `validateGame`，
  拒跨项目文档、拒比库里更旧的写（两个请求乱序到达时旧版本不能赢）。
- **面板**（`gameStore.ts` + `GamePanel.tsx`，接进 `StudioShell` 左侧页签）：照 worldStore 的
  已验证形态来（单例 store + `useSyncExternalStore`、在飞只一次 PUT、在飞期间的改动记一笔补发、
  迟到的读结果不覆盖本地真值、`keepalive` 让"改完就刷新"真的落库）。面板**只调模型层的纯函数**，
  不在 UI 里改文档结构。三处刻意出声而不是静默：空键名 / 非有限数值 / 重复引用，
  模型层返回的 `reason` 直接显示在面板顶部，并且**下一次成功的编辑会把它擦掉**
  （不然用户会以为刚加的那条也被拒了）。
- **验证**：契约 5 条 + 集成 8 条 + 模型 39 条全绿；`npm test` **54 files / 584 tests 全绿**；
  `npm run lint`（typecheck + eslint）0 问题；新增 `@smoke 游戏：建骨架、填数值、连引用、刷新仍在（§54）`
  并做了反向实验——把 GET 改成永远返回 null 后该用例**确实失败**在刷新后的断言上，
  说明"刷新仍在"这条断言咬得住只活在内存里的编辑。截图核对过面板实际长相，
  据此把引用那一行改成可换行（264px 的左栏里三个控件挤在一行会把按钮压扁）。
- **这一条已落地（2026-10-21 核实）**：`referenceGraph` 的图**UI 已经有投影了**
  （`apps/web/src/studio/GameGraphView.tsx` 直接 import 它并画出来）⇒ 原句"后端有图、UI 没有投影"是过期条目；
  剩下要真 provider 的是 §52/§53 那两个 Agent 的落地。
  §50/§51 的构建管线与类型选择。（写这段时三项都还欠着：引用图画布随后落在 2026-09-25 第三片，
  类型选择与对话管线落在 2026-09-26 §51 第三片；§52/§53 的 Agent 编排到今天仍欠，要真 provider。）

**M4 进度记录（2026-09-25，§54 第三片：游戏引用图 = 主区第五个视图）**：

- `GameGraphView.tsx` 把 `referenceGraph` 那份投影画出来，接进 `StudioShell` 的视图切换
  （画布 / 方案 / 代码 / 世界图 / **游戏图**）。与左侧「游戏」面板共用同一个 `gameStore`，
  图上连一条引用，面板那条立刻跟着出现——两份真值就是 §16 要避免的事，用例盯着这一点。
- **位置不存在文档里，而且是刻意的**：`GameDocument` 没有位置字段（模型层把布局划给视图）。
  所以 11 类各占一列、列内按文档顺序往下排，同一份文档每次打开排成同一个样子。
  世界图那边存位置是因为 §45 明说"摆过的位子是 3D 世界的地面布局"（§140），这里没有这个语义，
  就不为了"看起来一样"塞一个字段进契约。
- 边**两端裁到方块边上、中间沿垂直方向拱开**。第一版照世界图那样画中心到中心的直线，
  结果"点边删引用"点了没反应：同一行的两个实体，连线正好从中间那一列节点的 rect 底下穿过，
  命中区被后画的节点盖住，点上去选中的是节点。拱开之后箭头也第一次露得出来了
  （直线终点在目标节点中心，而节点在 SVG 里后画，把箭头整个盖住）。
- **顺带捞出一个静默失效的整类 bug**（见 `docs/TESTING.md`）：世界图的"选中"描边写的是
  `var(--nexus-color-accent)`，而设计系统里只有 `accent-1` / `accent-2`。CSS 变量拼错不报错，
  只让属性退回继承值——于是用户点了节点看不出任何变化，测试还全绿（它断言的是文字不是颜色）。
  新加的 `apps/web/test/style-tokens.test.ts` 把整类挡在门禁里：扫界面源码里每个
  `var(--nexus-*)`，未在 `tokens.css` 定义即红。第一次跑除了这处，还捞出 4 个页面 h1 用了
  不存在的 `--nexus-font-size-20`（字号梯度是 18/21，没有 20），一并改到 21。
- **验证**：`npm run lint` 0 问题；`npm test` **55 files / 586 tests 全绿**；
  新增 `@smoke 游戏图：点两个实体连引用、重复被拒、刷新仍在、摘掉归零（§54）`。
  这条用例的"点抓手摘引用"那一步就是先红后绿的（直线版本点不到边），不是补上去摆设。
  截图核对过实际长相，据此删掉了界面文案里漏出来的 markdown 星号（`**模板骨架**` 这种写法
  在 JSX 里是原样显示的）。
- **§54 现在欠的**：§52/§53 的 Game Agent 与 Playtest 编排（§51 的八种类型已于 2026-10-07
  全部接上，不再欠类型管线）——编排那半要真 provider 或真运行时，不在面板里塞假按钮。
  （"引擎类型选择"本身已经在 2026-09-26 接上：类型是文档字段，两个试玩页共用 `compileForKind` 分派。）

## M5 — 视频（§185）
- [ ] Video Studio（text/image/storyboard→video）
- [~] Storyboard → Shot list → 参考图 → 生成 → Timeline（§40-42）— 存储、分镜面板入口（切句成镜、机位/转场/时长/上下移/删除，全部走 §150 的可撤销补丁）、Timeline 条与总时长、镜头进语料库（§49 × §40）、镜头挂本项目的角色（§40 × §46，见文末）都已落地。**这一条原来写着"还欠两半：参考图只做到能选本项目资产，没把 §38 的生成按钮接到镜头上；`videoAssetId` 要真 provider"——前半句 2026-10-08 核对时已经不成立了**：`StoryboardPanel.tsx` 里那颗 `data-storyboard-image-gen`（"DEMO 参考图"）调 `makeReference()`，POST `/api/projects/<id>/images`，挂了角色就走 Character → Scene 那条；成功后把新资产补进名册（不补上 select 会渲染成空白，用户看到"刚挂上的东西不见了"），再落一个只改 `referenceAssetId` 的 §150 补丁；按钮的 `title` 上写着"本地确定性合成（DEMO），不是 AI 出图；撤销只断开引用，不删除已生成的资产"。**所以这一条现在只剩一半欠着**：`videoAssetId` 要真视频 provider，本机不做假生成（`packages/video-model/src/index.ts` 头部写着同一句）。逐条凭证见文末各片。
- [~] Timeline 编辑：trim / reorder / regenerate shot / extend / transition（§41）— **2026-09-28 第一片落地**：
  时间线从"一条只读的读数"变成编辑面——一格一镜、宽度即时长，拖右边缘 trim/extend（吸附 100ms、下限 100ms），
  拖整块 reorder（按**其余镜头的中点**分界，返回最终下标），点左上角的转场标记换衔接；拖动期间只在本地预览，
  松手才落一个 §150 的补丁事务。**2026-10-10 第三片：片段级裁切落地**（见文末）——双击一格在点击处
  把这一镜切成两镜，两半共享同一句描述与同一张参考帧，总时长守恒，切不出两镜时两半各说一句拒因。
  **还欠**：regenerate shot（重新生成某一镜要真 provider 的视频像素，
  与 §40 最后一格同一道门）。逐条凭证见文末。

## M6 — 社区（§186）
- [~] 社区与发现（§59 / §61）— **2026-09-24 第一片落地**：公开作品页上有 Like / Comment / Follow / Remix / Share
  （`apps/web/src/server/domain/social.ts`，路由 `/api/published/interact`、
  `/api/follow`、`/api/discover`），发现页 `/discover` 四个排得出来的标签（最新 / 最多人看与赞 / 最近最热 / 我关注的作者）。
  三条写进代码与界面的边界：**评论走发布机检同一份红线词表**（命中就不发出去，不"先发再等人看"）；
  **Remix 分叉的是发布出去的那一版快照**，作者工作区里没公开的改动不会跟着出去（§58，测试专门钉这条）；
  **Trending 与 AI Picks 当初排不出来，就写在页面上**（前者要互动时间序列、我们只有累计数；后者要模型），
  不拿累计浏览数改个名字冒充热度。
  Save 与 §60 创作者主页也在同一批落地（见下一条），所以 §59 的六个动作现在是全的：
  Like / Comment / Follow / Remix / Share / Save
- [~] 收藏与创作者主页（§59 的 Save + §60）— **2026-09-24 落地**：
  `saves` 表（迁移 0006，挂 publication_id 而不是 project_id —— 收下的是"这一版"，
  作者重新发布不该把收藏里的内容换掉；作者下架或被拒绝之后收藏**仍列出**并写明点不开的原因，
  不悄悄消失）；`/u/<handle>` 主页给 Avatar / Bio / 公开作品 / 世界 / 角色 / 游戏 / 粉丝与关注数。
  可见性边界是这一条的重点：主页只列公网上传着的作品，世界与角色只列**属于这些公开作品**的
  且只给名字与一句 tagline —— 世界文档、角色档案（声音、关系、记忆）在作者项目里，
  发布一张设计稿不等于把它们放上公网（测试专门放了一段"只该存在于项目里"的文字去试泄露）。
  简介会过发布机检同一份红线词表，命中就不保存。游戏栏现在是 0 并写明 M5 未开工，而不是省掉。
  仍欠：AI Picks（要模型推荐，没有可用的 provider）。Trending 已在下面单独落地——它当初和 AI Picks
  一起列在"排不出来"那张单子上，理由是"只有累计数"；那个理由被 §168 的访问表与逐行 `created_at` 推翻了。
  §132 的 block / mute 与头像上传也都在下面两条落地了。
  §168 Analytics 已在下面单独落地——主页上那几个数仍然只是浏览量，
  真正的六个数在 `/analytics`
- [x] 头像上传 + 项目简介（§60 的 Avatar + §49 的项目元信息）— **2026-09-25 落地**：
  `apps/web/src/server/domain/avatar.ts` + `/api/account/avatar`（POST/DELETE）+ `/api/avatar/<id>/<file>`（公开读）。
  校验链整条复用 §9c 的图片管线（magic bytes 判定 → 尺寸/体积上限 → 剥元数据），没有为头像另开一套宽松规则：
  头像会以 `<img>` 出现在别人的公开页上，风险面和设计稿里的图片一模一样。
  **为什么不进 `assets` 表**：那张表按项目归属（project_id 级联删除、发布快照按 id 引用、两条读取路径都要求有项目），
  而头像归属是人——硬塞进去要么给 project_id 开空值，要么让人删项目时把自己的头像带走。
  地址是内容寻址的（`avatar-<sha256 前 8 位>.png`）：换一张就换地址，于是 `cache-control: public, max-age=1y, immutable`
  是诚实的；被换掉的旧地址必须读不到（判定以库里的行为唯一依据，磁盘上残留的对象摸不到——
  删旧字节是 best-effort，这条是它的安全网）。顺序是**先写库再删旧字节**：反过来做会留下"头像已经没了但新的没换上"的中间态。
  摘掉头像是把列写回 null，不返回一张默认头像：那样主页上的圆圈看着像有图，其实谁都没传过（§159）。
  上传回执会显示"剥掉了哪些元数据段"——头像是全站少数几张不用登录就能看到的图，不告诉用户处理过就是替他假设。

  **项目简介（§49）这一片补的是两个空转的读**：`projects.description` 从建库起就没有写入方，
  所以 §166 的 `og:description` 稳定落在第二级"从快照文字里摘一句"、§165 的 `ilike(projects.description)` 永远命中不了。
  入口在首页每个项目行下面（展开式，不常驻输入框），`PATCH /api/projects/<id>` 只认 `description` 一个字段：
  **名字不在这里改**——TopBar 的重命名走设计文档、`saveDocument` 把 `document.name` 同步到 `projects.name`，
  报文层再开一个写名入口就是给同一个名字放两个真值（§16）。
  简介会公开在 `og:description` 上，所以它和 bio 走同一份红线词表（§129）：命中就不保存。
  所有权写在 SQL 的 `where` 里（`id` + `ownerId` + 未删除），别人的项目返回 null 而不是"存在但看不到"。

  验证：`avatar.integration.test.ts` 9 条（真库 + 真存储目录，逐条断言磁盘上的对象数）+
  `project-meta.integration.test.ts` 8 条（含"简介写进去之后搜索才真能命中它"那条闭环）+
  `@smoke §59/§61` 里加的真浏览器头像链路（假字节被拒 → 换上 → GET 200 与 `public`/`nosniff` →
  公开主页显示头像 → 摘掉 → 同一个地址 404）+ `@smoke §166` 里 og/twitter/JSON-LD 三处都读到作者写的那一句。
  反向实验记一笔：把 `openAvatar` 的"文件名要对得上库里的行"缩成"有头像就行"，**当时那 8 条全绿**——
  因为旧对象已经被删掉了，`getStorage().get` 返回 null 让断言因错误的原因通过。
  补的那条是手工往磁盘上放一个库里不引用的孤儿对象再读它，这次才真的只有那一条红（截图 `avatar-on-profile.png`、
  `project-description-rejected.png`）
- [x] block / mute（§132 剩下的那两件）— **2026-09-25 落地**：`user_blocks`（迁移 0011）+
  `apps/web/src/server/domain/blocks.ts` + `/api/blocks`（POST/DELETE）+ `/u/<handle>` 上的两个按钮 + `/blocks` 名单页。
  §132 原文四件（report / block / mute / moderation）到此齐了，但**齐的是名字，不是同一种强度**：
  report 与 moderation 走"平台来处理"，block 与 mute 是"我现在就不想再看到这个人"——被骚扰的人不该只有前者。

  **两类关系刻意不一样，这条区别是整个这一片的形状**：
  - `mute` 只管可见性——对方**照样**能评论、关注、点赞，只是他造成的通知不再进我的收件箱、他的内容不再出现在
    发现页与搜索结果里、他的评论在我这一侧被滤掉。把屏蔽当禁言用会以为自己在处理骚扰，其实没有；
  - `block` 在此基础上再双向挡住互动（评论 / 点赞 / 关注 / 改编，两个方向都拒），并且**顺带拆掉已有的关注边**——
    留一条"我关注了一个我拉黑的人"的边，关注流里就还会冒出他的内容，等于自己给 block 留口子。
    mute 不动关注：「还想知道他在做什么，但不想被他找到」是合法用法；
  - 一条关系只有一行（`kind` 在 block 与 mute 之间改），不是两行——block 蕴含 mute 的效果，
    "既拉黑又屏蔽"不是第三种状态。`not_self` 与 kind 白名单两条 CHECK 写在 SQL 里而不是只写在调用方；
  - **都不追溯历史**：拉黑之前发的评论还在，别人也仍然看得到。删别人的发言是 moderation 的活。
    这条要在界面上看得出来，所以作者那一侧的评论列表下面写"另有 N 条来自你已屏蔽或拉黑的人（别人仍然看得到）"——
    不报数就是让过滤看起来像评论自己变少了；
  - 过滤一律**按查看者**算（`hiddenAuthorIds(当前查看者)` 进 SQL 的 `notInArray`），不是按作者算：
    同一条评论，作者看是被滤掉的，旁观者看是正常的。`limit` 要在过滤之后才生效，所以过滤必须留在 SQL 里；
  - 别人是否拉黑了我，不在任何页面显示：那是对方的边界，说出来等于广播"谁在躲你"。
    被挡住的一方只收到一句不含细节的原因。

  验证：`blocks.integration.test.ts` 11 条（真库；每一条负面断言都配一个"同一种数据、换一种关系"的对照——
  一个恒返回 null 的 `relationOf` 会让所有负面断言全绿，只有对照组抓得住它）+ `@smoke §132` 三个视角
  （作者 / 被拉黑的访客 / 匿名旁观者，截图 `profile-blocked.png`、`blocked-comment-hidden.png`）。
  反向实验四个，每个都只红该红的那几条：`canInteract` 恒放行 → 3 红；`hiddenAuthorIds` 恒空 → 5 红；
  `setBlock` 不拆关注 → 7 红；`emit` 不看关系 → 2 红。
  仍欠：拉黑之后**已经发出去的通知行**不删（收件箱是历史，不是过滤器）；没有"屏蔽某个词/标签"这种更细的粒度；
  mute 不影响直接访问 URL——它是不出现在列表里，不是进不去；`/blocks` 上没有"谁拉黑了我"的反向视图（刻意不做）。
- [x] Trending（§61 那张"排不出来"单子上的前一项）— **2026-09-25 落地**：
  `apps/web/src/server/domain/trending.ts`（纯算法）+ `discover({sort:'trending'})` + 发现页第四个标签。
  **改口要有依据**：当初写"只有累计数"是对的，今天不成立了——点赞/评论/收藏/改编每一行都带 `created_at`，
  §168 的访问表又按"访客 × 天"存着 `opens`，按天的互动序列因此是真的。留着那条不改口，
  就是拿一条过期的限度骗人（§159 的反方向：明明能做却说不能，同样是谎）。
  算法是**最近 7 天的互动按半衰期 3 天加权**，权重 `点赞1 / 评论2 / 收藏1 / 改编3 / 一次打开0.2`；
  这三个数都是选择而不是事实，所以 `trendingMethod()` 把它们和"只在最近 200 条公开版本里排"一起
  原话显示在页面上（`data-discover-method`），每张卡还带自己的分数（`data-discover-score`）——
  一个藏起算法的序会被读成"平台公认最热"，写出来才只是"这是我们这套参数排出来的"。
  窗口外的互动**不计**（不是折到很小），未来时间戳不计（不给负权重抬分），空桶是 0 分（不补底数）；
  同分一律按发布时间倒序，否则两次刷新顺序会漂，而"榜在动"会被读成热度在变。
  验证：`trending.test.ts` 7 条纯单测钉算术 + `trending.integration.test.ts` 3 条打真库——
  其中关键的一条是**同一份数据下 `popular` 给出相反的顺序**（累计 6 赞但全在窗口外的那条排最后），
  这才证明新标签不是"最多人看/赞"换皮；`@smoke §59/§61` 里点一次「最近最热」，
  断言方法句、分数与"AI Picks 仍然排不出来"同时成立（截图 `discover.png`）。
  仍欠：候选集上限 200 是硬编码，平台大了要换成分桶预聚合而不是抬高这个数；
  半衰期与权重没有对照集，所以"排得好不好"今天无法回答，只能保证"排法透明"。
- [x] 全平台搜索（§165）— **2026-09-25 落地**：`/search` 一个 GET 表单 + 服务端渲染，八类目标各一组
  （projects / users / worlds / games / characters / designs / components / assets，与 §165 的清单同序），
  判定全在 `apps/web/src/server/domain/search.ts`。匹配走 pg_trgm 子串（迁移 0008 给被搜的列建
  `gin_trgm_ops` 索引）而不是全文检索：中文没有空格分词，`to_tsvector` 的 default/simple 配置切不出"王城"这种词，
  子串匹配对中英文一视同仁。
  **2026-10-22 补上相关度排序**（ADR-0056）：原先组内只按更新时间排（那条限度当时写在页面上，不装），
  现在按**四档确定性分**排：标题与查询完全一样 > 标题以查询开头 > 标题里有 > 只在简介/摘要/正文里有。
  - **分数算在 SQL 里**（`case` + `greatest`）⇒ 候选集本身按相关度取，
    不是先按时间截断再在剩下几条里排（那样"最相关的那条"可能压根没被取到）；
  - **标题列与详情列分档**（详情里的命中最多 1 分，低于"标题里有"的 2 分）⇒ 不并列，四档才成立；
  - **同分时按更新时间新→旧**（今天的行为保留为次序，不是被丢掉）；
  - **口径原话写在页面上**（`data-search-method`）：藏起来的序会被读成"平台公认最相关"；
    "没覆盖什么"那一栏同步改口，明说**不看词频、不看词在标题里的位置、不看点击与热度**。
  - **凭证**：`apps/web/test/search.integration.test.ts` 多 2 条（打真库）⇒ 该文件 16 条全绿：
    四档次序（其中"只在简介里匹配"那条被**故意设成最新更新的**——按时间排它会排第一，
    这条断言钉的是"相关度优先于时间"）；页面口径与代码一致、旧的"没有相关度排序"那句不许再留着。
  - **2026-10-22 浏览器那一寸也齐了**（e2e `e2e/search-relevance.spec.ts` 一条，9 秒跑完）：
    在真页面上量「次序真的是相关度的次序」——把「标题完全一样」的那条**先**建（它更旧）、
    「标题以搜索词开头」的那条**后**建（它更新）⇒ 按更新时间排的话次序正好相反 ⇒
    页面上的次序若与建的时间无关，才算真的在按相关度排；口径那一行（`data-search-method`）
    也要真的在页面上。

  **这一条真正的工作量在可见性，不是查询语法**：搜出一条打不开的结果比搜不到更糟。
  - 项目：你自己的（未删除）**或**有 public 且未被人工驳回的发布版本；自己的那条链到编辑器，
    公开那条链到发布路径；
  - 用户：只列有 handle、未注销、不是未认领 guest 的——否则 `/u/<handle>` 是空页；
  - 其余六类都挂在项目里，而 `/studio`、`/world` 与角色/资产路由只认所有权，所以**只搜你自己的项目**，
    未登录时这六组直接为空。别人的世界条目即使匹配也不列出：那些内容没有发布链路
    （§56/§57 发布的是设计文档那一版），列出来就是给访客一个 404。
  - 每组多取一条只为了说"还有更多"，不去数全表谎报总数；少于两个字符不发查询（一个汉字能命中半个平台）；
    用户打的 `%` `_` `\` 当字面量转义。

  没搜的部分 `SEARCH_NOT_COVERED` 四条原样列在页面上：世界与游戏条目正文、画布节点里的文字都存在 jsonb 里，
  子串匹配会连键名一起命中（搜 `player` 命中每一份模板骨架），要按内容找东西走项目内检索（§49）；
  资产只搜文件名；没有相关度排序。入口在首页与发现页各一条链接。

  验证：`apps/web/test/search.integration.test.ts` 11 条打真库，每条"搜不到"都配一条"换个人就搜得到"的
  反向断言——搜不到有两种原因（规则挡的 / 数据根本没建成功），必须分得开。
  `@smoke 全平台搜索` 在浏览器里走一遍：命中的链接点得开、画布元素名带页面名进 designs 组、一个字符不发查询、
  以及同一个关键词作者看得到而无会话访客一无所获。去掉 `likeTerm` 的转义，通配符那条立刻红
  （`分%达成` 会连 `百分X达成` 一起命中）。索引这一笔如实记下：`EXPLAIN` 只在 `design_nodes`
  （本机 1 万行）上选中 trigram 索引，`projects`（1252 行）与两字中文查询规划器仍走 Seq Scan——
  这条迁移要等表长大才兑现，现在别拿"建了索引"当性能结论。
  仍欠：相关度排序（要真打分得先有 §49 的向量半）、文档正文检索（同上，不拿全局 LIKE 扫 jsonb 冒充）、
  搜索建议与历史。
- [x] SEO（§166）— **2026-09-25 落地**：公开作品页的 head 全部服务端渲染（`/n/<handle>/<slug>` 的 SSR 本来就是真的），
  规则集中在 `apps/web/src/server/domain/seo.ts`——一份**纯投影**：吃 `PublishedPage` + origin，吐
  metadata / JSON-LD / 「省略了什么、为什么」，不碰数据库也不读请求头，所以每条规则都能在单测里单独钉住。
  `generateMetadata` 与页面组件读同一个库查询：`getPublishedPage = React.cache(resolvePublishedPath)`。

  这一条的实质是**爬虫看到的必须与访客看到的一致**，四组判断都为此存在：
  - `unlisted` 一律 `noindex`：它的语义就是"只认精确链接"，被收录等于替作者重新发布一次；
    `private` 与被人工驳回的本来就走 `resolvePublishedPath` 拿不到（404），所以
    `listSitemapEntries` 用**同一套谓词**（public + 非 rejected + 有快照 + 项目未删）——
    sitemap 里列一条 404 比不列更糟。
  - 绝对地址只来自**真实** origin（`apps/web/src/lib/origin.ts`）：`NEXUS_PUBLIC_ORIGIN` 优先于请求头，
    否则别人伪造一个 `Host:` 就能把爬虫领到别人的域名；`x-forwarded-host` 只在同时带
    `x-forwarded-proto` 时才信（裸 host 头可以任意伪造）。拿不到 origin 时**整条省略**并写进 `omitted`，
    不编一个 `localhost` 冒充对外地址（§159）；`robots.ts` / `sitemap.xml` 同理返回空并 warn。
  - `og:image` 不放占位图：只有这一版快照**真的画到**某个 image 资产时才有，判定复用公共图片路由的
    同一个谓词 `documentReferencesAsset`（清单里挂着但页面没画的不算，svg 不算），作者没有 handle
    时公共图片地址不成立、同样省略。
  - `description` 三级：项目描述 → 按字号挑句子的页面摘要 → 兜底句。第二级不是锦上添花——
    真机 curl 第一次看到的就是"按钮文案混进 og:description"，所以短于 6 字的文字（按钮 / 标签）不进摘要，
    字号大的先来，token 引用没有字号时退回文档顺序不谎报权重。

  JSON-LD 只写我们真有的字段（`CreativeWork` + author / publisher / `datePublished` = **这一版的发布时刻**，
  不是项目创建时间），没有 `aggregateRating`、`keywords` 这类编造字段；正文进
  `<script type="application/ld+json">` 前把 `< > &` 与 U+2028/29 转义掉——项目名是用户输入。
  `changefreq` / `priority` 不做（那是猜的），`/discover` 不放假 `lastmod`。

  验证：`seo.test.ts` 10 条纯函数单测 + `seo.integration.test.ts` 6 条打真库（public 在列 / unlisted 不在
  且配一条"resolve 仍非 null"的反向对照 / rejected 掉出去且留对照组 / 软删项目掉出去 / 取消发布掉出去且
  `lastmod` 就是 `publishedAt`）。`@smoke §166` 在真浏览器里走 head、JSON-LD 可 parse、`/robots.txt`、
  `/sitemap.xml`，再把同一个项目改成 unlisted 重新发布 → `noindex` 且从 sitemap 消失，
  反向对照页面本身仍然打开得到、canonical 没变（截图 `published-seo-public.png`）。
  反向实验逐个做过：删掉封面谓词 / 把转义正则缩到只剩 `[&]` / robots 三元改成恒 index /
  去掉 `visibility='public'` 或 `ne(moderation,'rejected')`——每次都只让预期的那几条红。
  已了结的一笔：`projects.deletedAt` 以前只有读没有写，sitemap 那条谓词只是防御性的——
  2026-09-26 §74 补上写入方之后它变成可测的，`project-delete.integration.test.ts` 里
  "删掉的项目不在 sitemap、恢复后又在"就是那条断言。
  **封面图已在 2026-10-07 落地**（见 commit 9353d02：发现页卡片显示封面图）；
  `/u/<handle>` 与 `/discover` 的 per-page metadata 没做（§166 原文范围是 public projects）；
  sitemap 截到 5000 条，超了只 warn + 截断，没有 sitemap index。
- [x] Analytics（§168）— **2026-09-25 落地**：`/analytics` 一张表，六个数各写清自己数的是什么。
  先说清这一条的**真实缺口**在哪里：views / likes / remixes / followers 早就有真值来源
  （`published_projects.views` 由公开页 SSR 累加、点赞与改编挂在项目上、粉丝是作者级），
  **completion 与 play time 此前没有任何采集**——所以这一条不是"做个图表页"，
  而是把"访客到底看了多久、滚到哪儿"这件事第一次真的存下来（迁移 0009 `publication_visits`）。

  粒度选的是**访客 × 天**而不是事件流：六个数没有一个是逐事件算的，
  事件流只会让"累计时长"这种数每次都全表扫；一行 = 一个人一天，
  写入用唯一键 `(publication_id, visitor_key, day)` upsert——打开次数相加、时长相加、
  **完成度取最远而不是平均**（`GREATEST`，一个人一天里滚得最远的那一次才说明他看到了什么），
  先匿名后登录的行允许补上 `user_id`，反过来不覆盖已有归属（`COALESCE`）。

  采集端（`VisitMeter` + `src/lib/visit-meter.ts`）把规则全放在纯算术里，因为这两个数最容易说谎：
  - 只在 `visibilityState === 'visible'` 时累计，切走标签页不算在看；
  - 单次 tick 超过 5 秒的部分丢掉（挂起 / 断点 / 睡眠一次性给出巨大的 delta），
    单次上报超过 60 秒截断，**并且把截断记进 `capped_reports`**——被动过的数据要留得下痕迹，
    界面上那一行会写"N 次上报被截断"；
  - 15 秒一次心跳，`visibilitychange→hidden` 与 `pagehide` 各收尾一次；
    用 `fetch(keepalive:true)` 而不是 `sendBeacon`——后者带不了 `x-csrf-token`；
  - 上报前先把"此刻滚到哪儿"并进聚合再取待上报的那一份：反过来的话滚到底要等下一次心跳才看得出来，
    一次短访问会把 100% 报成 50%（这个顺序错过一次，是真在浏览器里发现数字不动才回头改的）；
  - dev 下 StrictMode 会把 effect 挂两次，不去重就是一次打开算两次，所以按 path 记 `openedPaths`。

  公开页是**匿名可写**的入口，三道边界都在：CSRF 双提交（middleware 给每个访客都签了 token，
  不存在"访客没有 token"）、`path` 必须解析到非 private 且未被驳回的发布（否则 404，一行都不写）、
  按 IP + 匿名 key 限流 240 次/小时（每 15 秒一次心跳已经用满）。
  所有权写在 SQL 的 `where` 里而不是调用方：传别人的 publicationId 只会拿到空列表，
  "存在但看不到"这种含糊状态没有藏身处。`/analytics` 同时加进 `robots.ts` 的 disallow。

  展示面的诚实程度是这一条的重点：**采不到就是 null，界面原样写"未采集"**，
  不拿 views 换算一个时长冒充（`playTimeMs` 与 `completion` 都是这个规则）；
  但有行加出来是 0 秒时如实报"0 秒"——把"来过但没攒够时长"显示成"未采集"是另一种谎。
  六个数的口径直接印在页面上（含"打开次数不挡爬虫"、"隐私模式下每次打开算一个新访客"），
  `selfOnly` 单独标出来：只有作者自己刷新过的作品，那串数字不能读成"有人在看"。

  验证：`visit-meter.test.ts` 13 条纯单测钉住每一条截断/合并/去重规则；
  `analytics.integration.test.ts` 14 条打真库（同日合并、跨天不合并且访客按人去重、坏 key 一行不写、
  截断留痕、登录归属补写、null 与 0 分得开、点赞挂项目不挂版本、粉丝作者级、views 与今日打开两个来源、
  selfOnly、别人的 id 查不出、软删后从列表消失但行还在）；
  `@smoke §168`（2.8m）走完整链路：真人访客打开公开页 → 页面写着"这一页会统计" → 等一次真心跳带回
  `visibleMs>0` 与 completion → 作者页上访客 1 / 今天 1 / 时长 15 秒 / 完成度 100%，
  再验 403（只带 cookie 不带头）→ 200（补上头）→ 404（不存在的路径与切成私有的作品）三态，
  以及无会话访客打开 `/analytics` 只得到"需要先登录"且页面里一个数字都没有（截图 `creator-analytics.png`）。
  反向实验：去掉 `Math.min` 上限、把完成度平均的 `filter (where > 0)` 摘掉、`count(distinct)` 去掉 distinct、
  时长求和改取 max、`GREATEST` 改 `LEAST`、删掉 `ownerId` 条件、`COALESCE` 改成直接覆盖、
  访客 key 正则放宽——每一条都只让预期的那几条红。
  另外一条**证伪**记在这里：`contentHeight <= viewportHeight → 100` 那个提前返回是死分支
  （下面的 100 上限本来就给出同样答案），删掉之后测试仍然全绿，所以留着它只是假装钉住了规则。

  **按天曲线已在 2026-09-30 落地**（见文末「§168 第二片」）；游戏侧 completion 事件仍欠。
  **爬虫与真人区分已在 2026-10-16 落地**（第三片：`classifyVisit` 疑似另计，真人的数逐格
  filter 掉爬虫，`botOpens` 另给一格；详见文末「§168 第三片」与 ADR-0043）。
  **取消发布不再把统计一起删掉**——2026-10-22 落地（ADR-0055）：`unpublishProject` **不再删
  `published_projects` 行**，只把 `visibility` 改成 `private` ⇒ 那一版的访客现场与通关记录
  **原样留着**（`views` 本来就是这个行为，新表继承了它；今天多出来的两表也跟着一起留）。
  - **为什么这样就够**：库里**每个项目只有一行发布行**（版本号在同一行上 +1）⇒
    "访客现场"本来就是**跨版本累在那一行**上的 ⇒ 改可见性**一点没改统计的粒度**，
    改的只是"那一行还在不在"。
  - **三个可见性各归各**：公开面读不到它（`resolvePublishedPath` 判 private ⇒ 404）⇒
    采集端点写不进来（`findPublicPath` 判 private ⇒ 不再给一个没人能打开的页面攒数）⇒
    **作者自己那一行还在**（分析页上标着"已停"）⇒ 下架不等于抹掉履历。
  - **顺带修好一个今天就有的毛病**：删行之后重新发布取不到旧行 ⇒ **版本号重置成 1**；
    现在版本号接着往上走。
  - **"已经下架过再说一次"仍如实返回 false**（只撤还公开着的那一次）⇒ 与"没发布过"一样，
    没有新东西发生就不写审计。
  - **翻案一条旧断言**：`publish.integration.test.ts` 原来断言下架后 `getPublication(id)`
    为 null ⇒ 现在改为"那一行还在、只是 `visibility` 是 private"，并把理由写在断言旁边。
  - **凭证**：`apps/web/test/unpublish-keeps-stats.integration.test.ts` 3 条（打真库）：
    下架之后统计还在且那一行作者还看得见（含撤下留痕）/ 下架之后它真的不公开了
    （URL 404、采集写不进来、搜索与主页都不列它）/ 重新发布接着算（版本号往上走、统计不重置）。
    受影响的发布 · SEO · 通知 · 分析层 69 条全绿。
  - **导出已在 2026-10-22 落地**（见下）；跨作品的汇总视图本来就有着落（`creatorOverview`
    读的就是"名下所有作品加在一起"），那条记述已更正。
  **2026-10-22 导出落地（`GET /api/analytics/export` ⇒ CSV）**：
  - **数字与页面同一份**：导出与页面读的是**同一个** `creatorAnalytics` ⇒ 两处不可能漂
    （页面写"3 个访客"而导出写"4"这种不一致不会发生，§159）；
  - **没采到的是空格子，不是 0**（`completion` 与 `playTimeMs` 为 null 时写空）⇒
    "未采集"与"采到 0"在导出里也分得开（页面那一侧本来就是这个口径）；
  - **转义按 RFC 4180**：含逗号 / 引号 / 换行的值加引号 ⇒ 一个带逗号的项目名不会把整张表挪歪；
  - **带 UTF-8 BOM** ⇒ Excel 打开中文不乱码（这一格是给人拿去用的）；
  - **只给本人**：读的是自己的 id ⇒ 别人的作品一个字节都不在里面；没登录是 **401**（不是 500）。
  - **凭证**：新建 `apps/web/test/analytics-export.integration.test.ts`（4 条：数字与领域层
    **逐项相等**（测试自己重算一遍）/ 没采到的是空格 / 含逗号的值不挪列（自己写了个
    CSV 解析器按**列**断言）/ 别人的作品不在里面且匿名 401）；
    e2e `analytics.spec.ts` 多一条（`@smoke §168 导出：点那个链接真的下一个 CSV 下来，
    数字与页面上那一份相同`）：**下载真的发生**（文件落在磁盘上）/ **BOM 在**（Excel 打开
    中文不乱码）/ 文件里那一行的数与页面上那一格**逐字相同** /
    页面写着"未采集"的地方，导出里是**空格子**（不是 0）。
- [x] 通知中心（§164）— **2026-09-25 落地**：`/notifications` + 顶栏铃铛，只给**真的发生完**的事件写行。
  §164 原文点名的四类里今天只有 `Publish complete` 有真实终态：`Generation complete` 是同一次请求里
  同步回话的（web 侧没有能稍后"完成"的作业，要等 #10 的队列消费者）、`Build complete` 全平台没有会完成的
  构建端点、`Agent task complete` 的 `agent_tasks` 表**有结构但没有写入方**。
  所以这三类**不往收件箱插行**，而是原样列在页面下面（`data-notification-unbacked`）并各带一句为什么——
  比凭空造三条"完成"要诚实，也比把这条需求悄悄做小要好查（§159）。
  真有终态的除了发布还有两类：`resolveCase` 的人工裁决结论（全平台唯一一件"在别人请求早就结束之后才发生"的事），
  以及别人对你的公开作品点赞 / 评论 / 改编 / 关注。

  规则全放在纯函数 `src/lib/notify-plan.ts`（和 §166 的 seo、§168 的 visit-meter 同一形状），
  因为它装的都是会说谎的判断：`planNotification` 对"自己对自己做的事"返回 null；
  标题里的项目名与评论摘录都要过 `clip`（用户输入没上限就是标题没上限）；
  链接按**可见性**给而不是按事件类型给——`private` 那次发布指向 `/studio/<id>` 而不是必然 404 的 `/n/...`，
  没认领过 handle 的 guest 关注别人时**宁可不给链接**（读取时那条显示"没有可跳转的页面"）。
  每条通知带一个 `dedupe_key`，唯一约束在库里：点赞是开关（反复开关只留一条，键挂 `(project, actor)`）、
  评论每发一条都是新事（键挂 comment id）、发布按 `(publication, version)`（同一 path 换版本是两件新事）、
  裁决按键 case id。**去重是 `onConflictDoNothing` 挡的而不是内存挡的**，所以 `emit` 的返回值分成
  `created / duplicate / suppressed` 三态——测试要能区分"规则挡下了"与"根本没写进去"，
  否则"没有通知"永远只是"数据没建起来"的同义反复。

  读取时不悄悄消失：`inbox` 每次 JOIN 发布行，目标被下架 / 驳回的那条改标"这一版已经不公开了"而不是删掉，
  作者因此看得见"有人赞过，但那版已经打不开了"。这一条的判定按**链接形态**（`/n/` 开头才查发布行）
  而不是按 kind——切成私有的那次发布通知指向编辑区，拿"发布行还活着吗"去判它会给出一条假死信。
  `publication_id` 选 `ON DELETE SET NULL` 而不是 CASCADE，正是因为 §168 刚暴露过"下架连带把从属数据删干净"，
  收件箱里那条历史记录不该跟着一起没。未知 kind 读回 `'other'`（界面写"未分类"）而不是回落到 `'publish'`。

  验证：`notify-plan.test.ts` 19 条纯单测（含反向对照：同一种事件只换收件人就必须出声；标题逐字相等）；
  `notifications.integration.test.ts` 14 条打真库（作者有一条路人没有、dedupe 三态、自己对自己 suppressed、
  评论正文只进 body 不进标题、无 handle 的关注、取消发布后行还在且标失效、私有发布那条例外不受失效规则影响、
  拿别人的 id 标已读返回 0 且对方未读不变、全部标已读不删行、两个收件箱不互相漏、
  limit 截条目不截总数、手工插的 `kind='abuse_report'` 读回 `other`、二次裁决不再冒第二条通知）；
  `@smoke §164` 在真浏览器里跑两个身份（**新 context 才是新 guest**，同 context 的多个 page 共用会话，
  用它自赞自评只会测出"自己给自己发通知"这条规则没生效）：发布 → 铃铛 1 → 访客点赞/评论/关注 → 铃铛 4 →
  逐条标已读只动一条 → 全部标完未读归零而总数仍是 4 → 动手那人自己的收件箱是空的 → 无身份拿 401（截图 `notifications-*.png`）。
  铃铛的实时推送随 §163 落地（2026-09-26）：推来一条 notification 就重查一次数，**没有轮询**，
  未读数永远以库为准（断开期间的事件不补发，只把事件当"该重新查了"的信号）。
  **§164 分页已在 2026-10-07 落地**：`inbox(userId, { page, limit })` 支持页码与每页条数（默认 50、最大 100），
  返回 `pagination.hasMore` 如实反映是否还有更多；向后兼容旧调用方式（直接传数字当 limit 时不返回 pagination 元数据）；
  新增 4 条集成测试验证分页正确性、hasMore 边界、超范围页返回空列表、向后兼容性（`apps/web/test/notifications.integration.test.ts` 18 passed）。
  **通知偏好设置已在 2026-10-07 落地**（见 commit 9a6ff89：每人可按 10 类开关通知）；没有邮件 / Webpush。
  `projects.deletedAt` 那条谓词以前是防御性的（全库没有软删写入方），2026-09-26 §74 补上写入方之后它才真的可测：
  §74 的集成用例里删掉项目，指向它的那条历史通知**行还在**（那是作者的事件历史），但链接收走、
  理由写明"项目已经不存在"，恢复后又原样能点开——不需要重发一条。
- [~] 画布批注（§111）— **2026-09-24 落地**：点中元素 → 写一句话钉在它上面（`comments.node_id`，
  不另起一张表）。定位由服务端按文档算（页面、元素名），节点被删后批注仍列得出并标明悬空；
  随 AI 请求上线走 §68 那条路（客户端上传 `annotations` 一律 400，超出 20 条与悬空都写进
  `annotationsNote`），提示词里写清"批注回答该动哪个元素，不是要照抄进设计的文案"。
  **2026-10-24 第三项补齐（#185）**，这一条三项全齐：`@Agent` 提及解析 ✅
  （`server/domain/agents.ts` 的 `findAgent` / `mentionNote`）、回复线程 ✅
  （`comments.parentId` 那一列在，且是自引用级联）、**批注的「已解决」状态 ✅**——
  迁移 0038 给 `comments` 加 `resolved_at`（一行时间戳，不是布尔），
  `PATCH /api/annotations/[id]` 标上/重新打开，界面上"标为已解决 / 重新打开"，
  已解决的默认收起并说清收起几条，画布角标变灰淡出。
  2026-09-25 回看 §111 原文，它要的只有"点元素 → 写评论 → Agent 自动定位"，三样早就落地；
  回复线程与 resolved 状态当时判为"产品直觉、不是需求，不自动开工"。#185 仍然做了它，
  理由见 ADR-0061：**已解决的批注必须不再进 AI 上下文**，否则模型会把已经收工的事重做一遍——
  少这一条，"已解决"就只是界面装饰，而装饰正是 §159 禁的东西。
  `@Agent` 提及解析它挂在 §112/§113 的多 Agent 那条链上 ——
  **2026-09-26 已接上**（见 M6 的"Agent 名册有写入方"那一条）：批注正文里的 `@xxx` 现在是解析的第三来源
  （排在请求提名与提示词提及之后），并且它读的是同一名册、同一道门；不是给批注单独写一套匹配。
  验证：`annotations.integration.test.ts` 13 条 + 路由级 `annotation-resolve-route.integration.test.ts` 5 条
  + 画布 e2e（含刷新后仍在、以及"浮层挡住画布点击"这条反向实验——去掉 stopPropagation 那条断言立刻红）
- [~] 发布审核流水线（§131）+ 举报（§132 的一部分）— **2026-09-24 落地**：
  `publish → 机检（红线词表 + 资产出处）→ clear/review/blocked → 发布或挂人工队列`，
  机检只升级不认证（`moderation` 停在 pending，只有 role=admin 的人工裁决能写 approved/rejected，
  rejected 立刻让公开 URL 404），扫描自带 limits + rulesVersion 一路显示到发布面板，
  被挡下的发布也立案。取舍与限度见 `docs/adr/0008-moderation-escalates-never-certifies.md`。
  复核台 `/admin/moderation` 也已落地（非审核员连队列长度都看不到），整圈在真浏览器里核对过：
  挂起 → 看到命中证据 → 放行离开队列 → 拒绝后公开 URL 立刻 404（截图 `screenshots/admin-*.png`）。
  仍欠：图像/视频内容模型、版权比对。~~审核员提权目前只能改库（没有管理界面，也没有审计页）~~
  **已还（2026-09-25）**：`/admin/users`（提权 / 降权，规则在服务端判定）与 `/admin/audit`（审计事件页）落地，
  见下方"审计与角色"进度记录。
  §132 的 block / mute 已在上面单独落地（`user_blocks`），所以这一条四件齐了——但强度不同：
  审核是平台的权力，block 是个人的可见性选择，两者不能互相顶替。
- [x] **Java Spring Boot 领域服务在此落地**（用户/项目/社区/权限/计费的权威写入方）— **2026-10-07 落地**：
  `services/java-domain-service` — Spring Boot 3.2.0 + JPA/Hibernate + PostgreSQL。
  UserService（CRUD + 认领 guest + 档位变更）、ProjectService（CRUD + Fork）完整实现；
  Community/Permission/Billing 提供骨架接口与模式，待业务规则明确后扩展。
  Lombok 因 Java 25 不兼容已移除，手动实现所有 getter/setter。

**M6 进度记录（2026-09-25，审计与角色：§80 授权 / §84 审计 / §131 提权收口）**：

三件事一起落地，因为它们回答的是同一个问题的三个面："谁有权力、他用了没有、事后查得到吗"。

**1. `audit_events` 终于有了写入方（§84）。** 这张表建库起就在，注释写着"含被拒绝的越权尝试"，
但**全库没有一处写它**——"有表"不等于"有审计"，而"谁试过做什么、被挡了"这件事此前只存在于
服务器的瞬时响应里，关掉窗口就没证据了。现在写入的是**决定**而不是流水账，只在这几处：
登录 / 注册（成功与失败）、人工裁决（含非审核员的越权尝试与**重复裁决**尝试）、
发布 / 下架 / 取消发布、角色变更。把每次读都记下来，表会在几天里变成没人读的噪音，
真出事时反而找不到那几行。

三条写进代码的纪律：
- **不记凭据与隐私**。失败的登录尝试连"试的是哪个账号"都不记——那张表本身就会变成账号枚举的清单；
  审计页显示 `hasIp` 而不是精确 IP（精确定位滥用才需要，先留在库里不默认摊在页面上）。
- **写失败不改变请求结果**。审计是旁证不是业务前提：让它抛异常等于"日志库抖一下，审核员就点不动放行"。
  `recordAudit` 返回 false 并打到 stderr——那一行就是"证据没留下"这件事本身的证据。
- **没发生的事不记**。没发布过再取消（删行数为 0）不写审计，测试专门钉了这条。

**2. 提权 / 降权有了判定与界面（§131）。** 此前"谁是 admin"只能由运维改库。
判定全部在 `domain/roles.ts`，路由只翻译 HTTP 状态码——权限规则放路由里，下一个入口（CLI、批量导入）
就会漏掉它。三条规则：**不能改自己**（自己提权是"拿到这个会话的人就能变成审核员"的最短路径；
自己降权则让"还有谁能提权"没有答案）；**未认领的 guest 不给提权**（guest 身份新开一个浏览器就有，
§137，没有任何东西把它拴到人身上，提权等于把撤下内容的权力发给一个匿名会话）；
**改别人的前提是你此刻是 admin**，且这一条在写库之前问，不靠前端把按钮藏起来。
每一次尝试都进审计，被拒的那次也进——被拒绝的提权尝试恰恰是最该留痕的一类。
路由用 `currentUserOrNull()` 而不是 `requireUser()`：后者会替无会话请求现造 guest 身份，
而这个端点正是最不该"探测一下就白手造用户"的地方。

**3. 一条刻意不写的规则，以及它带来的两处自相矛盾（本轮修掉）。** 页面上**没有**"最后一个审核员不能降权"，
因为它是够不着的：能改别人的只有审核员，而审核员改自己被第一条挡住，所以"一个审核员都不剩"
从这条路径根本进不去。写下一条不执行的规则会让人以为它在工作（§159 的反面）。
本轮捞出的两处矛盾都出在这条规则上：
- `publish.ts` 的 `unpublishProject` 里，那笔审计调用被包在 `if (false) { … }` 里——**测试是红的**
  （用例已经断言 `publish.unpublish` 那行存在且 `actorId` 是本人），实现却被临时关掉忘了打开。
  这处是**新接上的 ESLint 规则集抓到的**（`no-constant-condition`），typecheck 完全看不见它。
  去掉 `if (false)` 后 7/7 转绿，删行这一笔终于留痕：URL 从这一刻起 404，
  但"谁撤的、撤的是哪一条"不能跟着行一起消失。
- `/admin/users` 页顶部的注释声称"最后一个审核员不能被降下去……两条都在服务端判定"，
  而 `roles.ts` 与页面**自己那段文案**都说这条规则不存在。三处说法里注释是错的，已改成一致。

**验证**：`npm run lint` 0 问题（typecheck + eslint 全过）；`npm test` **73 files / 765 tests 全绿**，
其中 `audit.integration.test.ts` 8 条（含"写不进去时返回 false 而不是把这次请求带崩"这条反向验证）、
`publish.integration.test.ts` 7 条（含本轮转绿的那条）。

## M7 — 创作者经济（§187）
- [~] Marketplace（组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色）
  —— **2026-10-06 后端落地**：`marketplace_items`（迁移 0023，七类物品 CHECK、可见性
  public/free/private、软删、下载计数）+ `domain/marketplace.ts`（列表只出 public/free、
  所有权判定在 SQL 的 where 里）+ `/api/marketplace` 三条路由（GET/POST 列表与创建、
  PATCH/DELETE 所有权；~~POST 下载计数~~ 那条只记数不交付的门已于 2026-10-21 删除，见文末同一节），标题/描述/标签过发布机检同一份红线词表。
  **2026-10-07 店面落地**：`/marketplace`——类型过滤、条目卡（价格/可见性/创作者/预览图）、
  上架表单（类型/标题/描述/标签/价格/可见性 + 来源项目与预览素材选择，资产清单按项目
  现拉）、我的物品与下架（confirm + DELETE + CSRF 双提交）。预览图走**市场自己的公开路由**
  `/api/marketplace/[id]/preview`（匿名场景自己的口；可见性跟条目走，所以缓存 `public, max-age=3600`
  而不是 immutable——素材字节不变，但"能不能看"会变）。导航加了「市场」。
  **测试**：`@smoke §127 创作者市场`（上架 → 出现在店面与我的物品 → **两条真交付对照**：没挂来源项目的
  条目报"没有可导出的源项目"且计数停在 0，挂上来源项目的条目在浏览器里收到一个 zip（前两字节 `PK`）
  且计数走到 1 → 改价格/可见性 → 下架消失）；domain 14 条（2026-10-06）；路由层的 `requireUser`/CSRF 门
  与 0f8404e 一起补齐并过全仓 typecheck；交付门 14 条集成测试见文末「§127 交付那一格」一节（2026-10-21）。
  **交付这一格**：`GET /api/marketplace/[id]/content` 那道门 2026-10-07 就建起来了（§144 的 design + code
  两档 ZIP），但它当时**谁也交付不了**——建包用的是下载者的身份（过不了 §144 的归属门，买家必拿 404）、
  中文标题直接进 `Content-Disposition` 会在构造响应时抛（平台上标题几乎必是中文）、免费那一路先 `+1`
  再建包（没源项目／源项目已删／导出抛错都照样让数字变大）。2026-10-21 把这四个洞一次修掉并立了见证，
  页面上那句"下载只记计数"也随之删掉；**计数从此只有一个含义：成功交付了几次**。
  **2026-10-23 已补**：ZIP 里**含资产字节**——`buildProjectExport` 加 `assets` 三档，以创作者身份走 §80 鉴权路由读私有素材（`openAssetForOwner`），买家拿到的包直接能跑，不再缺图。见 `d3efaff`。
  **2026-10-09 收益明细落地**：`/api/marketplace/earnings` GET 端点 + `/marketplace/earnings` 页面——
  聚合 `marketplace_splits` 表按日期分组，返回 totalEarned / totalSales / dailyBreakdown；
  创作者能看到自己的分成流水（一次销售 = 一行记录，按天汇总）。
- [~] Credits 与订阅（Free/Pro/Creator/Studio/Enterprise），消费透明（§133-134）
  —— 第一片已落地（账本 + 一类消费 + 一格拦截）；第二片把 storage 那一格也接上真的执行方
  （摄取门里拒绝新字节，413，见文末"§133/§134 第二片"与 ADR-0018）；
  （~~改档位的入口~~ 已在 2026-09-30 接上：`/admin/users` 的档位选择，见 ADR-0021）
  **2026-10-23 核对后改口径**：原句"欠 generation 的执行方"是**过期行**——
  generation 这一类**消费早已落地**：`chargeGeneration` 在同步收尾（`finishTask`）
  与审批批准（`decideApproval`：挂起那一次 `deliver` 没走收尾，补丁落地这一次要照扣，
  否则"走审批门的那条路免费"）两处调用，`credit_ledger_task_kind_key` 部分唯一索引
  挡住任何第二次写（重试、批准后作业又被轮询到，都只留一行账）。
  §133 五格的今天：**AI usage 与 storage 有真拦截方**（`refusalFor` / `refusalForStorage`，
  界面那列"已生效 / 还没拦截方"读 `ENFORCED_PLAN_AXES`）；**2026-10-23 再核一遍后，
  "generation 记账但不拦截"也是过期行——闸一直在**：五条生成入口全部先过 `refusalForRun`，
  credits_exhausted 时一条 `agent_tasks` 都不落（判据两层：429 + 副产物行数 0），
  见证 `apps/web/test/credits-enforcement.integration.test.ts`，见文末「第三十片半」。
  标签与事实的对应：`ENFORCED_PLAN_AXES` 里的 `aiUsage` 指的就是这道按 `creditKindForAgentKey`
  分桶（ai/image/video/compute 四桶）、按 `GENERATION_COST`（ai 1 / image 2 / video 5 / compute 1）
  计价的闸 ⇒ "生成次数"这一格**已生效**，只是标签叫 aiUsage；generation 与它是同一道门，
  没有第二道。team collaboration 与 publishing 仍只有 `PLAN_LIMITS` 里的数字、没有执行方。
  仍欠的是 image/video/compute 三类的**真消耗方**——要 §38/§40 的真生成端点
  （没有 provider 就不造假消耗，§159）。

## M8 — 开放能力（§188）
- [x] MCP、外部 Agent、公开 API —— **2026-10-21 核实后升格**（这一格原来挂着 `[~]`，理由是"还有几件事没做"，
  逐条核实后**那几件要么早已落地、要么今天补上了**）：
  ① **"项目的创建 / 删除 / 发布不对外"是过期条目**（今天第三次撞见"ROADMAP 里的'还没做'是历史快照"）：
  创建 `POST /api/v1/projects`（`projects:write`，2026-10-08）、
  删除 `DELETE /api/v1/projects/<id>?confirm=<名>`（`projects:write`，2026-10-09 第六片）、
  发布 `POST /api/v1/projects/<id>/publish`（`publish:write`，2026-10-09 第八片）⇒ **三样都对外了**；
  ② "MCP 与外部 Agent 接入那一格"：MCP server（第五片 stdio、第六片工具面、**第九片 Streamable HTTP 入口**）都落地了；
  ③ "4000 节点档的 GET 响应体积与 PATCH 耗时仍未量"：**2026-10-21 晚量完了**
  （`scripts/v1-4000-cost.mts`：gzip 后 0.11MB、布局求解 46.2ms、PATCH 改一个节点 2.4ms）；
  ④ **今天补上这一格原本真正缺的东西：一条端到端的证明**——`scripts/v1-agent-lifecycle.mts`
  （真凭据、真 HTTP、真库，把外部 Agent 要走的五步走一遍：建 201(383ms) → 改设计 200(167ms) →
  **读回并断言改动真的在文档里** → 发布 200(384ms) → 删 200(74ms) → 之后读详情 404）✓
  ⇒ **M8 整格从 `[~]` 升到 `[x]`**。
  公开 API 这一格已有读与写（第一片三格只读 + 第二片 PATCH 设计补丁 +
  第三片凭据级的访问账 + 第四片 JSON 出口的编码协商，2026-09-29/30）；4000 节点档的公网读/写
  **有了实测**（3293KB → 线上 gzip 103KB、GET 中位 513–951ms、一次 insert 中位 1369–1597ms，
  数与口径在 `docs/PERFORMANCE.md`）。
  **2026-10-07 第五片（MCP server 落地）**：`apps/mcp-server`（stdio）——定位是 **v1 的外部客户端**，
  不是特权通道（ADR-0031）：不 import 业务代码、不连库，四个工具与 v1 四条端点一一对应
  （`nexus_list_projects` / `nexus_get_project` / `nexus_get_design` / `nexus_patch_design`），
  token 鉴权、scope、凭据级访问账三道门自动继承；工具描述自带限度（先看规模再拉整份、
  删除类 op 会被 `approval_required` 拒、打不到的 op 被 `ops_skipped` 整体拒）。
  **测试**：`mcp.test.ts` 7 条对真本地 HTTP 后端量（tools/list 恰好四个、Bearer 头、PATCH body
  原样透传、404/401 变 isError 且错误码留文本、连接被拒是另一条错误路径）；stdio 冒烟两臂
  ——真进程 initialize 报 `nexus` + tools/list 四个、缺 `NEXUS_API_TOKEN` 退出 1 且 stderr
  说清凭据在哪签发（`npm run mcp:serve` 起服务；typecheck 链已纳入 apps/mcp-server）。
  **2026-10-09 第六片（建/删项目对外）**：`POST /api/v1/projects`（回 201 + `ApiProjectDetail`，
  `kind` 不认识回 400 并列出可选值，**不悄悄兜底成 `website`**——界面那条路是 `<select>` 送不出坏值，
  外部调用方写错类型必须知道）+ `DELETE /api/v1/projects/<id>?confirm=<项目名>`（复用
  `softDeleteProject()`：确认词逐字比对、越权 404、软删、审计留行；回执里写着"v1 没有恢复端点"，
  限度不靠调用方读文档）。scope 名单多一格 `projects:write`（迁移 0027 换 CHECK 不追加，
  手法同 0019；`ApiTokensPanel` 有对应的中文标签）。守卫同步：端点清单 4→6、写方法名单加 `DELETE`、
  "名单外 scope"反例从 `projects:write` 换成 `projects:delete`（它已经合法了，拿它当反例是假信号）。
  `api-v1-write.integration.test.ts` 8 条对真库量（403 点名缺哪格 / 真落库 / 未知 kind 400 且库不涨 /
  确认词不对 400 且项目还在 / 软删后详情 404 / 删别人 404 / 审计 allowed 各一条）。
  **2026-10-09 同日第八片（发布/下架对外，`publish:write`）**：`POST /api/v1/projects/<id>/publish`，
  响应 `ApiPublication`（path / version / visibility / publishedAt）。**v1 只收 unlisted / private，
  public 一律 400 并说明"回平台界面"**：§131 的机检与人工裁决在人的路径上，§74 把公开发布列在
  必须人工审批的清单，而一枚 Bearer 凭据背后没有可点批准的人——让外部 Agent 走 v1 直接进公网
  等于把审批从链上摘掉。scope **没有并进 `projects:write`**：发布（把内容放到公网）与建项目、
  删项目是三种风险，合成一格的话一枚为建项目签的凭据就顺带学会了发布（比 0019 那次更细一层的
  least-privilege）。private 走 `publishProject` 而不是 `unpublishProject`：回执永远是同一份
  publication 形状，且行留着（URL 一样解析不出来）。迁移 0028 换 CHECK。真库用例
  `api-v1-publish.integration.test.ts` 7 条：403 点名缺格 / unlisted 落库且 `resolvePublishedPath`
  真解析得出 / 重发布同 URL 涨版本不开新行 / **public 400 且行一个字节不动** / private 下架后
   解析不出而行还在 / 别人项目 404 / 审计 allowed:true。MCP 工具面同日 6→7（`nexus_publish`，
   public 收在 inputSchema 里，发都发不出去）。
   **2026-10-09 第九片：Streamable HTTP 入口**（原"仍欠：MCP 托管的 Streamable HTTP 入口"清账）：
   `apps/mcp-server` 加第二个传输入口 `src/http.ts`（`npm run mcp:serve:http`，`/mcp`，默认 3400）
   ——**工具层一个字没改**（七个工具还是 v1 七条端点的镜像），挂的还是 v1，ADR-0031 的选择
   一字不动（没有把 MCP 处理器搬进 Next.js）。托管形态改的只有凭据形状：每条请求带
   `Authorization: Bearer`，initialize 那枚 token **绑定整条会话**（换 token → 401
   `session_token_mismatch`，不然"会话 A 建立、token B 调用"就是提权缝）；token 真假仍只有
   v1 说了算，这一层不做第二套凭据库（值错的 token 出去是 v1 的 401，进 isError 文本）。
   测试 `mcp-http.test.ts` 7 条（401+WWW-Authenticate / 404 / 会话绑定全链：换 token 401 →
   原 token DELETE 200 → 删完 404 / 缺会话 400·未知会话 404 / 坏 JSON 400 / 真客户端完整握手
   tools/list 恰好七个且限度话还在 / 工具调用的 Bearer 逐字到 v1 / 值错 token 走 v1 401 进
   isError）；stdio 13 条不动；真进程冒烟 initialize 200 + `mcp-session-id`、缺 Bearer 401。
   （原两处文档写"工具面 7→8"是差一：实际 6→7，v1 端点也是 7 条，已一并改正。）

## 横向能力（随里程碑推进，不单列里程碑）
- Agent 工具注册表 + 权限 + 人工审批门（§72-74/177）— **§74 点名的「删除项目」这一格已落地（2026-09-26）**：
  起点是一件对不上账的事：`projects.deletedAt` 从建库起被近二十处读取谓词挡着（列表 / 搜索 / 发现 / 公开页 /
  创作数据 / 个人主页 / 收件箱那条链接），**但全库没有一个写入方**——那些防御性判断今天全是死代码，
  而 §74 列在"必须人工审批"清单上的那个动作在界面上根本没有入口。
  现在有了：`softDeleteProject` / `restoreProject` / `listDeletedProjects`（`domain/projects.ts`）+
  `DELETE /api/projects/[id]`（报文 `ProjectDeleteRequestSchema`，只有 `confirm`）+ `POST /api/projects/[id]/restore` +
  首页每个项目下的确认卡片与「回收站（N）」。
  **审批做在服务端**：`confirm` 必须逐字等于项目名，不匹配就一条都不写、只留一行 `allowed:false` 的审计（写进 §84 那张 `audit_events`）。
  只在界面上放 `window.confirm` 等于没有审批——直接打接口的人不受它约束，e2e 的第 ①② 两步就是绕开界面打的。
  **软删而不是删行**：§108 把用户的项目历史归 Snapshot 管，一次撤销不该把发布记录、快照、评论一起带走；
  集成用例为此数的是库里的条数（快照条数与 `published_projects.id` 在删除前后一模一样），
  恢复后同一条公开 URL 又打开的正是删之前钉住的那一版。
  顺手补上一个只有今天才会撞上的洞：`publicRefByPath` 的注释写着"和 `resolvePublishedPath` 同一口径"，
  代码却只挡 private 与被拒绝的——于是"页面已经 404，但点赞/评论/改编接口还在替一个作者已经删掉的项目收写"。
  `deletedAt` 以前从来没有值，这条差异是看不见的；现在补了谓词，用例里删除前后各打一次同一个接口。
  限度如实记下：① **没有"永久删除"也没有到期清理**，回收站只进不出（除了恢复），存储不会因此回收；
  ② 只做了"删项目"这一格，§74 清单上的消耗 credits / 对外发送消息 / 生产部署 / 支付都还没有审批门（M7/M8 未开工）；
  ③ §72-73 的 agent 侧审批当时未落地（`agent_tasks.requires_approval` 全库无人置真）——**同日补上了，见下面那条**；
  ④ 确认词比的是名字的原值，改过名就要用新名字确认——这是这条门的全部形式，不是缺陷；
  ⑤ `confirm` 有 2000 字上限（项目名这条链上没有 120 那样的约束），名字超过它的人先改名再删，界面上报的是"确认词太长"而不是"不匹配"。
  验证：`project-delete.integration.test.ts` 16 条打真库（含 §61/§164/§165/§166/§168 各面的可见性）+
  `@smoke §74` 在真浏览器里跑两个身份并直接打接口。四次反向实验各打中要害：
  把审批判定短路 → 2 条红（都红在"返回值应该是 approval_required"那一句）；
  把软删改成 `db.delete` → **8 条红**，其中"快照条数不变"从 2 变 0——那正是"软"这个字的全部意义；
  把 `publicRefByPath` 与收件箱新接上的 `deletedAt` 判定各自拆掉 → 各恰好 1 条红，
  红的那一句都是"删除之后应当看不见 / 点不开"，而同一个用例的下一步要求恢复后答案翻回来。
  Agent 工具注册表与权限矩阵（§72-73）本身仍未开工。
- [x] §74 的 agent 侧审批门（2026-09-26）— **`agent_tasks.requires_approval` 从此有了写入方**。
  上一条记下的是"删项目"这一格；这一格管的是 AI 那条路：一条 `remove` 在批准之前进不了画布。
  门做在**写入之前**且做在**服务端**：`apps/web/src/server/ai/approvals.ts` 的 `gateResponse` 逐 op 扫
  `remove / removePage / removeToken / removeAsset`，与 provider 自报的 `approvals` 取**并集**后把补丁整份扣下
  （`delivered.patches = []`，完整那一份只存在任务行的 `result` 里）。并集是必须的：
  provider 报的是它记得的那些，规则版 mock 与任何一次改写都可能给出一条 `remove` 而不附说明——
  provider 失忆不能变成"删除直接进画布"。
  `approvalPolicy` 这一栏**不由请求方定义**（§68 同一口径）：`assemble.ts` 一律覆盖成 `WEB_APPROVAL_POLICY = ['delete']`，
  客户端传什么都无效，e2e 第 ① 步就是自己填一个空数组直接打接口。
  裁决走 `POST /api/ai/tasks/<taskId>/approval`：`WHERE status='awaiting_approval'` 的 CAS 保证**第一次决定算数**
  （第二次 409），批准交回的是**当初被扣下的那一版**而不是重新生成的一版（理由见 `docs/adr/0012`）；
  归属由账本的 `created_by` 判，别人的任务与不存在的任务是同一个 `not_found`，两种都进审计（后者 `allowed:false`）。
  Studio 的审批卡片**从账本找回**（`GET /api/ai/pending-approvals`）：刷新之后现场还在，
  而读侧一个字都不给补丁正文——界面上"批准"是唯一的落地路径。挂起时**不写 `finishedAt`**：等待不是终态。
  这一路在真浏览器里撞到四个缺陷（都与 §74 本身无关，也都是这次才撞到的）：
  ① 裁决回执原先嵌在卡片内部，批准之后卡片消失、回执跟着一起没了，用户看到的是"按钮一闪，什么都不说"；
  ② `invertPatch` 对整棵子树的还原被函数末尾那次全局 `ops.reverse()` 翻了顺序，撤销时子节点因父级还没回来被逐条 skip，
  **节点悄悄少一半而处处绿灯**（画布 8 → 1 → 2），另有跟着克隆塞回 `children` 与逐条 `insert` 叠成双份的问题；
  ③ 同一屏上"画布还没有被改动"与 provider 活动流那句"1 个 op 已落地"并存——门把交回的那一份里的说法改成了
  "批准之前不会落地"（计划步骤的 `done` 同样换成 `skipped`），而**存下的那一版一个字不改**，批准之后交回的还是当初那一版；
  ④ 开发模式下这条路由的首个 POST 实测 8~9 秒，5 秒的默认断言会稳定误报"按钮没反应"。
  限度如实记下：web 侧只有 `delete` 这一档策略，§74 清单上的消耗 credits / 对外发消息 / 生产部署 / 支付仍未接（M7/M8）；
  写这一片时异步那一路（§162）还不认审批——**同日已经撤销**：`observeJob` 之后过的是同一个 `gateResponse`
  （见下面 §162 × §74 那一条），当时拦不住是因为异步那一路连结果都没交回来；
  `awaiting_approval` 的行**没有过期与清理**，没人决定就一直等着（界面上常驻可见，但库侧无 TTL）
  ——**2026-10-01 已接上**：`awaiting_since` + 读时收敛，见本页最后一条；
  卡片是挂载时读一次，没有实时推送，另开一个标签页批准之后这一页要刷新才更新。
- Context Engine / Design Index / Project Graph（§66-71）— **五切片已落地（2026-09-24）**：
  `buildDesignIndex`（`packages/design-model/src/context-index.ts`）把一份设计文档投影成**目录**
  （页面 / 框 / 组件 / 资产 / token / 交互 + 跨引用边 + totals，纯函数、不含正文），
  `fitIndexToBudget` 按字符预算裁剪，并且**逐条交代裁掉了什么**（totals 始终来自未裁的那一份，宁可少列条目不少报数）；
  服务端 `buildProjectContext`（`apps/web/src/server/domain/context.ts`）一次装配出设计目录 + 世界/角色/记忆/资产/语料/快照/发布的摘要 +
  §71 七个分支各自的索引状态，过 `ProjectContextSchema` 后由 `GET /api/projects/[id]/context` 出去；
  Studio 的「上下文」面板与 Agent 请求从同一份装配出发，面板上还给出「目录 vs 整份文档」的字符对比与可改的预算。
  第二切片把 §68 的缺口关上：AI 请求不再带整份文档。`POST /api/ai/run` 先校验项目归属，
  再用同一个 `buildProjectContext` 在服务端装配目录（`apps/web/src/server/ai/assemble.ts`），
  客户端上传 `context.document` 一律 400 并说明原因（边界要能被拒绝，不能只写在注释里）；
  DEMO 那一路的确定性规则改读**服务端权威文档**（本地工具入参，不上线），
  命令栏发请求前先 `flushBeforeAi()` 把脏改动落库——上下文既然来自库里，就不能悄悄按旧版本生成。
  这一路顺带挖出一个老 bug：`loadDocument` 只写不读 `visual_dna` / `brand_kit`（§16 的闭环断了），
  表现是"明明提取过 DNA 却按内置配色生成"。
  第三切片补 §69 的 Code Index（`apps/web/src/server/domain/code-index.ts`）：目录**从 codegen 的产物现算**，
  不另起一套对代码的认知（§16 的投影），也不落进库里的 `files` 表——那张表现成但一行都没写过，
  而算得出来的东西写进库迟早读到旧的（取舍见 `docs/adr/0007-…`）。符号、行号、参数、import 全部走**真实 TypeScript AST**，
  解析失败报"失败"而不是报"0 个符号"；文件归属由发射器自己标注（`GeneratedFile.origin`）。
  发给 provider 的是 `buildCodeDigest` 的结果：path / 语言 / 人话归属 / 行数 / 符号名 / 依赖 / **逐条命中理由**，
  **代码正文一个字符都不上线**（§68，`ai-assemble.integration.test.ts` 直接断言线上含符号名而不含区域正文）。
  排序是**词法**的（CJK 二元切词，中文页面名命中得了），不是语义的。
  §71 的 Code 分支因此从「未索引」变成「已索引」，note 写成可核对的一句话；面板同一行报目录字符数、
  文件/符号/内部依赖数与"几个文件没解析出来"。建这个目录当天照出一个真 bug：
  **页面名没有 ASCII 字符时导出 `components/nexus/undefined.tsx` / `export function undefined()`**
  （中文页面名是常态，不是边角），已修并钉在 `packages/design-model/test/codegen.test.ts`。
  第四切片干的是**把这条链在 Python 那头接上**：§68 只是不再发整份文档，`apps/ai-service` 的
  `build_prompt` 从头到尾没引用过 `designIndex` / `codeDigest`——它一直在读 `context.document`，
  而那个字段现在线上根本不存在。所以**今天看着正常只因为 DEMO MODE 跑的是进程内的 TS mock**；
  一旦配上真 provider，提示里的节点表会是空的，模型只能凭页面名瞎猜 nodeId（§159 的反面）。
  现在 `build_prompt` 优先吃目录（pages / frames / tokens / components / assets / interactions +
  totals + omissions + trimmed + 代码摘要），并在 payload 里自报 `contextSource`：
  `designIndex` 是正常路径，`document-fallback` 与 `none` 都带一句人话说明"这次看到的比正常少什么"，
  降级可见、不静默；超过预算同样如实写进 `promptTruncated` 而不是偷偷截掉。
  钉住它的是 `apps/ai-service/tests/test_prompt.py`，夹具由 `npm run contract:export` 用**同一套装配代码**
  现算（id 固定化后两次导出字节相同），所以 TS 侧改了目录形状、Python 侧的测试会先红，
  不会出现两端各自演化。反向验证过：换回旧 `build_prompt`，9 条里 6 条立刻失败。
  第五切片把 §68 剩下的最后一块"客户端说了算"拿走：`selectionDigest` / `designSystemDigest` 以前是浏览器
  算好发上来、服务端照单收下。不算越权（读的是自己的项目），但模型看到的"现场"是请求方自述的——
  谎报一个不存在的 nodeId、或者用点击顺序暗示哪个更重要，服务端没有任何办法发现。
  现在命令栏只发 `projectId / pageId / viewport / selection`（id），两份摘要由
  `apps/web/src/server/ai/derive-context.ts` 从**权威文档**现算（`buildSelectionDigest` + token/组件表），
  上传任一份摘要和上传整份文档同罪：400 `context_selectionDigest_not_allowed`（§12 的第 12 条边界）。
  `buildSelectionDigest` 比原来那份客户端摘要多交代三件事：认不出的 id 进 `missing`、文档里有但走不到的
  进 `unreachable`（`depth: null`，样式信息仍如实给出）、超出 12 条的进 `dropped`；
  顺序改成"当前页优先 + 文档位置"，客户端的点击次序不再参与。文字/尺寸/字号沿用模型里的意图值
  （`hug` / `fill` / `{token}` 不换算成像素），token 引用与目录、lint、health 同一个 `collectTokenRefs`。
  夹具那一路也跟着改：`scripts/ai-request-fixture.ts` 直接调 `deriveContextFromDocument`，
  摘要不再手抄——导出来的 `contracts/fixtures/*.json` 里那份就是服务端真会发出去的那份。
  **① Code Index 的后半截已在 2026-10-07 落地**：`fetchCodeByPath(document, path)` 能从设计文档重新生成项目并返回指定路径的完整代码内容（生成的 .tsx/.ts 文件与 code-only 区域都支持），找不到返回 null；更新 `CODE_INDEX_OMISSIONS` 删掉"要读实现得按 path 取"这一条；新增 4 条测试验证取生成文件、取 code-only 区域、找不到返回 null、符号列表与目录一致（`apps/web/test/code-index.test.ts` 18 passed）。
  Agents / Runtime 两个分支仍未落地，面板上写的是「未索引」而不是空白；
  ② 语义相关性与重排要 embedding provider（§49 的向量半）；
  实测尺寸/耗时见 `docs/PERFORMANCE.md`，预算为什么取 20000 见 `docs/adr/0006-design-index-char-budget.md`。
- 作业队列（§162）— **ai-service 这一侧已落地（2026-09-24）**：`POST /v1/ai/jobs` 收同一份 AiRequest，
  校验通过就入队并回 202 + jobId，`GET /v1/ai/jobs/{id}` 回 Queue→领取→结束三段里程碑与最终结果。
  关键的一条设计是**不给第二条执行路径**：worker 调的就是同步 `/v1/ai/run` 那个 `execute_ai_request`
  （从 app.py 里抽出来的 `execution.py`），所以"异步的作业其实没校验补丁"这种分叉从结构上不可能出现，
  而被 `test_async_result_is_the_same_pipeline_as_the_sync_route` 钉成"两份响应体必须逐字段相同"。
  后端两种，且**限制写在报文里**：`memory`（默认，只此进程可见、重启即失）与
  `redis`（配 `NEXUS_REDIS_URL`；LPOP 保证同一个作业不会被两个 worker 领走，跨 store 读得到）。
  配了 Redis 却连不上 → 启动直接失败，不会悄悄退回内存后端。`/healthz` 里那个写死的
  `pending: 0` 换成了真计数（`backend`/`capacity`/`note` 一起报），没跑 lifespan 时报 `backend: none` 而不是崩。
  `progress` 在没有真进度来源时恒为 `null` —— 不编一条 0.2→0.9 的假刻度。
  仍欠的两笔：① **web 侧还没有消费者**（`/api/ai/run` 仍走同步路径），所以这条队列今天对产品行为没有影响，
  它是图片/视频/3D 那条链的前置；② §163 的实时推送已在 2026-09-26 落地（见下面那条），
  但**它推的是同步请求的两个真端点**（开始与结束），队列那条路还没有事件可推——
  等 web 侧消费者接上 ai-service 的 `/v1/ai/jobs`，中间态才有来源，届时 `progress` 才允许不是 0/1。
  验证：45 条 pytest（新增 9 条）+ 真 Redis 跑通 9/9（`NEXUS_REDIS_URL=redis://127.0.0.1:6380/0`），
  真 uvicorn 起服务手工核对过 202→failed(provider-unavailable)→404 三种回话；
  两次反向实验（计数器写死 0、worker 无论什么都算完成）各自打中对应用例。
- Observability / Evaluation / Visual Benchmark（§84-86/156）— **§84 的审计那一半已落地（2026-09-25）**：
  `audit_events` 这张表建库起就有、注释写着"含被拒绝的越权尝试"，但**全库没有一处写它**——
  "有表"不等于"有审计"。现在有了写入方（登录/注册成功与失败、人工裁决含重复裁决与越权尝试、
  发布/下架/取消发布、角色变更），以及 `/admin/audit` 页。取舍见下方进度记录。
  **仍欠**：§85 Evaluation 与 §86 Visual Benchmark 没有开工；metrics/tracing 也没接，
  所以"线上发生了什么"目前只能靠这张审计表 + stderr。
- 规模基准与热点路径（§146/§147）— 模型层有 `scripts/perf-baseline.mts`，实测数字与"还没做的部分"记在
  `docs/PERFORMANCE.md`。2026-09-24 补上浏览器端：`npm run perf:browser`（`scripts/perf-browser.mts`）
  在真 Chrome 里量首帧、pan/zoom 帧距与"属性写入→画布重绘"延迟，当天数字与其三条必须一起读的限定
  （首帧不等于整页画完、本机 rAF 没锁 vsync 所以帧率只能当长任务信号、单次数字跨运行抖 2 倍）都写在那份表格里；
  还记了一次没解释的 60 秒不出帧现象，等它再现。画布虚拟化与 worker 仍未做。
  2026-09-24 补：持久层第一次进表，当场挖出一条硬断链 —— 一个页面超过约 **7,281 个节点就整体存不下去**
  （`writeNodes` 拼单条 INSERT 撞上 Postgres 65,535 参数上限），而 §146 的目标正是 10,000 节点。
  模型层基准只在内存里造文档，所以它从没暴露过这件事。改成 500 行切块并补了回归测试。
  同日再补一条更值钱的：浏览器端那张"N 节点"表**整批作废过一次**——压测脚本造的节点字段不全，
  画布整页崩，实际渲染的一直是起手 8 个节点，而脚本打印的节点数取自客户端自己加了多少。
  修法是两头：读路径不许崩（lint / 排版对残缺节点跳过并报出来）、写路径挡在门外（parseDocument 报 error），
  外加脚本自己核对"服务端存了多少 / 画布真渲染了多少"。修好后第一次真数据与三条读法限定见
  `docs/PERFORMANCE.md`；1000 节点档 pan 平移 p95 139–176ms、每次掉 40 帧，这就是视口裁剪的依据。
  同日再补：`buildCodeIndex`（§69）进同一张表 —— 10k 节点 220.9ms（其中 codegen 本身 118.5ms），
  而目录尺寸从 100 到 10,000 节点只从 6,128 变到 6,138 字符：**它按页面数增长，不按节点数**，
  因为节点在代码里是锚点注释而不是符号。这条读数写进 `docs/PERFORMANCE.md`，
  免得有人拿"代码目录比设计目录小两个数量级"当结论——那不是索引有魔法，是投影本来就不展开节点。
- 沙箱预览与生成代码隔离执行（§81-83）
- Design Critic + Visual QA + 无障碍/性能门禁（§32-33/90-91/178-179）—
  门禁与七行健康度已落地（`analyzeHealth`，见 M2 进度记录与 `docs/adr/0005-…`）；
  Design Critic 的**自动修复建议**仍只有 lint 的 `suggestion` 字段，没有对话式评审。

- [~] 实时通道（§163）— **2026-09-26 落地了传输与两类事件，偏离 WebSocket 的取舍写在 `docs/adr/0010-…`**：
  `/api/realtime` 是一条 SSE 长连接（App Router 的 route handler 承载得了，会话与项目所有权走同一条路，
  不必为单向通知多养一个进程），报文仍是早已是契约的 `RealtimeEventSchema`。
  生产者与传输解耦在 `server/realtime/bus.ts`（`RealtimeBus` 接口，默认驱动进程内，
  与 `security/rateLimit.ts` 同一口径：设了 `NEXUS_REDIS_URL` 才换 Redis pub/sub 扇出驱动、生产者不动）。
  **换驱动那一格 2026-10-06 落地**（`docs/adr/0028-…`）：多实例部署从此看得见别机的事件，
  ADR-0025 第六件（注销后不再向他推任何东西）也不再只在一个进程里成立——关门会往线路发一帧 `close`。
  一条连接覆盖用户频道（通知）与项目频道（进度），带 `?projectId=` 时校验归属（不是你的项目一律 404）、
  每账号同时最多 8 条连接（每条都握着订阅与心跳定时器，开多少条不能由客户端说了算）、写请求一律 405。
  **今天真的有生产者的有五类**：`generation.progress`（任务开始推 0、终态推 1，失败也推——
  界面上那句"正在生成"要能自己停下来；§112 的多步作业还每跑完一步推一格，见下面 §112 那一节）、
  `notification`（真的新写了一条才推，duplicate/suppressed 不推）、
  以及 §162 的 web 侧消费者与 §112 的编排推的 `agent.step` / `agent.activity`（异步作业的活动按游标推，推过的不推第二遍）。
  `build.status` / `preview.status` 两种事件**也有生产者了**（2026-09-30）：发布链路是仓库里唯一
  **真的分步走完**的构建动作（门禁 → 机检 → 钉快照 → 落 publication 行 → 公网 URL 生效或收回），
  每一格都挂在一个真发生了的节点上，中间不插刻度。`preview.status` 读的是
  `resolvePublishedPath` 那一遍**真实解析**的结果，所以"往外发布了却解析不出来"（多半是人工裁决挡的）
  与"收回之后还解析得出来"都报 `failed`，不跟着发布意图闭眼报就绪。
  至此 `RealtimeEventSchema` 里**七种事件全部有生产者**；
  断线期间的事件不补发（没有 `Last-Event-ID`），所以实时只当加速器、权威状态一律读库——这条限度写在 ADR 后果第 4 条，
  UI 上断开时显示"以刷新后的数据为准"而不是假装还在实时。
  **这一句 2026-10-06 要改口两处**（判决书是 `docs/adr/0029-…`）：① "不补发"这个选择本身保留，
  但 ADR-0028 欠账里那句"要补发得另立 ADR 选 Stream"是错的方向——从库里按游标重建帧比 Stream 省事得多，
  它被实测否掉了：收件箱的 `level` 根本不在表里（`emit()` 插库前就摘掉了），补出来的那一帧会把失败的构建画成绿色成功；
  ② "以刷新后的数据为准"以前是把活儿推给用户，现在连接**断过又接回来的那一刻界面自己重读一次**，
  铃铛的未读数不等刷新就追平（服务端一帧没改，改的是客户端那条 seam）。
  顺带修掉一处会污染终态的假象：provider 带 `error` 返回 HTTP 200（DEMO Mock 遇到没实现的指令就是这样）
  以前会记成 `succeeded` + "生成完成"，现在账本、通知、实时进度三处都按 `error` 判失败。
  验证：`realtime.test.ts` 15 条纯单测（2026-10-06 数过：与 Redis 那 6 例同跑报 21 passed，单跑该文件报 15）
  ——总线不跨频道泄漏、订阅者抛异常不连累别人、退订幂等、连接上限与归零；
  `realtime.integration.test.ts` 10 条打真库（该发的发了、duplicate 不发、suppressed 不发、无项目的任务不发、
  收尾不存在的任务不发）；`@smoke §163` 在真浏览器里跑两个身份：作者停在首页**不 reload**，
  访客点赞后铃铛从 1 变 2，且这期间收件箱接口只被请求了一次（数请求条数，不是数"数对不对"——轮询也能让数变对）；
  Studio 里跑一次真 AI 请求，进度行由事件流自己推出来（成功那条写"完成"，Mock 不认的那条写"失败：provider-unavailable"），
  别人的项目频道拿 404、匿名拿 401、POST 拿 405（截图 `realtime-bell.png` / `realtime-studio*.png`）。
  跨实例那一半（2026-10-06）：`realtime.redis.integration.test.ts` 6 例打真 Redis（两条独立总线 +
  一条绕过总线直接往线路上发字节的原生连接），`npm run realtime:two-process` 再用 5 个真实进程
  跑一遍投递与关门（八条判据），7 条变异臂逐句拆掉这一片的纪律、各红在该红的那一句上（详见 ADR-0028 的验证）。
  重开那一寸（2026-10-06，ADR-0029）：`realtime-reconnect.test.ts` 8 条纯单测
  （与 `realtime.test.ts` 同跑报 23 passed），6 条**注入 transport** 钉连接本身
  （"首连不发重读、重开恰好发一次、CLOSED 才报 closed、报文照样过契约"），
  2 条从源文件扫 `useRealtime(...)` 的选项对象钉**接线**——前 6 条只证明信号会发，删掉 `onReconnect` 它们一条都不红；
  六条变异臂 A/B/C/D/E/F 分别红 4 / 2 / 1 / 1 / 1 / 1 条（A 的预测是 1 条，实测 4 条，差额写在 ADR 的验证一节；
  E 把线接成空函数、F 接到别的 setter 上，都单独红在接线那一条）。
  **真浏览器断线那一格已拿到（2026-10-07）**：CDP `emulateNetworkConditions({offline:true})` 打断不了
  已建立的 SSE（30 秒里 `data-realtime` 一直是 `open`），所以断线用唯一诚实的办法制造——**服务端自己关流**：
  `/api/realtime` 增加显式 env 才生效的最长连接寿命（`NEXUS_REALTIME_MAX_LIFETIME_MS`，默认 0 = 不限，
  生产不变），到点走同一个 `cleanup`（退订 + 停心跳 + 释放名额）再关流，客户端看到的就是一次真断线
  （流结束 → error → 浏览器自动重连 → onReconnect）。
  `@smoke §163 断线重开`（14.2s live 过）：两条凭证都在网络层，不赌 DOM 状态的闪烁（connecting 只存在
  几十毫秒）——`/api/realtime` 请求数 ≥ 2（首连 + 重连，请求计数必须先于 goto 注册：EventSource 的
  GET 在连接"可见地 open"之前 ~300ms 就发出，注册晚了会漏掉首连——第一次跑就是这么红的）；
  `/api/notifications` 的下一次请求（没有访客互动也没有事件进来，它只能来自 onReconnect 的重读）。
  截图 `realtime-reconnect.png`。
- [x] 通知中心（§164）— 收件箱与真事件已在上面 M6 那条落地；原文点名的**四类到今天全部有来源**。
  Generation complete 2026-09-25 落地，Agent task complete **2026-09-29 落地**
  （§112 的多步编排有了执行方，见文件末尾那一节），
  最后一类 **Build complete 2026-10-01 落地**（§144 的导出就是那个"会走完的构建动作"，见文末那一节）。
  以前这里写着"等 §162 的队列消费者落地时一起补"——那句话要改口两次：消费者 2026-09-26 就落地了，
  而 Agent task complete 要的**不是**消费者：一个异步作业还是一次 provider 调用，worker 不会执行 plan 里的子任务；
  要的是 §112 那份计划真的被分步跑完（谁在什么时候做什么、做完留下什么）。
  这条单子最后卡住的那一句是"Build complete 要的是会完成的构建操作（今天没有导出 / 打包端点）"——
  它同时是**两个**欠账的同一个根：§164 的第四类通知，和 §144 NO LOCK-IN 的导出。
  导出接上之后两件一起结清；导出成功但缺资产时那条通知按 `warning` 发而不是 `success`
  （默默少几个文件比明说少几个更糟，§159）。
  **披露面走样已修（2026-10-06，任务 #94）**：收件箱页以前用一份手写的四条清单描述"会通知的"，
  登记已经长到十类，于是页面在说谎。现在那一列从 `lib/notify-plan.ts` 的 `NOTIFICATION_TERMINAL_STATE` 现算，
  一行一类；`apps/web/test/notify-producers.test.ts` 第 4 条结构门钉住"表键 = 注册表键 + 每类一句非空终态 + 页面不再手写名单"。
  e2e `@smoke §164` 也加了断言：`[data-notification-backing]` 恰好 10 行。
  同一 commit 里 `e2e/studio.spec.ts` 还有另一个会话的 65 行未提交改动，所以这 4 行没进本次提交——
  下次该会话提交时会一并带上。
- [x] Agent 任务账本（§112 的地基 + §164 的 Generation complete）— **2026-09-25 落地**：
  `agent_tasks` 这张表从建库起就有完整结构却**全库没有一处写它**，所以"Agent task / Generation complete"
  两类通知一直只能挂在收件箱的"没有来源"清单上。现在 `/api/ai/run` 每次请求开始落一行 `running`、
  结束落 `succeeded` / `failed`（失败也留行，带那句原因；没给原因时用兜底文案而不是留空），
  跑完就发一条 `generation` 通知——**同一任务重复发只留一条**（dedupe 挂在 `generation:<taskId>` 上）。
  能力那一列分开记 `real` / `demo`：标题写成"一次 DEMO 模板生成完成"而不是"生成完成"，
  否则看账本的人分不清这条结果是模型给的还是模板给的（§160）。
  `/tasks/<项目>` 是这本账的视图，页面上明说边界：今天每行都对应**一次同步请求**，
  §112 那种跨步骤任务（Goal → 子任务 → 依赖 → 验收）还没有执行方。
  任务号走响应头 `x-nexus-task` 而不是塞进 `AiResponse`——那是 web ↔ ai-service 的契约报文，
  不该被 web 侧的账本字段污染。枚举里成功那一档叫 `succeeded`（0000 建库时定的），不是 `completed`。
  验证：`agent-tasks.integration.test.ts` 5 条（含"不存在的 id 不会被说成改好了"、
  "别人的项目连任务数都不给"、FK 真的在挡不存在的项目）+ `notify-plan.test.ts` 新增 5 条纯规则
  （真模型与 DEMO 的标题必须不同、没有时长就不写用时、没有摘要就不编正文）+
  `@smoke §164` 末尾跑一次真请求，断言账本一行、通知第 5 条、"Generation complete 已从没有来源那张单子上摘掉"
  （截图 `agent-task-ledger.png`）。
   取消 / 重试**已于 2026-10-09 补上**（`attempt` 有了第二次的写入方，见下面「§162 取消与重试」那一条）；
   审批流当时记的是"`requires_approval` 全库无人置真"，
  **同日已经补上**（见上面 §74 agent 侧那一条），但那一格只接在同步的 `/api/ai/run` 上；
  接到 §162 异步队列那一条也**同日已经补上**（见下面 §162 × §74 那一条）——
  异步那一路现在同样先过门再交回，所以这一行不需要再等"以后"。
- [~] 作业队列的 web 侧消费者（§162 第一片）— **2026-09-26 落地后端到端的一条回路**：
  ai-service 早就有真队列（`POST /v1/ai/jobs` 入队、asyncio worker 执行、`GET /v1/ai/jobs/<id>` 读状态，
  由 `apps/ai-service/tests/test_jobs.py` 9 条钉着），缺的是 web 从来不曾提交给它、也没读过它的状态——
  于是"作业会自己结束"这件事在平台这一侧不存在。现在：
  `POST /api/ai/jobs` 收同一份 `AiRequestSchema` 报文、走同一个服务端装配（§68 那条边界照旧，客户端上传整份文档仍 400），
  先落一行 `agent_tasks` 再入队，拿到 jobId 就写进 `provider_job_id`（0013，带部分唯一索引：
  两行认领同一个 job 就会把同一批活动推两遍）；**入队没成功就把那行立刻结掉**，不停在 running。
  `GET /api/ai/jobs/<jobId>` 每次现场去问（web 只是镜像，不看缓存），然后把观察到的东西落进账本：
  终态才写终态、`completed` 且 provider 带着 `error` 记 failed、作业在那一侧查不到才落成 failed 并写明原因、
  问不到（非 404）时一行都不动。通知靠 `generation:<taskId>` 的幂等键兜住，两个标签页同时轮询只有一条。
  §163 的 `agent.step` / `agent.activity` 从此有了**第一个生产者**：worker 记的活动按 `activity_cursor`
  推进，`info` 那一档走 `agent.activity`（`agent.step` 的枚举里没有它，硬塞就是在界面上编出一条不存在的过程）。
  进度仍然不许编：worker 从不设 `progress`（单次 LLM 调用没有可观测的中间态），界面拿到的是 null 加一句说明。
  验证：`ai-jobs.integration.test.ts` 11 条打真库 + 一台本地假 ai-service（按契约形状报状态）。
  两次反向实验各打中一句：把"completed 就是成功"改成不看 provider 的 `error` → 1 条红（红在 `taskStatus`，
  同一个用例下一步的反向对照——同样报文去掉 error 就记成功——保证这不是把判定改严了就算数）；
  把"已经终态就不再写"的守卫换掉 → 1 条红（同一份 completed 被问两次时 `finishedAt` 往后挪了 32ms）。
  **这一片没有把 §164 剩下的两类变成有来源**：一个异步作业还是一次 provider 调用，
  worker 不会执行 plan 里的子任务，所以 Build complete 与 Agent task complete 照旧挂在"没有来源"单子上。
  （**2026-09-29 更新**：后一类已经补上——§112 的多步编排有了执行方，见文件末尾那一节；Build complete 仍然没有来源。）
  **"终态由有人来问才收敛"是这一片的取舍而不是疏忽**，为什么不许 web 起后台轮询器写在
  `docs/adr/0011-job-convergence-on-read.md`；那句"没人问就一直停在在跑"是真的，别读成"后台会自己补上"。
  还欠：界面上提交异步作业的入口与那条 409 的验证——**同日已经补上**（见下面 §162 × §74 那一条）；
  跨实例的游标要靠 Redis 后端；真 ai-service + 真 worker 的端到端一条待补。
- [x] §162 × §74：异步作业的结果接上同一道审批门，Studio 有了真入口（2026-09-26）—
  上面那片记的两句欠账其实是一句链：**没有入口 → 没人来问 → 终态不收敛**。而当时就算有人问，
  拿到的也只是状态：`settle` 把 provider 那份完整结果换成一句摘要（`result.detail`）就完事，
  **补丁在 web 这一侧根本没出现过**——所以"异步那一路不认审批"不是漏了个 if，而是它连可拦的东西都没有。
  现在这条回路是闭的：
  - 作业 `completed` → `observeJob` 把 `status.result` 过**同一个** `gateResponse`（同一份
    `WEB_APPROVAL_POLICY`、同一个 `nodeNamer`；文档读不到时理由退回 op 里那个 id，而不是编一个"某个元素"），
    含高危动作就地 `holdForApproval`：**终态不写、通知也不发**（与 `/api/ai/run` 完全同一口径，
    一条"Generation complete"替一次没人决定的事签字就是 §164 要避免的假事件）。
  - 挂起时存进任务行的是 `{held, delivered, approvals, policy, heldOpCount}`。为什么连 `delivered` 也要存：
    轮询是"隔几秒再问一次"，那时文档可能已经变了，拿 `held` 重算会把理由里的名字换掉——
    用户被问过的那一句和现在看到的这一句必须是同一句。
  - `GET /api/ai/jobs/<jobId>` 的响应体从此有契约（新增 `AiJobObservationSchema`，出口 `safeParse`）：
    里面带 `approvals` 与**能交回的那一份** `response`。等待中给的是 `delivered`（补丁为空 + approval-required），
    批准后给完整结果（门点过头就不再拦第二次），放弃后什么都不给并说一句为什么。
  - Studio 的命令行多了一个"异步作业"勾选：提交换端点、其余共用同一段 `consume`——
    落地走同一条可撤销事务（§149/§150），审批卡片也只有一处实现。**多一个入口不该多一种审批口径**，
    这一句钉在测试里：异步那条路如果绕过门，`approve` 之前就能在报文里看到 `remove`。
  限度如实记下：DEMO MODE 下异步只能验到那句 409 拒收（平台的 DEMO 口径在 web 进程内，
  不让同一个"没配 key"在两条路上长出两种假结果），所以**异步落地补丁这一段在浏览器里还没有真验过**，
  它验的是集成层（假 ai-service 按契约报状态）；等满 3 分钟没结束说的是"还没结束"，不是"快好了"；
  `awaiting_approval` 的行仍然没有 TTL（2026-10-01 接上，见本页最后一条）；跨实例游标仍靠 Redis 后端（未做）；真 worker 端到端仍欠。
  验证：`ai-jobs.integration.test.ts` 17 条（新增 6 条打真库：remove 挂起 + 通知零条 + 库里那一份完整、
  反向对照同一份报文换个非破坏 op 就一路到底、批准后报文里 op 回来了、放弃后什么都不回来、
  同一次挂起被问两次给的是同一份 `delivered`、文档里查不到的 id 理由退回那个 id 而照样拦）。
  两次行为性变异：把 `settle` 里那个 if 关掉 → **5 条红 1 条绿**，而那条绿正是反向对照（它本来就不该红）；
  把等待中交回的 `delivered` 换成 `held`（= 把补丁漏给还没批准的客户端）→ 2 条红。
   e2e `@smoke §162 异步作业入口` 在真浏览器里 1 条通过（4.9 分钟，慢的是 dev 模式首次编译那两条路由，
   不是断言在等）：截图 `screenshots/ai-async-refused.png` 上勾着"异步作业"、红字是服务端那句 409 原文、
   右侧仍是「1440 × 900 · 8 个节点」——**没有多出一条"在跑的作业"，也没有审批卡**。
   （**2026-10-09 更新**：a1c2f1f 的 DEMO 队列入口让那句 409 不复存在，这条 e2e 自那天起一直红，
   现已整条重写成四段真链路，见下面「§162 取消与重试」那一条。）
   `npm run test:ai-service` 56 passed + 1 skipped（那道跨语言的 `DESTRUCTIVE_OPS` 比对读的是 web 源码，
   这次动了 `approvals.ts` 所以必须重跑）。下面那片接上名册之后，同一个命令是 62 passed + 1 skipped。
- [x] §162 取消与重试：队列先受理、账本后 CAS，重试开新行（2026-10-09）— 详见 `docs/adr/0032-ai-job-cancel-retry.md`。
  动手前先补了同一个 §162 留下的真值洞：`demo_job_` 前缀的观察此前一律去问 ai-service → 404 →
  任务行被错落成 failed（或没有 URL 时永远 running）；现在真值在哪个进程就问哪个进程
  （web 进程内存的 `getDemoJob` + `demoStatusOf`，形状仍是同一份 `AiJobStatusResponse`），
  DEMO worker 的终态口径与 ai-service `jobs.py` 对齐（provider 回 error → job `failed`、error 原样落账）。
  - **取消**：`POST /api/ai/jobs/<jobId>/cancel`（csrf + 限速 30/10min）。**队列先受理、账本后 CAS**——
    标志没立上就先写行，worker 照样会把结果生出来，那时行是 cancelled、算力却花了。
    200 = 受理而不是已停止（jobStatus 可能仍是 running，检查点落账前它就是 running）；
    404 陌生人/查不到、409 行已终态/等审批/队列已终态/行刚好被改、503 队列问不到且**账本一字不动**
    （不能先把行说成取消、结果却可能还会完成）；行已 cancelled 再点一次照样 200（幂等）。
    用户主动取消不发通知不扣点，审计记 `ai.job.cancel`。DEMO 侧排队中的当场落账
    （claim 只认 queued，状态一改自然跳过），运行中立标志、worker 三个检查点
    （领取后/生成前/结果落地前）看见就丢弃——已经算出来的补丁也按取消丢弃，`response` 永远 null。
  - **重试**：`POST /api/ai/tasks/<taskId>/retry`（csrf + 限速 20/10min），四道门：
    404 / 409 非异步行 / 409 只允许 failed·cancelled / 409 老行没有存 `input.request`（诚实回"重试不了"，不猜）。
    门过了才落**新行**：`attempt = 上一行 + 1`、`input.retryOf` 把两行接起来，旧行一个字不动；
    新行走与 `POST /api/ai/jobs` 同一条共享管线 `submitClientRequest`——两条入口不许长出两套提交语义。
  - **界面**：命令栏的取消按钮只挂在"有作业号 + 还在等 + 取消还没受理"的窗口里（终态后再点只会得到 409）；
    状态行把"取消已受理"与观察到的"已取消"分成两句话，先后顺序钉进 e2e；任务列表挂"重试"
    （只对自己的 failed/cancelled 行出现），点了开 `attempt=2` 的新行、旧行还在表里。
  - 契约：`AiJobStatus` 枚举 += `cancelled`，`AiJobBackend` += `demo-memory`（`npm run contract:export` 已跑）；
    ai-service 侧 `POST /v1/ai/jobs/<id>/cancel` 同口径（404/409/200 幂等、queued 当场 cancelled、
    running 只立标志），`test_jobs.py` 随 `npm run test:ai-service` 77 passed。
  - 验证：`ai-jobs.integration.test.ts` 23 → **41 条**（取消 9 + 重试四道门 5 + 重试落账 2 + DEMO 观察 2；
    其中"取消之后观察"那条钉 outcome 与行 error 都是「取消受理」那句话、活动一条不许多发）；
    全量 vitest 1552 绿（顺带修掉 jsx-text 抓到的 `**新行**` 漏进 JSX 文案一处）；
    e2e `@smoke §162` **整条重写**并连跑两次绿（旧版钉的是 a1c2f1f 之前那句 409，
    那句话当天起就不存在了，测试一直红到现在）——现在钉四段真链路：①DEMO 队列提交
    （状态行带 demo-memory、取消按钮在窗口里）→ ②同一句"删除 Hero 区块"异步照样被扣成审批卡、
    放弃后"删除也没有发生" → ③提交后立刻取消：先"取消已受理"、下一次轮询再"这次作业已经取消"，
    卡片/错误/画布改动三样都不许出现 → ④任务列表里 cancelled 行挂重试，点了开 `attempt=2` 的新行。
    截图 `ai-async-queued/approval-held/cancelled.png`、`ai-tasks-cancelled.png`、`ai-task-retry.png`。
  - 调试中钉死的两个真 bug（都不在原计划里）：StrictMode 的 effect 清理会把 `pollStop` 拨真而挂载侧
    不再拨回，轮询没开始就被上一轮清理判死刑（误报"等了 3 分钟"）——挂载时必须复位；
    dev server 首次命中 `[jobId]/cancel` 要现场编译，那一两秒会把"受理"拖到第一次观察落账之后
    （200 变 409）——e2e 开跑时先预热一次，且 DEMO 作业两段等待刻意拉长到 2.2~3.4 秒，
    让取消窗口先于任何终态收敛（受理在先是语义，不是抢跑）。
  - 仍然没有测到：真 provider 下的异步取消（要一台接上 key 的 ai-service + worker）；
    Redis 队列后端（跨实例游标、进程内存重启即失这一点照旧写在报文 `backend` 里）。
- [x] #10 账本实时：每一条任务状态写出都出声，账本页不刷新自己变（2026-10-09）—
  事件用的是 `packages/schemas` 里早就有、却一直没有写入方的 `generation.progress`
  （`RealtimeEventSchema` 那个 union，ADR-0010/0029 的"事件只是加速器、权威永远是库"口径）。
  - **服务端补三条发出**（此前只有 start/finish/cancel 三处，挂起/裁决/过期三处落账无声）：
    `holdForApproval` 推「等审批：结果被扣下，等一次决定」（progress=1 与 finishTask 失败、
    cancelTask 同一口径：这一轮生成到头了，等待中的真实状态由库里的 status 说了算）；
    `decideApproval` 在 CAS 赢家之后推「已批准：补丁已交回画布」/「已放弃：补丁没有落地」
    （`not_pending` 早退一条都不推）；`convergeExpiredApproval` CAS 赢家在 `notifyApprovalExpired`
    之后推 `APPROVAL_EXPIRED_NOTE`。至此任务状态的六处写出方一一对应一条 `generation.progress`。
  - **账本复活**：`lib/tasksLedger.ts` 那份休眠契约（`app/api/projects/[projectId]/tasks/` 目录一直是空的，
    注释写着"要活起来得先有一个客户端消费者"）挂上了真的消费者——`GET` 路由按既有模式
    `requireUser → listProjectTasks → null 落 404 → TasksLedgerSchema.safeParse（不过就 500）→ apiJson`；
    契约补 `mine: z.boolean().optional()`（重试按钮只对自己的 failed/cancelled 行出现这件事，
    客户端从此读得出来），`readTasksLedger` 的 fetcher 可注入，失败措辞「HTTP 404」/「返回的报文不合契约」/ error.message。
  - **页面**：`/tasks/[projectId]` 退成薄 server shell（鉴权 + 初读 + `<TasksLedgerLive>`），
    组件承担表头摘要、`data-tasks-realtime` 状态芯片、`text-danger` 的读失败注记与整张表。
    订阅面刻意窄：只认 `type === 'generation.progress' && projectId` 对得上的事件，
    收到就 250ms 合并地重读一次，`onReconnect` 补一次；没有 ledger 侧的观察触发（收敛仍按
    ADR-0011 on-read，convergence 是收敛不是观察）。状态文案单源 `REALTIME_TEXT`
    （`lib/useRealtime.ts`），CommandBar 的本地 map 与 NotificationBell 的三元都换成同一份。
  - 探针各一次，都按预期变红再 revert：摘掉组件里那句 `schedule()` → e2e 红
    （账本停在「还没有跑过一次」，等不到「在跑」）；摘掉 `holdForApproval` 的
    `publishTaskProgress` → `realtime.integration.test.ts` 红（hits 0 ≠ 1）。
  - 验证：`realtime.integration.test.ts` 新 describe **4 条**（挂起 / 裁决两分支 / 过期，
    假 bus + 真库；CAS 输家一条都不推这条钉死）；新 `tasks-ledger.test.ts` **11 条**纯读契约
    （三条失败措辞、`cache: 'no-store'`、`mine` 契约、状态标签单源）；新 `tasks-ledger.integration.test.ts`
    **2 条**打真库（形状过 `TasksLedgerSchema`、陌生人的 `mine` 一律 false）；
    全量 vitest 137 个文件绿；`npm run lint`（typecheck + eslint）绿。
    e2e `@smoke #10` 与 §162 连跑绿（账本页薄化后 §162 那条没坏）：第二个标签页开账本 +
    预热一次读 + 计数 + 提交异步 + 不刷新看见 `在跑`→`完成` + 4 秒稳态 + 库里 succeeded 数与
    DOM 对账 + 陌生人 404；截图 `screenshots/tasks-ledger-live.png`（表头芯片 `实时：已连接`、
    摘要 `共 N 行 · 完成 N`、一行 succeeded）。
   - 仍然没有测到：真 provider 下的进度（要一台接上 key 的 ai-service + worker）。
     （`onReconnect` 的补读已于 2026-10-10 补上探针：`realtime-reconnect.test.ts` 的接线组
     多两条源码判据；真断线在浏览器里仍造不出来，那条限度照实留着。）
- [x] Agent 名册有写入方、@提及解析生效、`design.patch` 有第一个执行方（§112/§113 第一片，2026-09-26）—
  上面 §111 那条记的"`@Agent` 提及解析才是真欠的那一条"到这里接上了，但要先说清动手前的三个对不上账：
  `agents` 表建库以来**没有写入方也没有读取方**；`docs/AGENTS.md` 声称的 `agents/registry.py` 与 `AgentSpec`
  **全仓库不存在**（而 ai-service 按架构纪律 3 根本不连业务库，读不到名册）；`agent_tasks.agent_key`
  一直是**意图**（`design-edit` / `research`）冒充的别名。所以"接名册"如果只做成界面上显示"这一轮由谁负责"，
  把 `@qa` 换成 `@design` 落地的补丁一模一样——那是 §159 要避免的"看起来能用"。
  - **名册**：`scripts/db-seed.mts` 是唯一写入方（13 行幂等 upsert，含 §112 那几条职责原文），
    读取方是新文件 `server/domain/agents.ts`（`loadRoster` / `findAgent` / `resolveAgent`）。
    迁移 `0014` 加 `responsibilities text[]`。`tools/model_class/max_steps/output` 那四列**今天没有读取方**，
    这句话同时写在种子脚本头注释与 `docs/AGENTS.md` 里，不假装权限生效。
  - **解析**：优先级是"请求里显式提名 > 提示词里的 `@xxx` > 批注正文里的 `@xxx`"，三处都没有 → null，
    按原来的 intent 路径走，**不硬塞一个 Design Agent 当默认值**。点错的原样报回 `@fy`（不猜最像的那个）、
    点了不止一个的其余进 `ignored`、名册空的单独一句（"还没跑 `npm run db:seed`"），
    三种说法由 `mentionNote` 在服务端拼一处：同步走响应头 `x-nexus-agent-note`，异步走观察报文的 `notes`。
    客户端上传 `agent`（自报职责与权限）一律 `400 agent_not_allowed`——与 §74 的 `approvalPolicy`、
    §68 的 `document` 是同一条边界：让请求方自报职责等于让它自己写"我可以改画布"。
  - **§112 那半句要真的走到模型**：职责与 capabilities 随 `AiRequest.agent` 发出，
    ai-service 的 `_agent_note` 把它拼进系统提示（含"没有 design.patch 就 patches 留空"），
    DEMO mock 侧则是活动流第一行与计划里那个 agent 名字。名册留在库里而不是代码里，就是为了这两处读同一份。
  - **§73 的执行点**放在 `gateResponse`（同步 `deliver` 与异步 `settle()` 共用的那一个函数）：
    被点名的那位没有 `design.patch` 而结果里有 op（任何 op，不只是删除）→ **拒收而不是挂起**：
    `patches` 抽走、`error.code=permission-denied`、`approvals` 保持空、行落 `failed`、
    审计写一条 `ai.agent.capability` / `allowed:false`。为什么不复用挂起、为什么门读 `input.agent`
    而不是 `agent_key`（`research` 既是意图又是名册 key，读错那一栏会让一次没人点名的
    research 请求突然按 Research Agent 的权限被拒），都写在 `docs/adr/0013-…`。
  - **界面**：Studio 命令行多一个名册下拉（读 `GET /api/ai/agents`），选中的一位如果不在名册的
    `design.patch` 名单上，输入框下方那一句就写明"这一位不能改画布"；被拒的结果在审批卡片之外回执一句，
    而"这一轮是谁"始终跟着账本（`x-nexus-agent` 头 / 观察报文的 `agent`）。
  限度如实记下：**每一次越权仍然白跑一次 provider 调用**（提示词是提前告知，不是拦截；
  真提前拦法要在请求阶段按 op 数预拒，而那一步今天还不知道会不会有 op）；
  `resolveAgent` 只解析**一个**负责人，§113 的 handoff 链与多 Agent 调度**还没有实现**，
  所以"这一轮由谁负责"目前是一个标签加一份权限，还不是编排；名册生效前提是已播种。
  验证：`agents.test.ts` 17 条纯单测（解析优先级、去重、`a@b.com` 与 `someone@design.com` 不算提及、
    空名册、`mentionNote` 各分支）；`agents.integration.test.ts` 9 条打真库（13 行职责非空、
    `design` 有 `design.patch` 而 `qa` 没有、自报 `agent` 被 400、`@qa` 解析出库里那一份职责与权限、
    批注正文点名能解析、DEMO 报文里计划行写 QA Agent 且活动带职责）；
    `ai-approvals.integration.test.ts` 新增 7 条（拒收 ≠ 挂起、`set` 也算越权、QA 只提意见不拒、
    Design 的删除仍走 §74、没点名不拒、措辞改写、真路径落 `failed` 且不进待批列表）；
    `ai-jobs.integration.test.ts` 22 条（异步那一路同形）；python 侧 `test_prompt.py` 18 条（新增 6 条：
    职责进提示、没有作用域时提示留空 patches、没点名不编一个 Agent、空职责说"没有写"、
    `agent` 不是对象时按没点名处理、整条 HTTP 路跑到 provider 手上）。
  行为性变异三次：`gateResponse` 的 `opCount > 0` 改成 `> 999`（= 拒收从不触发）→ 45 例里 **6 条红**，
    同步与异步两条路都抓得到；`mentionsIn` 的 `match[1]` 改成 `match[2]` → **8/17 红**
    （这一条 TS 不红，`noUncheckedIndexedAccess` 让两种下标都合法，而每一次 @提及都会静默失效）；
    `recordCapabilityRefusal` 里那处 `missing,` 简写错引（值在 `input` 上）在跑测试时抛
    `ReferenceError` → 3 条红——**那次 `tsc` 是 exit 0 的**，红是测试给的。三次各自 revert 后跑对照全绿。
  全量回归（这片做完顺手补的一笔欠账，`npx vitest run --no-file-parallelism`）：80 个文件 / 875 例，
  **872 绿、3 红，三条红的都在 `branches.integration.test.ts` 且与本片无关**——
  一条是"分支切换偶发噪音快照"（M6 挂着的那笔诊断**又命中了一次**，现象与上次一致：内容没变却多出一条
  "切到「design-v2」前的现场"），另两条是 30 秒超时；**同一个文件单独跑 9 条全绿**（29.5 秒，最慢那条贴着超时线），
  所以那两条按负载超时记、不按缺陷记。噪音快照这一笔的欠账现在更明确了：诊断（为什么存这一条）已经写在
  快照自己的 `summary` 里，但测试把带诊断的那句断言排在第三条，命中时先在第 1 条上红了、诊断没打印出来——
  **同日结案**：诊断顺序已挪到第一条，根因（token 数组没有确定的读取顺序）写在下面那条 #40 结案记录里。
- [x] §169 Creator Analytics Agent 第一片：「为什么我的项目没人看？」有了一份读得懂的答案（2026-09-26）—
  **这是一份规则分析，没有调用任何模型**，界面上那一行小字就是这么写的。理由与 §159 同一条：
  接上 provider 之后可以再把同一份事实交给模型改措辞，但今天这条路上没有任何模型参与，
  把它叫"Agent 分析"就是假 AI。
  - `server/domain/analytics-agent.ts`：`analyzeCreatorFacts(fact)` 是纯函数（所有输入都在 `CreatorFact` 里，
    连"发布多少天"都由调用方算好传入，测试才钉得住边界），`buildCreatorFact(projectId, ownerId)` 负责装配——
    项目行的名字与简介、发布行的可见性与审核状态、钉住的快照里"有没有真被画到的图片资产"（复用 §166 的
    `documentReferencesAsset` 判定，不另写一份），以及 §168 那六个数**原样**（含 `null` 与 `selfOnly`）。
  - `/analytics?project=<id>` 渲染那一串发现，每条都是"看到的事实 / 结论 / 建议"三段；
    列表页每行多一个「为什么没人看？」入口。**不给整张列表按行读库**：那份列表的查询纪律是"一次分组查询服务整页"，
    所以分析按 `?project=` 逐件做。
  - 三条口径纪律，都是这一片最容易编错的地方：
    ① **先问能不能被看到**，再问留不留得住人；
    ② `selfOnly` 为真时说"这串数字只证明作者自己打开过"，**既不说"零访客"也不说"有人在看"**；
    ③ 审核状态分两档说话——今天全平台搜索只挡 `rejected`（`search.ts` 那句谓词就是依据），
    所以 `pending` / `review` 不能被讲成"被惩罚、进不了发现页"，那条建议明说"这不是没人看的直接原因"。
    把"还没裁决"讲成"被挡在门外"，是这类工具最顺手的一种谎。
  - 零访客那条按天数分两种结论：≥7 天说"问题在没被看到"，刚发布说"现在下结论太早"——同一件事的两种口径，
    不是两条规则。完成度/时长为 `null` 时说"没采到"，不拿 `views` 换算一个顶上（与 §168 同一口径）。
  - 归属：别人的项目、不存在的项目（含形状不对的 id——不校验就会让 Postgres 抛 22P02 变成 500）、
    没发布过的项目、软删的项目，四种都是同一个 `null`，界面上一句"读不到这个项目的发布记录"。
  验证：`analytics-agent.test.ts` 19 条纯单测（含"什么都齐的作品应当零条发现"这条反向对照，
  以及"每条发现三个字段都不许空着"）；`analytics-agent.integration.test.ts` 4 条打真库
  （真发布 + 真访客行，断言装配出来的数与 §168 读到的一致、四种拿不到答案的情形同一个 `null`）。
  行为性变异：把 `selfOnly` 那一支改成永不成立 → **2 条红**（单元与集成各一条，两边都指着同一句谎），
  revert 后 20 条全绿。
  限度如实记下：`hasCoverImage` 两条路径都测过（真被画到 → 算封面；资产在库里但这一版没画到 → 不算，
  与 §57/§166 同一口径）；
  ~~按天曲线~~、游戏侧 completion 事件这两件仍是 §168 记着的欠账，这一片没有替它们说话；
  **按天曲线已在 2026-09-30 落地**（见文末「§168 第二片」）；**爬虫与真人区分已在 2026-10-16 落地**
  （第三片，见文末「§168 第三片」与 ADR-0043）；游戏侧 completion 事件仍欠。
  建议全部限于平台今天真支持的动作（改标题/写简介/放封面/改可见性/把链接发出去），没有"投放""买流量"。



**全量回归基线（2026-09-26 15:36）**：`npx vitest run --no-file-parallelism` = **84 个文件 / 910 条全绿，exit 0**。
这是自 §112 那一片以来第一次整套干净：上一轮全量是 872/875，那三条红的就是当天结案的两件事
（分支切换噪音快照的读取顺序、以及并行负载下贴着 30 秒线的两条超时）。
以后引用"测试全绿"时请带上这一条的口径：这一套**不含** e2e（`@smoke` 另跑，42 条）与 Python 侧
（`npm run test:ai-service`，62 passed + 1 skipped），三者都跑完才是这个仓库的完整门禁。
同一提交（`06c1ca3` 之后）另两样也跑过：`npx playwright test -g "@smoke"` **42/42 通过（4.8 分钟）**，
`npm run test:ai-service` 62 passed + 1 skipped。也就是说 SSR 首屏文档那次改动（`7a94988`）
当时只由 3 条相关 @smoke 覆盖，现在整套 e2e 也过了——那道"已知未覆盖"的验证缺口已经合上。

**§51 那一片之后的口径 correction（2026-09-26 深夜）**：@smoke 现在**不是 42 条**了——那一片新加了
`@smoke §51 类型分派`，总数到 43。上面两段引用的 42/42 是**它加入之前**的实测，不改写、不替 43 背书。
§51 那一片自己跑过的只有 3 条：新增的 `@smoke §51`（1 通过，1.1 分钟）与被碰过的 `@smoke §50` 两条
（2 通过，6.0 分钟）；**剩下 40 条在这之后没有整套跑过**，这套改动动了 schemas 与两个试玩页，
没跑完整套之前不许说"e2e 全绿"。

**这笔欠账已经还了（2026-09-26 深夜，§133/§134 那一片之后）**：`npx playwright test -g "@smoke"`
**44/44 通过，14.6 分钟，exit 0**（44 = 43 + 新加的 `@smoke §134`）。第一次跑是红的 7 条，
红的样子不像逻辑错：前 8 条里快照/分支/方案板全空、面板写着"快照操作未完成：HTTP 404"，
第 17 条干脆 `worker process exited unexpectedly (code=3221225794)`（= Chromium 栈溢出），
中间还夹一条 `[WebServer] Failed to find Server Action ... older or newer deployment`。
同一时刻这台机器刚跑完 88 个文件的整套单测（本机空闲内存约 2.5GB），用 curl 走同一条游客链路
（建项目 → 列快照）拿到的却是正常的 200 与那一行"初始版本"。把单测那一份负载拿掉重跑，44/44。
**所以这一条记的是口径不是结论**：@smoke 要与大套件错开跑，红一片且形状是"元素不存在"时先量环境再改代码。

## 当前阻塞项
- `[!]` 真实 AI provider key（文本/图像/视频）— 用户提供前，全部生成类能力以 DEMO MODE 交付，UI 明确标注，不伪装真实结果。

## 已知技术债（不伪装成已完成）
- ~~`Layout.gap / padding / cornerRadius` 类型是 `number`，但属性面板的 token 绑定会写入 `"{space.4}"` 这类字符串~~
  **已修（2026-09-23）**：三处几何字段放宽为 `LengthValue = number | TokenKey`（types.ts），与运行时真相一致。
  验证发现 widening 没让任何消费者报错——因为 layout/render/codegen 早就经 `resolveNum`/`TokenStore` 解析，
  类型谎报从没被编译检查覆盖到。真正被它掩盖的是一个语义 bug：`server/ai/mock.ts` 的「移动端优化」配方
  `Number(gap) || 16` 会把 token 引用静默 coerce 成 NaN→16，已改为「token 引用原样保留、仅字面数值做下限」。
  补 design-model 单测锁住 `{space.*}` 参与真实排布、缺 store 时回落有限值不产生 NaN。
  **边界（非缺陷，如实说明）**：Code → Design 反向同步（`code-parse.ts`）对 gap/padding/cornerRadius
  **刻意只认 px 字面量**——代码里把这些属性写成 `var(--nx-space-…)` 时，`parse` 会给出 note 提示
  「token 绑定请在画布上做」并**不产出补丁**，因此模型里已有的 token 绑定不会被改坏（不是"丢成数字"）。
  这与 `size` 走 `lengthOf` 能把 `var(--nx-space-8)` 反解回 `{space.8}` 是两条不同的策略：`size` 支持、
  gap/padding/radius 不支持，是有意为之的可逆/不可逆区域划分（§17-19），不是待补的 bug。
- ~~ESLint 目前只有 `npm run lint` = typecheck 的占位配置，缺真实规则集。~~ **已还（任务 #43）**：
  `npm run lint` = 七个 tsconfig 的 typecheck + `eslint .`（type-aware `projectService`，测试与 scripts 也在门禁里）。
- 两张表里有**只读不写**的列，别把"列存在"当成"功能存在"：
  1. ~~`projects.description` 没有任何写入方~~ **已还（任务 #50）**：`PATCH /api/projects/<id>` + 首页每行的简介编辑器。
     §165 的 `or(ilike(description,…))` 与 §166 的 `og:description` 第一级从此才有东西可命中——
     `project-meta.integration.test.ts` 里那条"写进去之前搜不到、写进去之后搜得到并且把简介当 detail 带出来"就是这条闭环的钉子。
     历史项目仍然是空的（不回填、不拿名字凑一句），SEO 那侧继续走第二级摘要。
  2. `projects.deleted_at` 同样全是读：13 处 `isNull(projects.deletedAt)` 外加 `publish.ts:246` 单独挡一次，
     但全库没有一处把项目标记为已删除——软删除链路本身没落地。§166 的 sitemap 谓词因此是**防御性**的：
     今天它永远为真，等软删上线时它已经在位（集成测试直接改库造那一行，并在注释里写明是手工造的）。
- 资产服务已落地（任务 #9c，§38/§80/§101/§182）：图片上传 → magic-bytes 判定 → 元数据剥离 → 对象存储 → 鉴权路由 →
  画布/预览/发布四条投影同源。仍欠的两笔如实记下：
  1. `stripImageMetadata` 只做**结构化剥离**（PNG/JPEG/WebP/GIF 的 EXIF/XMP/IPTC/注释段），没有重新编码/缩略图/有损统一化——
     SECURITY.md 期望的"重编码去元数据"要等 provider 层落地时替换本实现（见 `docs/SECURITY.md` 的资产小节与本文件说明）。
  2. 目前只接受位图，视频/音频/3D 显式拒绝；`DELETE /api/assets/[id]` 有服务端与集成测试，UI 入口已随
     Asset Library 面板补上（任务 #21，含 e2e：上传→清单可见→删除跨页剥引用→撤销恢复引用但字节已 404）。
  3. Visual DNA 提取（任务 #22）**只解 PNG**（8 bit、非隔行、五种滤镜）——JPEG/WebP 能上传入库、能上画布，
     但点「提取视觉语言」会拿到 415 和一句中文原因，不会给出半截结论。解 JPEG 需要 Huffman+色度上采样，
     在"零原生依赖 + ai-service 无 Pillow"的约束下自己写不划算；等 provider 层落地时由真视觉模型接管（同时补上
     §173 那些像素测不出来的形容词：Cinematic / Soft glass / Slow motion）。
- 认证已落地（任务 #9d，§137/§80）：bcrypt 口令哈希、会话轮换/吊销、双提交 CSRF、内存滑动窗口限流、就地升级认领 guest 项目。
  三笔债里 CSRF 已还清，另两笔如实记下，替换点各自单一（见 `docs/adr/0002-password-hashing-and-csrf.md`）：
  1. 口令用的是 SECURITY.md 允许的 **bcrypt 回落分支**，不是首选的 Argon2id（原生/wasm 包与"Windows 免编译 + 零原生依赖"冲突）。
     换 Argon2id 时改 `server/domain/password.ts` 两处函数即可，`verifyPassword` 已按前缀分派，旧 bcrypt 串仍可验证。
  2. ~~CSRF 双提交只在 auth 路由强制~~ **已还清**：`csrfOk` 现覆盖全部 mutation 路由（projects 建/存、snapshots、restore、
     branches、switch、duplicate、variants、merge、publish POST/DELETE、assets 上传/删除、ai/run）。客户端统一走 `src/lib/csrf.ts` 的
     `csrfHeaders()`（`AccountPanel` 内联实现已收敛）；`FormData` 上传只加头不设 `content-type`。15 条 @smoke 端到端 + 新增 `csrf-client.test.ts` 为回归证明。
  3. 限流是**单实例内存驱动**，多实例部署下退化为每实例独立计数（不是不限量，但仍挡不住跨实例分摊的慢速爆破）。
     生产接 Redis 有序集滑动窗口，保持 `RateLimiter` 接口不变即可替换。
- 历史面板的 Ctrl+Z 只在浏览器会话内，刷新即失；服务端快照与 Branch / Duplicate（§27/§28）已经打通。
  还缺的是 §29 的多方案 A-B-C 并排比较视图（分支线已经能承载多个方向），
  以及快照列表的「只看当前分支」筛选——现在仍按时间全量展示、每行标出所属分支。
- 主题 mode 的持久化债已还（迁移 `0001_theme_mode`：`projects.active_mode` / `modes` 两列，
  保存-重载与快照恢复都带得回 `document.activeMode`）。
- ~~起手页的圆角、间距是写死在节点上的数字（`cornerRadius: 10`、`padding.top: 64`），没绑到 `radius.*` /
  `space.*` token。后果具体可见：§29 的视觉语言只能换颜色与字体，"换一套圆角"这种旋钮做不了——
  做不了就别在 UI 上声称能做。~~
  **已还（2026-09-23，任务 #25）**：起手页、四个结构方向新增的区块、DEMO 配方生成的 section
  全部改成引用 `{space.*}` / `{radius.*}`（为此给默认栅格补了 `space.20=80` / `space.24=96`）。
  `ConceptLanguage` 多了 `geometry` 旋钮，四套语言各自给出圆角与间距刻度——
  cyber 的「直角」现在真的是 0px，warm 的「圆角」是 20px，不再只是形容词。
  配套三件：`lintDesign` 的 `hardcoded-style` 覆盖未绑 token 的非零 gap/padding/cornerRadius
  （0 是默认值不算硬编码）；`code-parse` 学会把 `var(--nx-space-6)` 反解回 `{space.6}`
  （只认 px 字面量会让 §19 的往返恒等在第一份起手页上就破，而认回**引用**才不会把绑定改写成常量）；
  DNA 的 `radius` / `spacingScale` 从落好 token 的文档里读，不再抄一份常量表。
  顺带修掉设计系统面板的一处说谎：输入框的草稿在提交后不清除，撤销/AI 改动之后面板仍显示旧数字——
  现在 blur 即丢草稿，屏幕上的读数与模型一致（§16）。
- 项目健康与 Quality Gate 已落地（任务 #23，§178/§179，见 `docs/adr/0005-health-score-and-gate.md`）。
  它"没做到"的部分是刻意留下的，逐条说清，免得下一个人把它当成全绿：
  1. **Performance 行是静态预算**（节点数、树深、位图字节、缺尺寸图片、动效数），不是 LCP/CLS 实测。
     `basis` 里明写了这句。要真测得在预览浏览器里打点，再把结果作为 options 传进 `analyzeHealth`。
  2. **Tests / AI QA 两行会一直是"未评估"**。前者需要项目自己的测试跑起来（平台自身的测试对用户的页面没有信号），
     后者需要真实模型评审内容——两者都不是"再写点代码就能补上"的空位，而是需要新能力。
     它们留在表里、以第三种状态出现，正是 §178 的价值：让人看见哪里没被检查过。
  3. **Security 行是模型内的正则级检查**（疑似明文凭据、code 节点危险写法、http 明文外链），
     不是漏洞扫描，也不覆盖生成代码在沙箱内的行为（那是 §81-83 的隔离执行线）。
     凭据类发现只报节点与字段路径，绝不把命中的内容抄进报告。
  4. **阈值是工程判断不是标准**：80/70/60 只写在 `HEALTH_THRESHOLDS` 一处，Build/Security 按"有无 error"判。
     改线必须同时改 `health.test.ts` 里门槛两侧（82 通过 / 76 挡住）的断言。
  5. 健康度按整份文档算（每页解析一次排版），Studio 里每次改动都重算。8 节点的起手页无感，
     几百节点之后需要增量或缓存——`analyzeHealth` 已经接受外部传入 `layouts`，就是为了那一天。
  6. 几何类发现（越出画布、零尺寸、点击目标）依赖该页能排版成功；结构坏掉的页面会跳过排版，
     问题由 Build 行负责报出来，不会静默消失。
- 代码投影（`codegen.ts`）与画布一样只覆盖几何/样式/文字：`typography.runs`、`animation`、`interactions`、
  `bindings` 都还没实现——渲染层也没有，所以两边一致地缺失，不是生成器单独偷懒。
  （`states` 已于 2026-10-24 补齐四处投影，见文末 §124 一节与 ADR-0062。）
- 生成的页面组件之间没有共享组件抽取：`component`/`instance` 节点会被展开成内联子树，
  等 §13 组件系统的实例语义稳定后再收敛成 `<Component />` 引用。
- **未定位的偶发（不伪装成已修）**：`branches.integration.test.ts` 的「内容没变时反复切换不会堆噪音快照」
  整套并行时约 8 次失败 1 次。名字已经抓准：多出来的是 `切到「design-v2」前的现场`，即从 main 切走时
  `stashCurrent` 认为"工作稿 ≠ main 的 head"；而单独跑同样三步（建项目 → 开分支 → 来回切）是干净的：
  两条 head 都在、`documentsMatch` 两次都为 true、只留两条"切换到"。
  怀疑点因此收窄成一句：**switchBranch 恢复进工作区的文档，是否有时与它自己的 head 快照不逐字段相等**
  （真相等就不该 stash）。下一步是在那条判 false 的分支上把差异打出来（哪个 page / token / 节点不同）。
  期间没有放宽断言、没加重试——噪音快照正是这条测试要抓的东西（另见 `docs/TESTING.md` 已知偶发）。
  **2026-09-25 又中一次**（全量 67 文件 / 723 测试，唯一红的就是它；单独重跑 `branches.integration.test.ts`
  8/8 干净）。到这次为止的复现率是"整套并行约 9 次里中 2 次"，且两次都发生在加了新纯单测文件的运行里
  ——与本片（game-model）没有任何共享代码，这条只是又一次"并行时中、单独跑不中"的证据，不是新增因。
  **同日把调查变成常驻诊断**：连着跑 5 次（2 次全量 + 3 次相关子集）都没再命中，探针打出来的
  两次都是真差异（`added 原稿标记` / `added v1 的方向`，即"改了再切"的合法 stash），
  也就是说继续靠复现去抓不划算。现在 `stashCurrent` 每次写那条"前的现场"都把**为什么**写进快照自己的
  `summary`（"与「X」的差异：added 某节点" 或 "离开的分支没有可读的 head 快照"），
  下一次真噪音出现时历史列表里就带着原因，而不是留一行只有时间的谜。
  新增一条测试钉住这个诊断（并配反向对照：内容一样时根本不写这一条）。
- **噪音快照已定位并修掉（2026-09-26，#40 结案）**：根因不在比较逻辑，在**读取顺序**。
  `design_tokens` 从建库起没有一列记录"文档里的顺序"，而 `loadDocument` 读它用的是**一句没有 ORDER BY 的 SELECT**：
  返回顺序由物理行序决定。`saveDocument` 又是 delete + 按文档顺序 insert，于是同一份内容每过一轮存取，
  token 数组都可能重排一次——`documentsMatch` 对数组是**按序**比的（`stableKey` 只重排对象键，不重排数组），
  所以"内容没变的切换"会被判成有改动，`stashCurrent` 就写出那条"切到 X 前的现场"。
  这解释了它为什么只在整套并行时中（行序受 churn 影响）、为什么单独跑干净、为什么 `diffDocuments` 说不出差在哪。
  修法是把顺序变成模型里存得下来的东西：迁移 `0015` 给 `design_tokens` 加 `sort_index`，
  `saveDocument` 写入文档里的位置，`loadDocument` 按 `(sort_index, key)` 读；
  同一处顺带把 `pages`（原来 `sortIndex` 有并列时同样不定序）、`components`、`design_nodes` 都补上确定的 ORDER BY。
  验证：`projects.integration.test.ts` 新增一条"token 顺序穿过一次存取不变"，
  它自带反向对照——把**这个项目**那一列抹平成同一个值后，读回来的顺序必须变成字母序且不再等于文档那一份
  （否则这条绿只能证明"postgres 恰好按插入顺序返回"）；
  `branches.integration.test.ts` 新增探针：切换后立刻断言"工作区那一份 == 这一分支 head 那一份"，
  然后一次编辑都不做、来回切 8 次，要求噪音 0 条而"切换到"恰好 16 条。
  变异两次各自被抓：`sortIndex: index` 写成 `0` → 红在"等于 wanted"那条；去掉 token 查询的 ORDER BY →
  红在反向对照那条（`degraded` 竟然等于 `wanted`）。两次都只红这一条测试，其余 10 条不受影响。
  顺序从此是**确定的**，所以界面也重跑了一遍：`npx playwright test -g "@smoke"` 42/42 通过（7.6 分钟），
  含设计系统面板、历史/分支、发布与实时那几条读文档的用例——它们以前读的是一份顺序会自己变的列表。
  同一笔的第二次命中（今天全量那次）还暴露了诊断本身的缺陷：带证据的那句断言排在第三条，
  命中时先在第 1 条上红了、诊断一个字都没打印——已把分支头与那条快照自己的 `summary` 移进第一条断言。
- **§147 只赢了一半 → 第二片已落地（2026-09-26，图层面板窗口化）**：画布视口裁剪把 1000 / 4000 节点档的画布 DOM
  从 1000 / 4000 降到 18 个，pan 平移的 p95 从 139–176ms 降到 115–127ms，**但 >33ms 的掉帧数一点没变（40 / 235）**；
  而 4000 节点那一档首帧当时仍然量不到（等 180 秒画不出第一个节点），同一档图层树列出 3999 行。
  当时的结论是"整份文档铺成 DOM 的地方不止画布"，这一片就是照那句做的：图层树先展开成一维
  （`src/studio/layers-flat.ts`，显式栈、语义与改造前的递归逐字对齐），面板只渲染看得见的那一段
  （固定行高 24px + overscan 6，绝对定位）。**同一台机器、同一脚本重量的结果**：
  4000 节点档首帧从"180 秒量不到"变成 **1514.9ms**（两次 1689.9 / 1339.9），
  图层树展开 3999 行而 DOM 只有 **39 行**，画布 DOM 仍是 34 个，
  pan 平移 p95 **18.2ms**、>33ms 的帧 **0/262**（改造前那一档是 235 帧掉帧）；
  1000 节点档同样从"图层树 999 行 DOM"变成 999 展开 / 39 DOM。
  仍然挂着的两句，别跟着一起划掉：
  ① **属性写入 → 画布更新在 4000 节点那一档是 1313.6ms**（起手 8 节点 22.4ms）。
  这一句先前写的是"每次改动都把整份文档重算/重存一遍的那条路径"——**那句推断已被实测否掉**：
  这个探针量的是页内的"写属性 → 画布重绘"，而自动保存有 1800ms 防抖，网络那一趟根本不在这个窗口里。
  顺手把保存响应里"读回整份文档再序列化发出去"那一块去掉了（客户端从来不读它，只读 `ok` 与 `savedAt`），
  重量之后同一档是 1313.6ms 对 1353.5ms——**在噪声内，所以它不是这 1.3 秒的来源**，
  那次删除只是"少做一份没人要的工作"，不记成性能修复。
  这 1.3 秒**现在量出分布了**（探针加了两个分点：input 之后到第一帧隔多久、期间有没有长任务）：
  三次分别是"总 1203 / 第一帧前 1201"、"总 1291 / 1287"、"总 1204 / 1202"，
  而每一轮那一个长任务的时长就是那 1.2 秒本身。**结论：钱全花在一个把主线程占死的同步大块上，
  浏览器连一帧都还没走到**——不是重绘、不是布局、更不是网络。
  下一步该做的是"改一个节点不再需要同步走完 4000 个节点的那一次提交"（节点组件记忆化 / 补丁应用与渲染切片），
  而不是继续在服务端找。起手 8 节点那一档（总 34.7ms、第一帧前 30ms、无长任务）是同一把尺子的反向对照。

  **同日再量一层（48cfb7a 的快照分段计数），把上面那句"下一步"改向**：
  4000 节点档三次是"总 1146 / 第一帧前 1143 / 长任务 1143 / 快照 2 次共 23ms（求解占其中 23ms，token 与资产 0）"、
  "1300 / 1298 / 1297 / 19ms"、"1420 / 1417 / 1417 / 18ms"。
  也就是说那 1.2 秒**不是模型、不是布局求解、也不是 buildSnapshot**（这些合计 20ms 上下），
  而是订阅 store 的那一次 React 渲染提交。起手 8 节点同一把尺子是"总 24-36ms、快照 0-1ms、无长任务"，
  这一档是防止"计数本身坏了"的对照。
  所以"节点组件记忆化"这个方向要改：**画布只渲染 34 个框，问题不在它**；
  该找的是其它订阅者里随节点数线性（或更糟）长的那一段——图层面板的展开与匹配、属性面板，
  以及任何在 render 里遍历 `page.nodes` 的组件。
  ② 面板窗口化不改"整份文档要先进内存"这件事，展开那 3999 行仍然是一次 O(n)，
  真要往上走（10000 节点档）得看结构共享与增量保存。
  ③ §146/§147 那张目标表里，先前**只有写在文档上、没人去量的两项现在量了**（`ec5bf35`/`677e26c`/`8e0e117`，
  都是生产构建 + `PERF_LABEL` 的口径）：选中响应 12.5 / 13.8ms（目标 <16ms，过），
  JS 堆峰值 19MB / 86MB（浏览器开 `--enable-precise-memory-info`，50ms 轮询取最大）。
  剩下的那半是**内存"峰值"与目标之间还差一句判断**：61-86MB 这个数本身没有通过/不通过的标准——
  §146 只写了"度量并记录内存峰值"，没写上限，所以这一项现在只有数、没有门。
  证据链的三处新钉法：`layers-flat.test.ts` 8 条（顺序/折叠/悬空 childId/过滤只筛顶层/1000 层不爆栈/4000 节点展开 3999 行），
  `perf-browser.mts` 的自检从"图层树 DOM 行数 ≈ 文档规模"改成读 `data-layer-total`（虚拟化之后 DOM 行数不再是文档证据），
  并新增一条"大文档下 DOM 行数 > 展开总数一半就直接抛错"；
  反向对照由既有 e2e 提供：7 节点的小项目仍然渲染出 7 行 `[data-layer-id]`（窗口化不该把小文档也裁成半截）。
  §147 因此仍是 `[~]`。

  **但上面这些数全是开发模式的数，这一点先前没写出来**（2026-09-26 补，同一台机器、同一脚本、`npm run build` 之后重量）：
  给探针加上 CPU 采样归因（`PERF_PROFILE=1`）之后，那 1.2 秒里自时长最高的几段是
  React **DEV 专用**的样式对象比对（`addValueToProperties` / `addObjectDiffToProperties` 合计约 26%，
  加 `readReactElementTypeof` 与一堆 `jsxDEV`），生产构建里这些代码根本不存在。实测对照：

  | 档位 | 开发模式 | 生产构建 |
  | --- | --- | --- |
  | 属性写入 → 画布更新（起手 8 节点） | 34.7ms | **8ms** |
  | 属性写入 → 画布更新（4000 节点） | 1247.7ms | **221.2ms**（各次 147.3 / 295.1） |
  | 首帧（4000 节点） | 1322.8ms | **1904.9ms**（各次 1821.2 / 1988.6） |

  两句结论，一句好消息一句不好：
  ① 先前记在 §147 名下的"1.2 秒热点"**大部分是开发模式的税**，不是用户会感受到的延迟——
  把它当作用户侧缺陷去优化 React 渲染，会花掉几天去修一个不存在的洞；
  ② 但**首帧在生产里反而更慢（1.9 秒）**，这一项才是 §146/§147 真正没过关的那个：
  它量的是"从导航到第一个节点画出来"，里面是整份文档的读取 + 水合 + 首屏求解，
  与 DEV 税无关。所以 §147 剩下的活是**首帧那条路**，不是属性写入那一条。
  **首帧那 1.9 秒随后又被拆开了，而且它自己也不稳**（同一份生产构建、同一脚本，隔十分钟重量是 540.2ms）：
  探针加了第二段拆分（`__perf.startEpoch` 与 resource timing 换到同一个坐标系再减——第一版混了两个时钟，
  算出过 -17ms 这种荒谬数），4000 节点档三次是"到手前 416 / 474 / 409ms + 到手之后 108 / 105 / 93ms"，
  那一次项目接口请求本身是 152-206ms。也就是说**首帧剩下的钱花在"文档到手之前"**
  （HTML + JS 加载、水合启动、接口往返），到手之后的渲染只占约 100ms。
  两句要一起记住的不确定：① 同一构建第一次跑与第二次跑差 3.5 倍（1904.9 vs 540.2），
  所以任何一次单独的数都不能当基线——要么固定跑两遍取第二遍，要么把冷启动单独列一档；
  ② `encodedBodySize` 同源也常报 0（浏览器不给），所以"文档多大"这一项现在量不到，日志里写的是"字节数浏览器不给"而不是编一个数。
  **首帧那一段的第一个改动量完了（7a94988 + 本轮的标签修正）**：文档改由服务端随 HTML 带下来之后，
  同一台机器、同一脚本、生产构建，`首帧（4000 节点）` 三遍是 **435.7（冷）/ 386.5 / 464.5ms**，
  改之前同口径是 540.2ms（同一份构建第一次跑还量过 1904.9ms）。
  两句都要说：① 确有下降，但**幅度（约 -14% 到 -28%）小于跨会话的抖动**，
  所以只能记成"方向对、省下的就是那次接口往返"，不能记成"首帧快了 X%"；
  ② 拆分那行日志的标签也跟着改过一次——文档内联之后，"最慢的那次 /api/projects/*"
  已经不是文档接口，而是快照/发布/批注那几次里的一个，首帧比它早结束是**正常**的（首屏不依赖它），
  旧标签会把它读成"文档到手之前"，那是个会说谎的标签。
  纪律补一句：以后引用 §146/§147 的数，必须写明是 `next dev` 还是生产构建——
  同一台机器、同一脚本、同一档节点数，两者差 5 倍是实测出来的。

  **2026-09-27：测量协议这一项收口了，收口收到的第一件事是"上面两个绿的数复现不出来"**（同一台机器、
  同一份生产构建、`PERF_LABEL=prod-ff68810`、同一会话连跑，完整表在 `docs/PERFORMANCE.md`）：

  - **协议本身**：4000 档在同一会话量了两遍，属性写入是 239.2 与 319.7ms（差 34%），首帧 1051.8 与 877.1ms（差 17%）。
    "同一口径、同一构建、至少两遍"这条规则不是形式——它当场就证明了单遍不能当基线。
  - **§146 的 10000 这一档以前从来没有真的跑过**：单页 10000 节点在真实 PUT 路径上被服务端直接拒绝
    （`HTTP 400 页面 Home 节点数超过上限 4000`，`validation.ts` 的 `MAX_NODES_PER_PAGE`）。
    脚本改成吃这个常量、一页填满再开一页，于是量到的是 `10002 节点 / 3 页` 这份真文档：
    首帧 1569.1ms、属性写入 476.7ms、选中响应 29.6ms、JS 堆峰值 148MB、pan 中位帧距仍是 6.1ms 且 0 帧 >33ms、
    画布 DOM 仍是 34 个。这条挡在前面的事开成 **#63**（顺带一个事实：单页上限并不约束整份文档，
    64 页 × 4000 存得下 25.6 万节点，一页 5000 反而不行——这道守卫没守住它自己想守的东西）。
  - **先前那两个"达标"现在不达标，而且不是规模造成的**：`docs/TESTING.md` 写死了属性写入 <50ms、
    选中响应 <16ms（"回归即视为 bug"）。属性写入在 4000/10002 档是 239–477ms，明显红；
    选中响应**连起手 8 节点都红**——四遍基线 32.7 / 30.8 / 27.5 / 36.4ms，而 `677e26c` 记下的是 12.5 / 13.8ms。
    同一把尺子、同一个脚本，量不出当初那条绿，所以"选中响应达标"这句从今天起作废；
    同理 `7a94988` 那笔记录的 4000 档首帧 386.5–464.5ms，今天两遍是 877–1052ms。
    两种可能没法定：要么当初那几次是机器空着量的（今天这台在并发跑别的活），要么中间这几笔改动确实拖慢了。
    下一步就是把它分清——**空闲机器上重跑同一档**，这条比继续加新功能值钱，所以排在 #63 之后立刻做
    （#62 的写放大那一半已完成；10000 档读数已补于 2026-10-09，客户端发补丁那半见 #62 专节）。
  - **内存那一项还是只有数没有门**（148MB 这句不说达标）：§146 只写"度量并记录"，没写上限，
    所以这一项的缺口是"没有标准"，不是"数字太大"。
  - §147 仍是 `[~]`（画布虚拟化/增量渲染、选中响应仍欠账），但**`applyPatch` 结构共享已落地**：
    `execute + undo ×10` 在 10k 节点档从 657.9ms 降至 ~200ms（同会话前后对照），
    "整份文档克隆仍在"这句作废。下一刀是画布虚拟化与选中响应。


## #63 落地：文档规模的门改成按整份文档挡，§146 的 10000 档第一次真跑通（2026-09-27）

`docs/adr/0015-document-size-gate-counts-the-whole-document.md`。一句话：
`validation.ts` 的 `MAX_NODES_PER_PAGE = 4000` 换成 `MAX_NODES_PER_DOCUMENT = 20_000`（= §146 顶档的两倍），
单页不再单独设限。理由与两头的事实在 ADR 里，这里只记路线图上要紧的三点：

- **上面那条"10002 节点 / 3 页"的数从此被取代**：门改了以后压测脚本不再摊页，
  §146 顶档就是**一页 10000 个节点**，重测的数在 `docs/PERFORMANCE.md` 口径 `prod-adr0015` 那一节
  （首帧 1761.3 / 1809.9ms、属性写入 583.3 / 763.3ms、选中 36.0 / 67.4ms、JS 堆峰值 145 / 161MB，两遍各取中位）。
  新数比摊页那次数**更差**，但那不是回归而是量的对象变了——别拿这两栏相减说"改门改慢了"，
  也别拿新数当"还能再往上加节点"的依据。
- **门修好的是"能不能存"，不是"存了卡不卡"**：属性写入 <50ms 这一档在 10000 单页是 12–15 倍，
   `applyPatch` 结构共享已落地（`CopyOnWrite` 写时拷贝），**增量保存早已落地**（`writeDocument` 已是增量 diff），
   #62 的写放大那一半完成（"全部完成"这句不作数：10000 档读数 2026-10-09 才补，客户端发补丁那半见 #62 专节）。
- **测试纪律又补了一条**（写在 `docs/TESTING.md`）：这一节的头三条用例全在单页上摆数字，
  所以"退回单页语义"这种改法它们一律看不见——第四条（三页各不超上限、总数超上限必须拒）
  是三颗变异探针里唯一能看见"求和没了"的那条。**改门的语义必须同时有一条跨页的用例**，
  不然绿灯守的还是旧语义。

下一步顺序：**"空闲机器重跑同一档"已完成（本机有并发负载，选中响应起手 8 节点 49.9ms、属性写入 8 节点 37.7ms）**，
分清了选中响应是常数级问题（起手 8 节点就超标，非随规模增大）。→ 画布虚拟化 + 选中事件路径常数开销（§147）。#63 关掉。


## #64 落地：同一项目的并发保存以前必然互相踩，现在在事务里排队（2026-09-27）

`docs/adr/0016-project-writes-serialized-by-xact-lock.md`。修的是生产日志里那次
`PUT /api/projects/9404a93d…: Failed query: insert into "pages"`：`writeDocument` 是"整删重插"，
两个并发事务各自从同一份旧文档出发，就会 A 删完 → B 删完 → A 插 p_x → B 插同一个 p_x 撞 `pages_pkey`。
库里没留半写状态（回滚干净），但用户侧是一次保存失败，而 Studio 有自动保存，两个标签页就会撞。

- **改法一行**：`writeDocument` 开头拿项目级事务锁 `pg_advisory_xact_lock(hashtextextended(projectId, 0))`。
  放在 `writeDocument` 里而不是调用方，因为它有两个调用点（`createProject` / `saveDocument`），
  锁的范围属于"怎么写文档"这件事本身。
- **证据是红率不是单次绿**（`apps/web/test/document-concurrent-write.integration.test.ts`，3 个并发写各 600 节点）：
  无锁连跑 5 遍 **5 遍全红**（红因就是日志里那道 `insert into "pages"` 冲突，断言消息里直接带出来）；
  加锁连跑 5 遍 **5 遍全绿**。用例另外两条断言的是"读回来是某一份完整文档、不混不半截"和"库里节点行数与文档对得上"。
- **这条测试挡不住的一件事要说明白**：把锁 key 写成常量 `0`（所有项目全局串行）用例照样绿。
  锁的范围靠的是那一行代码和 ADR，不是靠断言；真要钉得做跨项目并发计时对照，本机负载下那条会飘。
- 与 §147 的关系：这是"整份文档替换"的写放大的**下半截（并发）**，上半截（一次保存为什么要写 10000 行）
  还是增量保存那一刀，做完之后这把锁仍然是对的。**大文档下的排队代价没重测**（今天这台机器不空闲，
  一次普通页面加载 4.3 秒），记在这里不当已知。


## #65 落地：trending 的同分用例第一次有两条腿（2026-09-27）

整套跑红的那一条（"刚发布的应当在 trending 这一页里"）是 c1bc9b4 那一族的**第四处**——
`discover` 的前 60 是环境量，而当时只处理了"红了的那三条"，没处理"任何对宽度的依赖"。
量过的数：清理后 99 条公开版本、整套跑时 121 条，当页最高分 7.4、最低 0.2（一次临时探针，跑完删掉）。

但这一族只是表面原因，第二处洞在比较器自己身上：原来的同分用例两张卡的 `published_at` 天然差几毫秒，
**"路径倒序"那一级从来没被走到**——把它删掉用例照样绿。所以这一片改的是两件事：

- 分数压过全场而不是"看得见就当没事"：赞数从个位数拉到 80（一人一票、权重 1，人数就是分数上限），
  同文件另两条对窗口宽度的依赖（popular 对照、屏蔽用例）一起拉高；断言消息里带当页最高分与五张卡的分数时刻。
- 并列前提要故意和退路矛盾：三张卡钉在**同一时刻**（只有路径那一级能定序，期望顺序是发布顺序的反面），
  另两张**时刻不同而路径大小与时间先后相反**（只有时间那一级能给对）。

**验证**：未变异对照 3/3 绿（跑完 `git diff --exit-code` 确认 `social.ts` 还原干净）；
删掉路径那一级 → 红 1 条（同刻三张跟着库返回行的顺序漂）；删掉时间那一级 → 红 1 条（`ts-early` 抢到前面）。
`npm run lint`（typecheck + eslint）0 问题。教训两条写在 `docs/TESTING.md`。

**这一片没有做的**：整套单测在写这一段时还没重跑完，所以"959 条全绿"这类话现在不能说；
`published_projects.published_at` 被用例钉值只发生在测试库里，生产写入方（publish）没动。

**上面那句话当场就被自己证伪了一次**（2026-09-27，同一天的整套重跑）：`npm test` 结果是
**88 文件过 / 1 文件红，957 绿 / 3 红**，红的正是这三条新写的用例，红因是**默认 30 秒超时**。
量出来的数：单跑（库里带着整套存量）三条各 5.8 / 2.5 / 7.5 秒；整套那一遍总时长 532 秒（基线 352 秒）。
两条一起改：给这三条显式 90 秒（对最重的 7.5 秒留 12 倍余量），并把超时不够的后果写进文件注释——
**超时被撑到时用例的写入还在继续**，所以 afterAll 的清场撞上外键，那一遍留下 95 个删不掉的用户行
（已经手工清掉：`delete … where handle ~ '^tr(av|f|v)…'`，连 12 条残留的赞一起）。
放宽的只有墙上时钟，一条断言都没减；这一点在 `docs/TESTING.md` 里也留了一句。

**90 秒那一改的整套重跑，当场补上了（2026-09-28 07:50）**：`npm test` →
**90 个文件全过 / 965 条全过，240.54 秒，退出码 0**。上面"整套还没重跑完"那句欠账到此合上；
这一遍比出问题那一遍（532 秒）快得多，因为机器空闲——**同一套用例的墙上时钟本来就随负载飘**，
所以这里报的是文件/用例数而不是时长。


## §38 第一格：本地确定性图像合成器落地（2026-09-27，只有合成器与它的单测）

`docs/ROADMAP.md` 的阻塞项第 3 条写着"真实 AI provider key（文本/图像/视频）"没有着落，
所以 §38 的 Text → Image 今天能诚实做的部分是：**像素来源明确标注为本地合成**，
把这条链的其余环节接成真的。这一格落了 `apps/web/src/server/domain/image-synth.ts`：
prompt/seed/尺寸 → 真 PNG 字节（自己写的编码器：签名 + IHDR/IDAT/IEND + CRC32 + zlib），
输出带着 `genMeta = {prompt, seed, provider:'demo', model:'local-deterministic-synth', demoMode:true}`，
**没有任何 HTTP、没有 provider、没有模型**。同一句话逐字节可复现，换话或换 seed 必须不一样。

**验证**：`image-synth.test.ts` 5 条全绿（15/10/2/2/3 毫秒）。这五条里最要紧的是最后一条反向对照——
它把 IHDR 改坏一个字节，要求同一套 CRC 校验必须报错；不然"结构合法的 PNG"只是校验给的绿灯。
另外它数的不是字节而是**颜色种数**（>200 种），一张平图过不了这一条。

**这一格没有做的（不许读成已生效）**：
- 没有 HTTP 接口、没有 Image Studio 面板入口，画布里拿不到这张图。用户仍然只能上传。
- 生成结果**还没有进资产表**：`uploadImageAsset` 里 `source` 写死 `'upload'`，摄取函数不接受"生成"这一档，
  所以 §133/§134 的 image 额度桶**今天仍然没有消耗方**。
- `assetRowToRef`（`projects.ts:223`）没把 `genMeta.demoMode` 映射出去，
  于是 `AssetsPanel.tsx:111` 上那个 DEMO 徽标是**读一个永远不会被写的字段**——接上生成的那一格要一起修。


## §133/§134 第一片：额度账本落地，五格里只有一格真的有执行方（2026-09-26 夜）

需求原文两句：§133"五档订阅（Free/Pro/Creator/Studio/Enterprise），按 AI usage / storage /
generation / team collaboration / publishing 设计"，§134"用户看得到 AI / Image / Video / Compute
四类额度，**所有消费透明**"。动手前库里没有任何额度的概念。这一片做的是**能兑的那部分**，
并且把没兑的在界面上写出来。

**做了什么**

- 迁移 `0016_credit_ledger.sql`：`credit_ledger` 一张表 + `users.plan` 一列。
  **没有"当前余额"这一列**——余额是 `SUM(delta)` 派生的（与快照/搜索那几处"能派生就不存储"同一条纪律）。
  三条库级保证：只追加触发器（直接打在表上的 UPDATE/DELETE 一律挡，更正=新写一行 `adjust`）、
  `(task_id, kind)` 部分唯一索引（一次任务只扣一行）、`(user_id, kind, period)` 部分唯一索引
  （一个月一类只发一次）。
- 规则层 `server/domain/credits.ts`：四类额度、五档发放表、单价表、`creditKindForAgentKey`、
  `refusalFor`。**没有充值**：`adjustCredits` 存在但没有任何 HTTP 路由通向它，
  它的用途是让测试能造出"余额为 0"这个状态。
- 一个真拦截方：`refusalForRun` 接在 `/api/ai/run` 与 `/api/ai/jobs` 提交之前（任务行落库之前），
  额度不够回 `429 credits_exhausted`，那句话带着数字（"需要 1 点，现在只有 0 点"）。
- 扣点接在**写终态的那两个地方**：`finishTask`（同步与异步轮询共用）与 `decideApproval`
  （批准=那份补丁真的落了画布，所以也要扣；拒绝不扣）。失败的任务一行都不扣。
- `/credits` 页：四类余额 + 最近 20 行流水（每一行都写"追到哪件事"）+ 五档表。
  页面自己说清三件事：只有 `aiUsage` 这一格有拦截方、Image/Video/Compute 今天没有消耗方、
  发放是"看账之前确保一次"而不是每月 1 日定时任务（本机没有常驻 cron）。
  首页账号区加了入口，**游客也看得见**——扣的就是这个会话名下那 100 点。

**踩到并修掉的五处**

1. 第一版触发器无条件挡所有 UPDATE/DELETE，集成测试第一次跑就红了两处：
   `delete from agent_tasks` 要按 `ON DELETE SET NULL` 摘掉账本里的指针，被挡下 →
   从此全库删不掉任务行；而 `generation ⇒ task_id IS NOT NULL` 这条表级 CHECK 分不清
   "插入时就没写"与"后来被摘掉"。现在放行条件写死成"`pg_trigger_depth()>1` 且除两个外键指针外各列一模一样"，
   形状规则挪到触发器的 INSERT 分支（那里看得见 `TG_OP`），**放行这一条本身有用例**。
2. `creditKindForAgentKey('videos-agent')` 的反向对照写错了：`video` 就是 `videos` 的子串，
   它当然算 video。红过一次之后改成"让关键字整个消失"（`vide-agent` / `filn-agent`）。
3. drizzle 把库的报错包成 `Failed query: ...`，Postgres 自己那句话在 `cause` 里——
   只断言 `message` 的 `toThrow(/只追加/)` 挑不出"红的是别的错"。测试改成读两层。
4. §51 那一片把 4 处 `var(--nexus-color-border)` 提了进去，而 `tokens.css` 里只有 `-subtle` / `-strong`：
   `style-tokens.test.ts` 那条"界面里没有指向不存在 token 的 var()"从那次提交起一直是红的，这次整套跑才撞上。
   已改成 `-subtle`。记在这里的理由不是"错了就改"，而是**门禁和断言都在，缺的只是提交前跑整套**。
5. `npm test` 默认并行，`social.integration.test.ts` 与 `trending.integration.test.ts` 各红一条，
   红的不是逻辑而是**列表宽度**：`discover` 的 limit 硬夹 60，这台开发库里已经积了 101 条公开版本
   （存量最高浏览量 151），"我刚发布的那张卡在不在这一页里"取决于别的文件此刻在发布还是在清理。
   同两个文件串行跑 12/12 绿，坐实了这一点。两片都修：`vitest.config.ts` 关掉文件级并行，
   同时把那三条对"前 60"的依赖拿掉（自己的卡片用浏览量顶进窗口 / 零分顺序那条改用自己造的两张卡）——
   因为它是**慢红**：存量再多 60 条，串行也一样红。

一个自己抓到的口径错：整套第一次跑完时我只看到 `exit 0`，就把"954 条 / 86 秒"当成读到的数字报了一遍——
那个数是没读到的（`| tail` 之后输出文件是空的）。实际量到的是 **352 秒 / 88 个文件 / 954 条全绿**。
这类错正是 §159 反对的那种"看起来量过了"。

**验证（这一片自己跑过的）**

- `credits.test.ts` 10 条 + `credits.integration.test.ts`（真库）10 条：全绿。
- `@smoke §134`（真浏览器，22.6s）：跑一次生成 → AI 那一格 100→99、
  image/video/compute 三格一动不动、那一行流水写着"DEMO 模板"并指着命令栏报出的任务号前缀。
  截图两张看过：`screenshots/credits-{before,after}-generation.png`。
- `npx tsc -p tsconfig.tools.json` / `e2e/tsconfig.json` / `npx eslint`（本轮改动的 11 个文件）：0 问题。
- 整套单测：`npm test` **88 个文件 / 954 条全绿，352 秒**（关掉文件级并行之后，见上面第 5 条）。
- 整套 e2e：`npx playwright test -g "@smoke"` **44/44 通过，14.6 分钟**。
  第一次跑红 7 条是环境（刚跑完单测 + Chromium 栈溢出），过程与判据写在上面 §51 那条口径 correction 后面。
- **现在可以说的**：这一片之后，单测与 e2e 两套都整套绿过。仍然不许说的是"覆盖完整"——
  @smoke 只有 44 条，它盯的是用户可见的那几条主干。

**这一片没有做的（照实记，不要当成已生效）**

- ~~storage / generation / team collaboration / publishing 那四格上限只是页面上的数字~~ **storage 那一格后来接上了执行方**
  （2026-09-28，见文末「§133/§134 第二片」与 ADR-0018）；generation / team collaboration / publishing 三格仍然只是数字。
- Image / Video / Compute 三类只有发放方、没有消耗方（要等 §38 图像、§40 视频那条路）。
- ~~改档位没有界面：`UPDATE users SET plan` 是服务端代码里的事。~~ **2026-09-30 接上了**：
  `/admin/users` 上有档位选择（`domain/plan-admin.ts` + `PATCH /api/admin/users/[id]/plan`），
  取舍见 ADR-0021。它**不是购买流程**（§159：账面上没有一分钱流进来，所以界面上不出现"升级"也不标价），
  是运营兜底动作；与"改角色"刻意相反，它**允许 admin 改自己**（发额度 ≠ 授予权限）。
- 这道门**不预扣**：并发可以把余额跑到负数（预扣要一个能把 provider 调用包进去的可回滚事务，今天没有）。
  负余额在流水里看得见，这个松是选定的，写在 `credit-ledger.ts` 注释与 ADR-0014 里。


## §38 第二格：Text→Image 端到端接上，image 那个额度桶第一次有消耗方（2026-09-28 凌晨）

需求原文（§38）要的是五条箭头，而本机没有图像 provider（阻塞项"真实 AI provider key"还在）。
第一格只落了合成器与它的单测；这一格把**那条链上其余每一环接成真的**：

- `apps/web/src/server/domain/image-studio.ts`（新）：规格门 → **额度门** → `startTask(capability='demo')`
  → 本地合成 → 与上传**同一道**摄取门 → 资产行 → `finishTask`（这一句里发生扣点）→ 通知。
- `POST /api/projects/[projectId]/images`（新）：CSRF → 会话 → 归属 → zod → 上面那个函数；
  额度用尽回 429、规格不合回 400，两者理由都直接透传，不是界面文案。
- 修掉第一格点名的两处真缺陷：`uploadImageAsset` 原本硬编码 `source:'upload'`（生成物记成上传，
  事后查不到哪张是模型给的），现在收 `source` 与 `genMeta`；`assetRowToRef` 原本不映射
  `taskId` / `demoMode`，所以 `AssetsPanel.tsx:111` 那枚 DEMO 角标读的是一个**没人写过的字段**——死代码。

**验证**（`apps/web/test/image-studio.integration.test.ts`，打真库，4 条）：
- 一次生成在四处各留一行：`assets`（`source='generated'`、mime/宽高、对象键 `projects/{projectId}/{assetId}.png`
  由服务端按 id 生成）、清单里的 `generatedBy`（provider=demo、prompt 回填、**demoMode=true、taskId 指回那一次任务**）、
  `agent_tasks`（succeeded / capability=demo）、`credit_ledger` 恰好一行 `-2`，且余额按量减少。
- **门的位置**这一条是这一片的重点：余额扣到 0 之后再生成，`assets / tasks / ledger` 三个计数**一个都不许多**；
  拒绝理由原文照抄 `refusalFor`（"Image credits 不够：这一次需要 2 点，现在只有 0 点"）。
- 复用与消费是两件事：同 prompt 同 seed 拿回**同一行**（同 checksum 在项目里只有 1 行）但**两行任务、两笔扣点**；
  只换 seed 必须给新行——否则第二次点击等于什么都没生成。
- 非法输入（宽 2048、空 prompt）不过门、不留任务行、不花额度。

**两次变异探针**（跑完还原）：把额度门挪到 `startTask` 之后 → 目标用例红，断言消息就是
`expected { assets: 1, tasks: 2, ledger: 1 } to deeply equal { …tasks: 1… }`（多出来的正是那条
"running 然后失败"的假账）；删掉 `assetRowToRef` 里 `demoMode` 那行 → 红 1 条，红在那句
"DEMO 与真模型的来源必须可区分"。**第一格说"角标读一个没人写的字段"，这一格的凭证是删掉映射会红。**

探针那遍一共红了 2 条，其中 1 条是**连带**：额度门用例在断言失败后就不会执行"把余额还回去"那一行，
于是下一条被"额度不够"挡住。已改成每条用例自己补足额度——**连带红不是证据，是用例之间的依赖**。

`npx tsc -p apps/web/tsconfig.json --noEmit` 干净；`image-studio + image-synth + assets` 三个文件 **17 条全绿**
（含上传链路，确认改了 `uploadImageAsset` 签名没把上传弄坏）。
**上面 #65 那节的"90 文件 / 965 条全过"是这一片之前的整套数**——新的 4 条还没进过整套，写完这段就会重跑。

**这一片没有做的**：Studio 面板里还没有那个入口（§158 要求真浏览器 Run/Test/Screenshot，单独一片；
所以"角标在界面上真的亮起来"目前只有服务端与单测层面的凭证，没有肉眼看到的图）；
其余四条箭头（Image→Image、Sketch→Image、Reference→Variation、Character→Scene）一格没动；
真 provider 那一格仍然缺 key——换成真模型时改的是 `image-synth.ts` 那一个文件里的像素来源。


## §38 第三格：Image Studio 的界面入口落地，顺带挖出模型层一处"撤销不可逆"（2026-09-27）

第二格只有服务端与单测；这一格把入口接进 Studio，并按 §158 在真浏览器里跑了一遍。

**做了什么**
- `AssetsPanel` 顶部加了 prompt 输入框与"生成图片（DEMO · 扣 2 点）"按钮（空 prompt 不可点）；
  卡片上那枚 DEMO 角标补了 `title`（说清"这不是模型给的"）与 `data-asset-demo-badge`。
- `studio.generateImageFromPrompt`：一次点击 = 一个事务（`addAsset` + 选中元素的 `style.fills`），
  没选中元素时只进清单并在回执里写"选中元素后生成才会同时贴上"——不猜用户要贴哪。
  429/400 的理由原样摊在 `[data-asset-error]` 上。
- 新 e2e `e2e/image-studio.spec.ts`（@smoke）：生成 → 卡片带 DEMO 角标、缩略图能被浏览器解码
  （`naturalWidth > 0`）、画布那层的 assetId 与卡片同一个、引用数 1 → 撤销 → 重做 →
  `/credits` 上看得见那一笔 `-2`（理由里带"DEMO 模板 image.generate"，且绑定任务）。

**e2e 第一次跑红，红出来的不是界面问题，是模型层的真缺陷**：撤销之后画布上的填充收回了，
但清单里那一条**永远留着**。查到 `packages/design-model/src/patch.ts:599`——`addAsset` 的逆操作
只在"目录里本来就有这一条"时才写（写的是还原旧值），**新增**那一路什么都不写，于是撤销无从下手。
全仓库 `grep addAsset **/*.test.ts` 是 0 命中：这个 op 的撤销从来没被测过，所以上传路径
（`uploadImageAsFill` 也是 `addAsset` + 贴填充）一直带着同一个洞，只是没人断言过"撤销后目录里少一条"。
修法：新增那一路的逆操作写 `removeAsset`（沿用 `insert` → `remove`、`addToken` → `removeToken` 的既有口径）。

**验证**：`packages/design-model/test/patch-commands.test.ts` 新增 3 条（撤销同时收回条目与填充、重做又回来；
**覆盖已有条目时撤销是还原不是删除**——这一条挡的是"把目录清干净当撤销"这种修法；逆操作形状）。
变异探针：把新加的那行 `removeAsset` 删掉 → 红 2 条（撤销那条 + 形状那条），
而"还原不是删除"那条**保持绿**（31 passed），说明它不是靠这次改动才过的。
e2e：`图像生成` 1 passed（13.7 秒），回归 `上传图片 | 资产库` 2 passed（36.4 秒）。
截图 `screenshots/image-studio-generated.png` 人眼看过：角标、回执文字、画布填充、清单缩略图都在。
整套重跑（`patch.ts` 的撤销语义变了，第二格欠的那句"写完这段就会重跑"在这里还上）：
**91 个文件全过 / 972 条全过，813.26 秒，退出码 0**。这一遍比 #65 那次的 240 秒慢三倍，
本机同时挂着 50 多个别的项目的 node 进程（内存只剩 2GB 上下）——**绝对时长在这个环境下不是结论，
"全过 + 退出码 0"才是**；要拿时长做比较得等同一种负载。

**环境上的一条坑（写进 TESTING.md 了）**：3100 上有一个更早会话留下的 `next start`（生产构建），
`playwright.config.ts` 的 `reuseExistingServer: true` 会直接复用它——于是新代码在浏览器里根本不存在，
用例红在"等不到 `[data-image-generate]`"。这条红**不是被测代码的结论**。改成另起 `next dev -p 3210`
并用 `NEXUS_WEB_URL` 指过去才量到真结果。**下次跑 e2e 前先确认 3100 上是谁**。

**这一片没有做的**：`addComponent` 的逆操作是同一形状的洞（只在已存在时写还原，新增那一路不写），
今天没有任何用例断言过"撤销能删掉一个组件"，所以先记着不动——修它要连带补组件引用的清理语义
（**下一段已补上**）；
其余四条箭头（Image→Image、Sketch→Image、Reference→Variation、Character→Scene）仍未动；
真 provider 仍缺 key。


## 补上第三格点名的那道洞：addComponent 的撤销 + 它牵出的删除门（2026-09-27）

上一段末尾记的那条"先记着不动"在这一段动掉了。

**做了什么**
- `patch.ts` 新增两个 op：`removeComponent`（移出目录 + 把**所有页面**上引用它的实例节点的
  `componentId` 一起解开）与它的逆 `restoreComponent`（放回定义 + 按记下的 `(pageId, nodeId)`
  把链接接回来）。形状照 `removeAsset` / `restoreAsset` 抄，包括"对不存在的 id 记 `skipped`，不静默成功"。
- `addComponent` 的逆操作补上新增那一路：`else ops.push({ op: "removeComponent", ... })`。
- `packages/schemas` 的 `PatchOpSchema` 加这两条，`npm run contract:export` 重导契约
  （`design-patch / ai-response / ai-job-status` 三个 JSON Schema 各加一份枚举，共 +147 行）。
- **`removeComponent` 同时进两边的高危名单**：`apps/web/src/server/ai/approvals.ts` 的
  `DESTRUCTIVE_OPS` 与 `apps/ai-service/src/ai_service/execution.py` 的同名集合。
  它带走定义并连带解开实例，漏一档就等于这一档**两边都不拦**。
  审批卡片上那句理由也补了 id 来源（`describe()` 原先只认 `nodeId/key/assetId/pageId`，
  `componentId` 会退回裸 uuid），组件名后头写清"删除会连带解开引用它的实例"。
- 提示词里的 op 词汇表**没加**这两条：`removeAsset` 也不在表里——不邀请模型删资产/删组件，
  但它真删了就得拦得住。

**验证**
- 新文件 `packages/design-model/test/patch-components.test.ts`：6 条（一次事务里「建组件+放实例」的
  撤销/重做；覆盖同 id 时撤销是还原不是删除；逆操作形状；删定义连带解开实例；跨页实例的删除→撤销→重做；
  对不存在的 id 记 `skipped`）。
- web 侧门：`ai-approvals.integration.test.ts` 那条"带走东西的 op 全被拦下"从 4 档变 5 档
  （`heldOpCount` 5→6），并新增两条断言：理由里出现"定价卡片"、**不许**出现裸 componentId。
  连契约与 schemas 一起跑：**4 个文件 / 50 条全过**。
- ai-service：**64 passed + 1 skipped，退出码 0**，其中包含跨语言那条
  `test_destructive_op_set_matches_the_web_gate`（它直接读 web 源码比对集合，不抄第二份常量）。
- 四次变异探针，跑完全部还原（还原后用 `git diff` 核对过）：
  A 删掉 `addComponent` 新加的那行 `removeComponent` → 红 2 条（撤销那条 + 形状那条），
  而"覆盖时是还原不是删除"**保持绿**；B 删掉 `removeComponent` 里解链的那个循环 → 红 2 条
  （连带解开那条 + 跨页还原那条）；C 把 `describe()` 里的 `op.componentId` 拿掉 → 红 1 条，
  红在"理由里要点名定价卡片"；D 只把 `removeComponent` 从 web 清单里拿掉 → web 那条红（5→4），
  同时 Python 的集合比对那条也红。**C 与 D 证明"名单加了但读不懂在删什么"和"只补一边"都拦得住。**
- `npm run typecheck` 干净（7 个工程）。

**第一段用例自己红出来的那条**：我起初照 `addAsset` 的形状写成"文档里先有一个引用 cmp-new 的实例、
再执行 addComponent"，红在重做那一步。原因不是实现错，是这个前置状态本来就不合法——
`addComponent` 从不给既有节点接链接，所以撤销时 `removeComponent` 解掉的链接不是这次事务建立的，
重做自然接不回来。真实形状是"一次事务 = 建组件 + 放实例"，用例改成那个形状后绿。
**教训：逆操作的连带清理可能比正操作做得更多；这种不对称只在有既有引用时才暴露，
而那种文档本来就不该存在——别把非法前置状态的行为写成断言，那会锁死一个不该支持的语义。**

**这一片没有做的**：Studio 里还没有"删除组件"的入口（模型层能撤了，界面还没有那个按钮）；
`docs/STUDIO.md` 的组件那一节还没提这两个 op；§38 其余四条箭头、真 provider key 仍未动。


## §38 第二格箭头：Reference → Variation 的服务端那一段（2026-09-27）

**做了什么**
- `SynthInput` 多了 `hueAnchor`（0..1）：它**参与身份哈希**，也参与配色。参与哈希是必须的——
  否则"同 prompt 同 seed 换一张参考"会被去重复用成同一行，第二次点击什么都没生成。
- `generateDemoImage` 多收 `referenceAssetId`：走 `openAssetForOwner`（按归属取字节，不按 id 裸取），
  用已有的 `extractVisualDna` 量出主色，转成色相锚点喂给合成器；量不出来（不是 PNG、全透明、没有主色）
  与不拥有这张图都是**拒绝**，不退化成"没参考随便生成一张"。参考图先解析、后谈额度，解析失败不留任务行也不扣点。
- 路由 `/api/projects/[id]/images` 的 body 多一个可选 `referenceAssetId`（只接受 id，字节由服务端自己取）。
- `assets.ts` 的 `rowById` 加了 uuid 形状门：**这是这一片红出来的真缺陷**——非 uuid 的 id 直接进 where，
  Postgres 抛 `invalid input syntax for type uuid`，于是"这个资产不存在"在所有走这条路的接口上都是 500。
  现在形状不对就当查不到，路由只剩 404 这一种说法。

**验证**：`image-studio.integration.test.ts` 新增 3 条，与 `image-synth` 一起 **15 条全过**——
换参考就是换字节（且各自都与不带参考的那张不同）、同 prompt 同 seed 同参考复用同一行（同 checksum 只 1 行）、
参考图不存在（畸形 id 与合法但不存在的 uuid 两种）时 `assets/tasks/ledger` 三个计数一个都不许多。

**这条箭头的证据边界（写清楚，别over-claim）**：上面那组断言钉住的是**身份与元数据**——
参考图确实换了字节、确实记进了 `genMeta`（`referenceAssetId / hueAnchor / referenceDominant`）。
我本来还想钉"画面看着像参考图"：写了四条均匀分布的锚点、量产物主色要求落在各自 ±0.2 的格子里，
**这条是红的**（锚点 0.25 量回 0.918）。红得对：合成器的形状色是 `anchor + rand()`，
主色由形状而不是背景决定，所以"绝对色相等于锚点"本来就不成立。我把这条断言删掉了而不是放宽容差——
**放宽到能过就是假绿**。留下的真实欠账：DEMO 合成器的"变体"只保证"由这张图的色相派生出来、且与原图不同"，
不保证人眼看着像参考图；正解是换成真 image-to-image provider（§76-79 那一格），
或者先改合成器让形状色也按锚点取（改渲染口径时这条断言要一起补回来）。

**这一片没有做的**：界面入口（资产卡片上那个"以它为参考生成变体"的按钮 + e2e）；
Sketch → Image、Image → Image、Character → Scene 三条箭头；真 provider key。

**补：这一条箭头的界面入口（同日第二格）**
- 资产卡片上多了一个"生成变体"按钮（`[data-asset-variant]`，非位图/忙碌时不可点），
  `studio.generateImageFromPrompt(prompt, referenceAssetId)` 带上参考 id；回执文案里明写
  "以清单里那张为参考的变体"，按钮的 `title` 也明写"换的是它派生出的色调，不是把画面内容改成另一个场景"
  ——上面那条证据边界如果界面上不说，用户就会按"图生图"来期待它。
- e2e `@smoke 图像生成` 加长：生成 → 撤销 → 重做 → **点变体** → 清单多一行、缩略图能被解码、
  那张是**另一个 asset 行**（img src 与原图不同）、角标仍是 DEMO、额度页那一笔 -2 看得见。
  **1 passed（1.2 分钟）**，截图 `screenshots/image-studio-variation.png` 人眼看过：
  原图偏红绿，变体偏蓝紫——色调确实换了，但"看着像原图的变体"这件事仍然没被钉住（与上面那条边界一致）。
- 又踩了一次 3100/3210 那个坑，这次是反向的：**上一份 dev server 服务的是旧路由表**，
  `POST /images` 直接 404，红在"画布没出现生成图"上。判据还是那条：红之前先确认服务的是哪份代码
  （`netstat` 看谁在听 + 换端口起一份新的）。这次顺带确认 `GET /api/assets/<非 uuid>/file` 返回 404
  是**上一格那条 uuid 门的正确结果**，不是路由丢了——别把修好的东西再当成 bug 修一遍。

**再补：§13 组件的界面投影（同日第三格，关掉上面点名的欠账）**
- 设计系统面板顶部多了一段"组件"（`[data-components-section]`）：列出目录里的组件、每个被多少实例引用、
  以及两个动作——**存为组件**（把当前选中的元素指认为主组件的根；没选中就不可点，面板不凭空造真值）
  与**删除**（一次 `removeComponent` 事务，可撤销）。
  这一段之前根本不存在：组件在全库只有计数出现（上下文面板的 totals、属性面板那行"多少个组件"），
  模型层的目录在界面上没有投影——所以"能撤销的删除"修好了也没有入口可用。
- 新 e2e `e2e/components-panel.spec.ts`（@smoke）：未选中时按钮 disabled + 空态文案 → 选中 Headline →
  存为组件 → 卡片出现且写着**引用 0**（还没有实例，写 1 就是谎）→ 删除 → 卡片消失 →
  撤销 → 定义回来、引用数仍是 0 → 重做 → 又没了。**1 passed（27.3 秒）**，
  截图 `screenshots/components-panel.png` 人眼看过。
- 两次红都不是被测代码的错，记下来免得下次再踩：① 断言按钮 disabled 之前先切了面板——元素还没渲染；
  ② 图层行只在"图层"那一栏里存在，切到设计系统栏之后再查 `[data-layer-id]` 必然为空。
  **跨面板取句柄的顺序必须是：先拿 id，再换栏。**
- 仍未做：把实例"重置为主组件""变体切换"接进界面（§13 的 override 那半），以及从组件目录一键实例化到当前页。

**再补：§39 / §40 的 Character → Scene（同日第四格）**
- 需求 §39 要的是"用户建一个角色，系统存 identity/appearance/style/clothing/traits，后续生成**同一个角色在不同场景里**，
  尽可能保持视觉一致"。角色档案那一半早就有了（§46 那一格），但**"不同场景"这一半没有生成入口**，
  而且 `assets.character_id` 这一列从 0000 建库起**没有任何写入方**——一列没人写的真值就是文档里的装饰。
- 现在 `generateDemoImage` 认 `characterId`：色相锚点取自角色档案的 `visualIdentity.palette`（第一个合法十六进制色），
  资产行写入 `characterId`，`genMeta` 记 `characterId / hueAnchor / anchorDominant`。
  于是"视觉一致"第一次有了**可测的定义**：同一角色的不同场景 → 同一个锚点 + 不同字节；换一个角色 → 换一个锚点。
  三条拒绝路径都留得住：档案 palette 是空的（不拿"随便一张"冒充它的场景）、角色不在这个项目里、
  参考图与角色同时给（两个来源同时给就说不清这张图是照谁画的）——**都在写任务行与扣点之前**，三个计数一个都不许多。
- 验证：`image-studio.integration.test.ts` 新增 4 条，与原有 7 条一起 **11 条全过**。
  变异探针：把"量出来的锚点喂给合成器"那一行删掉 → **红 2 条**（一致性那条 + 换角色换锚点那条），
  另 9 条保持绿；探针跑完用 `git diff` 核对过还原。
  顺带把 `referenceDominant` 改名成 `anchorDominant`——现在两种来源（参考图 / 角色）都写这一格，旧名字会谎报来源。
- 仍未做：角色场景的界面入口（角色面板上那个"生成它的场景"按钮 + e2e）、§40 其余三条
  （Text → Video / Image → Video / Storyboard → Video）、以及"clothing/traits 真的参与画面"这件事——
  今天的锚点只用到 palette 一栏，其余字段仍只进文本上下文。

**这一格的整套凭证**：`npm test` **92 个文件全过 / 985 条全过，退出码 0**（跑于 Character → Scene 落地之后）。
上一格那三条箭头各自只带了自己文件的数，这里合上：模型层撤销、两侧删除门、契约、摄取门 uuid 修、
参考变体与角色场景，全都在同一遍整套里同时绿。

**下一格（已登记为任务 #67）**：角色面板上的"生成它在另一个场景里"。用例草稿已经写好并留在 `/tmp/character-scene.spec.ts.draft`
（不在仓库里，因为它断言的 `[data-character-scene]` / `[data-scene-prompt]` 两个控件还没实现——
把不存在的选择器提交进 e2e 就是让下一位跑的人去猜红的是谁）。实现时要动的三处，选择器契约先定死在这里：
`studio.generateImageFromPrompt(prompt, { referenceAssetId?, characterId? })`（把现在那个位置参数换成对象，
`AssetsPanel` 里"生成变体"那一处调用同步改）、`CharacterPanel` 视觉标识那一段之后加输入框与按钮
（palette 为空时按钮不可点，与服务端同一口径）、面板回执走 `state.assetNotice` 并挂 `[data-character-notice]`。

**Character → Scene 的界面那一格：先落了一半，另一半如实退回**（同日稍后又落了，见本节末尾）
- 已落：`studio.generateImageFromPrompt` 的第二参数从"参考图 id"换成 `source?: { referenceAssetId?, characterId? }`
  （两个来源在界面上是两件事，位置参数到第三个就没法加了），`AssetsPanel` 的调用点同步改。
  这一半是行为不变的改造，凭证是**原有的那条 e2e 重跑：1 passed（1.6 分钟）**。
- 退回：角色面板里"生成场景"那一块（补丁在 `/tmp/character-panel.patch`，用例草稿在 `/tmp/character-scene.spec.ts.draft`）。
  **红在浏览器里，不是红在编译**：填完色板之后"保存档案"仍然是 disabled，
  而它的门是 `!dirty || saving`（`CharacterPanel.tsx:480`，dirty 用 `JSON.stringify(selected.profile) !== JSON.stringify(draft)` 判）。
  也就是说 `page.fill('[data-character-visual="palette"]', ...)` 之后 dirty 仍然为假——
  要么那次 fill 没进到受控 input 的 onChange，要么 `selected.profile` 与 `draft` 在那一刻本来就相等。
  **上面那段"诊断"是错的，这里更正**：我当时说嫌疑收在 `patchProfile` 的入口条件（`!selected || !draft` 静默返回），
  还写了"fill 落在 DOM 里但没落进 setDraft"——**证据并不支持这个结论**。真相朴素得多：
  那条断言本身放错了位置。用例是 `click('[data-character-save]')` 之后再断言"保存档案"可点——
  点下去之后它当然变成 disabled（按钮文案就是快照里那句"保存中…"），而 Playwright 的 `click` 本来就等过 enabled，
  也就是说 **dirty 一直是真的，面板一直是对的，红的是我的断言顺序**。
  第二处同理：换成断言"生成场景"可点之后仍然红，因为那时场景输入框还空着——它本来就该不可点。
  两处都改完：**e2e 1 passed（13.4 秒）**。
  教训写在这里代替猜测：断言"某按钮可点"之前先问一句"上一步点击是不是刚刚把它自己变灰了"；
  快照里那句"保存中…"其实已经把答案给我了，是我没去读它。
下一格的第一步应该是把这条门量清楚
  （在页面里读按钮文案是"保存档案"还是"没有改动"，再决定是改用例还是改面板）。
  顺带记一个已经想清楚的设计：那个按钮的可用条件应当读**已保存的** `selected.profile.visualIdentity.palette`，
  不是草稿里的——服务端判的是存档，界面拿草稿放行就会让人点出一个必然被拒的请求。

**Character → Scene 的界面那一格：落地了**
- 角色面板的视觉标识那一段下面多了场景输入框 + "生成场景"按钮（`[data-scene-prompt]` / `[data-character-scene]`）：
  可用条件是**已存档**的色板非空 + 场景非空 + 没有正在忙——服务端判的是存档，界面拿草稿放行就会点出一个必然被拒的请求。
  回执挂在 `[data-character-notice]`，文案是"这是清单里那个角色的一个场景（色调取自它的视觉标识）"。
- 凭证：`e2e/character-scene.spec.ts`（@smoke）**1 passed（13.4 秒）**——空色板时按钮不可点 → 填色板存档 →
  按钮活了 → 生成 → 切到资产库，最后一张卡片带 DEMO 角标且缩略图 `naturalWidth > 0`。
  截图 `screenshots/character-scene.png`。
  三条入口（Text→Image 与变体、组件面板、角色场景）**一起回归：3 passed（33.0 秒）**——
  这一条是给 `generateImageFromPrompt` 那次签名改造（位置参数 → 来源对象）的回归凭证：
  三个调用点里改了两个，跑一遍才知道没漏。
- 于是 §38 / §40 那五条箭头里，text→image、reference→variation、character→scene 三条在界面上点得出来了；
  image→image 与 sketch→image 仍未动（原因写在上面那条清单里）。

**顺带：`assets.character_id` 的读的一半也接上了**
上一格只写了列，清单投影里没有它——**一列只写不读的真值在界面上等于不存在**。
现在 `AssetRef.characterId` 有映射，资产卡片上多一枚"角色场景"标记（title 带角色 id；
面板没加载名册，所以这里不猜名字，猜出来的就是谎）。
凭证：集成用例新增一条断言"库里写入了归属角色，清单投影必须读得出来"，
变异探针把那一行映射删掉 → **红正好这一条**（另 10 条保持绿），11 条一起过；`tsc` 干净。
浏览器那一半也补了凭证：`e2e/character-scene.spec.ts` 现在断言卡片上有「角色场景」标记，**1 passed（21.5 秒）**。

## §39 点名的四栏终于有地方存了（2026-09-27）
需求原文写着"用户创建 Character A，系统保存 identity / appearance / style / clothing / traits"。
档案里过去只有 `appearance` 对得上，**identity / style / clothing / traits 四栏根本没地方放**——
不是"还没填"，是类型里没有这一栏，用户在面板上找不到输入口，检索与生成也拿不到。
- `CharacterProfileSchema` 加这四栏（`traits` 是短标签数组），**每一栏都带 `.default()`**：
  库里已有的档案没有这几栏，不补默认值的话旧行在载入时解析不过去，
  面板上表现成"这个角色读不出来"——那是数据被界面弄丢，不是契约在把关。
- `world-model` 的 `CharacterProfile` 接口与 `emptyProfile` 同步；建档时这四栏是空串/空数组，
  但**在**（不是 `undefined` 冒充"有这一栏"）。
- 角色面板多了三个输入口：身份（不变的那部分）、穿着、画风/媒介。
- 验证：新文件 `character-fields.integration.test.ts` 3 条 —— 建档时四栏为空但在、
  **写进库再从库里重新读回来四栏一个字不丢**（不看 update 自己回给的那份内存对象，直接查 jsonb）、
  手工抹掉 jsonb 里那四栏模拟加字段之前的旧行，仍然读得出来且 `unreadable` 为空。
  变异探针：把 `clothing` 的 `.default('')` 去掉 → **红第三条**，消息就是"旧行读不出来"，
  证明那个默认值不是装饰；还原后 `character-fields + characters` 两个文件 **10 条全过**。
  `npm run typecheck` 七个工程干净（没有一处字面量构造档案被这次改动打破）。
- 仍未做：`traits` 的界面输入口（面板上还没有那一栏）；把这四栏喂进 §39 的正题——
  **生成时真的按 identity/clothing/style 保持一致**（今天角色场景的锚点只用 palette 一栏），
  以及 knowledge / RAG 文本里带上这四栏（现在检索命不中"穿靛蓝斗篷的那个角色"）。

**接上§39 的第二半：这四栏进得了检索**
存进档案只是第一半——检索拿不到，就等于**对 AI 不存在**（面板上看得见，模型查不着）。
`knowledge.ts` 的角色切分里多了 身份 / 穿着 / 画风 / 特征 四小节（空小节照旧不进索引）。
凭证：`character-fields.integration.test.ts` 新增两条断言——保存档案后直接查 `knowledge_chunks`，
`%靛蓝斗篷%` 与 `%认路很快%` 都要有行；变异探针把这四行从切分里删掉 → **红在"穿着写进了档案，却没进知识索引"**，
还原后 `character-fields + knowledge` 两个文件 **11 条全过**。
仍欠：`traits` 的界面输入口；以及让生成真的读这四栏（今天角色场景的锚点只用 palette）。

## traits 的输入口：试过，没落地，症状与下一步实验记在这里（2026-09-27）
面板里加了一个逗号分隔的 traits 输入框，用例填进去之后点"保存档案"——**按钮一直不可点，`click` 等到超时**。
字确实留在输入框里，也就是说那次 `onChange` 没落到 `setDraft`。
这**不是**上一格"断言放错位置"的老问题：这一次是点击被 disabled 挡住，不是断言点错。
补丁连同用例改动一起放在 `/tmp/traits-ui.patch`（43 行），**没有提交进仓库**——
半截 UI 留在树里，下一次跑 e2e 的人会以为那是被测代码的问题。
下一步实验定死：把 onChange 换成 `visualIdentity.motifs` 那条**已经证明可用**的写法再试一次。
若那样 dirty 就变真，问题在 `traits` 这个键本身（`textField` 的联合类型不含数组字段，
`patchProfile` 的入参类型与 `withProfile` 的合并语义要复核）；若仍然不真，问题在这个输入框挂载的位置。
不查清就不写"已完成"：现在面板上少一栏 traits，是**已知缺口**。

## §39 的第二半（补记）：角色的四栏现在真的走到生成请求里
上一次因内存耗尽（node v8 abort）退回的接线，这次跑通了并落地：
`generateDemoImage` 在拿到 `characterId` 时，把档案里的 身份 / 穿着 / 画风 / 特征 拼进**交给合成器与任务行的 prompt**
（服务端派生，不依赖前端传什么）。边界照旧写清楚：DEMO 合成器只认 prompt 的哈希，
**画不出"靛蓝斗篷"的语义**——这一格补的是接线，欠的还是像素；换上真 provider 时不必再接一遍。
凭证：`character-fields.integration.test.ts` 新增断言——生成一次后直接查 `agent_tasks.input.prompt`，
必须同时含"靛蓝斗篷 / 厚涂、暖光 / 认路很快"；变异探针把拼接那一行改回 `input.prompt` →
**红在"任务行里的 prompt 没带上穿着设定"**，还原后 `character-fields + image-studio` 两个文件 **14 条全过**。
顺带踩到一个真约束：生成角色场景**要求档案里有 palette**（没有就拒绝，不拿随便一张冒充），
所以测试角色建档后要先把视觉标识填上——这条约束第一次是在用例里被自己撞出来的。

## §39 的第二半（续）：角色肖像（Character Portrait）与一处"永远为假"的判定
同一条链上补了**为角色生成它自己的参考图**这条支路：`generateCharacterPortrait`（域层 + 路由 `z.boolean().optional()`）。

- **肖像由档案驱动，不看用户 prompt**：给 `characterId + generateCharacterPortrait` 时，
  prompt 由 身份 / 穿着 / 画风 / 特征 **加上视觉标识的轮廓与标志** 组装（`visualIdentity.silhouette` / `motifs`
  以前只在档案里躺着，没进过 prompt），用户那句话被**忽略**而不是拼在后面——否则它就不叫"由档案驱动"。
- **产出带 `characterPortrait: true` 标记**（任务行 + `genMeta`），供后续 Character → Scene 以
  `referenceAssetId` 复用它，这是"同一个角色在不同场景里认得出"的落地方式。
- 与 `referenceAssetId` 互斥（两个来源同时给就说不清照谁画）；与场景共用同一个由视觉标识导出的
  `hueAnchor`，所以肖像与场景的配色是一套，不是各画一套。

**顺手修掉一处"永远为假"的守卫**：这道判定原来写成

```ts
if (input.characterId && input.generateCharacterPortrait && !input.characterId) { /* 拒绝 */ }
```

前后自相矛盾，**恒为假**——于是"只给 `generateCharacterPortrait` 不给 `characterId`"不会被拦下，
而是**静默地按普通 Text→Image 生成一张图**（进不了角色分支、档案读不到），用户以为自己拿到了角色肖像。
这类写法 **typecheck 看不出来、eslint 也看不出来**（试过 `@typescript-eslint/no-unnecessary-condition`，
它不跨合取式推理，本仓库当前规则集同样不报）——所以防线只能放在**测那道守卫本来想守的行为**上，
这正是下面那条用例存在的理由。

**凭证**：`image-studio.integration.test.ts` 新增 5 条（只给 portrait 不给 characterId 必拒且一行都不许多、
肖像忽略用户 prompt 而带上身份/穿着/画风/特征/轮廓/标志、`genMeta.characterPortrait` 与归属列、
肖像与参考图互斥不花额度、同一角色肖像与场景同锚点但不同字节）。
**变异探针**：把那行守卫还原成旧的自相矛盾写法 → **红在"没有角色却按普通文生图放过去了——用户会以为这是角色肖像"**，
改回后 16/16 全过。`character-fields.integration.test.ts` 那一组（四栏进 prompt）同批通过，
两个文件合计 **19 条**；`npm test` **94 文件 / 1000 条全绿**。
**仍欠**：真 provider 的像素（DEMO 合成器只认 prompt 的哈希，画不出"靛蓝斗篷"的语义）。

## §39 的第二半（再续）：肖像的界面入口，以及上一次欠下的那条变异探针
面板上补了「生成肖像」按钮（`[data-character-portrait]`），**不给输入框**：肖像完全由档案驱动，
让用户填一句话再被忽略，比不给输入框更让人困惑。它的可用条件是**已存档的 palette**，
与场景那一栏的输入框无关——e2e 里就钉了这一对：色板存好之后肖像已可点、场景仍不可点。
回执也分成两档：肖像说"这是那个角色自己的参考图"，不再混进"那个角色的一个场景"里
（同一句话糊住两种东西，就是给用户一个与事实不符的交代）。

**凭证**：`e2e/character-scene.spec.ts` 扩到一条链上跑完 场景 → 肖像，**1 passed / 42.1 秒**，
截图 `screenshots/character-portrait.png`（清单两张卡、肖像那张带 DEMO 角标）。
第一次跑是红的：切走再切回角色面板时编辑器整个不见了——`CharacterPanel` 的 `selectedId`/`draft`
是组件本地 state，面板换标签页会重新挂载。失败快照先看过才改的（不是猜的）：
补一次 `[data-character-tab]` 点击，与生成场景之前那一步是同一条 remount 规矩的第二次命中。

**把上次没跑到的探针补上了**：`docs/ROADMAP.md` 里"四栏进 prompt"那一格先前那句探针结论是**没跑过就写进去的**，
这次实测：未变异 3/3 绿 → 把 `effectivePrompt = [input.prompt, look]…` 改回 `effectivePrompt = input.prompt` →
**红正好 1 条**，消息原文 `任务行里的 prompt 没带上穿着设定: expected '在雪地里' to contain '靛蓝斗篷'`（另 2 条仍绿）→
`git checkout` 还原、`git diff` 该文件为空 → 再跑 3/3 绿。

**看图看出的两处新缺口**（记在这里，别当成已经好了）：
1. 肖像卡片上的角标写的是「角色场景」——`characterPortrait` 只落在 `genMeta` 与任务行，
   没有进清单投影。卡片把肖像说成场景，与回执刚修掉的那句话是同一类错。
2. 资产卡片那排操作按钮在面板宽度下换行成"一字一行"（截图里看得见），是排版问题不是数据问题。

## 上面那两处已经补了：清单投影带上 characterPortrait
`AssetRef.characterPortrait` → `assetRowToRef`（读 `genMeta.characterPortrait === true`）→
`AssetsPanel` 角标分两档：肖像说「角色肖像」，场景仍说「角色场景」。
按钮那排加上 `flex-wrap`，整排不再被压到一字一行。

**凭证（两个方向都钉了）**：`image-studio.integration.test.ts` 那条肖像用例现在同时断言
"肖像的清单投影有这一格"与"同一角色的**场景**没有这一格"——只断言前者，一个永远写 `true` 的映射照样过。
变异探针：把 `assetRowToRef` 里那行映射删掉 → **红正好 1 条**
（`清单投影里没有 characterPortrait：卡片会把肖像一律说成"角色场景": expected undefined to be true`，另 15 条仍绿）；
还原后 **16/16 全过**。e2e 那条链加了两条角标断言，**1 passed / 33.6 秒**，
截图 `screenshots/character-portrait.png` 里两张卡各自写着「角色场景」「角色肖像」，按钮不再一字一行。

**探针过程里踩到的自己的坑**（下次别再踩）：还原用的是 `git checkout -- <文件>`，
而那次那个文件**带着未提交的新代码**——checkout 把探针改动和我刚写的映射行一起冲掉了，
于是"还原后的对照跑"红了。红的是我的还原程序，不是被测代码。
教训：`git checkout --` 只对**与 HEAD 干净**的文件安全；文件本身有未提交工作时，还原要用
"记下原文再逐字写回"，或者先提交再做探针。

## §39 的闭环：肖像可以当"同一个角色的下一个场景"的参考
上一节记的"与 `referenceAssetId` 互斥"只对了一半，这里把范围说清：

- `referenceAssetId + generateCharacterPortrait` **仍然拒绝**——肖像由档案驱动，塞一张图进去当参考，
  "由档案驱动"那句话就又不成立了。
- `referenceAssetId + characterId` **放行**，但那张参考图必须是**这个角色自己的肖像**
  （服务端按 `assets.character_id` 与清单投影的 `characterPortrait` 验）；拿同角色的一张场景、
  或别的角色的肖像当参考一律拒绝，且拒绝时一行都不许多、额度一分不扣。
- 同时给参考图时，色相锚点取**量自那张肖像像素**的那个（`anchor ??=`），档案继续给语义
  （身份/穿着/画风/特征/轮廓/标志）。这两件事分开说清楚：档案说"画的是谁"，肖像说"照哪张图画"。
- 界面入口：肖像卡片多一个「以此生成场景」（只有肖像卡有——拿场景当参考再生成场景不是"角色身份"）。
  回执分成四档，新那一档写"色调取自它那张肖像量出来的主色"，不写"取自视觉标识"，因为这一档不是。

**凭证**：`image-studio.integration.test.ts` **18/18**（新增 2 条）。锚点那条不是拿生产代码自己跟自己比：
测试里独立 `openAssetForOwner` 读回肖像字节、再 `extractVisualDna` 量一遍主色，要求 `genMeta.anchorDominant`
等于**这次测量**；归属那条带反向对照（"我自己的肖像当参考就该放行"），否则两次红只是因为"谁都拒绝"。
变异探针（两次是叠加跑的，第二次的红数里含着第一次的两条）：
① 把归属判定改成恒不拒绝 → **红 2 条**，消息分别点名"不是这个角色肖像的图被当成角色参考放过去了"与
"同角色的一张场景被当成角色参考图放过去了"；② 再把 `anchor ??=` 换成 `anchor =` → 多红 1 条
`带参考图时锚点没走测量：照这张图画变成了照档案画: expected '#2e7d32' to be '#e9cd82'`——
这一条同时证明"量出来的主色"与"档案声明的第一色"确实不是同一个值，断言不是空转。
还原用 md5 与探针前核对一致后重跑 **18/18 绿**。
e2e 那条链现在一次点完三档（场景 → 肖像 → 以肖像延伸场景），**1 passed**，
截图 `screenshots/character-scene-from-portrait.png`：三张卡的角标依次是 角色场景 / 角色肖像 / 角色场景。

**边界照旧**：DEMO 合成器只认 prompt 哈希与一个色相锚点，所以"同一个角色认得出"今天可测的只有**色调**那半；
换真 provider 时这一格不必重接，欠的还是像素。


## §40 的第一片：`packages/video-model`——分镜与时间线先是模型，后才是要生成的东西
需求那条流程是 `Prompt → Storyboard → Shot list → Image references → Video generation → Timeline`。
本机没有视频 provider，所以这一片只做前三步，而且**明说自己不是 AI 分镜**：
`planStoryboard()` 是确定性断句（分隔符切句、首镜宽景尾镜特写、含运动词给跟移并加长时长），
每一条规则都进 `notes`，界面上要原样显示——与 `GamePlan.notes` 同一口径。

- **不凑数**：镜头数 = 断句数。一句没有标点的话就一镜，并在 `notes` 里说"没有可断的标点"；
  只剩标点或空白的输入切出 0 镜，说的是"没有输入句子"，而不是"生成了一张空分镜"。
- **并镜不丢内容**：超过 12 段时把剩下的并进最后一镜，`notes` 里报的段数在改动之前量好
  （先改后量就会报出"1 段"这种假数字——这一条就是这么被抓到后改的）。
- **时间线是投影不是第二份真值**（§16）：只从 `shots` 累加偏移。§41 点名的轨里
  audio / subtitles / effects **存在但为空，并各带一条 `emptyReason`**——缺这一句，
  界面上"没有音频"与"渲染失败"就长得一模一样。
- **没有一帧视频就不说能播**：`playable` 要每一镜都有 `videoAssetId`，否则 `blockers` 里
  写清"有 4/4 镜还没有视频帧"，并注明"缺的是帧，不是布局"（时间线照样可编辑）。

**凭证**：`packages/video-model/test/storyboard.test.ts` **14 条纯单测**（不碰数据库）。
三次变异探针各红**正好 1 条**：① 并镜改成直接丢尾段 → 红在镜数那条（11 ≠ 12）；
② `playable` 不看视频帧 → 红在"没有帧就该不可播"；③ 三条空轨整个不摆 →
红在 `§41 点名的 audio 轨整个不见了`。还原以 md5 与探针前核对一致后 **14/14 绿**。
包内 `tsc` 干净、`eslint .` 干净；根 `typecheck` 加了第五个包，`vitest.config.ts` 加了 alias。
整套 `npm test` 在这一片之前是 **94 文件 / 1002 条全绿**（275 秒，commit `bb6e322`）。

**这一片欠的**（别当成已完成）：分镜的存储与投影进 `document`（现在只在包里）、
Studio 的「分镜」面板入口、镜头的 `referenceAssetId` 接上 §38/§39 那条图像链、
`Video generation` 那一格要真 provider、§150 的撤销补丁（第二片，见下）、
§41 的 Timeline 编辑界面（trim / reorder / regenerate / extend / transition）。

## §40 的第二片：`packages/video-model/src/patch.ts`——分镜也走「一次编辑 = 一个可撤销事务」（§150）

形状照 `packages/design-model/src/patch.ts`（那一份是仓库的口径，不另起一套）：
纯函数 `applyStoryboardPatch`、吃**改动前文档**的 `invertStoryboardPatch(before, ops)`、
以及把两者接成事务的 `storyboardTransaction(before, ops) → { applied, undo, redo }`。
五个 op：`addShot` / `removeShot` / `restoreShot`（只作为逆出现）/ `moveShot` / `updateShot`。

四条容易说谎的地方与它们的钉子：
- **逆必须记"原来在第几位"**：`removeShot` 的逆带的是删除时那一位，否则撤销会把镜头追加到
  末尾，顺序就回不来了。连删两镜时逆按倒序排，一次撤销全数归位。
- **逆吃旧值**：`updateShot` 的逆交换 `before` / `after`；拿改动后的文档算逆，撤回去的是新值。
- **清空可选字段是删键**：`after: { referenceAssetId: undefined }` 走 `delete`，
  不是留一个值为 `undefined` 的键——测试用 `in` 与 `Object.keys` 钉住，`toEqual` 对这两种是盲的。
- **找不到镜头抛错，不静默跳过**：静默跳过会造出一次"看起来成功"的撤销，其实什么都没做（§159）。
  空分镜上移动也报错，说清是第几位没有镜头。

**凭证**：`packages/video-model/test/patch.test.ts` **14 条**（含混合事务：删、插、改、移一次做完，
撤销后逐字节回原样；`JSON.stringify` 比较，不让 `undefined` 键与缺失键蒙混）。
包内 `tsc` 与 `eslint` 干净，`packages/video-model` 现在 **28/28 绿**（14 断句 + 14 补丁）。

**变异探针**：五个各红且红在该管的那几条（控制组 14/14 绿，还原后 md5 与探针前一致
`7486fd64…`）：① `restoreShot` 记下末尾 → 3 条红（单删还原、连删倒序、混合事务）；
② `updateShot` 的逆不交换旧值 → 4 条红（改字段、清空补回、混合事务、事务的 redo 那份）；
③ `addShot` 插引用而不是插副本 → 1 条红（改结果写回了调用方）；④ 逆不倒序 → 2 条红；
⑤ 找不到镜头返回 -1 不抛 → 1 条红（那条越界/未知 id 的用例）。

## §40 的第三片：分镜进库——`storyboards` 表 + 报文契约 + 归属核对（还没有界面）

`packages/video-model` 那两片今天有了落点：`infra/migrations/0017_storyboard.sql` 建 `storyboards`
（一项目一份，`project_id` 上挂唯一约束）、`domain/storyboards.ts` 读写、
`/api/projects/[projectId]/storyboard` 的 GET/PUT，形状与 worlds / games 完全一致（不另起一套）。

- **报文与结构各管一件事**：`StoryboardDocumentSchema`（`@nexus/schemas`）管字节，结构权威在
  `@nexus/video-model`（纯函数包，不碰库）。三份枚举清单写了两遍，所以 `SHOT_CAMERAS` /
  `SHOT_TRANSITIONS` / `STORYBOARD_ARROWS` 改成**运行时常量、类型从它派生**，
  契约测试逐位比两边——模型加字段而报文没跟上时，zod 会把那一格静默剥掉，
  这条测试用键清单比对把它抓出来（"存得下但查不着"是同一类 bug）。
- **归属核对**：镜头能挂 `characterId` / `referenceAssetId` / `videoAssetId`。不核对的话，
  从别的项目复制来的一份分镜就成了一条读取别人资产的通道（§80 那条链的反面：
  存进去的指针也得只指得回本项目）。报错点名是哪一镜、哪个 id。
- **时间戳放列不放文档**：文档要能被同一份输入重复投影出逐字节相同的结果（§16 可重放），
  "存过几次"不是内容。并发用可选 `baseUpdatedAt`：带上就拒绝更旧的写，不带就是最后写入者赢
  ——第一次建档手里没有基准，逼它编一个时间戳等于让它伪造并发检查。
- **时长上限 600000 毫秒远高于模型会产生的 3000/4500**：边界用来拦垃圾输入，
  不用来否决作者真想要的长镜头（贴着默认值写上限，长镜头就只剩一条 500）。

**凭证**：`packages/schemas/test/video-contract.test.ts` 8 条 + `apps/web/test/storyboards.integration.test.ts` 8 条
（真实 Postgres：null / 往返 / 契约外进不来且库里不留痕 / 别的项目的角色被拒且反向对照通过 /
不存在的资产 id 被拒（镜头那一格与 source 那一格各一次）/ 更旧的写被拒 / 唯一索引真在库里
（比 `23505` 与约束名，不让"连接断了"冒充约束生效）/ 删项目级联）。
`npm run db:migrate` 应用 0017（6 条语句）；全量 `typecheck` 干净。
两个变异探针各红**正好 1 条**：① 关掉角色归属那道判断 → 红在"挂别的项目的角色该被拒"；
② 把并发比较的 `<` 换成 `>` → 红在"更旧的写该被拒"。还原后 md5 与探针前一致（`2289e6b7…`）且 8/8 绿。

**这一片欠的**：Studio 的「分镜」面板入口（现在只有 HTTP + 库，界面上点不出来）、
分镜进 §49 知识索引（对 AI 不可见）、镜头参考图真的接上 §38/§39 那条生成链、
§150 的补丁与库里的行怎么配（撤销栈在客户端，写库要过同一份 PUT）、发布链路里没有分镜这一格。

## §40 的第四片：「分镜」面板进 Studio——每次改镜头都是一个补丁事务

左栏第 6 个页签「分镜」（`StoryboardPanel` + `storyboardStore`），把第三片那套 HTTP 变成了点得出来的东西：
一句话 → 切成镜头表 → 逐镜改机位/转场/时长/提示词 → 撤销/重做 → 刷新还在。

- **切分不是生成**：按钮叫「切一版分镜」，空状态与 notes 都明说这是**本地确定性断句**、
  不是模型给的镜头语言。切不出镜头（只有标点）就一句话回执 + **一次 PUT 都不发**，
  不往库里塞一份 0 镜的文档冒充"生成好了"（§159）。
- **§150 在分镜里是真的**：`applyOps` 走 `storyboardTransaction`，正做进撤销栈、逆补丁应用到本地，
  随后**照常 PUT 一次**——撤销不是把界面擦回原样，库里那份也跟着回。栈刻意留在客户端：
  库里存的永远是当前状态，与画布"Command 改文档、持久层只看最终形态"的分工一致。
  建档（`planFrom`）换掉整份真值，不是"一次可撤销的编辑"，所以它清空两个栈，
  而不是留一个撤不回原状的空步。
- **时间线可读不可播**：`playable` 一直是 false，界面把**为什么**一起显示（缺的是帧不是布局），
  audio / subtitles / effects 三条轨各带一句"为什么是空的"——没有这句，"没有音频"和"渲染失败"长得一模一样（§41）。
- **非法值改不掉那一镜**：时长写 `abc` → 输入框回到原值 + 一句"没写进去"，
  保存状态不变红。客户端拦的是"这一格根本没动"，服务端的 1..600000 仍是第二道门。

**凭证**：`apps/web/test/storyboard-store.test.ts` 5 条（fetch 桩按 route.ts 的真实响应形状写：
建档不带基准 / 服务端给的基准原样带回 / 被拒时那句服务端原话不被"HTTP 400"替换 /
撤销发出去的那份文档逐字节等于改动前 / 空输入零次 PUT）。
`e2e/storyboard.spec.ts` 2 条在真 Chrome 里点：3 镜、改机位、撤销后点「重读」仍是 wide、
删最后一镜能回到**原来那一位**、整页刷新后 3 镜还在、不可播与 blockers 读得出来。
截图 `screenshots/storyboard-panel.png`、`screenshots/storyboard-duration-rejected.png`。
三个变异探针各红**正好 1 条**：① 去掉 `stepBack` 里那次 `commit()` → 红在"撤销是一次真的写"；
② 去掉时长那道客户端守卫 → 红在 e2e 的"没写进去"回执（元素压根不出现）；
③ 去掉镜头卡头部的 `flex-wrap` → 红在 `toBeInViewport()`（"viewport ratio 0"：
264px 的面板里 ↑↓＋✕ 被裁出界外，Playwright 点得到但用户看不见）。
还原后 store md5 与探针前一致（`30d7b41c…`）。全量 `npx vitest run` 99 文件 / 1051 条绿，`npm run typecheck` 干净。

**这一片欠的**：分镜进 §49 知识索引（AI 看不见它，**已由下一片补上**）、镜头的 `referenceAssetId` 真的接上 §38/§39 那条生成链、
`videoAssetId` 要真 provider 才有值（时间线因此永远不可播）、发布链路里没有分镜这一格、
移动镜头（↑↓）与插镜（＋）只有 e2e 里那一条被点过。

## §49 × §40：分镜进知识索引——存得下但查不着，等于对 AI 不存在

前三片把分镜存进了库、给出了界面，但 `syncProjectKnowledge` 的语料清单只有世界条目 / 角色档案 / 记忆：
一份写着"第 2 镜是航拍 4500 毫秒"的分镜，检索里一块都查不到。这一片把那一格补上。

- **一镜一块 + 来源句子一块**：块体是提示词 + `机位：` / `转场：` / `时长：… 毫秒`（有角色或参考图才带上那两行），
  标题是「分镜标题 · 第 N 镜」。
- **`notes` 刻意不进**：那是投影对自己的解释（"这一版来自本地确定性断句"），不是故事内容。
  让它进索引，查"分镜"会命中一排规则说明书——比查不到更容易误导装配上下文的那一方。
  这条不是口头承诺：纯函数测试先把"notes 里确实有那句话"钉住，再断言没有任何一块含它。
- **`sourceId` 认的是行，不是文档自己写的那个 id**：`knowledge_chunks` 的唯一约束
  `knowledge_chunks_source_key` 是**全局**的 `(source_type, source_id, chunk_index)`，
  而客户端切完一版分镜手里拿的 id 是模型默认值 `storyboard-1`（`saveStoryboard` 原样存客户端文档，
  只有读路径换成行 uuid）。用文档 id 的话第二个项目就撞约束——**这不是推演，是这次真的红了**：
  `23505 duplicate key`，连带 `storyboards.integration.test.ts` 里 5 条与本片无关的用例一起挂。
  所以那条"sourceId 前缀是行 uuid、且不含文档 id"的断言单独存在，先于任何检索用例。
- **同步由写路径 arm**：`saveStoryboard` 两个成功返回前各调一次 `syncProjectKnowledge`，
  与角色/世界同一口径。用户不需要知道"重建索引"这个按钮存在。
- **界面跟着改口**：`SOURCE_LABELS` 加 `storyboard: 分镜`；检索面板自述那句从"世界条目、角色档案与记忆"
  改成把分镜镜头算进去——库里真的装了分镜之后，那句话再说"只有前三样"就是界面在撒谎。
  另外命中卡原来整条标题走 `truncate`，264px 面板里被截掉的正好是"第 N 镜"这半句
  （截图里看得见：两块都显示成"夜色里的港口，一台旧起…"，分不出是哪一镜）。
  现在块名单独占一格不截，文档名可以截。

**凭证**：`knowledge.test.ts` 新增 4 条纯函数用例（3 镜 → 4 块 / `#source` 那块 / sourceId 认行不认文档 id /
每块回得去自己那一镜 + notes 不掺进来）。`knowledge.integration.test.ts` 新增 2 条真库用例：
存一版分镜后 `bySource.storyboard === 镜头数 + 1`、查那句能命中"第 1 镜"、命中里没有规则说明书；
整版换掉（来源句子跟着变）后旧句子不再命中分镜——**只改一镜的提示词不构成陈旧**，
因为那句话同时是 `#source` 块的内容，这条写在用例注释里免得下一个人误以为漏测。
第二条再同步一次块数不变（整份重建是幂等的，不是越同步越多）。
`e2e/storyboard.spec.ts` 第 3 条在真 Chrome 里按顺序证明因果：新项目里查"缆绳"→ `0 块` + 没有命中；
只点一次「切一版分镜」并保存（不碰重建索引）→ 同一个词变成 `4 块` + 「分镜」来源命中 + "第 3 镜"在视口内。
截图 `screenshots/storyboard-retrieved.png`。
**变异探针**：抹掉 `saveStoryboard` 里那两行同步调用 → `2 failed | 16 passed (18)`，
两条红都落在新的 `§49 × §40` describe 里，其余 16 条（含 8 条 storyboards 集成）不动——
证明"是写路径 arm 了索引"，而不是"测试自己调了一次 sync 所以绿"。还原后 md5 与探针前一致（`9252f987…`）。

**这一片欠的**：游戏文档（§54）是同一形状的断链——`syncProjectKnowledge` 里没有 `games`，
所以游戏设定对 AI 也不存在（**已由下一片补上**）；分镜进 AI 的上下文装配（现在发出去的是 designIndex，语料检索只服务检索面板）；
向量那一半仍要 provider；§165 全平台搜索没有分镜这一类目标。

## §49 × §54：游戏设计进语料库——填过的才算内容，空骨架一块都不进

上一片欠的那一格补上了：`syncProjectKnowledge` 的语料清单此前是世界条目 / 角色档案 / 记忆 / 分镜镜头，
`games` 不在里面。一份写着"苦痛主教只在钟声里移动"的游戏设计，检索里一块都查不到。

- **一个填过的实体一块，外加概述一块**：标题是「游戏名 · 实体名（类别）」和「游戏名 · 概述」，
  块体是说明 + `标签：` / `数值：k=v、…` / `引用：角色 → 目标名`。
- **模板骨架一块都不进**（§159）：`createGame` 给的是 11 类各一个空实体，名字就是类名。
  那种东西进索引，查"游戏设计"会命中一排空壳，而空壳表达的恰恰是"还没设计"——
  比查不到更容易误导装配上下文的那一方。判据是"这块有没有可检索的文字"（说明/标签/数值/引用任一非空），
  刻意比进度条用的 `fleshedOutCount`（只看说明与数值）**宽**：只打了标签或只连了引用的实体仍然有东西可查。
  这条不是口头承诺：纯函数用例先把"骨架确实有 11 个实体、四样全空"钉住，再断言切出 `[]`。
- **引用渲染成目标实体的名字**：「追杀 → 守夜人」是查得到的一句话，「追杀 → ge_mb3k9x」不是。
  引用两头都在同一份文档里，所以这里能就地解析，不需要第二次查询。
- **数值按 key 排序再拼**：对象键的顺序来自客户端，不是来自内容；不排序的话同一份设计两次切分
  可能得到不同的块，"重建索引看差异"就没有意义。用例只换插入顺序、其余完全一样，来证明这一点。
- **`sourceId` 仍然认行 uuid**：上一片那个 `23505` 的形状留了一条独立用例——
  两个项目各存一份**文档 id 相同**的设计，两边的块必须都在，而不是第二个项目插不进去。
- **同步由写路径 arm**：`saveGame` 两个成功返回前各调一次，用户不需要知道"重建索引"这个按钮存在。
- **界面跟着改口**：`SOURCE_LABELS` 加 `game: 游戏`；检索面板自述那句从"…与分镜镜头"改成把游戏实体算进去。
  `games.ts` 顶部那句"要检索时走 §69 的索引"也跟着改了——§69 是代码索引，游戏设计要被检索走的是 §49。

**凭证**：`knowledge.test.ts` 新增 6 条纯函数用例（该文件 21/21）：骨架 → `[]` / 填过的 → 2 块且标题带类别与类型标签 /
引用出名字不出 id / 数值顺序无关 / `sourceId` 认行不认文档 id / 只有标签的实体照样进（而 `fleshedOutCount` 报 0）。
`knowledge.integration.test.ts` 新增 3 条真库用例（与 `games.integration.test.ts` 8 条一起 21/21）：
空骨架存进去 `total === 0` → 填完 `bySource.game === 2` → 查那句命中「苦痛主教」→ 换掉说明后**旧说法不再命中、新说法命中**
→ 再同步一次块数不变；带引用的那块在真库路径命中「追杀 → 守夜人」且不含 `ge_` 那种内部 id；
两个项目存同一份文档 id 各自 2 块、直接数行是 4。
`e2e/studio.spec.ts` 第 4 条 `@smoke`（19.0s）在真 Chrome 里按顺序证明因果：新项目 `0 块` →
点一次「创建游戏骨架」（11 个实体进库）回到检索面板**仍然是 `0 块`** →
填概述 + 那位敌人的名字与说明 → `2 块` + 中文「游戏」来源 + 块名「苦痛主教（敌人）」在视口内 + 「游戏类型：视觉小说」。
截图 `screenshots/game-retrieved.png`。
**变异探针**：抹掉 `saveGame` 里那两行同步调用 → `3 failed | 18 passed (21)`，
三条红全落在新的 `§49 × §54` describe，其余 18 条（含 8 条 games 集成）不动——
证明"是写路径 arm 了索引"，不是"测试自己调了一次 sync 所以绿"。还原后 md5 与探针前一致（`8b697d91…`）。
探针自己也踩了一次：第一次用 `binary` 写回把中文重编码了，两个测试文件都 `Transform failed`、
**0 条断言跑起来**——"0 red"不是"没红"，得先看 runner 的报错再下结论。

**这一片的门禁红过，而且红得该记下来**：我先跑了一遍 `npm run lint` 就以为绿了——那条命令写成
`npm run lint > log; echo EXIT=$?; tail log`，**退出码来自 `tail` 不是 lint**，而我读的是还没跑完的日志头部。
pre-commit hook 把真话说出来了：13 个 TS 错，全落在两个测试文件里。一处是 `ofKind` 的入参类型写成
`{ sourceId: string }[]`，于是后面那些 `.title` / `.content` 断言在类型层根本不存在——
vitest 不做类型检查，所以"运行时 21/21 绿"完全没覆盖到它。**辅助函数把字段抹掉，等于让那些断言从门禁眼里消失**，
下一片给 helper 定类型时要用生产的那个类型（`Chunk`），不要就地手搓一个形状。
另一处是 `${first.ok ? second.reason : first.reason}`：拿一个的判别式去取另一个的分支字段，类型不通过，
改成两条各自出声的 `throw`（报错也顺便说清了是哪一份存失败）。
hook 第二轮又抓出一条 e2e 的：`toHaveCount(1, '主张')` 不合法——**Playwright 的 matcher 第二参只收
`{timeout}`**，红字里要带主张得写在 `expect(entityHit, '主张')` 上。vitest 的 `expect(x, msg)` 与它同形，
所以这条只在 `tsc -p e2e` 那一步才现形：跑过一遍 e2e 不等于类型层过。

**这一片欠的**：语料的内容还没进 AI 请求——`context.ts` 只报块数与来源分布，发出去的是 designIndex，
检索只服务检索面板（§66-71 里"按相关性取内容拼上下文"那一半没做）；
§165 全平台搜索有 `games`（名字+摘要）但**没有 `storyboards`** 这一类目标；向量那一半仍要 provider。

## §49 × §16：设计正文进语料库——清单最后一格「Documents」，一块就是一页

§49 那份清单（Lore / Characters / History / Locations / Items / Quests / **Documents**）里，
前六格在这片仓库已经有了主人，最后一格一直没人认领：`syncProjectKnowledge` 的语料清单是
世界条目 / 角色档案 / 记忆 / 分镜镜头 / 游戏实体。一句写在落地页上的"雾里的港口只有一条会响的钟"，
在检索里一块都查不到——设计文档是这个产品的主文档，却是语料库里唯一缺席的那一类。

- **一块 = 一页，行首带节点名**：块体是 `节点名：文字` 的行，标题是「文档名 · 页面名」。
  逐节点切块是另一个方向的选择，但对 4000 节点的项目会产出上千条十几个字的碎语料，
  面板滚不完，命中读起来也是"一句没有出处的话"；按页聚合之后，拿到块的一方仍然知道该改哪个节点。
- **只吃 `text`**：形状、颜色、token 引用是 §70 索引的活（`DESIGN_INDEX_OMISSIONS` 里明写了
  "语义检索与相关性排序"不归它），代码节点是 §69 的活。这里刻意不越界。
- **纯布局的页一块都不进**（§159，和 §54 那条"空骨架不进索引"是同一句话）：
  一页全是空 frame 就没有可检索的文字，硬切一块等于告诉 AI"这页有内容"。
- **不索引 `page.meta` 的描述与路由**：`pages` 表没有这两列（`writeDocument` 只落 name / 尺寸 / 背景），
  把它们切进语料就是索引一份库里不存在的东西——下一次从库里重读就对不上，块却是查得到的谎话。
- **走不到的节点仍然进块**：`designNodes` 存的是整页 `Object.values(page.nodes)` 全量，
  从页面根 BFS 不到的文字真的在文档里。单列一段「没有接进页面树的节点」并标 `（不在页面树里）`，
  不静默丢——静默丢就是"存得下但查不着"的另一半。
- **`sourceId` 带项目 id**（`${projectId}#page-${page.id}`）：全局唯一约束是
  `(source_type, source_id, chunk_index)`，页面 id 只是文档内的命名空间，
  不带项目就会重演上一片那个 `23505` 的形状。

**两条同步路径，各自的删除范围等于各自的重写范围**：
- `syncDesignKnowledge(projectId, document)` 只删/插 `design` 这一类，由 `saveDocument` 与 `createProject`
  在事务**外面** arm（同步走的是 `getDb()` 那条独立连接，它在事务里写的 chunk 不跟着外层回滚——
  文档没存成而语料里已经是新句子，检索就会回答一份不存在的设计）。频率是每次自动保存，
  所以它绝不去重切全世界。
- `syncProjectKnowledge(projectId, { includeDesign })`：**不带**这个参数时（世界/角色/记忆/分镜/游戏
  那些写路径用的就是它）既不重切设计，也就**不许删** `design`——删除范围大于重写范围就会变成
  "一次世界保存把设计正文从索引里抹掉，而它只有下次编辑设计才回来"。
  带 `true` 时才付整档读取那一遍（页面 + 节点 + token + 组件的全部行），而它只有一个调用方：
  界面上那颗「重建索引」按钮。**这是历史项目唯一的补索引路径**——这批内容进库之前建好的项目里
  设计正文一块都没有，写路径永远不会替它补；按钮上的"重建"若只覆盖清单的七格之六，
  那就是半个真的功能。

**界面跟着改口**：检索面板加了按来源计数的芯片（`data-knowledge-source="<type>"`，缺席即"这一类真的没块"），
`SOURCE_LABELS` 补 `design: 设计文档`，面板自述那句把"设计页面的文字节点"算进语料。
`N 块` 这个总数从这一片起不再是证据——一个全新项目现在合法地占一块设计正文。

**凭证**：`knowledge.test.ts` **27/27**（这一片新增 6 条 `chunksFromDesign` 纯函数用例：起始模板 → 1 块且
标题带页名 / 擦掉文字只剩布局 → `[]` / `sourceId` 认的是"项目 + 页面行" / 走不到的节点仍然进块并写明不在树里 /
同一份文档切两遍完全一致 / 长文案切成多块且每块 ≤ `CHUNK_MAX`、`chunkIndex` 连续、共用一个 `sourceId`）。
`knowledge.integration.test.ts` **16/16**（新增 3 条真库用例：新建项目即有设计语料 → 改文案后旧句子再也查不到、
新句子查到、块数不涨 / 写路径的重建**不碰**设计块（脏块原地不动）而「重建索引」按钮补得回脏块 /
两个项目的同名页面各自成块且互相查不到）。
`e2e/studio.spec.ts` 新增那条 `@smoke` 在真 Chrome 里走 图层选中 → 属性面板改文案 → 防抖自动保存 → 检索面板，
中间没有任何替身。**第一轮 `-g "检索面板"` 三条：2 passed / 1 failed**，绿的两条是这条新用例与分镜那条，
红的是一条 `已保存` 的 5s 超时（见下）。**第二轮三条全红**，红的不是切分也不是内容：面板里明明白白写着
`HTTP 404`——`GET /api/projects/<id>/knowledge` 404，`stats` 因此停在 `{}`，芯片一块都不渲染。
同一次跑之后直接数库（`docker exec nexus-postgres psql`）证明这三个项目**各自都有 `design 1`**：
写路径在浏览器流程里也成立，红的是面板那次读取。404 的成因还没定位（`projectBelongsTo` 为假？
`studio.projectId` 晚到？），记成独立的 BUG，不在这一片里靠加大超时糊过去。
糊过去。

补一条量到的线索：同一台机器上 `npm run typecheck` 之后红在 Next 自己生成的
`apps/web/.next/dev/types/routes.d.ts:97`（TS1128，生成物被截断），
删掉整个 `.next/dev` 重生成之后门禁才回到绿——也就是说那次跑里 dev 服务器的路由产物
本来就坏了一半，404 有更可能的解释：不是归属判断，是路由表没编译出来。
但 BUG 仍然挂着，因为界面那句“索引里有 0 块语料”是在一次失败的读取之后说出来的：
查不到要说“查不到”，不能报一个像内容的数字。

**变异探针**（4 条，每条只落一处；全部还原后 md5 与基线一致 `projects f01d57dc / knowledge c42075f2`）：
抹掉 `saveDocument` 里那句同步 → `2 failed / 16`（红的正是"新建即有语料"与"两个项目同名页面"）；
`syncProjectKnowledge` 读了设计文档却不切块（`void chunksFromDesign(...)`）→ `1 failed / 16`，
红的正是那条脏块用例；把孤儿段的 `!reached.has` 反过来 → `1 failed / 27`（走不到的节点那条）；
`if (!lines.length && !orphan.length) continue` → `if (false)` → `1 failed / 27`（只剩布局那块都不产的那条）。
探针脚本自己先红了一次：`createHash` 从 `node:fs` import，**0 条用例跑起来**——"没输出"不是"没红"。

**这一片动了上一片的证据**：§49 × §54 那条 `@smoke` 原来靠"新项目 `0 块`"证明骨架没进索引，
现在新项目是 `1 块`（它自己的设计正文），所以三条断言改成芯片：`设计文档 1` + `game` 缺席 → 填完之后 `游戏 2`。
证据是变强了：「某一类一块都没有」比「整个库是空的」更贴近要证的事。
同一条用例里 `已保存` 那句拿默认 5s 等，这一轮红过一次（收到的是"保存中…"），补成 20s 与它的兄弟断言一致——
**5 秒的预算在冷启动的 dev 服务器上本来就不算余量，别把负载读成回归，也别把回归读成负载**：
第一轮里这条新用例是绿到走完最后一步的（`screenshots/design-retrieved.png` 的落盘就是它的收据）。

**这一片欠的**：语料内容仍然没进 AI 请求（`context.ts` 只报块数与来源分布）；
§165 全平台搜索仍然没有 `storyboards` 这一类目标；向量那一半仍要 provider；
`includeDesign` 那条重建走的是整档读取，4000 节点档要付多少**还没量过**（§147）。

## §73：读不到 ≠ 零块——一次失败的读取在界面上要说"读不到"

上一片收尾时那条 e2e 线索有了答案，也留下一句谎要修。

- **404 的成因已经量到**：删掉被截断的 `apps/web/.next/dev`（Next 自己生成的 `routes.d.ts:97` 报 TS1128）
  重生成之后，同一组 `-g "检索面板"` 从 3 failed 变成 **3 passed (1.1m)**，
  再往后是 **4 passed (34.0s)**。所以红的是 dev 服务器的路由产物坏了一半，不是切分、不是归属判断——
  那三个项目当时直接数库各自都有 `design 1` 块。**结论：e2e 整组突然全红，先怀疑生成物，再怀疑代码。**
- **但界面那句谎是真的**：面板当时的输出是 `HTTP 404` 旁边写着「索引里有 **0** 块语料」，
  头部总数也是 `0 块`。一个失败的读取被翻译成了一个像内容的数字——
  看的人据此得出"这个项目没有语料"，而库里明明有（§159：半个真的界面也是谎）。
- **改法**：`RetrievePanel` 把"读取失败"和"库里真的没块"分成两种状态（`statsFailed`）。
  失败时头部总数写「读不到」（`data-stats-failed="true"`），来源芯片**一个都不渲染**——
  缺席本来是"这一类真的没块"的证据，不许替一次网络故障作证；空闲那句改成"不报块数"，
  并给一个「重试」入口。成功那次读取会把标记清掉，所以重试真的能拿回块数与芯片。

**凭证**：新增 `@smoke` 一条（`e2e/studio.spec.ts:1116`，8.8s）：用 `page.route` 把
`GET /api/projects/*/knowledge` 拦成 503（**拦真请求，不喂假数据**；放行分支仍然 `route.continue()`），
断言头部是「读不到」、空闲句 `not.toContainText('0 块')`、`[data-knowledge-source]` 计数 0；
再 `unroute` + 点「重试」，断言 `设计文档 1` 芯片回来、头部 `1 块`、`data-stats-failed="false"`、
不可用提示消失。整组 `-g "检索面板"` **4 passed (34.0s)**，`npm run typecheck` 0。
**变异探针**（3 条，各自命中一处、跑完还原且 md5 与基线一致 `de7a4bbc`）：
空闲句退回无条件报数字 → `1 failed`，红的正是 `not.toContainText`；
头部总数退回无条件报数字 → `1 failed`（`toHaveText('读不到')`）；
成功读取后不清 `statsFailed` → `1 failed`（重试那句拿不回数字）。
三条都是断言红而不是崩，脚本自己也红了一次：`createHash` 从 `node:fs` import——
**同一个坑在同一个 session 里踩了第二遍**，因为探针文件是从上一份复制的；
import 坏掉的探针进程**0 条用例跑起来**，那不是"没红"。


## §165 第九组：分镜进全平台搜索——标题查表，画面描述查 §49 的语料块

§49 × §40 那一片记下的欠账（"全平台搜索有 `games` 但没有 `storyboards`"）在这一片还上。
一句写进分镜的画面描述，项目内检索查得到，跨项目什么都查不到——而用户找东西是从搜索框开始的。

- **两个来源，各自证明各自的**：① 分镜标题查 `storyboards` 表，这条**不依赖语料库**，
  那批内容进库之前存下的旧分镜也一直搜得到；② 画面描述查 `knowledge_chunks` 里
  `source_type='storyboard'` 的块——那份文本本来就是为检索切的，且 `notes`（"本地确定性断句"那类
  规则自述）不在块里，所以搜"分镜"不会命中一排规则说明书。命中行带着**是哪一镜**（块标题「文档名 · 第 N 镜」）。
- **join 回 `storyboards` 而不是直接用 `chunk.project_id`**：分镜删了而块还留着的那个窗口里，块是孤儿；
  拿块当结果就是给用户一个点开即 404 的链接——§165 自己那句话："搜出一条打不开的结果比搜不到更糟"。
- **`sourceId` 的形状是我真踩过的坑**：分镜的块认的是 `${行id}#shot-…` / `${行id}#source`，不是裸行 id。
  第一版写等值 join，`14` 条里红 `2` 条，**红的正好是**"画面描述命中"与"孤儿块不产结果"那两条：
  等值 join 让语料块这条路一条都匹配不上，于是它会安静地什么都搜不到。这条坑留在代码注释里，
  也留在探针 B 里（见下）。
- **测试的前提要自己站住**：`planStoryboard` 的标题就是那句来源文本，任何句子片段都会先被标题那条路
  命中，语料块那条路就永远测不到。做法是把标题改开（重命名一份分镜正是用户会做的事），
  再拿**最后一镜**的文本去查；镜头序号从同一份 doc 推导，不是我抄进来的常量。
  孤儿块那条先断言"块真的还在库里"，否则最后那条 `toEqual([])` 是在测空气。
- **界面跟着改口**：`/search` 页面那句"八类目标"是写在脸上当能力范围用的，九组就说九组；
  `SEARCH_NOT_COVERED` 补了一条诚实边界——旧分镜的画面描述要等一次保存或点「重建索引」才可搜，标题不受影响。

**凭证**：`search.integration.test.ts` **14/14**（新增 3 条：标题与描述两条路各自命中、`detail` 分别是
「分镜标题」与「第 N 镜」，并配一句查无此词必须空；孤儿块——删 `storyboards` 行、块仍在库里——结果必须空；
他人分镜不进我的结果、他自己搜得到、匿名也搜不到）。`typecheck` 0。
`e2e/studio.spec.ts:1831` 那条 `@smoke` 加了真浏览器的一段：**1 passed (11.1s)**——Studio「分镜」面板存一份 →
`/search?q=那句描述` → `[data-search-group="storyboards"]` 里有命中行自己的字与指向该项目的 `/studio` 链接。
（断言里带命中文本，因为空组也可能挂着标签，"这一组存在"不等于"搜到了东西"。）
这条也红过一次，红得是它自己的问题：上面几步已经 `goto` 到 `/search`，在那里点不到面板标签，
`page.click('[data-panel-tab="storyboard"]')` 一直等到 150s 测试超时——先回编辑器再点。

**变异探针**（2 条，各自命中一处、跑完还原且 md5 与基线一致 `052aec88`）：
A 把标题那条 `ilike(storyboards.title, term)` 换成一个不可能的词 → `1 failed / 14`，红的就是标题那条用例；
B 把语料块的 join 退回我等值写错的那个形状（`${行id} = sourceId`）→ `2 failed / 14`，
红的正是"画面描述命中"与"孤儿块不产结果"两条——**这条探针复现的是我这一片里真实发生过的错误**，
所以它证明的不是断言写得严，而是这条路一旦形状错就会响。


## §49 × §66-71：语料的**内容**按相关性进 AI 请求，不再只报一个块数

§49 那三片把语料切好、索引好、面板能查了，但发给模型的那一份里始终只有"库里有几块"。
这一片把最后一格接上：**这一轮的提示词就是语料库的查询词**，按相关性取回的块带着出处进报文。

- **报文契约**（纪律 6：跨端只能用 `packages/schemas`）：新增 `CorpusDigestSchema` ——
  `query / candidates / used / omitted / budgetChars / usedChars / vectorAvailable / items[]`，
  每条 item 带 `sourceType / sourceId / chunkIndex / title / excerpt / score / matchedBy`。
  出处与命中方式不是装饰：模型引用一条设定时要能指认是哪一类第几块，设定冲突时才知道改了哪一句。
- **"没查"与"查了但都不相关"必须在报文上长得不一样**：`query: null` 是前者。
  所以 `ProjectContextSchema.corpus` 刻意**没有默认值**——省略它和发一份空的，过 zod 之后分不出来。
- **被预算裁掉的相关块要数得出来**（`omitted`），装配沿用 §68 那套纪律：
  裁剪的每一刀都进报文，不留"看起来是全集"的错觉。Python 侧据此生成一句 `corpusNote`，
  只在 `query` 非空时出现——没查却解释"有 3 条被裁掉"就是假话。
- **两条路都要有，各自证明各自的**：标题/目录那一类（`designIndex`）继续发；
  语料摘录是并列的第二份。`/context` 面板那条路没给查询词就不查（装配是只读的，一次全文检索不是零成本）。

**一次返工值得记**：第一版把契约夹具的 `corpus` 由 `apps/web` 的 `context.ts` 导出，
`npm run typecheck` 立刻红两条**与本片无关**的错（`notifications.ts` 找不到 `@/lib/notify-plan`）——
原因是 `scripts/` 走的是 `tsconfig.tools.json`，那条程序里没有 `@/*` 别名，
而我新增的 import 边把整条 `context → publish → moderation → notifications` 的图拖了进去。
共享默认值因此落到 `packages/schemas`（`emptyCorpusDigest()` + `DEFAULT_CORPUS_CHAR_BUDGET`），
装配与夹具同用一个出处——**顺手也把"手抄一份形状"的漂移风险消掉了**：
Python 侧唯一的真实形状来源就是那份夹具，它现在由生产代码产出。

**凭证**：`context.integration.test.ts` 新增 2 条（给查询词就带回相关块、出处、命中方式，
并断言 `items.length === candidates - omitted`；不给就 `query: null` 且 `items: []`；
第二条用 `maxCorpusChars: 12` 逼出 `used=0 / omitted=candidates`，`candidates` 与宽预算那次相同——
裁的是发送的块，不是检索）。`ai-assemble.integration.test.ts` 补一条：真装配路径上
`wire.context.corpus` 存在且 `query` 就是本轮提示词。三个文件 **22/22** 通过，`npm run typecheck` 0，
`npm run contract:export` 重跑后夹具带上了 `{"query":null,...,"budgetChars":4000,"items":[]}`。
Python：`apps/ai-service` 全量 **66 passed / 1 skipped**（新增 2 条 corpus 用例）。
**变异探针**：把 `payload["corpus"]` 换成空对象 → 第一次只抓到 **1/2**（第二条断的是说明文字，不是摘要本身），
补上 `'"omitted":3' in user` 这类转发断言后两条都抓到；第二刀把 `corpus` 本身换成 `{}`（查询词因此变 null）→ **2 failed**。
两刀跑完都还原，`design_prompt.py` md5 一致。

**这一片欠的**：摘录是命中位置附近的**窗口**，不是整块正文——要整块得按 `sourceId` 回库里取，那条通道还没有
（已写进 `unavailable`，界面与报文都看得见）；reranker 仍是确定性融合，向量那一半仍要 provider；
`/context` 路由没暴露 `corpusQuery`，所以检索面板看不到"这一轮到底取回了哪几块"；
浏览器那一层的"改一句设定 → 发出去的这一段跟着变"还没证过。

## §49 × §66-71 第二格：上下文面板能按一句设定试取回语料（#75 的一半）

上一片把语料内容接进 AI 请求，但界面上看不到这一件事：/api/projects/<id>/context 不接受查询词，
上下文面板里那一行「语料 N 块」与发出去的那一份之间没有可核对的路径。这一片补上：
- 路由收 corpusQuery（上限 200 字，超了 400 说清凭什么挡），转给 buildProjectContext；
- 面板在「语料」那一行下面给一个输入框与「试一次」，展示取回了几块 / 候选几块 / 被预算裁掉几块，
  每条摘录带着出处（哪一类哪一块）与命中方式；查不到就明说「一条都没取到」，不留看着像结果的空壳。
- 参数拼接改用 URLSearchParams：手拼查询串最坏的结果是中文词不转义 → 永远零命中，
  而面板会一本正经地报告「项目里没有这句话」。

凭证：上下文那条 @smoke 加长到这一段（1 passed，9.4s），截图 screenshots/context-corpus.png；
探针把路由里那一行 corpusQuery 传给装配删掉 → 1 failed（红的正是新加的摘要断言），还原后 md5 一致。
这一轮也遇到同一形状的坑：新加断言前面那句「字符（」拿默认 5s 等，冷启动编译就是不够用，
补到 25s 与兄弟断言一致——第一次红的不是代码而是预算，别把它读成回归。

## §49 × §66-71 补上浏览器那半：改一句设定，上下文里取回的那段真的跟着换（#75 的第③格）

上一片把语料接进 AI 请求、又给面板加了试取回的入口，但"改了以后旧说法还在不在"这件事
只在 vitest 与检索面板那两条路证过。上下文这一层重新证一遍，走的是真编辑器：
图层选中 Headline → 属性面板改文案 → 防抖自动保存（它换语料块）→ 回上下文面板按旧句子试 →
必须「一条都没取到」；按新句子试 → 摘录里要出现那句话。

凭证：上下文那条 @smoke 加长这一段，1 passed (11.5s)，typecheck 0，截图 screenshots/context-corpus-after-edit.png。
变异探针把 syncDesignKnowledge 的"换块"改成只插不删 → 1 failed（红的就是这一段：
旧块留在索引里，新块又因为 (source_type, source_id, chunk_index) 的全局唯一约束插不进去），还原后 md5 一致。

#75 当时还剩最后一格：摘录是命中附近的窗口，不是整块正文——按 sourceId 回库里取整块的那条通道还没做（下一片已补，见文末）。

## §49 补最后一格：按出处取回整块语料（#75 的第①格）

§66-71 那一片在 unavailable 里写着"要整块得按 sourceId 回库里取，而那条通道还没有"——
这句话当时是真的，界面上也就只能停在窗口摘录。这一片把它变成假的：
- readKnowledgeBlock(projectId, sourceType, sourceId) 按 (项目, 类别, 出处) 取回整块，chunkIndex 升序，
  带 tokens 数（预算能核对）与块标题；跨项目与不存在的出处返回空列表，HTTP 那层给 404 并说清原因
  （"来源已删除而索引还没重建"就是那个形状，别用空列表装作成功）。
- 新增 GET /api/projects/<id>/knowledge/block，参数校验挡在查询前面（sourceType 必须在那几类里、sourceId 非空且 ≤200 字）。
- 上下文装配那句 unavailability 跟着改口：现在说的是"能按出处取回，但这一轮没有替你取"。

一条断言被实测纠正了：第一版直接断"整块 > 摘录窗口"，红在 145 vs 145——新项目的块本来就短于
一整个窗口，那条断言测的不是这条通道的理由。改成两块：小块的包含关系（content ≥ snippet），
另造一个长文案（同一出处第二次保存）断严格大于——**这条通道的价值只在块超过窗口时成立**，
所以见证要造出那个形状，而不是拿一个恰好短的项目去断言。

凭证：knowledge 两个文件 44/44（新增 1 条，17 条集成里的一条）。变异探针把 readKnowledgeBlock
的项目边界删掉 → 1 failed，红的正是那条跨项目断言，还原后 md5 一致。

#75 还欠一格：上下文面板的摘录旁边没有"取整块"的按钮——通道通了，入口还没接（这仓库有过同形状的前科：#66/#67）。（这一格已在下一片补完，见文末「整块语料的界面入口」。）

这一片的红门记录（同一笔前科的第二次）：新断言里写的是 `full.blocks[0].content`，vitest 44 条全绿，
pre-commit 的 typecheck 却红 6 条——`noUncheckedIndexedAccess` 说 Object is possibly undefined。
**vitest 不做类型检查**，索引访问在门禁眼里就是会消失；这次是 hook 兜住的，不是我提前想到的。
改法是绑一个 `const block = full.blocks[0]` 再判空，而不是到处加感叹号——判空那句顺手把
「取回来是空列表」这种前提断裂变成会出声的错误。

再记一条自己咬自己的：这段补记第一次是用 bash 双引号里的 `node -e` 写的，文本里带着 markdown 反引号，
反引号被 shell 当成命令替换吃掉，追加进去的几行变成半句话混进正文；第二次换单引号又被内层双引号绊住。
**多行中文文档一律用 Edit/Write 落盘**，`node -e` 只留给不含反引号、美元符与内层引号的短脚本——
这一片里它已经三次把话讲到一半吞掉了。

## §49 最后一格补完：整块语料的界面入口（#75 关掉）

上一片只把通道做出来（`GET …/knowledge/block`），摘录旁边没有那个按钮——这仓库对"服务端已通、界面没入口"
是有前科的（#66 组件删除、#67 角色→场景），所以这一片就补那一寸：每条摘录下面一个「取整块」，
取回来显示正文 + 「第 n/N 块 · T token」，失败时把服务端那句原因原样落在界面上。

- 错误路径是这一格的重点：404 不能说成"这块是空的"。`[data-context-block-error]` 显示的是
  路由给的那句"来源已删除而索引还没重建（点「重建索引」核对）"，与"取回来确实是空列表"
  （`[data-context-block-empty]`，另一句话）分得很开。
- 参数仍然走 `URLSearchParams`（上一片那条纪律的第三次应用）。

凭证：上下文那条 `@smoke` 加长——点「取整块」→ 断正文里出现刚改进去的那句、断「第 n/N 块 · T token」那行、
再用 `page.route` 把 block 那一条 GET 拦成 404 → 断错误句出现且 `[data-context-block-text]` 计数 0。
**1 passed (17.0s)**，`npm run typecheck` 0。两条变异探针各自只落一处且都红：把按钮的 onClick 换成空操作 →
1 failed；把 catch 里那句错误原因改成 `error: null` → 1 failed（证明"失败被吞成空"这个形状真的会被抓到），
两刀跑完都还原、md5 与探针前一致。

## §49 × §46：镜头的角色在语料里写名字，不写那串 uuid

§54 那一片给引用定过规矩：块里写「追杀 → 守夜人」，因为那是查得到的一句话；「追杀 → ge_mb3k9x」不是。
同一句话在分镜那一格漏了——`chunksFromStoryboard` 把 `shot.characterId` 原样写进散文。
那串 uuid 是库生成的行身份（§46 明写"模型里那个临时 id 不外传"），既读不出设定，也不是能拿去核对的话。

- `chunksFromStoryboard(document, storyboardId, worldId, characterNames?)`：给了名字表就写「角色：守夜人」，
  **认不出来才退回原 id**——宁可留一句不好读但能核对的话，也不写"（不认识）"这种没有出处的字。
- 名字表在 `syncProjectKnowledge` 已有的那次角色循环里顺手攒出来，不为这件事多开一次查询。
- 镜头归属那条校验本来就在服务端（`firstForeignRef`：挂的角色/资产必须属于本项目），这一片不加新规则，
  只是让已经合法的引用在语料里说人话。

一条测试前提被实测纠正：第一版取"第一块命中的分镜语料"来断言，红在
`expected '灯塔的光扫过浮冰…' to contain '角色：守夜人'`——那块是**作者写的那句来源**，
它本来就不带机位/角色这些行。改成取标题带「第 N 镜」的那块，断的才是该断的那一块。
整块正文走的是这一批刚补上的 `readKnowledgeBlock`：摘录窗口不够长时，它正是该用的工具。

凭证：`knowledge.test.ts` 28/28、`knowledge.integration.test.ts` 18/18（真库那条：`createProjectCharacter`
建出守夜人 → 每镜挂它的 id → `saveStoryboard` → 检索那句镜头描述 → 按出处取整块 →
断含「角色：守夜人」且**不含那串 uuid**）。变异探针把名字表退回只写 id → `2 failed / 46`，
红的正是纯函数那条与真库那条；还原后 46/46、md5 与探针前一致。

## §40 那一寸补上了：镜头可以挂本项目名册里的角色（#76 关掉）

模型字段 `Shot.characterId` / `referenceAssetId` 与服务端归属校验（`firstForeignRef`：
挂的角色/资产不属于本项目就整份拒绝）早就都在，缺的只是界面上那个选择器——
本仓库为这件事栽过三次（#66 组件删除、#67 角色→场景、#75 整块语料），所以这次把入口和见证一起补。

- 选项**只来自服务端**：`/characters` 与 `/assets` 各拉一次，面板不给用户手填 id。
  这样"点了才被服务端挡下"这条路在界面上出不来；名册为空时那句提示也写在脸上
  （`data-storyboard-roster-note`：还没有角色 / 参考图要先上传），不是让下拉框默默只剩"不挂角色"。
- 一次选择 = 一个可撤销事务（§150）：走 `storyboardStore.applyOps([{ op: 'updateShot', before, after }])`，
  撤销是逆补丁而不是重打一遍；"不挂角色"写回 `undefined`，落库时那个键就没了。

凭证：`e2e/storyboard.spec.ts:36` 新增一条 `@smoke`（真浏览器，**1 passed (13.3s)**）——
角色面板建「守夜人」→ 分镜面板切一版 → 选择器只有 2 个 option 且第 2 个是那位角色（名册是服务端给的）→
选上 → 撤销回到「不挂角色」→ 重做又回到「守夜人」→ **点重新装配（reload）后仍是「守夜人」**，
这一步走的是服务端，证明落库的不是内存。整组 `e2e/storyboard.spec.ts` **4 passed (22.9s)**，typecheck 0。
变异探针把 `after` 写成 `shot.characterId`（点了等于没改）→ 1 failed，红的正是那条选择器用例；还原后 md5 一致。

§40 还没做完的那半截留在原处：镜头的**视频**（`videoAssetId`）要真 provider，本机不做假生成；
参考图那一格这一片只上了"能选本项目资产"，还没有把 §38 的生成按钮接到镜头上。

## §40 × §38/§39：镜头行上的「DEMO 参考图」——两条箭头都证了（#77 关掉）

上一片欠的那半截补上：镜头行加一个按钮，拿这一镜的提示词走 §38 那条 Text → Image，
挂过角色就走 §39 的 Character → Scene（服务端自己去取那位角色的肖像当参考，字节不经客户端）。
产出的资产 id 立刻挂进 `shot.referenceAssetId`，仍然是一个可撤销事务。

三句实话跟着按钮一起写：

- 按钮就叫 **DEMO 参考图**，`title` 写着"本地确定性合成，不是 AI 出图"（§160）。
- **挂了但没有视觉标识的角色会被拒**：测试里那位「守夜人」只有名字，Character → Scene
  返回的是"palette 是空的，先补 §39 那一栏"，界面把这句原样显示在 `data-storyboard-image-error`，
  **一个 option 都不许多出来**。不悄悄退化成"随便出一张图"，也不假装生成了。
- 撤销只断开引用，**不删那张已经花过额度产出的资产**；删资产是资产库那一格的动作，不塞进 undo。

两处实现上的坑是被测试逼出来的，都记下来：
1. 生成完不补名册，那个 `<select>` 会因为"值不在选项里"被浏览器渲染成空白，用户看到的就是
   "刚生成的东西不见了"。所以成功后把新资产并进 roster（并去重）。
2. **整组跑红过一次，单独跑绿**：撤销/重做各自都是一个新事务，重做之后自动保存还没落地就点
   「重新装配」，读回来的是上一次落库的状态。这里不能用"等文本变已保存"——那一栏在重做的瞬间
   可能还挂着上一次的"已保存"，会假通过。改成 `expect.poll` 反复重新装配直到服务端认可，
   断言的内容没变（库里就是那位角色），但不再赌时序。整组连跑两遍各 4 passed (21.6s / 22.8s)。

凭证：`e2e/storyboard.spec.ts:36` 那条 `@smoke` 加长到两条箭头 + 名册补全 + 撤销不删资产；
变异探针两条各落一处且都红——把名册补全那一步变成"当作已存在" → `toHaveCount` 红；
把挂了角色的分支也走纯文本箭头（假装 Character → Scene 不存在） → 那句"视觉标识"的拒绝红。
两刀跑完都还原，`StoryboardPanel.tsx` md5 与基线一致。typecheck 0（含 `e2e` 那一个 tsconfig）。

## 全量回归检查点：今天这十二次提交之后，99 个测试文件 / 1083 条用例全绿

这一天改了 knowledge / context / assemble / search / 三个面板 / 两条路由 / schemas / 契约夹具 /
ai-service 的提示词，但每一片只跑过自己那一小段。补一次全量：
npx vitest run --fileParallelism false → **99 个文件、1083 条用例、0 失败、0 跳过**
（数字是从 JSON 报告里数的，不是拿 exit code 当结论）。

顺手把镜头那格的最后一句限度挪到它该在的地方：时间线旁原来只有「不可播」两个字，
为什么不可播只藏在 notes 里。现在写着「不可播：还没有能直接播放的画面——镜头视频那一格要真 provider，
本机不做假生成（§159）」。对应的 e2e 断言从 toHaveText 一句改成两条 toContainText：
「不可播」与「不做假生成」都要出现——**结论和理由一起断**，否则哪天只改解释的那半句测试不会响。
e2e/storyboard.spec.ts 整组 4 passed (19.4s)，typecheck 0。

## #62 上半截：增量保存落地——写 1 行，而不是 10000 行（2026-09-28）

`docs/adr/0017-incremental-document-write.md`。`writeDocument` 从「整删重插」改成增量：先算差异，只写变化的行。
**语义没变**——客户端发的是完整文档，缺失即删，最后完成的事务整体胜出（ADR-0016 的锁不动，那条结论不受影响）。

四处是这一刀真正的坑，各有用例钉着（`apps/web/test/document-incremental-save.integration.test.ts`，9 条）：

- **`data` 必须参与比对**：接手时工作区里那版只比 `parentId / nodeType / name / sortIndex / visible / locked`，
  而用户改的文字 / 样式 / 尺寸全在 `data` 里——那条路会「保存成功但什么都没存」。用例：改一个 text 节点的文字。
- **缺失即删，不是只增改**：那版把节点删除整段去掉了（改成「合并语义」，还顺手把并发用例的断言一起改了）。
  删一个节点再保存、读回来它还在，那是 §16 的设计模型漂移。用例：删节点 / 删整页。
- **换页不能走 UPDATE**：`design_nodes` 主键是 `(page_id, id)`，节点换页要按「删旧行 + 插新行」。
  用例：把节点搬去另一页；另有两条是「同一份文档里删掉一页、同时把该页的节点搬到留下的页 / 新建的页」
  （被删页面的行要先排除出「库里已有」的集合，否则那个节点既不插也不改地消失）。
- **删除要按主键走**：`delete ... where page_id = ? and id in (...)`。单独按 id 删用不上 `(page_id, id)` 主键，
  是全表扫描——本机测试库积到十万行时，并发用例从 1.9s+0.8s 涨到 12.3s+12.1s。

**差异在哪算**（这一刀最值钱的取舍）：内容差异交给 Postgres（jsonb 相等本身就是键序无关的），
JS 只读回 `id + page_id`。把 4008 行读回 JS 逐字段比是「957.6ms 读 + 468.3ms 比」，
而「只读 id 10–12ms + 库里 jsonb 差集 161.5–264.8ms」。顺带把 `stableKey` 从 `snapshots.ts` 提成
`domain/stable-key.ts`——快照的 `documentsMatch` 与增量保存的 `diffByKey` 从此是同一个实现。

**验证**：4000 节点 A/B/A 三遍（新增 `scripts/perf-save.mts`，`npx tsx scripts/perf-save.mts 4000`）：
改一个节点后保存 **196.8–225.5ms（两遍中位）vs HEAD 782.3ms**；无改动保存 198.1–202.5ms vs 797.0ms。
整张读数表与三条读数纪律在 `docs/PERFORMANCE.md` 的 2026-09-28 那一节。
写入路径相关的 **17 个测试文件 / 149 条用例全绿**（不是全量回归，是「用到 `saveDocument` 的那一批」），
本片新增 9 条用例；`npx eslint` 对本片 6 个文件 0 问题。

**这一刀没有关掉的**：`docs/TESTING.md` 那条「属性写入 <50ms」仍然红。剩下的代价不是「写多少行」，
而是每次保存都要把整份文档过一遍（客户端发 3.5MB 全量 + 服务端序列化 + 库里解析比对 ≈180ms），
外加 `saveDocument` 之后的 §49 语料同步仍是全量重切（146.5ms @4000 节点）。
再往下走只有「客户端发补丁」（§150 的 Command 已经在客户端存在）——那是单独一片。
10000 档这一版没量到（HEAD 是 1433.9ms），下次补。**2026-10-09 已补**：同一会话两遍，
改一个节点 477.6–503.3ms（中位）/ 最小 447.6–457.0，约为旧口径的 2.9 倍快——写放大在顶档同样关掉了，
读数与三条纪律在 `docs/PERFORMANCE.md` 文末「10000 档补测」那一节。**#62 的两格至此都落地了：
① 读数（2026-10-09，本节上文）与 ②「客户端发补丁」（同日落地，`docs/adr/0033-autosave-sends-patch-not-document.md`）**——
属性写入 → 画布更新在 1000 档进了 <50ms（42.8ms，dev 口径），10000 档仍红（181.9ms），
红的是 §147 的画布/选中渲染路径，不再是保存报文。

## #62② 自动保存改发补丁：写 1 条 op，而不是 3.4MB（2026-10-09）

`docs/adr/0033-autosave-sends-patch-not-document.md`。`store.save()` 从整份 PUT 改成优先发
§150 的 Command 补丁：`PATCH /api/projects/<id>/design`，报文 `{ patches }` 按时间序
（一条命令一个补丁，撤销发逆补丁，AI 事务同一条队列——服务端看到的动词词汇与手工编辑完全一致）。

- **服务端**：`patchProjectDocument`（`server/domain/projects.ts`）= `lockProjectWrites` →
  `loadDocument(tx)`（锁内读最新版）→ 逐条 `applyPatch` → `parseDocument` 形状门 →
  同一个 `writeProjectDocument`（文档行 + 项目摘要列仍只有一处实现）→ 事务外
  `syncDesignKnowledge`（与 `saveDocument` 同一条纪律）。三种拒绝都**整批一条不写**：
  任何一条 op 打空 → `ops_skipped`（409）；打完的文档过不了门 → `document_rejected`（400）；
  库里没文档 → 404。这一条路刻意没有审批门：报文来自作者本人（requireUser + 归属），
  与 PUT 同一信任级，§74 的门拦的是 AI 与公开 API。
- **客户端**：待发队列 `pendingPatches`（execute/undo/redo/AI 事务四处入队），
  `editSeq` 判"在途期间又有编辑"，`forceFullSave` 给 `setMode` / `setPage` / `jumpTo` / 快照恢复
  这类"补丁词汇表达不了的整份替换"显式逃生门；补丁请求被门挡下（409/400）当场换全量 PUT 兜底
  （同一个人的同一份内存状态，换一条路，不卡 error）；网络失败把补丁放回队头，下一轮再发。
  离线期间的 `flushBeforeAi` / publish / snapshot 全部经同一条 `save()`，不用各自记得换报文。
- **契约**：`ProjectDesignPatchRequestSchema` 进 `packages/schemas`（跨端报文只走 schemas，
  与公开 API 的 `ApiDesignPatchRequestSchema` 同词汇不同上限——那边 ops ≤200，这边 patches ≤200）。
- 验证：`document-patch-save.integration.test.ts` **7 条**真库 + `studio-patch-save.test.ts` **6 条**
  客户端；变异四次各红一处（execute 入队、skipped 判定、409 兜底、形状门），都还原后对照全绿；
  e2e `@smoke AI command bar` 的"落库先于 AI"断言从"PUT"改成"落库"（钉顺序不钉动词），
  `studio slice: select, edit a property, undo, autosave`、§162、#10 连跑绿。全量 vitest + lint 绿。
- 账（`docs/PERFORMANCE.md` 同日两节全表）：服务端**更慢**（@10000 799.6ms vs 全量 450.5ms——
  loadDocument 是补丁路径新增的一段，明账不藏）；省下的是客户端 3.4/8.4MB 主线程序列化与上行字节。
  浏览器门：1000 档属性写入 → 画布更新 **42.8ms 进 <50ms**；10000 档 181.9ms 仍红（§147 渲染路径的账）。

## §41 第一片：时间线从「读数」变成编辑面（拖 trim / 拖 reorder / 点转场）

§41 要的是"类似视频编辑器"的时间线。在这一片之前，界面上只有一条**读数**：总长几秒、可不可播、
三条空轨为什么是空的。长度、顺序、转场确实能改，但只能回到上面的镜头表里改数字、点 ↑↓——
**时间线自己碰不得**，而原文点名的六个动词里，trim / reorder / extend 说的都是在时间线上直接改。

这一片补的就是那一寸：一格一镜、宽度即时长（`timelineOf` 的投影，不是第二份真值），三种直接操作各有实现——
右边缘 trim/extend、整块 reorder、左上角的转场标记换衔接。三个决定没有放在组件里，放在
`packages/video-model` 的纯函数上（那里才测得到）：`clampShotDuration`（吸附 100 毫秒、下限一步、
上限与镜头表那个数字框同一个数）与 `dropIndexFor`（按**其余镜头的中点**分界：拖动时这一镜自己的宽度也在变，
用"目标格左边缘"那种判据会在同一个位置给出两个答案，界面就在相邻两位之间跳；它返回的是**最终下标**，
与 `moveShot.to` 同口径，所以"拖回原位"拿回原下标，界面据此不记一次空事务）。

**拖动期间库里一动不动**：预览只活在组件状态里，松手才落一个 §150 的补丁事务——
每次 pointermove 都写库会把撤销栈塞进几十步（Ctrl+Z 要按几十次），中途关页面还会留下半截长度。
拖整块的位移按条宽夹住（`minDx`/`maxDx`）：不夹的话那格会被条的 `overflow-hidden` 裁到看不见。
另外，序号与时长最初是居中流排版，转场标记盖住了"4.5s"的 4——改成三处绝对定位（左上转场、右上序号、
底部居中时长），面板只有 239 像素，47 像素的一格放不下三段居中文字。**这两处都是从截图里看出来的。**

**凭证**：`packages/video-model/test/timeline-edit.test.ts` **11 条**纯单测（吸附、上下限、坏数、
拖回原位、跨中点、拖出两端、不在分镜里抛错，以及两条"接进 `moveShot` 之后顺序到底排成什么样"——
下标口径差一位就会在那两条上红）；`e2e/storyboard.spec.ts` 新增一条 `@smoke`：拖边缘（读数在、库里没动 →
松手后库里变了且 %100 为 0 → 撤销回原值）、点转场（库里换了、镜头表那一栏跟着动 → 撤销）、
拖整块（目标格被标出、读数说"第 N 位"、落下后顺序变了 → 撤销）。**1 passed (7.9s)**；
整组 **5 passed (1.2m)**（含改同一个面板的四条老用例）。三条变异探针各只红一处、都还原
（`StoryboardPanel.tsx` md5 与探针前一致 `E40EFA9C…`）：① 去掉吸附 → **库里的值根本没变**
（这一条比预想的狠：契约里 `durationMs` 是 `z.number().int()`，非整数毫秒整份 PUT 会被拒，
吸附不只是好看，它是"这次编辑写不写得进去"的前提）；② 每次 pointermove 都写库 →
红在"拖动中库里那一份还是旧的"（Expected 3000, Received 5500）；③ 落下下标减一 →
红在顺序断言（Array [2,3,1,4] 对 [2,3,4,1]）。
截图 `screenshots/storyboard-timeline-edit.png`（编辑面 + 轨道）与 `storyboard-timeline-dragging.png`（拖动中的目标格与读数）。

**§41 第二片（2026-09-30）：键盘也能改长度**——`docs/DESIGN_SYSTEM.md` §90 要求"全部交互可键盘到达"，
拖拽能做的事必须能用键盘做一遍，而且**标准一样**。

- 左右方向键各一格（`SHOT_MS_STEP`，100ms），**Shift 是粗档一次 1 秒**（`SHOT_MS_COARSE_STEP = SHOT_MS_STEP × 10`）。
  粗档**共用**拖动那条路的刻度而不是自己定一个（比如 500ms）：两条路改的是同一个 `durationMs`，
  刻度不同的话键盘调出来的数在拖动那条路上没有对应档位，作者就会看到"明明调好了、一碰鼠标又跳一下"。
- `keyboardTrimDelta(key, shiftKey)` **不管的键返回 `null` 而不是 `0`**：`0` 会被调用方当成
  "一次合法的零步操作"，于是 `preventDefault` 掉一个本该交给别人的按键——上下方向键要留给面板滚动。
  返回 `null` 就是"这个键不是 trim 的"，调用方原样放行。
- **拖拽状态按 `via` 分成两种**（`{ kind:'trim'; via:'pointer'; … }` 与键盘那一支），
  而不是把指针几何设成可选字段：可选字段会让"键盘这条路上混进一次 pointermove"变成**能编译过的写法**。
- 提交语义与拖动**完全一致**：调整期间库里一动不动，Enter 才落**一个** §150 事务，Esc 取消——
  所以整段键盘调整（三下按键）**撤销一步**就回到原样，不是三步。
- **凭证**：`timeline-edit.test.ts` 新增 `keyboardTrimDelta` 一组，最后三条都把增量接进
  `clampShotDuration` 再看结果——只看增量的话，"把一镜调成 0 毫秒"或"调出一个不在 100ms 刻度上的数"
  这两种错都测不出来；`e2e/storyboard.spec.ts` 新增一条 `@smoke §41 时间线键盘那条路`：
  方向键调长度、Shift 粗档、Enter 落库、Esc 取消，且**不惊动画布**。

## §133/§134 第二片：storage 那一格真的有执行方了（拒绝新写入，不驱逐）

第一片里 storage 只是表上的数字（ADR-0014 明写着"还没有拦截方"）。这一片把它接成真的：
`uploadImageAsset` 在**字节进对象存储之前**问一句"这个人还放得下吗"，放不下就整条拒掉——
`413 storage_exhausted`，话里带档位与三个数字（"Free 档上限 200MB，已用 198MB，这一次还要 4MB"），
与 `refusalFor` 同一条口径。

三个决定写在 ADR-0018：**用量是派生的**（`SUM(assets.bytes)`，按所有者跨项目合计，库里没有"已用"那一列）；
**门放在唯一的摄取门里而不是路由上**（§80：全链路只有那一处读字节，用户上传与 §38 生成共用它——
挂路由上会漏掉生成那条路）；**只拒新写入、不驱逐**（自动删用户的图是最坏的一种限额）。
checksum 命中的重复上传在门**之前**就返回了，所以满仓时它照样放行：那份字节已经在库里，不该收两次占用。

界面上 storage 从"还没有拦截方"那一列挪到"会真拦"那一列（`ENFORCED_PLAN_AXES`），
并多了一行「已用 X / 上限 Y MB」；两列加起来仍然等于 §133 那五件事，有单测钉着——
把 `ENFORCED_PLAN_AXES` 改回去而忘了改页面，那条会红。

**验证**：`credits.test.ts` 新增 4 条纯规则（1024 进制换算与单调性、边界在 `used + incoming` 上、
两列互斥且加起来是五件事、给人看的字节数只留一位小数）；`assets.integration.test.ts` 新增 2 条打真库 + 真存储
（铺满到上限 → 上传被拒且**一行都不写** → 只把档位换成 pro，同一次上传就放行；checksum 命中的重复上传在满仓时仍放行）。
这两条用**自己的所有者**：用量是按所有者跨项目求和的，共用文件级那个 ownerId 会让别的用例留下的素材把"已用"顶到上限
——实测就是这么红了第一次，所以拆了 owner。
变异探针：把 `if (refusal)` 改成 `if (refusal && false)` → 「超配额拒绝新写入」那条红在 `expect(blocked.ok).toBe(false)`，
还原后全绿。相关 8 个测试文件 **100 条全绿**（credits / credits.integration / assets.integration / avatar /
image-safety / image-studio / ai-jobs / studio-flush，不是全量回归）；改动文件 `npx eslint` 0 问题；`apps/web` typecheck 0。

**没做的（照实记）**：① 生成那条路的 413 只由代码路径与 typecheck 保证，没有单起一条集成用例
（拒的还是同一道门里的同一个函数）；② 这道门**不预扣**——两个并发上传可能都过、合计略微越限（ADR-0018 写明）；
③ generation / team collaboration / publishing 三格仍然只是数字；④ 改档位仍然只能改库或改服务端代码，没有界面。

## 交接点（这一轮停在这里，下一轮从这里接）

状态（2026-09-28 夜更新）：增量保存这一片落地并提交，写入路径相关的 17 个文件 / 149 条用例绿。
另一条线（§41 第一片，时间轴拖动）也已落地：`StoryboardPanel.tsx` 里那个当时未定义的 `TimelineDrag`
是它写到一半的状态，类型与两种拖拽现在都在（见上面「§41 第一片」），它自己那 4 个文件 `npx eslint` 0 问题。

**并发实情（写给下一个接手的）**：今晚这个 checkout 上有两个会话同时在跑同一句"继续做这个项目"。
文件范围是错开的（一条在 `server/domain` 的写入路径，一条在 `studio` / `video-model` 的界面与模型），
但**门禁是共用的**：pre-commit 钩子跑的是整棵树的 `npm run lint`，一边留着语法半成品时另一边就提交不了。
所以：动手前先 `git status` 看清在途文件，提交时只 `git add` 自己改过的路径，别用 `--no-verify` / `SKIP_HOOKS=1` 绕。

推进队列（不依赖外部授权，按顺序取下一格；2026-10-10 深夜重排）：

1. ~~**#10 账本实时**~~ **已落地**（2026-10-09，见「[x] #10 账本实时」那一条）。
2. ~~**#62② 客户端发补丁**~~ **已落地**（2026-10-09，`docs/adr/0033-*`）。
3. ~~**§147 选中响应（<16ms）与 10000 档渲染**~~ **归因完成（2026-10-10）；增量重解落地（2026-10-21）**：
   选中响应 44ms（prod 1000 档）经 CPU 采样证明 **>80% idle、0 个应用函数命中**——
   这扇门的地板（输入→绘制流水线 2–3 帧）高于门的数字，不是界面代码的账；
   分段标记（`nexus:sel:store/commit`）与三段拆分探针已进 `scripts/perf-browser.mts`，
   2026-10-20 补上了生产构建下的分段读数（B 片的开关 `NEXT_PUBLIC_NEXUS_PERF_SEGMENTS=1` 正好用上）。
   **"数没量到"那条今天解除了**：10000 档在生产构建下量不到，是因为 `page.goto` 用着 playwright 默认的
   **30s 导航上限**（首屏 8.4MB 文档的编译+加载）——**量不到是因为导航超时，不是那一档渲染得慢**
   （dev 档首帧 1203.7ms）。脚本的三处导航上限放宽到 300s（**只放宽导航，不改量法**），
   那一档当天就量到了（口径 `prod-4502d2f`：属性写入 95.8ms、首帧 1084.5ms、选中 23.4ms）。
   **增量重解（ROADMAP #133）也落地了**（2026-10-21，`16ddc0b`）：两份实现合一（删掉约 400 行重复，
   "增量与全量相等"由构造保证）+ 真复用（没碰到的分支沿用上一帧同一个对象）+ Studio 侧接线
   （改动集合保守收集、undo/redo 也登记、基准校验文档与页的身份）+ 回退开关
   （`NEXT_PUBLIC_NEXUS_INCREMENTAL_LAYOUT=0` 走全量）。
   **但红线没达成**：模型层 10000 节点省 63%（改几何 230.2 → 84.4ms）/ 68%（改样式 150.8 → 47.8ms），
   **浏览器那一档却是 128.2 vs 128.8ms（0%）**。
   **差别的原因当天查清了（带分段的两轮）**：**增量的收益完全取决于「文档形状 × 改动位置」**——
   `perf-browser` 造的 10000 档文档是**扁平的**（一页 10000 个节点全挂 root），
   改任一个节点 → 其余 9999 个兄弟**全部移位** → 位置全变 → 一个都沿用不上 → 复用率 0；
   而模型层那棵是**深树**（深 6 层），改最深的叶子 → 省 63%。
   **并且增量对 10000 档的**首屏**零帮助**（首屏没有"上一帧"可复用）——那一格要别的解法。
   **那一格也量过了（2026-10-21 凌晨，`scripts/first-paint-cost.mts`）**：服务端读 1019ms + 组装 ≥36ms + 序列化 267ms
   ≈ **1.3 秒**；传输不是瓶颈（**gzip 后只有 0.17MB**）。
   **⚠️ 但"7.2 秒在 RSC 序列化"那个推论是错的（当晚就推翻了）**：把"首屏不带文档"那一刀真做了，
   同一台机器同一时段量开/关两轮 → **两个数在噪声里**（HTML 到手 1679ms 带 / 1868ms 不带）→ **那一刀没收益**。
   真相是：**"7.2 秒"那个读数本身带着当时的机器负载**（今天同一台机器 HTML 到手只有 1.5~2.2 秒）。
   **所以首屏那一格还欠一次干净的测量**（安静机器 + 同一构建 + 至少两遍）；
   在那之前**"首屏慢在哪里"还没有答案**，别拿任何一版数去论证优化。
   **那笔测量当天上午就做了（安静机器、同一构建连量两遍）**：HTML 到手 **1365/1123ms**、
   第一个节点画出 2249/2033ms → **"7.2 秒"确认是机器负载**。
   **又过了半小时量了开/关 A/B（同一构建起两个 server 交替量，因为 `NEXUS_STUDIO_SSR_DOCUMENT`
   是服务器端运行时读的）**：
   **带文档** HTML 到手 1040-1533ms、首帧 952/1349ms、属性写入 22-25ms；
   **不带** HTML 到手 27-306ms、首帧 1775/1830ms、属性写入 41-54ms。
   **⇒ 判决：这一刀不做**（省的是 HTML 等待，首屏一点不早、首次编辑还更慢）。
   **下一片的两条路已量化（同一份数据，`scripts/first-paint-cost.mts`）**：
   首屏服务端那 1.3 秒 = 读 **1019ms（78%）** + 组装 ≥36ms + 序列化 267ms；
   而 psql 读同样 10000 行只要 **235ms** → **差的那 780ms 是 node-postgres 的逐行解析**（不是数据库慢）
   → ① **存储形状**（每节点一行 → 一页一行）估能省 **700~850ms**（**是估，不是测**；代价是存储迁移）；
   ② **首屏只带视口内**（要"部分文档"这个新能力）。
   **这一格先不动手**：先核①的可行性（写路径/快照/分支复制/导入导出各碰 `design_nodes` 几处），核完再定顺序。
   **可行性已核（`grep designNodes`：只碰 4 个文件）**：
   写与读**都集中在 `server/domain/projects.ts` 一处**（逐节点写 311-325、批量插入 417、整页读 571）→ 迁移面比想象小 ✓；
   **但 `server/domain/search.ts`（按节点名 `ilike` + 按 updatedAt 排序）真的需要逐节点行** → 「一页一行」要给搜索留一条路
   （jsonb 里的名字数组 + GIN 索引？还是另留一张只放 id 与名字的窄表？）**要实查**；
   **更要紧的是写放大**：一页 10000 节点若"每次编辑重写整页 jsonb"→ 每次编辑写 10.7MB ✗
   → **省了首屏那 780ms，却把编辑变贵** → 这一条不核清楚不能动。
   ⇒ **下一片的入口就是这两条只读核对**（搜索怎么查、写放大多少），核完再定动手顺序。
   **⇒ 首屏那一格的真问题因此清楚了**：瓶颈是**服务端把那份 10000 节点文档读出来 + 组装 + 序列化**（≈1.3 秒），
   两条路：**① 存储形状**（`design_nodes` 每节点一行 → 一页一行；存储迁移）
   与 **② 首屏只带视口内**（要"部分文档"这个新能力）。判决书见 `docs/adr/0048-first-paint-document-not-in-html.md`。

    **更新（2026-10-21 中午）：两条路都被真数据否掉了（`scripts/jsonb-agg-probe.mts`，同一份 10000 节点文档）：**
    逐行读 + Node 组装 **151ms + 4ms = 155ms**；jsonb_agg 一行 + JSON.parse **643ms + 741ms = 1384ms**（9 倍慢），内容逐项相等（0 条不同）。
    **⇒ 首屏那一格的真问题现在定位好了**：读 10000 行 + 在 Node 里组装，**才 155ms**——那"约 1.3 秒"里大头不在读与组装。
    `loadDocument` 还读了 pages / design_tokens / components / assets 各一张表（drizzle 行映射 × 4 张表），再加 RSC 序列化 9.37MB 载荷和浏览器那一段（解析 + 水合 + 首屏求解 + 首次绘制）。
    **⇒ 那 1.15 秒找到了（2026-10-21 下午）：是 drizzle 的逐行映射，不是数据库。**
    `scripts/design-nodes-read-cost.mts` **交错**量同一步的两种读法（负载会漂，一次量完 A 再量 B 不可比）：
    drizzle `select()` **817ms** vs 裸 sql（无映射）+ 同样组装 **499ms**（中位，比值 64%；那轮机器很挤，绝对值待重测）。
    **为什么白做**：`design_nodes` 的载荷整份在 `data` 那一列（jsonb），drizzle 映射完代码里还是直接取 `row.data`。
    **⇒ 落成代码（只改一处）**：`loadDocument` 读 `design_nodes` 改走 `reader.execute(sql`SELECT id, data …`)`（原始行，不经映射），
    组装仍在 Node 里（不挪进 Postgres——那条 9 倍慢，已否）；`DocumentReader` 加了 `execute`（读取路径仍拿不到写的能力）。
    **红线**：`apps/web/test/load-document-identity.integration.test.ts`——读回来的文档必须与**库里的原始行逐项相等**
    （内容/键集合/顺序/token 引用），且**验证过故意少读一个节点就会红** ✓。
    **⚠️ 下一格要在安静机器上重测**（同一构建、开/关两轮）把最终数写死。
    **系统排查已做完**（`scripts/drizzle-mapping-cost.mts`，交错量、只读）：那一层开销**只有"一次把整份文档读出来"
    那一条路径上有**（那里行数上万且整列都是 jsonb）；搜索路径（只选 3 列）drizzle 反而更快（3.5ms vs 裸 sql 11.3ms，
    它走了索引）→ **其余路径不必动**（少改一处是一处）。
    **已重测（下午，安静机器、同一构建、两个 server 交替量、开→关→关→开各两轮）**：
    10000 档 **第一个节点画出**（用户看到画布有东西）带文档 **2065/2436ms** vs 不带 **1478/1583ms**
    → **不带文档早 400~850ms**；但**画布容器**出现晚 ~450~520ms（首帧 1046 → 1494/1565ms）、
    首次编辑慢约一倍（18.5/27.6 → 31.2/35ms）。
    **⇒ 判决从"不做"改成"有取舍，待产品拍板"**（默认保持带文档，开关就位）。
    **一条要记的方法论**：这一格的判决**因为服务端一次提速而改过两次** ⇒
    **任何"值不值"的结论只在当下那一版服务端成立，服务端一变就要重量**。
    **⇒ 那一格现在拆成三段了（安静机器、同一份真文档）**：服务端 `loadDocument` **434ms**（修后；修前 2.1~3.1 秒）
    ＋ **RSC 序列化 + 传输 ≈700-900ms** ＋ **浏览器（解析+水合+首屏求解+首绘）≈800-950ms**
    ⇒ **两段大头都随文档大小走，解法是同一个：首屏别带整份文档**；
    而"带多少"有个便宜的答案——**画布是虚拟化的**（10000 档在浏览器里**只渲染 34 个 DOM 节点**）
    ⇒ 首屏真正需要的只是视口内那几十个节点。
    **⇒ 下一格＝"部分文档"能力的可行性核对（先只读，不动手）**：几何全给（~1MB 量级）＋内容按视口给，
    滚动到别处再按需补（分页 + 合并 + 一致性），代价与风险一起列清。
    **核对已做完第一轮**（`packages/design-model/src/viewport.ts`）：裁剪判据**是纯几何的**
    （≤400 个节点不裁；否则视口 + 256px 外扩与包围盒相交）⇒ **"首屏带哪些内容"有现成判据**，
    而 10000 档只渲染 **34 个** DOM 节点 ⇒ 首屏内容就是视口内那几十个；
    **形态**：服务端算全量布局 → 首屏传**全量几何 + 视口内内容** → 滚动到别处按需补。
    **待决风险三条**（动手前要答完）：① 视口外内容缺失时画布显示什么（**产品决定**）；
    ② 补内容的请求与合并规则；③ `ResolvedLayout.nodes[id]` 现在把几何与内容揉在一起
    （`node` 字段就是内容），而画布/预览/代码生成三处投影都读它 ⇒ 要"只传几何"得拆这个形状（影响面要数清）。
    **⇒ 核对做完了（2026-10-21 下午，`scripts/partial-document-size.mts`，10000 档真文档）**：
    **首屏载荷 9.37MB → 938KB（10.2× 小）** = 瘦 layout（**数组编码**的 `[x,y,w,h,depth,parentId,children]`，~780KB）
    ＋ **视口内 54 个节点的完整 node**（几何+样式+文字）；视口内可见 **54 个**（裁掉 9946 个）✓
    ⇒ 那两段随大小走的大头会按这个比例缩 ⇒ 首屏有望落到 300~500ms 量级（**是估，动手前还要实测**）。
    **风险①的技术侧答案**：`nodeStyle` 假设 node 完整 ⇒ 两种画法（视口外不画 / 画占位框），
    **观感由产品选**（现有代码专为此加过 256px 外扩 ⇒ 作者在意"元素凭空长出来"）。
    **风险②有先例可抄**（`marketplace.ts` 的 limit/offset、`notifications.ts` 的 limit+1 判断还有没有更多）。
    **风险③波及面数清**：画布（含 React memo 比较器读 14 个字段）/变体看板/预览页/公开页/属性面板 ⇒ 要拆 `ResolvedNode` 的形状 ⚠️。
    **⇒ 这是新能力（分页 + 合并 + 一致性），不是一处改动** ⇒ 下一格先定**第一片的最小形态**
    （首屏载荷瘦身 + 滚动时按需补当前视口那一批），再动手。
    **⚠️ 2026-10-21 晚：这一路被判决"走不通"（ADR-0051）——理由是硬的不是"难做"**：
    **客户端自己算布局**（`apps/web/src/studio/store.ts:403/413` 调 `resolveLayout`）
    ⇒ 要算全图几何**必须持有全量节点** ⇒ "首屏只给视口内那几十个"⇒ 画布画不出全图；
    而**编辑路径把这个前提钉死了**：改一个节点 ⇒ 兄弟位置跟着变 ⇒ 布局要重算 ⇒ 重算要全量文档
    ⇒ 首屏没给全量，**用户一编辑就得多拉 9.37MB**（把首屏省的时间赔回去还赔上一次往返）。
    **⇒ 剩下能走的路＝流式首屏**：内容照样全给，只是**分批到**（先到骨架+视口内那块 ⇒ 很快看到画布；
    后面陆续补齐 ⇒ 编辑时内容多半已到齐）⇒ **不动任何现有前提** ✓
    **下一格＝流式首屏的可行性核对**：① Next 的 RSC 能不能用流式（`<Suspense>` + 异步组件）
    ② 文档怎么分块（"视口内 + 其余"两段，两个异步组件）③ **第一块能早多少**（同一构建、开/关两轮实测）。
    **⇒ `packages/design-model/src/partial.ts` 留着但**它没有接线**（ADR-0051 里写明了：
    那是**能力**，不是已交付的功能，§159）**；它的用处变成：流式首屏的第一块 ＋ 预览/公开页/变体看板
    算"只有视口内"的那份几何（省 CPU，不改首屏）。
   **这一格也做了（2026-10-21 后半夜，`d36d712`）**：复用再细一层——**跨帧的测量缓存**
   （尺寸没变的部分，测量结果留着；只重算坐标）。红线：10000 档扁平文档的 `layoutMs`
   **104-118ms → 76-91ms**，属性写入总延迟 **131.9ms → 94.5ms**（省 28%）。
   **一条边界**：模型层那个"测量 9999 次 → 1 次"是**计数**不是时间（测试里的 measureText 是故意很慢的计数器），
   **别把计数当收益报**——浏览器的 measureText 是启发式估算，每次很便宜。
   正确性由单测 3 条 + 真浏览器那支（`@smoke studio slice: select, edit a property, undo, autosave`，1 passed 21.4s）守着。
   细节见 `docs/PERFORMANCE.md`「2026-10-21」那两节。
   **自审自己当天写的代码时查出一个真缺口（2026-10-21 凌晨，已修）**：
   测量缓存的键只看「节点 id + 约束」，而**测量用的字号、间距、字体名都来自 token 解析**
   （`resolveNum` 与 `fontFamily` 都走 `tokens.resolveValue`）——
   token 一变而键没变，就会拿回旧尺寸（"改了字号，高度却还是老的"）。
   这与"改了节点内容却沿用旧测量"是同一个坑，只是内容不在节点上、在 token 表里；
   **库自己的注释早就写着"签名包括 tokens"，实现里却没有** → 契约与实现不符。
   **触发条件要说准**（别把它说成"改 token 就画错"）：单独改 token 时改动集合是空的 → 走全量 → 缓存整份清空 → **没事**；
   出事的是**同一个事务里既改 token 又改别的节点**（AI 的一次操作就是这样）：
   改动集合非空 → 走增量 → 缓存没作废 → 受 token 影响的节点拿回旧尺寸 → **画布高度是错的**。
   **修法**：token 表的指纹进测量签名（`tokensSignature`，按 key 排序的 JSON）；
   token 一变 → 签名对不上 → 整份作废。**代价明写**：指纹覆盖**整张** token 表，
   所以改一次品牌色也会让缓存整份作废（下一帧重量一遍）——宁可多量一次，不拿说不清的复用去赌尺寸（§159）。
   **补测 3 条**（`packages/design-model/test/measure-cache.test.ts`），且验证过**摘掉修复后三条全红**
   （"受 token 影响的节点沿用了旧高度 expected 24 to be greater than 24"）——是真守卫，不是摆设。
   **顺带把最后一条 e2e 存量红（§144 413）也修了，根因是真缺陷**：
   Next 16 的**中间件会先把请求正文读进来才运行**（默认 10MB 上限）→
   ① **合法的 >10MB 导入今天就是坏的**（正文被截断）；② 路由那道"按 Content-Length 先拒"来不及跑 →
   客户端猛推时服务端读完才回 413 → 中途收连接 → 客户端只看到 `ECONNRESET`。
   **修法**：导入路由**不进中间件**（它自己管鉴权）→ 头一到手就拒 → **正文一个字都不用读**
   （同一个探针：修之前 8 秒还在等，修之后 **723ms** 拿到 413；Next 那句 10MB 截断警告也没了）。
   **⚠️ 2026-10-21 上午：这一格底下还压着一个更大的发现——§147 的增量重解在编辑器里从来没跑过**
   （探针查出来的：改一个节点后，**没被改**的节点不是同一个对象 → 走的是全量）。
   三处根因：① 补丁走写时拷贝 → 文档对象每次都是新的 → 用对象身份判"是不是同一份文档"永远为假
   → `prev` 恒为 null；② 改动集合登记在**布局求解之后**（`design.execute` 会同步触发 commit）
   → 求解时它是空的；③ AI 事务完全没登记、undo/redo 登记太晚、`jumpTo` 走批量逆补丁也没登记。
   修法：**文档代数**（`DesignStore.generation`：整份换掉 +1、打补丁不变）+ **先登记后变更** +
   "算不全就强制全量"（`removeComponent`/`removeAsset`/`jumpTo`）。
   **接上电之后又量出 7 倍的反向效果**（增量 848ms vs 全量 142ms）：根因是增量路里一个**平方级**的
   形状检查（`children.every(c => prev.children.includes(c.id))`）＋它比错了对象
   （拿按 parentId 建的 resolved 孩子表去比文档结构）＋往沿用来的父节点 push（污染上一帧）。
   修完：模型层同一份真文档 **全量 27-41ms / 增量 16-29ms（测量 7 次 vs 9999 次）**。
   完整判决书见 `docs/adr/0049-incremental-layout-was-never-running.md`。
4. ~~**§146 的 100 档读数补齐**~~ **已落地**（2026-10-10，`docs/PERFORMANCE.md` 同日节）：
   首帧 426.3ms / 属性写入 61.3ms（两遍 31.8–90.7，抖动 2.8×）/ pan 6.1ms / 堆 98MB /
   画布 DOM 100 个（小文档视口裁剪未开）；**选中响应这一档没量到**（3 秒内手柄没出现），
   如实记空，下轮安静窗口补。
5. ~~**实时通道 Redis 后端（ADR-0010 留的第二驱动）~~ **已落地**（2026-10-05，`docs/adr/0028-*`）：
   `realtime/redisBus.ts` 是第二驱动，`bus.ts` 的 `createDefaultBus` 只看 `NEXUS_REDIS_URL` 选它，
   装上了哪个驱动会打进日志，连接坏了不退回进程内也不拖垮请求。
   #10 欠的「账本页 `onReconnect` 补读没有探针」**也已补**（2026-10-10）：
   `realtime-reconnect.test.ts` 的「接线」组多两条源码判据（账本也只有一个 `useRealtime`
   调用、它的 `onReconnect` 接的是 `refresh` 不是空操作）；真断线在浏览器里仍造不出来，
   这条限度照实留着。
6. ~~**§140 第四片：可走的地形**~~ **已落地**（2026-10-10，四步走完，见 §140 条目下的补记）：
   ① 高程在 wire 上被静默剥掉的断链（`WorldPointSchema` 没有 `elevation`，zod 剥未知键，
   面板写的高度存盘后再打开回到地面——实测确认后契约补栏，存取往返各钉）；
   ② 模型与契约（`WorldDocument.terrain` 圆台高度场、`setWorldTerrain`、`bad-terrain`、
   `WorldPlateauSchema`，重叠取最高的圆台——不平均不后画赢）；
   ③ 场景投影纯数据（**踩过的坑**：`sceneTerrain()` 一度带一个 `heightAt` 函数，
   而 WorldScene 要过 server/client 边界，Next 运行时报 Functions cannot be passed…
   3D 页白屏——改成纯数据 + 一条 typeof 断言防 Regression）；
   ④ 3D 与面板（相机贴地、半透明盘 + 高度柱 + 台沿圈、`data-walk-height`、
   WorldPanel 地形区数字输入、`@smoke 3D 世界` 加一段 + 截图 `world3d-terrain.png`）。
   图上画圆台的编辑器**也已补上**（2026-10-13）：世界图工具栏「画地形」按住拖圆、
   点中圆台两步删（`WorldGraphView.tsx` + `terrainDraw.ts` 纯函数，13 条单测 +
   `@smoke …（§140 图上画地形）` 走查拖画/删/刷新仍在）；起笔点先用 `elementFromPoint`
   验空白，候选位夹在**可见区域**——图比视口宽（这版骨架 2146px），按整宽取比例
   会点到视口外（`elementFromPoint` 返回 null）。
    **2026-10-15 第五片：坡地已落地——做剖面（profile），不做网格高度场**：
    `WorldPlateau.profile?: 'mesa' | 'cone'`（缺省 mesa，老文档逐字节不变），cone 台心到
    边缘线性降到 0、可走；两条 e2e 都加了坡（图上虚线圆 + 3D 脚下 `data-walk-height` 4）。
    详见文末「§140 第五片」一节与 ADR-0041（高度场明确不做的理由）。
7. ~~**任务 #132（并发会话登记的 §113 真欠账那一半）**~~ **已落地（2026-10-12 起，`268bd8d` + `d44bbcc`，
   ADR-0034 / ADR-0035；本行 2026-10-20 核对时发现它早已过期）**：`game` 那一步编出来的 GameDocument
   只留在内存里、界面上却写着"已生成…可直接在 Game Studio 试玩"、而库里一行没写——**三件事都做完了**：
   措辞收口（`GAME_DRAFT_NOT_LANDED_NOTE`：草稿存在任务行的这一步里，**没写进项目**）、
   草稿随结论存下来（`draft?: GameDocument` 存在任务行里，不在响应体里，客户端贴不进来）、
   一个用户点出来的"写进项目"（点「接受进项目」才写；已有游戏设计时拒绝覆盖，不静默覆盖）。
   **别照这一行重新发明**：核对方式是 `git log --grep='ADR-0035'` + `apps/web/src/lib/agent-game-draft.ts`。
8. ~~**对话两型引擎 = `ARTIFACT_CHAINS` 的第三个键 `story`**~~ **已落地（2026-10-20，ADR-0046，三片）**：
   `eb7cddf`（片 1 实现）· `475935e`（两个坑的返工）· `a992277`（片 2 见证 24→31 条 + vm 见证）·
   `aec8be3`（片 3 真浏览器 1 passed 1.2m）。
   于是**八型全部带上引擎**——`kindNote`（那句错位披露）今天恒为空，而它仍然是派生的
   （"机制还在"由一条反向控制钉着：临时把状态表某一型的管线改成 `null`，那句话必须出来）。
   判决书：`docs/adr/0046-artifact-third-chain-story-pipeline.md`。
   **下一格若还要动 `packages/game-model/src/codegen.ts`，先 `git status` 看那块是不是有人在途。**
9. **其余 `[~]` 长线**（RAG 向量、图像/视频/角色一致性像素、§54 游戏设计系统）
   **全部卡在真实 provider key 上**——按 §159 留白，不假造。**拿到 key 之前，
   自主推进的格子就是上面的 1–6（1–4 已落地，3 是 §147 的复测窗口）与第 8 项（今天已落地）；
   没有自主格子时就去核对 `[~]` 行是否过期，别照着已经做完的事再做一遍。**

需要用户才能推进的（不要绕过）：真实 provider key。有了它才能落地的是 §49 的向量与 rerank、
§38 的图像那半截像素、§40-42 的镜头视频、§39 的角色一致性像素。这四格今天全部按 §159 留白，
并在界面上写明了限度；换 provider 时不必重接逻辑，只换合成后端。

开工顺序仍是 `agents.md` 那五步：读 ROADMAP 找 `[ ]/[~]` → 读模块文档 → `git log --oneline -15`
→ 先跑最小验证确认起点是绿的 → 实现 / Run / Test / Screenshot / Inspect / Fix / Retest / Commit。

---

## §188 M8 第一片：公开 API v1（只读）+ API 凭据 —— 2026-09-29

- **落了什么**：`api_tokens` 表（迁移 0018：只存 SHA-256、`hint` 认哪一把、三条 CHECK、吊销留时间戳、`user_id` 上 ON DELETE CASCADE）；
  `authorizeApiRequest` 单入口（Bearer 解析 → 鉴权 → scope → 每凭据每分钟 120 次）；三个只读端点
  （`GET /api/v1/projects`、`GET /api/v1/projects/<id>`（含现场从文档算的 pageCount/nodeCount）、`GET /api/v1/projects/<id>/design`）；
  `/api-tokens` 管理页（明文只给一次、列表读失败说"读不到"而不是 0 枚、吊销、两个"试一下"按钮发的是真 HTTP）。理由在 `docs/adr/0019-public-api-bearer-tokens.md`。
- **见证**：`apps/web/test/api-tokens.test.ts` 10 条 + `api-tokens.integration.test.ts` 15 条 —— `npx vitest run` 两个文件 **25/25 绿**（真库，迁移已应用）；
  `tsc -p apps/web` 与 `tsc -p packages/schemas` 干净；eslint 覆盖本次改动的 10 个路径 0 问题。
  变异探针 12 个（迁移多一格 scope / CHECK 名单清空 / 端点用名单外 scope / 端点丢掉 authorize / 端点加 POST /
  bearer 改成大小写敏感 / 去掉头长度上限 / 随机段缩到 16 字节 / hasScope 恒真 / 节流窗口改到 70s / 摘要换成 sha384 /
  路由扫描器什么都找不到）—— **12/12 都被预测中的那一条用例抓到**，其中两处是按预测多红了姊妹用例（同一函数改坏了两条断言），
  跑完 5 个被改文件与进场时逐字节一致。
- **真浏览器（§158 的 Run→Test→Screenshot→Inspect）**：`e2e/api-tokens.spec.ts` 两条 @smoke，`npx playwright test e2e/api-tokens.spec.ts` **2/2 绿（45.0s）**。
  第一条走的是真 HTTP：游客建项目→注册→进 `/api-tokens`（新账号显示"还没有发过"而不是 0 枚）→ 发一枚只带 `projects:read` 的凭据 →
  页内 fetch 真读回 `GET /api/v1/projects` = 200 且项目名对得上 → 拿它问 `/design` = **403 insufficient_scope**（那句里带着缺的 scope 名）→
  再发一枚两格都给的 → 页面上那两个"试一下"按钮显示 **HTTP 200 · 文档来自 1 页 / 8 个节点（库里那一份）** → 吊销它 → 同一串明文再问 = **401 revoked_token**，
  而没吊销的那一枚照样 200（吊销按枚不按人）→ 刷新整页：两串明文在 body 文本里都找不到，只有 hint 前缀与"已吊销（时间）"那一行。
  截图两张已看过：`screenshots/api-tokens-issued.png`（明文只在这一块里出现）与 `screenshots/api-tokens-after-reload.png`（刷新后无明文、状态列是已吊销且没有第二个吊销按钮）。
  第二条钉游客不可达：`/api-tokens` 对游客退回首页，界面上是 `data-auth-identity=guest` 而不是一个空的凭据页。
- **还没做（下面第二片接掉了写那一半）**：v1 只有读，没有写端点，所以外部 Agent 当时只能"看得见"不能"改得动"；
  凭据级的读审计只到 `last_used_at` 那个分钟级信号，没有"谁在什么时候读了哪一份文档"的流水（这一条今天仍然成立）。
  M8「MCP、外部 Agent、公开 API」那一格当时仍是 `[ ]`：这一片是它的第一块，不是它本身。
- **已知限制（当时）**：v1 没有写端点（POST 得到 405，界面上写的是"写还没做"）——第二片之后界面上那句已经改掉，
  `POST /api/v1/projects` 回 405 说的变成"集合这条路没有这个动作"；设计文档整份返回，没有分页也没有字段裁剪，
  4000 节点档的响应体积还没有量过。

---

## §188 M8 第二片：公开 API 的写端点（PATCH 设计补丁）—— 2026-09-29

- **落了什么**：`design:write` 那一格（迁移 0019：先 DROP 再 ADD 那条 CHECK——`<@` 是"整串都在名单里"，
  两条并存时旧的那条会把新值挡死；加一格不用重建类型，已有凭据一行都不动）；
  `PATCH /api/v1/projects/<id>/design`（`apiPatchDesign`）。**发的是补丁不是整份文档**：
  Studio 自动保存说的是"客户端认为这一版就是全部"，而公网调用方没有资格替服务端决定"其余的都不存在了"。
  读—改—写在同一个事务里，`pg_advisory_xact_lock` 取在**读之前**——为此把 `lockProjectWrites` 与
  `writeProjectDocument` 从 `writeDocument` 里抽出来，让"写文档"这件事全库只有一处实现
  （第二处迟早漂开，漂开的那一半就是"文档改了但项目名还是旧的"这类账）。
  四种拒法都在写之前发生，且各说各的话：409 `approval_required`（补丁里有带走东西的 op——§74 那道门在 API 这一侧是
  **拒**不是**挂起**，因为这一边没有人可以点批准，挂起等于替不在场的人保留"再批准一次就能删"的期望）、
  409 `ops_skipped`（一条 op 打不到就整份不写，写一半比不写更难查）、400 `document_rejected`
  （打完补丁的文档过不了 Studio 保存那道同一扇规模门，ADR-0015）、404 `project_not_found`（别人的与不存在的一样）。
  报文门在 `@nexus/schemas`：`summary` 必填、`ops` 一到两百条（内部 AI 那条上限是 4000，因为它在同一个进程里）；
  限流分两桶（读 120 / 写 30 每分钟，数字住在 schemas，界面与测试读同一份而不是各抄一个）；
  成功之后落一条 `source:'ai'` 的快照并带上这份补丁的清单（Studio 历史面板按 §151 展示 diff）、重切语料、写 per-凭据审计。
  **拒也留行**：越权尝试与被拒的删除各落一行 `allowed:false` 到 §80 那张 `audit_events`——响应是瞬时的，账不是。
- **界面**：`/api-tokens` 多一格 scope 说明，多一颗写着"会真的加一个节点"的按钮（不是看不出后果的"测试"）；
  页首那句"今天 v1 只有两个只读端点，没有任何写端点"是假的，已改成三个读加一个写并写清删除类一律拒。
  顺手清掉两处旧注释里的同一句谎（`api/v1/projects/route.ts` 说的是"集合这条路没有这个动作"，
  `api/account/api-tokens/route.ts` 说的是"Bearer 的写不需要 CSRF，因为凭据不会被浏览器自动带上"）。
- **见证**：`api-tokens.test.ts` 17 条 + `api-tokens.integration.test.ts` 24 条打真库，`npx vitest run` 两个文件 **41/41 绿（89.4s）**。
  两个会漂的只读钉法换成了推导法：
  scope 名单比对改成从 `pg_catalog` 读**生效的那条约束**（跨迁移取最后一条 ADD，不再拿第一份文件当事实），
  scope 与 HTTP 方法**按源码位置配对**（读 scope 只许挂 GET、写 scope 只许挂写方法，且每格写 scope 必须真有一个写方法在执行它）。
  三个变异探针各打中预测的那一条：① 0019 的 CHECK 名单里拿掉 `design:write` → 红在"库里生效约束与 schemas 那份是同一件事"；
  ② 迁移文件的遍历顺序反过来 → 红在同一条（证明"最后一条 ADD 生效"真的在跑，而不是恰好相等）；
  ③ 把 advisory lock 挪回读之后 → 24 条里恰好 1 条红，红在"同一枚凭据并发两次 PATCH：两个节点都在——后写的不许悄悄吃掉先写的"，
  连跑两遍都是它，而对照（未变异）24 条 0 红。
- **真浏览器（§158）**：`npx playwright test e2e/api-tokens.spec.ts` **3/3 绿（3.1m）**。新那条量的四件是集成层给不了的：
  面板那颗按钮报的"文档现在 N 个节点"与随后 GET 回来的 N 一致（不是它自己加的数）且节点真在文档里；
  `remove` 得 409 而**文档一个节点都没少**（那个节点还在）；只给读权限的凭据发 PATCH 得 403，
  同一句 403 由面板原样贴出来；缺 summary 与空 ops 在门口就是 400，两次之后节点数没动。
  截图两张已看过：`screenshots/api-write-panel.png`（`HTTP 200 · 文档现在 9 个节点；历史里落了一条带补丁清单的记录`）
  与 `screenshots/api-write-refusals.png`（`HTTP 403 · insufficient_scope：这枚凭据的 scope 是 projects:read / design:read，
  没有 design:write…`，而列表里那两枚一行窄一行宽，宽的那枚"最近使用"翻成了这一分钟）。
- **还没做（下一格取这里）**：读没有 per-调用的审计（只有 `last_used_at` 那个分钟级信号）——写有账，读没有；
  项目的创建 / 删除 / 发布不对外，所以外部 Agent 能改文档却不能建项目；
  4000 节点档的 GET 响应体积与 PATCH 耗时都还没量过（§146/§147 那一档）；
  MCP 与外部 Agent 接入那一格没动，所以 M8 整格是 `[~]` 而不是 `[x]`。

---

## §188 M8 第三片：凭据级的访问账（读也留得下证据）—— 2026-09-29

- **落了什么**：迁移 0020 建 `api_access_buckets`，主键 `(token_id, endpoint, project_id, bucket)`。这张表唯一一处
  能挡住"每次调用写一行"的地方是库里那句 `CHECK (date_trunc('minute', bucket) = bucket)`——不是洁癖：一次清单读
  在限流额度内可以有一百二十次，逐次写行的账本三天就没人读得下去了。FK 到 `api_tokens` 走 `ON DELETE CASCADE`
  （**吊销不清账**，注销人才清，所以撤了凭据还能查它生前读过什么）、`calls >= 1`、一个 `(token_id, last_seen DESC)` 索引。
  `recordApiAccess` 只在**读成功**那一条路径上调用，`ON CONFLICT DO UPDATE` 累加次数并推 `last_seen`；
  新建一个桶的同一刻顺手删掉这一枚凭据超过 `API_ACCESS_RETENTION_DAYS`（30）天的行——清理频率的上界就是新增行的
  频率上界，而后者由读限流封顶。`listApiAccessSummary(userId, perToken=3)` 给面板聚合；四个 v1 handler 各记一行；
  `GET /api/account/api-tokens` 多回一个 `access` 数组，出门口过 `ApiAccountTokensSchema`（§跨端报文只用 schemas 那条纪律）。
  **为什么不塞进 `audit_events`**：那张表记"决定"（这一格允不允许、为什么），这本账记"用量"（哪一枚凭据读过哪一份、
  读过几次）。混成一张表的后果是两边都变成没人读的那一种——裁决要翻出来查，用量只想看一眼。
  **项目那一格用空串而不是 NULL**：NULL 之间不比相等，进了主键就等于每次调用都是新的一行，那句 CHECK 也就白写了。
- **界面**（`/api-tokens` 多一列"最近读过（按分钟合并，留 30 天）"）：三句诚实各有各的代码理由——
  `—` 是"这一本没读到"（查询失败），`还没读过东西` 才是"读到 0 次"，两者混起来一次拉取失败就会被读成
  "这个人在公网上一格都没碰过"（§73 同一形状）；端点名太长所以只显示"方法 + 最后一段"，全串挂在 `title`
  与 `data-access-line` 上（列宽裁掉的那半截正是有信息的那半截）；写也记在同一本账上，列名里就写着按分钟合并，
  不假装它是逐次流水。
- **见证**：`api-tokens.test.ts` 19 条 + `api-tokens.integration.test.ts` 30 条打真库，两个文件 **49/49 绿（170.8s）**。
  两条推导法的新见证（不靠手抄名单）：从 `apps/web/src/app/api/v1` 遍历出全部 handler，**每个方法都必须在账上留得下
  一行**、端点名必须是从源码推出来的字面量；单引号那一条另配反向对照——从真源码里挑一行、把 `${projectId}` 注入到
  中间，改出来的这一格必须被认出来，否则"改不动等于没测"。三个变异探针各打中预测的那一条：
  ① 端点名换成拼出来的 `GET /api/v1/projects/${projectId}/design` → **2 红**（"每个方法都要留一行"与"必须是字面量"）；
  ② design 的 GET 停止记账 → **1 红**（只有推导那一条，字面量那条不受影响，两条用例是独立的）；
  ③ `apiAccessBucketOf` 不再截分钟 → **6 红**，全落在访问账那一组，库里那句 CHECK 拒收（40 次 insert 全被挡），
     `recordApiAccess` 把失败写进 stderr 而**没有把一次成功的读变成 500**——响应仍是 200，这一屏证据就是"这次的证据
     没留下"这件事本身的证据。未变异的对照 49/49 绿，三处还原后 sha256 与探针前逐字节一致。
  顺带抓到两处只有真库 / 真多次跑才抓得到的：`listApiAccessSummary` 里 `eq(projects.id, apiAccessBuckets.projectId)`
  在真库上直接 `42883 operator does not exist: uuid = text`——cast 必须落在 uuid 那一侧（`projects.id::text`），
  因为 `''::uuid` 会抛而空串正是那一列的合法值；哈希那条反向对照写死"把末位换成 0"，而明文尾巴是随机十六进制，
  实测 4000 枚里 209 枚（5.22%）以 `0` 结尾，也就是每十九次跑红一次、红的是测试自己，改成按明文推导邻居字符。
- **真浏览器（§158）**：`npx playwright test e2e/api-tokens.spec.ts` **4/4 绿**，新那条量的四件是集成层给不了的：
  同一枚凭据三次连着清单读在面板上**不超过两行**而合计仍是 3（合并不许把次数合掉）、design 那一格 ×1、
  读过的那一份带**项目名**而不是只有端点名、只给清单权限的那一枚账上只有清单那一格——那次 403 一行都没留。
  截图 `screenshots/api-access-ledger.png` 已看过：`CI 被拒的那次` 那一行只有 `GET …/projects · 整个清单 ×1`，
  `CI 读三遍` 那一行是 `GET …/design · 访问账样本 mulqvir8 ×1` 加 `GET …/projects · 整个清单 ×3`。
- **还没做（下一格取这里）**：MCP 与外部 Agent 接入那一格；项目的创建 / 删除 / 发布不对外，所以外部 Agent 能改文档
  却不能建项目；4000 节点档的 GET 响应体积与 PATCH 耗时**已量（2026-10-21 晚，`scripts/v1-4000-cost.mts`）**：
  GET 响应 3.22MB → **gzip 0.11MB**、布局求解 46.2ms、**PATCH（改一个节点）2.4ms**
  （10000 档对照：0.27MB / 95.6ms / 5.1ms）⇒ **传输与写路径都不是障碍**
  ⇒ **M8 那一格缺的是"能力"（项目创建 / 删除 / 发布不对外），不是性能**
  ——**⚠️ 这一条本身也过期了**（2026-10-21 核实：三样 2026-10-08/09 就都对外了，见上面 M8 那行的升格说明）✓全局视图与 CSV 导出
  已经落地（2026-10-15，见文末 `§188 全局访问账` 一节）。M8 整格因此还是 `[~]`。

---

## §112 多步编排第一片：多步作业有了真执行方，Agent task complete 第一次有真终态 —— 2026-09-29

- **落了什么**：`apps/web/src/lib/agent-runtime.ts`（纯规则层：配方、计划自检、就绪 / 受阻、终态判定、
  §113 的交接）与 `apps/web/src/server/agent/runtime.ts`（执行器：四种步骤，加一张
  `RUNNERS: Record<StepKind, Runner>`——纯层加一种步骤，执行器不加真实现就过不了类型检查）。
  `GET` / `POST /api/projects/<id>/agent` 是它的读写口；Studio 多了 `Agent` 标签页（`AgentPanel`，带 `data-agent-*` 一串锚点）。
  计划写进 `agent_tasks.plan`——这一列从 0000 建库起就在表上，此前**全库没有一处写它**，
  于是 §25 说的"用户可以看到 Planning… 1..8"只能活在那个请求的内存里，刷新就没了。
- **为什么在 web 层而不是 ai-service**：每一步的产物要落业务库、要发实时事件、要写账本与通知，
  这几样都是 web 这一侧的职责（`ARCHITECTURE.md`：AI Service 不写业务库）。取舍写在
  `docs/adr/0020-multi-step-orchestration-lives-in-web.md`。
- **第一片只读**：四种步骤（结构盘点 / 上架元信息 / 发布门禁 / 汇总）都不改设计模型、不发布、不生成像素，
  所以没有 §150 的事务要记，也不可能把工作区改坏——这一条在真浏览器里逐字节量过（见下）。
  计划由确定性配方生成 → 整条作业记 `capability: 'demo'`，面板常驻 "DEMO 规划" 标识，通知标题里也写（§160）；
  而每一步的读数（页数、门禁分、语料块数）是真的。发布门禁那一步用的是发布时**同一个** `analyzeHealth`（§179）。
- **拒收在建行之前**：五种理由各有自己的码——`no-document`(404) / `roster-empty`(409) / `capability`(409) /
  `credits`(429) / `invalid-plan`(500)。一条从没跑起来的作业不在账本里留行（同 §134 的额度拒绝口径）。
  能力那一条由名册说了算（§73）：缺 Agent 或缺能力就整份拒收，并说清缺谁、缺哪条能力。
- **失败往下传**：某步失败之后，依赖它的步骤是 `skipped` 并写着被谁牵连——不是 `failed`（它们根本没跑过），
  而且跳过的那一步一条 `agent.step` 都不发（只发一条活动说明）："没开始过"与"失败了"是两件事。
- **断在半路的行读的时候收敛**（ADR-0011 同一口径）：`convergeStaleRun` 把超过 5 分钟还挂在 `running`
  的行收敛成 failed 并写明原因；只碰没有 `provider_job_id` 的行——有作业号的归 §162 的消费者，两边不抢同一行。
- **见证**：`agent-runtime.test.ts` 17 条纯层 + `agent-orchestration.integration.test.ts` 5 条打真库
  （全绿那一条把计划落库、事件顺序、任务行 succeeded、通知与扣点一起量了；失败那一条注入一个会抛的执行方，
  量的是"失败往下传 → 任务行 failed → 通知按 error 说 → 不扣点"；另加拒收不留行、名册缺人拒收、收敛三条），
  连 `notify-plan.test.ts` 与 `notifications.integration.test.ts` 一起跑 **64/64 绿**。
  **变异探针一个**：把 `verdictOf` 的成功判定从"没有失败**且**没有被跳过"改成"没有失败"——
  纯层恰好红一条，红的正是新加的"只有被跳过、没有失败的终态也不算成功"那条
  （这一支跑起来到不了：跳过一定是被失败牵连的，所以它是承诺而不是路径，靠手工造的计划钉住）。
- **真浏览器（§158 的 Run → Test → Screenshot → Inspect）**：`e2e/agent.spec.ts` 两条 `@smoke`，
  `npx playwright test e2e/agent.spec.ts` **2/2 绿（5.2m）**。第一条走真 HTTP：注册 → 建项目 → 进 Studio 切 Agent 页 →
  空态写的是"还没有跑过 Agent 作业"（不是"0 步完成"那种空壳）→ 填目标 → 跑一次 → **4 步全 `done`**、
  页面上是"完成 4/4 步"与那句目标、`DEMO 规划` 标识在、没有报错便签；
  服务端数出来的 **"1 页 / 8 个节点"** 与画布上那 8 个节点对得上（不是面板自己加的数）；
  刷新整页后那一份作业还在（库是权威，ADR-0010 后果第 4 条）；最后到 `/notifications`，
  那一行写的是"《编排 …》的多步 Agent 任务完成（DEMO 规划 · 4/4 步 · 3.2 秒）"——与面板上的是同一件事，
  而"没有来源"那张单子上**只剩 Build complete**。
  第二条量的正是"只读"这句承诺：跑一次检查前后 `GET /api/projects/<id>` 的整份文档**逐字节相同**，
  历史里的快照一条不多。截图两张已看过：`screenshots/agent-run.png` 与 `screenshots/agent-notification.png`
  （前者是整个面板跑完的样子，后者是收件箱里那一条）。
- **还没做（下一格取这里）**：计划不是模型给的，接上真 provider 规划之前 `capability` 只能是 `demo`；
  四步都是只读，所以它只能**指出**问题不能**修**——要"修"就得有会改模型的步骤，而那种步骤必须自己走 Command（§150）
  并把撤销凭证带回来；作业是**同步跑完**的，没有排队 / 取消 / 重试。
  （这一条原本还写着"长作业没有真进度"，2026-09-30 已由下面那一节补上：多步作业的中间刻度有了真来源。）
  §74 的审批门与这一片没有交集，因为这一片一个写动作都没有。

## §188 M8 第四片：公网 v1 的 JSON 出口带上编码协商 —— 2026-09-29

**为什么要自己压**：`next start` 自带的 compress 中间件认得 `application/json`，
但它**没接住 Route Handler 的写路径**——同一台生产服务器上 `/` 的 HTML 回 `Content-Encoding: gzip`，
而 `/api/v1/.../design` 那份 3.2MB 的文档回 `identity`（两份头部记在 `docs/PERFORMANCE.md` §188 那一节）。
这一格没有分页也没有字段裁剪，所以报文体积就是调用方付的全部代价：**3293KB → 103KB**。

- `apiJson(data, req, init)` 是 v1 的 JSON 出口：够大（`API_GZIP_THRESHOLD_BYTES = 1024`，
  取自 Next compress 中间件的默认阈值，同一句话不在两处各写一遍）且对方收得住才压。
- **`content-length` 两条路都自己写，值与体同源**（gzip 那一路写的是压过的字节数）——
  把原体长度挂到压过的体上，客户端读到的就是截断的 JSON。
- 压过的响应补 `vary: Accept-Encoding`（同一 URL 会因这一回头给不同编码，
  虽然现在写着 `no-store`，漏掉 vary 等于"现在没事、以后加缓存就出事"那种欠账）。
- **结构门**：`api-response.test.ts` 里扫 v1 的路由文件，不许再出现裸的 `NextResponse.json`——
  "漏了一格"在响应码上完全看不出差别，只能从代码形状上钉。

**本轮修掉的一处真 bug（`acceptsGzip` 的最具体匹配）**：原实现是"扫一遍，看见 `gzip` 或 `*` 就算收"，
于是 `gzip;q=0, *` 判成**收**——那一条的意思是"别的都行，就是不要 gzip"，
通配把它盖了过去，我们就会给一个明确拒收的客户端回 gzip，它可能根本解不开。
按 RFC 9110 的**最具体的匹配胜出**重写（显式的 `gzip` 定案，`*` 只作为兜底），
并把两格补进测试表（`gzip;q=0, *` → 不压、`*;q=0, gzip` → 压）。
**变异探针**：把 `acceptsGzip` 改回"看见就算收" → 红在 `accept-encoding="gzip;q=0, *" → 不压`；
改回后 `api-response.test.ts` **26 条全过**。
原表只有 `gzip;q=0` 单独出现那一格，而它在两种写法下都对——**这个 bug 只在两者同时出现时才露头**，
所以"表里有一个拒收用例"并不等于"拒收这条语义被测住了"。

**验证与未验证（如实记）**：`npm run lint` 0 问题；非库用例 **62 文件 / 788 条全绿**。
本轮 Docker 起不来（WSL 被本机安全策略挡住，Agent 无法自行启动引擎），
所以**打真库的用例这一轮没跑**——其中 `api-tokens.integration.test.ts` 覆盖的正是本次改过的三个 v1 路由，
它是**待补的验证**，不是"已经绿了"。改动本身是响应编码层的一层包装，且结构门钉住了每一处出口，
但这条要说清楚：下一轮 Docker 起来后先补跑它。

**顺带清掉一处会误导下一个人的死契约**：`lib/tasksLedger.ts` 写着"`/api/projects/<id>/tasks` 的报文契约"，
而那条路由**不存在**（`app/api/projects/[projectId]/tasks/` 是个空目录），全仓也没有任何引用。
`/tasks/<项目>` 那一页是服务端组件、直接读库，本来就不需要这条 HTTP 路由。
按 `RealtimeEventSchema` 的先例（契约可以留着、但要如实说明没人用）保留文件、把状态写进注释，
并在本节记一笔：要让它活起来，得先有一个客户端消费者。

**顺带清掉 lint 的一处噪音源**：`.scratch/`（变异探针与跑批脚本）此前既没进 `.gitignore`
也没进 eslint 的 ignores，于是类型感知的规则集每次都报四条"文件不在 project service 里"。
**顺带清掉 lint 的一处噪音源**：`.scratch/`（变异探针与跑批脚本）此前既没进 `.gitignore`
也没进 eslint 的 ignores，于是类型感知的规则集每次都报四条"文件不在 project service 里"。
两处都补上（并互相注明），`npm run lint` 从此只报真问题。

## §188 M8 第四片另一半：把"只有上限、没有实测"那句限度换成数字 —— 2026-09-30

上一节改的是出口（`apiJson` 会压），但**没有量过线上真的压没压**，也没有 ADR-0019 那句
"4000 节点档会给出很大的响应"对应的数。这一节补的就是这两个数，外加补跑上一节点名要补的那一寸。

**怎么量的**：`scripts/perf-public-api.mts`（上一节写好的脚本，这一轮第一次真跑）打的是
**生产构建 + 真 HTTP + 真凭据**：`npx next start apps/web -p 3101`，脚本开头先拿"不带凭据的
`/api/v1/projects` 必须回 401"当活门——回别的就不量（这一格既是探针要量的门，也是它自己的存活检查）。
**同一会话连跑两遍**，每项 5 次（大档写与 200 条 set 各 3 次）取中位并一起报最小值。
线上字节用 `wireProbe` 自己数 chunk：**fetch 会透明解压**，所以在它那里"响应 3293KB"永远成立，
问不出服务端压没压——这一格是整个测量里最容易自欺的地方。

**量到的**（详表与读数口径在 `docs/PERFORMANCE.md` 的 2026-09-30 那一节）：
- 4008 节点 / 1 页的整份文档：**解开 3293KB / gzip 103KB，每节点约 841 字节**，两遍逐字节一致；
- **`content-encoding: gzip` 真在生产 Route Handler 的响应上**：要 gzip 时线上 103KB，要 identity 时 3293KB。
  上一节"3293KB → 103KB"那句是从本机压同一串字节的来的数，这一轮它有了线上版本；
- 压的净代价 **+30~47ms**（457−410 / 343−276，每格只跑一次，只当量级），换来线上少 3190KB；
- GET 大档中位 **951.3 → 513.3ms**（两遍，最小 489.2 / 332.3）——**同一份文档两遍中位差 46%**，
  这台机器的墙上时钟照旧随负载飘，所以延迟不做断言、只做体积与 `content-encoding` 才配当门；
- **一次 `insert` 在 4008 节点档中位 1596.9 / 1369.5ms（最小 1395.7 / 1227.7）**，而小档（228 节点）
  是 262.0 / 304.7ms。对照 `perf-save.mts` 的进程内增量保存（改一个节点 196.8–225.5ms）：
  公网这一趟多出来的一个数量级**没有拆开归因**，只是与"整份 `loadDocument` 的那一次 GET 同量级"对齐了。
  归因要用进程内探针分段，这一轮没做，所以这一句在 ADR 里写的是"未验证"而不是结论；
- 清单那一格 **366B 走 identity**（在 `API_GZIP_THRESHOLD_BYTES = 1024` 之下）——阈值不是装饰，
  这一档就是它存在的理由；
- 删除那一条仍然回 409 `approval_required`（74.2–106.8ms），公开 API 这一侧没有人可以批准它。

**补跑上一节点名要补的那一寸**（Docker 已经起来了）：`api-tokens.integration.test.ts` 打真库 **30/30 绿**，
`api-response.test.ts` **26 条**、`api-tokens.test.ts` **19 条**绿。
红过一次也要如实记，而且要记下**归因被量纠正了一次**：那一次是在**生产服务还挂在 3101、4000 档的测量刚跑完**
的机器上跑的，三个文件串行（`fileParallelism: false`）打到那条并发 PATCH 时用完了 30 秒
（`Test timed out in 30000ms`）；单跑同一个文件 **30/30 绿**（47.2s 那次），再跑一遍 verbose 是 **30/30 绿、10.8s**，
其中那条并发 PATCH 自己只占 **1129ms**。
我先前写的"那 47.2s 大部分是这一条"是猜的，第二次量就把这句推翻了——**同一份用例在空闲机器上是 1.1 秒，
在刚量完 4000 档的机器上要 30 秒以上**，这是排队与连接争用，不是逻辑慢（`vitest.config.ts` 记的就是这件事）。
处置是"复跑并量出那一条自己的耗时"，不是加 timeout、也不是改用例。

**头部那三条承诺各拆了一次臂**（`.scratch` 里的探针，跑在 `git archive HEAD` 解出的平面上，
被跟踪的 `http.ts` 全程没被打开过——结束时按 sha256 证了一遍，前后都是 `a3c4fcf82666`）：

| 臂 | 改坏的是哪句承诺 | 红的用例 |
|---|---|---|
| A1 gzip 那一路把**原体**长度挂到压过的体上 | `content-length` 与体同源 | 「两条路的 content-length 说的都是这一次真正发出去的字节」 |
| A2 identity 那一路改用 **utf16 字符数**当长度 | 长度按 utf8 字节算 | 「CJK 按字节算不按字符算……」（**这一臂第一次跑是 0 红**，见下） |
| A3 压过的响应不写 `vary` | 同一 URL 会因编码回不同头部 | 「vary 里补上 Accept-Encoding，但不吃掉调用方已有的那一串」 |

control 与收尾各 **26/26 绿**，三臂各红 1 条、红的正是 aimed 的那一句。

**A2 露出来的洞与补上的那一格**：原来那条"两条路的 content-length"用的是 ASCII 报文，
字符数==字节数，所以把 identity 那一路的长度改成 `plain.length`（utf16 字符数）**26 条全绿**——
一份中文文档在生产上就会收到一个**比体短**的 `content-length`，客户端按头读回来的是截断的 JSON，
而测试一个字都不会说。补的是同一份 CJK 报文再走一次 identity：断言头里的长度==实际字节数，
外加一格"字符数与字节数必须不相等"（相等就等于这条用例白写，将来报文形状变了它会先红）。
**这就是"表里有一个用例"不等于"这条语义被测住了"**，上一片栽在 `gzip;q=0, *`，这一片栽在 ASCII 报文——同一个形状。

**浏览器那一只也补跑了**：`NEXUS_WEB_URL=http://localhost:3101 npx playwright test e2e/api-tokens.spec.ts`
**4/4 绿（3.5 分钟）**，打的是带 gzip 出口的生产构建。浏览器 fetch 自带 `accept-encoding: gzip`，
所以第二片那条"面板那颗按钮真加一个节点"走的是**压过的那一路**——写进去的节点数与随后 GET 回来的仍然一致，
说明 `apiJson` 换了出口没有把 JSON 契约改坏（`content-length` 与体的关系在真浏览器里成立，不只在单测里）。

**这一格因此现在能说的**：公网读一份 4000 节点的项目是 0.3–1.3 秒、103KB 的一次传输；
**不能说的**：它在 10000 档如何（没量），以及那 1.2 秒里每一段各占多少（没拆）。
M8 整格仍是 `[~]`：MCP 与外部 Agent 那一格还没动，项目的创建/删除/发布也不对外。

## §112 × §163 第二片：多步作业的中间进度刻度有了真来源 —— 2026-09-30

- **补的是哪一格**：上一片（2026-09-29）末尾写着"作业是同步跑完的，长作业也没有真进度"。
  现在 `apps/web/src/server/agent/runtime.ts` 每跑完一步推一格 `generation.progress`，
  分子是**已到终态**（成功或失败）的步数、分母是计划里的总步数，两个数都从库里那一份 `plan` 数出来
  （`progressOf`），所以中间那几格是真的数出来的，不是 `0.2 / 0.5 / 0.9` 那种插值。
- **构造点收在一处**：事件形状的拼装收敛到 `apps/web/src/server/domain/agent-tasks.ts` 的 `publishTaskProgress`
  （原来那个私有函数导出后与编排共用）。理由是"progress 恒在 0..1、kind 说得清是哪一类"这两句话，
  生产者各拼一份就得各证一遍；取舍记在 `docs/adr/0020-…` 新增的那一条。
- **跳过的那一步不发这一条**：它什么都没做，算一格等于把"没跑"报成"跑完了四分之一"；
  收尾那一格由 `finishTask` 发（成功与失败都发，失败也发是上一片就有的纪律）。
- **钉的是什么**：`agent-orchestration.integration.test.ts` 两条用例把整串刻度钉死——
  全绿 `[0, 0.25, 0.5, 0.75, 1, 1]`（最后一格是任务行收尾），失败 `[0, 0.25, 0.5, 0.75, 1]`
  （那一步失败占一格，被它牵连跳过的那一步不占），另加"整串单调不减"与"跳过的标题在进度串里一次都没出现"。
  消息那一串**从库里读回的那份计划推导**（`planned.tasks.map(...)`），不在测试里重抄步骤标题——重抄会把断言变成对抄写的测试。
  一起跑 **5/5 绿**（最后一次 16.6s，其中用例 2.07s；机器空闲时同一份是 5.8s / 用例 2.02s——差的是 collect 那一段，不是逻辑）。
- **两个臂加一个反向平面**（`.scratch` 里的平面，被跟踪的文件全程没动，跑完删）：
  | 平面 / 臂 | 改动 | 结果 |
  |---|---|---|
  | 反向平面（`git archive HEAD` 的旧执行器 + 只放进新用例） | 生产者还没有中间刻度 | **2 红 3 绿**，红的正是那两条进度断言，报的是值不符（`[0, 1]` vs `[0, 0.25, 0.5, 0.75, 1, 1]`），不是崩 |
  | 分子只算 `done`（失败不计入终态） | 失败那一步那一格停在 0.5 | **1 红 4 绿**，红的就是失败那条：`[0, 0.25, 0.5, 0.5, 1]` vs `[0, 0.25, 0.5, 0.75, 1]` |
  | 分子再算上 `skipped` | 无 | **5/5 绿（臂活了下来）** |
  第三条不是"代码没问题"，而是"这句话测不到"：跳过的那一步在主循环里标状态，根本走不到推这一格的函数，
  分子里加不加 `skipped` 改不动任何东西。于是 helper 的注释改窄成测到的那半句（**跳过的那一步不发这一条**），
  不再声称"分子含 skipped 会红"。**被真正钉住的语义是"失败也算到终态"**（第二个臂红在那里）。
- **真浏览器量到的与它教的事**：`e2e/agent.spec.ts` 两条 `@smoke` 最终这份文件 **2/2 绿（25.8s：10.5s + 8.9s）**，
  钉的是首格 0、末格 100、至少一格严格在两者之间、整串单调不减、且消息里出现过 `第 n/4 步：`。
  带临时探针量过一次（探针行已在提交前删掉，删掉后重跑仍绿），页面画出来的是
  `0% · 已提交 | 50% · 第 2/4 步 | 75% · 第 3/4 步 | 100% · 第 4/4 步 | 100% · 完成`——**25% 那一格没有被画出来**。
  查了 `api/realtime/route.ts`（只有 `controller.enqueue`，没有丢弃也没有排队逻辑）之后归因清楚：
  SSE 事件都到了，是 React 把两次更新合进同一次绘制，DOM 上就少一格。结论是**分工**而不是加 tolerance：
  精确序列归集成层（事件流本身一条不少），浏览器层只钉"画得出中间刻度"——把精确序列写到浏览器层就是在赌绘制时机。
- **踩到的一次环境陷阱（判据记下来）**：Playwright 的 `webServer` 被 kill 时只杀了 `npm` 外壳，
  留下来的 `next-server` 子进程仍占着 3100 并回一套**已经失效的路由表**——当时**所有** API 路由都回 404
  （连 `/api/auth/register` 也是），看上去像我把代码改坏了。判据：404 遍布全部路由就先查端口上是谁在听
  （`netstat -ano` + 按 PID 杀那个子进程），不要先改代码。
- **文档 census 跟着改**：`ARCHITECTURE.md` 与本页那句"只有 `generation.progress` 与 `notification` 有生产者"
  从 34a22bb 起就过期了。**2026-09-30 更新：七种事件现在全部有生产者**——
  `generation.progress`、`notification`、`agent.plan` / `agent.step` / `agent.activity`（编排与 §162 消费者），
  以及最后一对 `build.status` / `preview.status`（发布链路，见上面 §163 那一条）。
  所以 §164 的"没有来源"清单里，Build complete 也**不再是"没有来源"**。
- **还没做**：跨实例（总线是进程内的，多实例部署收不到别的实例的事件）；
  `awaiting_approval` 那一档没有 TTL。§163 那一格因此仍是 `[~]`（欠的是跨实例与补发，不再是生产者）。
  （两格后来都动了：TTL 在 2026-10-01 落地，跨实例在 2026-10-06 落地（ADR-0028），
  所以现在欠的只剩**补发**那一件——见文件末尾那一节。）

## §168 第二片：按天曲线——"最近到底有没有人在来"，累计数对这个问题是瞎的

上一片回答的是"到目前为止一共多少"（每个发布版本 × 六个累计数）。这一片回答另一个问题：
**最近这段时间有没有人在来**。累计数对后者是瞎的——昨天刚爆过的作品，与半年前爆过、
之后再没人来的作品，累计数可以长得一模一样。

- **三个量各画一张图、各有各的纵轴**（`TrendChart.tsx`，服务端组件，浏览器不为它付一行 JS）。
  打开次数是"次"、访客是"人"、时长是"秒"，挤进同一个坐标系里读者一定会去比柱子高矮，
  而那个比较没有任何含义。代价是多占两行地方。
- **没有数据的日子画成基线上一小段虚线**，不跳过也不画成满高：跳过会把"停更了一周"画成连续有人来，
  满高虚线柱又会被读成"那天最高"。虚线短柱说的是"这一天没有心跳"。
- **纵轴上限就是窗口内的最大值（至少 1）**，所以一根满高的柱子永远意味着"这是这段窗口里最高的一天"，
  而不是"越过了某个固定阈值"；上限写在标题右边，可以直接核对。
- **"这一天一条心跳都没有"的时长是 `null`，不是 0**——0 秒是"来过但没攒够时长"，两者不能混
  （与六个数里的 `playTimeMs` 同一口径）。
- **访客在窗口内去重，不是把每天的人数相加**：库里按 (人 × 天) 分行是为了画曲线，
  同一个人连着来三天，在"窗口内访客"里仍然是一个人。
- **"今天"由调用方说**（`utcDay(now)`），这一层不读时钟——读时钟的函数没法测"窗口边界"这种情形。

**验证**：`analytics-trend.integration.test.ts` 打真库 + 纯函数两组，钉的都是会被含糊掉的边界——
闭区间两端都算、两端之外那一条不算（并做反向对照：把窗口放宽一天它就进来了）、闰年二月照常往前数、
天数夹在 1..365（0 天不是"空窗口"，1000 天也不是十年）、缺的那天补 0 而时长仍是 `null`、
窗口内访客跨天去重（曲线上是三个"人·天"、访客数仍是 1）、有行但加出来 0 秒报 0 不报"未采集"、
完成度按行加权（一行 100% 加三行 20% 是 40% 不是 60%）、只数自己的作品（别人的访问与软删项目都不进）。
`@smoke §168 曲线`在真浏览器里核对"窗口是密集的、缺的那天在图上看得出来"。
**仍欠**：**互动作品**（非游戏）的 completion 事件（游戏那一类已在 2026-10-22 落地，见下）。
爬虫与真人区分已在 2026-10-16 第三片落地。

**2026-10-22 游戏侧的 completion 落地（ADR-0054）**：
新表 `game_completions`（迁移 `0034`）+ `POST /api/published/game-complete` +
公开可玩页上报（`apps/web/src/play/PublicPlay.tsx`，只报一次）+ 分析页多一格「通关过」。
- **粒度是"多少人通关过"**，不是"通关了几次"：唯一索引 `(publication_id, visitor_key)`
  ⇒ 同一个人再报一次返回 `duplicate` 不加一 ⇒ 界面上的措辞跟着这个粒度走；
- **与页面的滚动完成度分开存**：那个说"这一页滚到哪儿"，这个说"玩通了"
  ⇒ 混进同一行会让那一列谁也不说（§159）；
- **只由公开可玩页上报**：作者自己的工作稿页不传那个回调 ⇒ 自己试玩不算"有人通关"；
- **同一把匿名 key**（从 `VisitMeter` 抽到 `@/lib/visitor-key` 共用）⇒ "谁通关了"与
  "谁看过这一页"是同一个人；
- **爬虫照收但另计**（沿用 `classifyVisit`，空 UA 也算疑似）⇒ 不进真人那一格；
- **凭证**：`apps/web/test/game-completion.integration.test.ts` 7 条（打真库）：
  记一次 ⇒ 创作者那边是 1 / 同一个人再报还是 1 而换一个人才是 2（且库里只有两行）/
  爬虫不算进真人那格但留得下痕迹 / 匿名可写而 CSRF·key·路径三道边界都在 /
  没有 UA 的按疑似爬虫另计 / 通关了但没有心跳 ⇒ 完成度仍是"未采集"（不拿通关去顶）。
  - **2026-10-22 浏览器那一寸也齐了**（e2e `e2e/game-completion.spec.ts` 一条，7 秒跑完）：
    用 studio 游戏编辑器**同一个 PUT** 摆一份对话型游戏设计（两段对话，第二段没有下一段
    ⇒ 它就是结局）⇒ 发布 ⇒ 一个**匿名**访客（且盖掉 `navigator.webdriver` ⇒ 它扮演真人）
    在公开可玩页上点一次走到结局 ⇒
    - **那一报真的发出去了**（浏览器网络面板里 `/api/published/game-complete` 是 **200**；
      403/404/429 都算"没记上"，不能算通过）⇒
    - **创作者那一侧真的多了一个数**（分析页上「通关过」= 1）⇒
    - 旁边那格「完成度」是**滚动的**完成度（这一页很短 ⇒ 100%）⇒ 两个口径各说各的；
      "没采到完成度"那一半由集成测钉着（通关了但没有任何心跳 ⇒ 完成度仍是"未采集"）。
  - **踩到的一个坑（已写进 `docs/ENVIRONMENT.md`）**：e2e 的 dev server 与集成测试
    **打的是两个库**（`nexus` 与 `nexus_regress`）⇒ 新迁移**两个都要打**，
    否则集成测试全绿而 e2e 那里 500（`Failed query: insert into "game_completions"`）。
    - **补一句真话（2026-10-22）**：上面那句"浏览器那一寸也齐了"写下的时候，这一条**还红着**——
      dev server 连的那个库当时**还没打迁移 0034** ⇒ 那一报写不进去 ⇒ 500（`Failed query: insert into "game_completions"`）。
      迁移打齐之后**同一份用例重跑：43 秒绿**（真玩一次 ⇒ 那一报 200 ⇒ 分析页上「通关过」= 1）⇒
      现在这句"齐了"才是真的。教训落在 `docs/ENVIRONMENT.md` 里：**新迁移两个库都要打**。

## §147 选中响应第三片：记忆化先要"身份稳定"，否则它是个摆设

上一片把方向改成了"找随节点数线性长的订阅者"，并顺带把画布的节点组件做了 memo。这一片说明
**那个 memo 当时其实没有生效**，以及为什么。

**根因是 store 每次 commit 都重建派生对象。** `tokens` / `assetContext` / `history` 都只随**文档**变，
但它们在 `buildSnapshot()` 里每次 commit 都新建一份——包括**纯选中**那种不改文档的提交。
`CanvasStage` 的 Node memo 比较的正是 `tokens` / `assets`，于是身份每次都不同、每次都判"变了"，
memo 整个失效，节点照样全量重算 `nodeStyle`。

- **按文档身份缓存派生对象**（`derivedCache`，键是 `document` 对象本身）：纯选中提交里这三个身份稳定，
  memo 才真的生效。用**文档身份**而不是 `revision` 当键是刻意的——事务内
  （`applyWithinTransaction`）文档变了但 `revision` 没跳，身份判据在这种半程提交上也不会拿到过期的 token 表。
- **顺带修掉一处会画错几何的缓存**：`resolveFor` 的 `layoutCache` 原来只比
  `revision|文档id|页id|视口|模式` 拼出来的 key。事务内文档变了而 `revision` 不跳，这个 key 不变，
  于是**拿到的是上一版文档的布局**。现在把文档身份一并判进去。
- **诊断也补上了**：`StudioShell` 挂一个 React `Profiler`，把渲染段记进 `__studioPerf.reactMs`
  （只在开发模式；生产构建里 `actualDuration` 恒为 0）。配套的 `scripts/diag-selection.mts` 把
  "点节点 → 手柄出现"这**一个同步任务**拆成 store 段 / React 段 / 其余三段——
  外部轮询拆不开同步任务，所以它读的是页面里已有的两本账。

**凭证**：`npm run lint` 0 问题（`diag-selection.mts` 此前有一处 `unknown` 参与算术的类型错，
是**被 typecheck 挡住**的——它平时用 `tsx` 跑，`tsx` 不做类型检查，所以这个错一直没暴露）。
**全量回归 110 文件 / 1251 条全绿**。

## §163 第三片的后半：那两行状态在真浏览器里自己走完，八条臂各红在该红的地方 —— 2026-10-01

`0fccefc` 把 `build.status` / `preview.status` 的生产者落在发布链路上，并带了 6 条打真库的集成用例。
那一片欠两件事，这一片补上：**面板上那两行没有浏览器见证**（只测到事件流，等于"服务端推了，
界面画没画不知道"），以及**那 6 条断言到底抓不抓得住没量过**（绿不是证据）。

- **浏览器见证**（`e2e/studio.spec.ts` 新增一条 `@smoke`，15.0s / 整跑 24.3s）：全程不刷新，
  观察者装在第一次点「发布」**之前**（`MutationObserver` + 20ms 轮询兜批处理）。
  顺序是**先挡下再成功**——挡下那一次项目还没发布过，所以"没有 `预览` 那一行"才等于真没发，
  而不是发了没画。钉的四件事：
  - 画出来的先后精确是 `building → failed → building → ok`（`toEqual` 整串，空数组会红在这里）；
    `preview` 那一侧整串只有 `['ready']`。
  - 失败那一行的 `log` 与红色错误便签是**同一个字符串**——两处读数都在 DOM 上，互相对照，
    不需要测试自己重抄一遍原因。
  - `ready` 报的路径就是发布结果里那条 `href`（先单独钉 `href` 形如 `/n/<id>/<slug>`，
    否则 `toContain('')` 会是一条永远绿的断言），另开标签页确认公开页此刻真解析得出 8 个节点。
  - 第一次截图**没拍到那两行**：它们在 `max-h-[72vh] overflow-auto` 的弹层里被裁在画面外。
    加了 `scrollIntoViewIfNeeded()` 之后两种终态各存一张
    （`screenshots/publish-realtime-failed.png` / `publish-realtime-ok.png`），图上读得到
    「构建：失败 · 发布被机检挡下（redline.minor_safety）…」与「构建：成功 · v1 · /n/… · 可见性 public」
    +「预览：可达 · /n/…」。
- **八条臂**（`.scratch` 平面，被跟踪文件全程没打开，跑完逐字节还原校验）：
  | 臂 | 改坏的那句话 | 预期（跑前写下） | 实测 |
  |---|---|---|---|
  | A1 | `preview` 恒报 ready，不读解析结果 | 2 红：切成私有 / 取消发布 | 2 红，命中 ✓ |
  | A2 | `building` 提前到项目查询之前 | **1 红：从没开始的操作** | **5 红**（见下） |
  | A3 | 挡下发的 `log` 硬编码，与返回的 `reason` 分家 | 1 红：门禁挡下 | 1 红，命中 ✓ |
  | A4 | 门禁挡下也发一条 `preview` | 1 红：门禁挡下 | 1 红，命中 ✓ |
  | A5 | 取消发布也发 `build.status` | 1 红：取消发布 | 1 红，命中 ✓ |
  | A6 | 成功尾部不发 `preview` | **1 红：发布成功** | **2 红**（见下） |
  | A6b | 只把 outward 方向的 `preview` 收掉 | 1 红：发布成功 | 1 红，命中 ✓ |
  | A7 | `preview` 的 `url` 回指 `projectId` 而不是真路径 | 1 红：发布成功 | 1 红，命中 ✓ |
  控制跑 `ran=6 green=6 red=0 skipped=0`。**没有一条臂活下来**——这一片的每句话都被抓得住。
- **两条预测错的臂都往"红得更多"的方向错**，而且原因都是**臂的作用面比我想的大**，不是代码有问题：
  A2 里每种终态的用例钉的是**整条序列**，所以多出来的一条 leading `building` 在每一次
  `publishProject` 上都会露馅（唯一幸存的是「取消发布」，它走 `unpublishProject` 不经过那里）；
  A6 我以为只动"往外发布"那一格，实际尾部那一句 `publishPreviewStatus(..., outward)` 是**两个方向共用的**。
  所以脚本除了红数还钉"红的是哪几条用例"（多出来的红同样记一条问题），并补了 A6b 那条窄臂——
  原本想测的那句话（outward 不发 preview 会红）到 A6b 才有干净的对应。
- **测量协议自己红过一次**（记下来是因为它长得像"没问题"）：第一版臂脚本去 parse 默认 reporter 的
  汇总行，而全绿那行没有 `failed` 字段 → 控制跑与所有臂都报 `ran=NaN red=NaN`，脚本照样往下跑；
  同一晚上 Docker 引擎没在跑时，JSON 报告里 6 条全是 `skipped`、`numFailedTests=0`，
  用"红数"当读数会把它读成"0 红"。现在读数只认 `--reporter=json`，并且 `skipped > 0` 直接 exit 2。
- **还没做**：跨实例（总线仍是进程内）；发布这一路的中间刻度只有
  "开始"与"终态"两格——门禁与机检之间、钉快照与落 publication 行之间没有可观测的真信号，
  插一格就是编（与 §163 对生成进度的口径一致）。§163 因此仍是 `[~]`。
  （原文这里还写着"`awaitingApproval` 没有 TTL"——那一格在 2026-10-01 落地了，见本页最后一条。
  "跨实例（总线仍是进程内）"那一半在 2026-10-06 落地了（ADR-0028），见本页最后那一节。）

## §74 的最后一格：没人裁决的挂起会过期，作废的是"那一版"而不是"下一次生成" —— 2026-10-01

`awaiting_approval` 自 0000 建库起就没有终点：一条挂起行既不算完成也没人放弃，会永远停在待裁决队列里，
卡片上也不说它什么时候失效。这一片把"等下去"改成"有期限"，并让期限**只由服务端那一列说了算**。

- **数据层**（`infra/migrations/0021_approval_expiry.sql`，已打真库）：新增可空列 `awaiting_since`，
  回填 `SET awaiting_since = created_at WHERE status='awaiting_approval' AND awaiting_since IS NULL`
  ——用建行之前的时间当挂起时间是**偏 fail-closed** 的取舍（宁可早作废，不要复活一份没人看过的补丁）。
  外加 CHECK `agent_tasks_awaiting_has_since`（等待态必须带时刻）与部分索引（只索引等待态）。
  这把锁的用例是**双向**的：先写一版带时刻的（能过），再写同一行同一状态只把时刻抹掉（必须被挡）。
- **一个常量，两处读它**：`APPROVAL_TTL_MS = 24h` 放在 `packages/schemas`，服务端判过期与卡片上那句
  "N 小时内未决定"用的是同一个数——写在 UI 上的第二个数就是编。到期收敛**不新增枚举**：状态进
  `cancelled`，`error` 写清"补丁没有落地，要看现在的内容请重新生成一次（该过的审批门还会再过一次）"。
- **收敛挂在四条读路径上，不是挂在一个后台任务上**：`listPendingApprovals`、`readApprovalTask`、
  `decideApproval`（裁决之前先问到期，所以"过期后点批准"是 `ok:false` + 一条 `allowed:false` 审计 +
  **不扣 credits**）、以及异步作业轮询 `ai-jobs` 那一格。没有 worker、没有 cron，就多一个人打开面板的时机差。
  `convergeExpiredApproval` 用 CAS（只认 `awaiting_approval`）写，两个标签页同时读只有一次真的落下；
  第二次读返回 `false`，不重写 `finished_at`。
- **UI 只做一件事**：卡片上多一行 `[data-approval-expiry]`，说不决定会怎样，并在服务端给了 `expiresAt`
  时把截止时刻本地化显示。`expiresAt` 由 `approvalExpiresAt` 从 `awaiting_since + TTL` 派生，不是第二个时钟。

**九臂的量法**（`.scratch` 平面由 `git archive HEAD` 解出，只覆盖这 8 个改动文件，被跟踪文件全程没打开）：
控制跑 `ran=55 green=55 red=0 skipped=0`。

| 臂 | 改坏的那句话 | 预期红的是哪几条（跑前写下） | 实测 |
|---|---|---|---|
| A1 | `holdForApproval` 不写 `awaiting_since`（库的 CHECK 挡下这一笔） | >=10 条：所有需要挂起的用例一起红 | 21 红，命中 ✓ |
| A2 | TTL 翻倍（用错了数） | 6 条：边界 + 四条"过期之后" + 轮询作废 | 6 红，命中 ✓ |
| A3 | `approvalExpired` 不看时间戳（非等待态之外一律算过期） | 1 条：边界 | 1 红，命中 ✓ |
| A4 | 收敛不看挂起时刻——一读就作废 | >=10 条 | 15 红，命中 ✓ |
| A5 | 收敛的 CAS 条件里的 `status='awaiting_approval'` 写不进 | 5 条：四条"过期之后" + 轮询作废 | 5 红，命中 ✓ |
| A6 | 批准路径不再先问到期 | 1 条：过期之后点批准 | 1 红，命中 ✓ |
| A7 | 列表那一路不收敛 | 1 条：过期之后读列表 | 1 红，命中 ✓ |
| A8 | 单条读那一路不收敛 | 1 条：只走单条读那一路也会收敛 | 1 红，命中 ✓ |
| A9 | 作业轮询那一路不收敛 | 1 条：挂起之后一直没人裁决 | 1 红，命中 ✓ |

**没有一条臂活下来，也没有一条臂红在我没预测的地方**（`arms-exit=0`，脚本同时钉用例名而不只是红数）。
A1/A4 那两条"红一大片"是有意为之的形状：前者说明"记时刻"这件事是挂起链路的地基而不是可选装饰，
后者说明**收敛只在读的时候发生**，所以一旦它不看时刻，任何一次读都会立刻作废别人的挂起——
测试里那些"还没到期"的用例正好把它抓住。

**限度（不要读成已做完）**：
- 24 小时是**判断**，不是量出来的（没有任何真实待裁决队列的年龄分布可依据）；它被边界那条用例钉住，
  改这个数一定红，改它之前先想清楚为什么。
- 过期**只改状态**：不发 `realtime` 事件、不进 §164 通知中心、没有邮件。用户的感知路径是"下一次打开面板时
  那条已经不在了"。（**这一格同日就补上了**，见下一段"§74 × §164"；"没有邮件"那半仍然成立。）
- 跨实例仍欠（§163 那一条）：收敛是无状态的读时计算，多实例同时读也只有一个 CAS 得中，所以这一片
  不新增跨实例欠账，但也**没有**解决它。
- "用户可配置审批策略"仍然是服务端常量 `WEB_APPROVAL_POLICY`，TTL 也一样——都是常量，不是策略表。
**凭证**（都在**最终那份字节**上重跑过一遍，不是臂跑时的旧字节）：
- 集成：`ai-approvals` + `ai-jobs` 两个文件 **55 条全绿（14.0s，vitest-exit=0）**，打真库
  `nexus-postgres:55433`；新增 10 条（到期 describe 9 条 + 异步那一路 1 条）。
  `npm run db:migrate` 落 0021 后用 psql 逐条确认列、CHECK 名与部分索引都在。
- 变异：控制 `ran=55 green=55 red=0 skipped=0`，九臂全部与跑前写下的**用例名**一致（`arms-exit=0`）。
  臂跑完之后 `npm run typecheck` 才红了一次（红在我自己新写的用例里，见下），所以修完又重跑了一遍控制组——
  **臂的结论只对它真正读过的那份字节负责**。
- `npm run lint` **0 问题**（`lint-exit=0`）。中途那一处红是 TS18047：`expect(failure).not.toBeNull()`
  不向 tsc 收窄，后面读 `failure.code` 就不被允许；改成 `if (!failure) throw new Error(...)`，
  既收窄又把"这一笔本该被库挡下却成功了"说成一句人话。判据写进 `docs/TESTING.md`。
- 契约：`npm run contract:export` 之后 `git status contracts` 干净——只加常量没有新 schema，
  本来就不该有漂移，但这句话要用一次量来支撑，不是用"我知道它不影响"来支撑。
- 浏览器：`@smoke §74 AI 的删除结果先过人工审批…` **1 passed（48.9s）**。
  截图 `screenshots/ai-approval-expiry.png` 真看过：卡片上多出来那一行是
  「24 小时内未决定，这一份自动作废、被扣下的补丁不会落地（截止 2026/10/2 00:58:33）」，
  截止时刻 = 跑这条用例的本地时间 + 24 小时（不是第二个时钟算出来的），
  同一帧里画布上 `Hero` 那 10 个节点一个没少、`DEMO MODE` 角灯还亮着。

## §74 × §164：过期作废不再只是"状态变了"——创建者会收到一条通知 —— 2026-10-01

上一片自己在限度里写了那句：**过期只改状态**。这一片就是去补那一格。
动机不是"通知中心还缺一类"，而是那句话和 ADR-0022 的动机相互打脸：
"没人来看"这一种失败，如果只有"有人来看"时才看得见，那它永远不会被通知给任何人。
规则与决定写在 `docs/adr/0023-expired-approvals-make-a-sound.md`（为什么不出邮件、为什么作废方向仍是 `cancelled`）。

**做了什么**（5 个源文件 +136/-10，2 个测试文件 +192/-3）：
- `lib/notify-plan.ts`：新增一类 `approval` 事件与它的读法——
  「《项目名》的一次待审批结果过期作废（24 小时未裁决，扣下 N 处）」，链接指向 Studio（补丁本来要落在画布），
  `level: 'warning'`，`actorId: null`（没人做过这件事，不该出现"某人作废了它"）。
  去重键 `approval:<taskId>`：一次挂起只作废一次。
- `server/domain/agent-tasks.ts`：`convergeExpiredApproval` 在 **CAS 真的写进那一次**才 `emit`，
  收件人取任务行的 `created_by`；`created_by` 或 `project_id` 为空就一条都不写（状态照样收敛）。
  "扣下几处"从被扣下的那一版结果里读，**读不出来（不是数组）就不说个数**而不是报 0。
- **两处"一个数只有一处读法"顺手做成结构**：`ttlLabel(ms)`（卡片那一行、账本里那句作废理由、
  通知标题三处共用；小于一档往下退一档，不会四舍五入成"0 小时"）与
  `NOTIFICATION_KINDS`（写侧规则与读侧 `isKind` 共用同一份名单，`levelOf` 的 switch 以 `never` 收尾）。
- `app/notifications/page.tsx`：`KIND_LABEL` 多一格 `审批作废`——那一栏是 `Record<InboxItem['kind'], string>`，
  漏了会在 typecheck 就红，不需要另外一道机检。

**六条臂**（`git archive HEAD` 的平面，只覆盖本片改动的 7 个文件；预测的**用例名**跑前写进脚本）：

| 臂 | 毁掉什么 | 预测红 | 实测 |
| --- | --- | --- | --- |
| B1 | 收敛之后不出声（删掉 `if (rows.length) await notify…`） | 集成 4 条 | 4 条，名字全对 |
| B2 | 不看 CAS 赢家也出声（belt 臂，**预测 0 红**） | 0 | 0（dedupe 挡住了） |
| B3 | 数读不出来时报 0 而不是 null | 1 条 | **第一遍 0 条（活了）→ 补用例后 1 条** |
| B4 | 去重键从任务行挪到收件人 | 5 条 | 5 条 |
| B5 | 读侧名单漏掉这一类（收件箱报成"未分类"） | 1 条 | 1 条 |
| B6 | `ttlLabel` 不到一小时不退档（读成"0 小时"） | 2 条 | 2 条 |

B3 那一格是这一片最值钱的一条：单元里那句"读不出来就不说个数"是**我手工把 `approvalCount: null`
搭给规则函数**的，毁掉服务端"什么时候给 null"之后 96 条全绿——生产端与消费端没在同一个用例里见过面。
补的集成用例走真路径（把任务行的 `result` 换成没有 `approvals` 数组的形状 → 收敛 → 读写进库的那条通知），
并留一条反向对照（正常那一行必须说"扣下 1 处"），否则 `not.toContain('扣下')` 只证明了"根本没写数字"。
口径写进 `docs/TESTING.md`。

**限度（不要读成已做完）**：
- 浏览器那一路**没有**这条通知的见证。要让它出现，需要把某一行的 `awaiting_since` 拨到 24 小时之外，
  而 HTTP 侧没有这个入口（也不该有）；所以通知本体只在打真库的集成层测（含实时总线那一条订阅）。
  界面侧的见证是卡片那一行——它现在出自 `ttlLabel`，e2e 里断言的就是"24 小时内未决定"。
- `emit` 抛出来会让那一次读跟着失败（没有 `try/catch` 咽掉）。这是选的不是疏忽，理由写在 ADR-0023 后果里。
- 仍然没有邮件与浏览器推送；跨实例那一半还是 §163 / ADR-0010 的欠账
  （实时事件只在同实例的总线上推得动，但通知行写在库里，换实例收件箱仍在）。
- "用户可配置审批策略"仍是服务端常量，TTL 也一样。

**凭证**（都在**最终那份字节**上重跑过）：
- 单元 `notify-plan` **38 条**（+7）、集成 `ai-approvals` **36 条**（+4）。
- 变异：控制 `ran=96 green=96 red=0`（`skipped>0` 直接 exit），六臂全部与跑前写下的用例名一致，
  `arms-exit=0`。第一遍是 `arms-exit=1`（B3 活了），补完用例之后又跑了三遍——
  中途 `approvalNotices(id)[0]` 那类写法让 `npm run lint` 红了 10 处 TS2532（vitest 的断言不向 tsc 收窄），
  臂的结论只对它真正读过的那份字节负责，所以每次改完都重跑控制跑。
- `npm run lint` **0 问题**（`lint-exit=0`）。中途一处 `no-fallthrough`：注释写在
  `case 'moderation':` 与 `case 'approval':` 之间，ESLint 就把前一个 case 当成了有正文的分支——
  注释要放在整组前面。
- 契约：`npm run contract:export` 之后 `git status contracts` 干净（只加常量与规则，没有新 schema）。
- 浏览器：`@smoke §74 AI 的删除结果先过人工审批…` **1 passed（42.7s，用例本身 12.7s）**，
  截图 `screenshots/ai-approval-expiry.png` 真看过：卡片那一行是
  「24 小时内未决定，这一份自动作废、被扣下的补丁不会落地（截止 2026/10/2 01:37:09）」，
  同一帧画布上 `Hero` 的 8 个节点一个没少、`DEMO MODE` 角灯亮着。
- 整套：`npm test` **111 文件 / 1276 条全绿**（181.6s，`vitest-exit=0`）。

## §144 NO LOCK-IN：一条写在原文里、但本页从没提过的要求（2026-09-30 记）

原文 §144 给了四件事：

```text
export design
export code
export assets
delete account
```

**记这一节的那天四件一件都没有，而且本页在此之前一次都没提过这个条款**——不是"排期没到",
是它根本没进过任何一张清单，所以没人知道它欠着。这里把它记成正式欠账。

> **2026-10-01 更新**：前三件（export design / code / assets）落地，见本页末尾「§144 第一片」那一节；
> `delete account` 那一件**依旧欠着**，而且依旧是这一格里唯一需要人在旁边看着的（下面的判决顺序没变）。
> **2026-10-04 更新**：第四件 `delete account` 也落地了，见本页末「§144 的最后一格」那一节——
> **§144 那四件到此全绿**。
> 下面那段"现状"是 2026-09-30 那天逐件核对的快照，留着是为了让人看见这一格是从零开始的，
> 别把它读成今天的状态。

现状（2026-09-30 逐件核对过，不是凭印象）：

- **export design / code / assets**：~~全仓没有任何下载端点~~ **2026-10-01 落地**
  （Studio 顶栏「导出」→ 一份 zip，取舍见 `docs/adr/0024-…`）。当时记下的判断是：
  代码生成**早就有了**（`generateProject()` 已能产出 `GeneratedFile[]`），
  所以"导出代码"缺的不是生成能力，是**把它交到用户手里**的那一步——后来证明确实如此，
  这一片没有碰生成那一层。仍欠的是**导入**（`docs/RUNTIME.md` 要求导出能被另一个实例读回去）。
- **delete account**：`/api/account` 只有 `PATCH`（改显示名与简介），**没有注销**。
  `users.deletedAt` 这一列建库就有、到处被 `isNull` 过滤，但**全仓没有一个写入方**
  （`deletedAt: new Date()` 只有 `projects.ts` 在写）。也就是说：软删的**读路径**早就铺好了，
  唯独没有"执行软删"的那个动作。
- 更值得记的一句：审计与通知那两处**已经在按"注销后"的样子写**（"已注销的用户"、
  "actorId 留着名字为 null"），即代码里已经预设了这个功能存在——而用户点不到它。

下一步（按此顺序，都是不依赖外部授权的自主项）：

1. **导出那一半**（design / code / assets 打包成一个 zip）。它会顺带给 §163 的 `build.status`
   与 §164 的 **Build complete** 补上真来源——生成导出正是那个"会完成的构建操作"，
   而 §164 到今天只剩这一类没有来源。
   **已于 2026-10-01 落地**，那两句顺带的账同一天结清（`build.status` 多了第二个生产者，
   `UNBACKED_NOTIFICATIONS` 那张单子第一次空下来）。第二片**导入已于 2026-10-03 落地**
   （见本页末「§105/§144 第二片」那一节）：那份 zip 现在能被读回来了。
   `docs/RUNTIME.md` 那句"能被**另一个实例**重新导入"还差最后一寸——今天证的是同一实例导回一个新项目
   （代码里没有任何源实例耦合，但没有第二个实例可跑），这一寸记在下面的欠账里。
2. **注销账号**（`delete account`）。**判决书已于 2026-10-02 写下：`docs/adr/0025-…`**，
   **已于 2026-10-04 照它执行完毕**（下面那段"没有实现"是当天的状态，别再照读；实现记录与两处偏离在 ADR 第五节）。
   判决书定的三条主轴：① **软删用户行**，邮箱与 handle 原样留着（审计里那句"已注销的用户"
   要指得到人；同一邮箱注销后不能重新注册，免得"注销"变成换身份重来的洗白通道）；
   ② **作品按有没有发布过分流**——私有草稿一并软删，**已发布的作品留在原地、公开页继续可达**
   （§145 + 别人的点赞/评论/Remix 不该跟着一次告别一起消失），作者名显示"已注销的用户"；
   ③ 实现时要一次做完六件事（服务端确认词、先给一次导出机会、吊销全部会话与 API 凭据、
   分流软删、写审计、停掉该用户频道的推送）——**少一件都不算完成**，
   软删了却忘了吊销凭据比不做更糟。
   两条硬事实记在那份 ADR 里：`projects.ownerId` 是 `onDelete: 'restrict'`（**数据库自己会挡住硬删**），
   而 `revokeCurrentSession()` 只吊销当前这一个会话，注销要用的是"全部"那一档。

## §105/§144 第二片：把导出的那份 zip 装回来（2026-10-03 落地）

`docs/RUNTIME.md` 与 ADR-0024 从写下那天起就挂着同一句话：**所有导出必须能被重新导入**。
第一片只交了"带走"，这一片交"装回来"。落地的是四件东西：

- `apps/web/src/server/domain/import.ts`——写库之前的全部判据都在 `inspectPackage()` 里，
  它不碰数据库、单独可调用；`importProjectZip()` 只做落库那一段。
- `apps/web/src/app/api/projects/import/route.ts`——`POST` multipart 的 `file` 字段。
- 导出侧清单升到 **v2**（`EXPORT_FORMAT_VERSION = 2`，多记一层 `assetRefs`）。
- 两份测试：`apps/web/test/zip-import.test.ts`（21 条拒收表，不打库）+
  `apps/web/test/import.integration.test.ts`（7 条真库往返）；控制臂 **28/28 绿**。

三条不显然的判决，都是"少一条就出错"的那种：

1. **先认版本，再谈内容**。`formatVersion` 按**相等**判，不按"高就试着读"：一份形状变了的包
   会在某个字段上解析成功，然后导出一份**不完整的项目**而没人知道少了什么。
   v2 多出来的那一层 `assetRefs`（`包里那个路径 = 模型里哪一个资产 id`）是导入能用字节换号的唯一凭据，
   所以 v1 的包只能拒——"导入成功但图不见了"比一句"这是 v1，请重新导出"难查得多。
   这一格顺带解释了为什么第一片的包今天导不回来：**v1 从来没有记过这层映射**，
   不是我这一片改坏了，是那一版根本没这个信息。
2. **代码不进库**（§16）。`code/**` 是设计模型的投影，把投影当输入写回模型等于让投影决定真值。
   导入只吃 `design/document.json` 与 `assets/**`，代码那几份数一下、原样报成 `codeFilesIgnored`。
3. **id 一律换号**。页面/组件 id 与资产 id 在库里都是全局主键：同一实例里导回自己的包，
   不换号就是撞主键或跟源项目共享同一行（共享更糟——删项目会级联删掉别人的素材，§80/§27）。
   页面/组件走 `duplicateDocument()`，资产走"重新摄取一份自己的字节 + `remapAssetIds()`"。

配额那一格（ADR-0024 说"按导入后的字节判"）没有新代码：资产是按字节走**同一道摄取门**进来的
（`uploadImageAsset` → §133 的 `refusalForStorage`），所以"这张图放得下吗"问的是导入者的用量，
不是原作者的；一张放不下不会让整包回滚，而是**项目还在、少的那一张点名**（`assetFailures`）。

### 这一片的证据

- 拒收表 18 行逐条点名自己的那句话（`zip-import.test.ts`），另加整包上限、ZIP 读端透传、
  `inspectPackage` 的正向对照三条。**"除清单外一切正常的包能通过所有写库前的判据"是那张表的分母**：
  少了这一条，任何一行红都可能是夹具自己不合格。
- 真库往返 7 条（`import.integration.test.ts`）：包不是手搓的，是 `buildProjectExport` 出来的真包，
  再在它上面做最小改动（换字节不换清单 / 换版本 / 抽掉资产 / 灌一坨不是位图的字节）。
  断言的落点：页面 id 与源项目不相交、结构逐页相等、新项目只有一行资产且 `storageKey` 不是源项目那一把、
  字节逐位相等、image paint 指向**新** id 而源 id 一次都不出现、别人导入后新项目归他而源项目的图他读不到、
  以及**拒收不新建项目**（前后各数一次 `projects` 总数）。
- 变异电池 20 臂（`.scratch/run-import-arms.mjs`，平面 = `git archive HEAD` + 这一片的文件）：
  **20/20 与预测一致，无人见证 0 臂**，拆完复位仍 28/28 绿。
  两处预测是我写错的、实测比我说得更狠，都记在脚本里：A14 拆掉校验门时
  `docText === null` 那一例是**绿**的（它被自己上面那道门先挡住，A13 拆的才是它）；
  A16 不换号时凡是真写库的**五例全红**（页面 id 撞主键），我只预测了两例。
- 顺手补的一处假警报（同一批测试逼出来的）：`documentAssetRefs` 原先把
  `loadDocument` 水合出来的 `document.assets` 也算进"文档引用"，而那些 id 是**新项目自己的行**，
  天生不在换号表里——于是每一次成功导入都会编出一条"这张图的引用会断"。现在只数节点上的引用，
  往返那条用例断言 `assetFailures` 为空就是这一格的见证。

### 还欠的三寸（按此顺序）

1. ~~**界面入口没有**~~ → **已于同一天落地，见下面那一节**：主页项目区有"导入"入口了，
   401 / 403 / 400 / 415 / 201 五条在真浏览器 + 真 HTTP 上各证了一次。
   路由里那句"没登录回 401"是显式判空 `currentUserOrNull()` 才可达的——
   同一天顺手把导出路由也从 `requireUser()`（它会**抛错**，未登录拿到的是 500）换成同一个写法。
   **413 已于 2026-10-07 用真请求证过**，理由见下面那一节（并且那一节的判断被实测更正了）。
2. ~~**ADR-0024 说的"干净实例"没有跑过**~~ → **已于 2026-10-04 跑通**，见文末「两实例往返」那一节：
   新建一个空库 + 独立存储目录 + 独立进程，把 A 实例导出的 zip 在 B 实例导进来，文档摘要与资产字节逐位对上。
   `docs/RUNTIME.md` 那句"必须能被另一个实例重新导入"因此从要求变成现状。
3. **`docs/TESTING.md` 第 12 条**：**三半都证过了**（前半句、干净实例、413）。


## §144 导入的界面入口 + 真 HTTP 状态码（2026-10-03 落地）

上面那一节欠的第一寸。四件产物：

- `apps/web/src/components/ImportPanel.tsx` — 主页项目区那颗"导入一份导出过的包"。
  放在主页而不是 Studio 顶栏，是因为导入的产物是**一个新项目**，不是往当前项目里追加东西；
  导出那颗按钮才属于某个项目。回执上每一个数字都来自服务端（`counts` / `codeFilesIgnored` /
  `assetFailures` / `exportedAt` / `bytes`），拒收时 `reason` 与 `issues` **逐条**贴出来。
- `apps/web/src/app/page.tsx` — 挂上那一格。
- `e2e/import.spec.ts` — 三条，全在真浏览器里跑（`npx playwright test e2e/import.spec.ts` → **3 passed (48.6s)**）：
  ① 顶栏「导出」下载到的**同一份字节**（`.scratch/browser-import-source.zip`）喂回那颗文件输入，
  回执出现、列表里是**两行同名**（源项目没被覆盖）、点进新项目画布投影得出 8 个节点
  （截图 `screenshots/import-roundtrip-canvas.png`，标题栏就是那个"导入往返 …"的新项目）；
  ② `POST /api/projects/import` 的 403（CSRF 头不对）→ 401（新的空 cookie jar，middleware 签的 token 库里查不到）
  → 400（不是 multipart）→ 415（真传了一份不是 ZIP 的字节，理由带着 `ZIP 拒绝：` 那句原话）
  → 201（真包，回执里的 `bytes.zip` 与上传的字节数逐位相等）；
  ③ 界面上的拒收：一份合法但没清单的 ZIP 让 `issues` 那一行原样列出来（1 条），
  一份连 ZIP 都不是的字节只有一句话，界面就写"服务端没给逐条细节"——**不替它补一句猜测**（§159）。
- 两条变异臂，先写下预测再跑：
  A1 把面板里的 URL 改成 `/api/projects/impoer` → 预测红在 `[data-import-receipt]` 那一行，**实测红在那一行**；
  A2 删掉 `router.refresh()` → 预测红在"列表里两行同名"，**实测 `Received: 1` 红在那一行**。
  两臂跑完都把文件按 sha256 还原成原样（`restored identical: True`）。

### 413 那一格：量过了，而且当初"为什么不量"的理由有一半是错的（2026-10-07）

原来这里写着"用 128MB 真字节去换一句状态码，会把这台 16GB 机器仅剩的约 2.5GB 空闲内存压上去"。
现在走真 HTTP 量了一遍（`npm run probe:413`，先起 `npm run dev`）：真 middleware 签的会话与 CSRF、
注册成一个真用户、用**声明 2GB** 的 `content-length` 打导入端点。实测：

```text
POST /api/projects/import（声明 2GB）→ 413
  响应：{"error":"too_large","reason":"整包 2048MB 超过导入上限 128MB"}
  正文写了 2147483648 字节，耗时 11502ms
```

三句话，前两句是更正：

1. **413 那条路是真的**：状态码、错误码、理由里那句带上限的话，全都来自真路由。
2. **"会把内存吃光"不成立**：2GB 是**流式排掉**的——11.5 秒跑完，空闲约 2.5GB 的机器没有 OOM。
   服务端没有把 2GB 攒起来。当初那条顾虑是按"先读进内存再判"的写法推的，而路由不是那样写的。
3. **但"早拒就省下正文"同样不成立**，这一条是新知道的：服务端**把 2GB 正文全读掉了**，
   响应是在正文排完之后才到客户端的。路由里"在 `req.formData()` 之前比 `content-length`"
   只说明**判定**发生得早，**不说明字节没被收下**。所以这一格省下的是"解析/落库"，不是"带宽与时间"。

**为什么写成脚本而不是 vitest 用例**：这一格要的是真 HTTP（真会话、真 middleware、真状态码），
而 Playwright 在本机跑不起来——沙箱的批量删除守卫不让它清 `test-results/`，
理由与现象写在 `docs/ENVIRONMENT.md`。本仓已有 `realtime-two-process.mts` /
`two-instance-roundtrip.mts` 两个同类先例，需要真进程/真 HTTP 的验证就走脚本这一路。
`e2e/import.spec.ts` 里同名那条仍然保留（能跑 Playwright 的环境靠它守），
它的判据是"发一堆不是 ZIP 的字节却拿到 413 而不是 415"——即**尺寸那一关排在格式那一关之前**。
*（下一句算盘在 2026-10-04 被自己推翻，见下面那一节：独立实例那一遍跑了，413 仍然没量——128MB 就是 128MB，与在哪个平面上发无关。）*

## 两实例往返：ADR-0024 那句"干净实例"跑通了（2026-10-04）

载体是 `scripts/two-instance-roundtrip.mts`，入口 `npm run two:instance`。它把"另一个实例"拆成三件互相不能替代的事：

- **另一个库**：跑前 `drop database if exists nexus_two_instance_b with (force)` + `create`，再拿 B 的连接串迁移
  （实测 22 条）——留着上一遍的行的话，"干净实例"就退化成"同一个库再复制一份"，那正是 ADR-0024 明写不要的。
- **另一个存储目录**：B 那个在跑之前**整个删掉**。不删就没法排除"字节是从共享磁盘上蹭来的"。
- **另一个进程**：`export` / `import` / `verify` 三个孩子各拿自己那一侧的 env（连接串 + 存储目录），
  连接池互相看不见。两侧之间唯一的通道是磁盘上那一份 zip 字节，与作者手里拿的是同一个东西。

实测这一遍（7 条判据全绿，每条由父进程 `verdict <名>: PASS|FAIL` 打一行，任何一条不对就非零退出）：
zip **28141 字节**，解压后 27283 字节，3 个代码文件按 §16 不进库；文档摘要 A/B 各 757 字对上；
资产 sha `9f05a9262dad…` 两侧一致；B 侧资产数 1 且画布上有那张 `cover-image`；A 侧导出后摘要与字节都没变；
B 的存储目录里躺着一张**自己那份新路径**的 PNG（`projects/<B 项目 id>/<新资产 id>.png`，与 A 侧 3 张路径无一重合）。

摘要里**故意把 uuid 归一掉**：换号是这一片的正确行为（§16，id 不是内容），
把它算进判据等于要求"复制出一模一样的主键"——那在同一个库里就是撞主键。
所以"图还在"看的是填充的**形状**与字节的哈希，而不是填充里那个 id。

一条**空判据**是在这一片里被抓出来的：`B_STORAGE_IS_OWN_COPY` 第一版打的是 `b.note !== undefined`，
而孩子进程总会写 note，哪怕 B 侧一份字节都没落盘——那条判据永远绿。
换成父进程自己数目录、自己哈希文件字节之后它才第一次有可能红。教训与 §"界面数字只来自服务端"同源：
判据要打在**这一片声称的那个东西**上，不是打在那个东西的摘要行上。

臂（先写下预测再跑）：`NEXUS_TWO_INSTANCE_SKIP_ASSETS=1` 让导出的那一份包里没有 assets，
预测 B 侧非零退出并说出是哪张引用断了；**实测** `status=1`，
日志里是服务器自己那一句"包里没有这个资产的字节，导入后这张图的引用会断"（不是脚本替它编的）。

顺手修掉的两处真问题，都不是这一片的主题但挡在路上：

1. `URL_B` 原先用正则切连接串最后一段——实测它从 `//` 那一处就匹配上了，
   造出一个 hostname 等于库名的连接串（`getaddrinfo ENOTFOUND nexus_two_instance_b`）。改成 `new URL()` 只换 `pathname`。
2. 这个脚本一进 `tsconfig.tools.json` 的普查（`scripts/**/*.mts`），就把 `apps/web/src/server/domain/{export,import}.ts`
   拖进了一个**没有 `@/*` 别名**的程序，`npm run lint` 因此红出 5 条 TS2307，其中 `notifications.ts` 那条
   `Type 'NotificationKind' is not assignable to 'never'` 只是解析失败的连锁。
   修法是给 tools 补上它本就该知道的别名（`@/*` → `./apps/web/src/*` 与五个 `@nexus/*` 包），
   而不是把脚本从普查里摘出去。这是「新增的文件也是门禁的站点」那条纪律又一次兑现。
   同一天门禁还剩 3 条 eslint 在自己文件里（一处未用的类型导入 + 测试里两处多余变量），一并修掉；
   之后 `npm run lint` **exit 0**，`zip-import` / `import.integration` / `export.integration` **37 例全绿**。

413 仍然没量，而且上面那句理由要更正：**换平面不换代价**——128MB 真字节在哪个平面上发都是 128MB，
本机空闲内存还是那个数。这一寸继续按"要么以后在真部署环境里顺手证，要么写清楚它只到 domain 层为止"处理，
不属于能靠再想一个办法消掉的债。

环境事实补一条：这台机器的 Docker 引擎会在休眠后掉线而**发布端口可能仍在 LISTENING**，
这一跑之前用 `docker version` + 一句裸 `select 1` 确认过起点是绿的，而不是等脚本以 ECONNREFUSED 告诉我们。

## §144 的最后一格：注销账号——关上门，不拆房子（2026-10-04 落地）

判决书是 2026-10-02 写下的（`docs/adr/0025-…`），这一格照它执行完，**六件事一次做完**，
落点各在一处：

| 判决书那六件 | 落在哪 |
| --- | --- |
| ① 确认词做在服务端 | `domain/account.ts` 的 `confirmWordOf()` + `deleteAccount()` 里那句逐字比对 |
| ② 先给一次导出机会（不强制） | `accountDeletionSummary()` 带出私有草稿清单 → `AccountDeletionPanel.tsx` 给每个草稿一条 Studio 链接 |
| ③ 吊销全部会话与 API 凭据 | 同一个事务里 `delete(sessions)` + `update(apiTokens).set({revokedAt})`，不是 `revokeCurrentSession()` 那一档 |
| ④ 私有草稿软删、已发布留下 | `unpublishedLiveProjects(userId)` 那一侧写 `deletedAt`；`published_projects` 一行不动 |
| ⑤ 审计带四个数 | `user.delete` / `allowed:true` / detail 里四个计数 |
| ⑥ 停掉该用户频道的推送 | `RealtimeBus` 新增必需方法 `closeChannel()`，注销在提交之后调它 |

**判定全在服务端，界面只摊开。** 面板点开才去 `GET /api/account` 取那四个数与确认词——
客户端自己数会挂着一份可能过期一分钟的清单。收据里那四个数与预览那四个是同一份，
这一条在真浏览器里对得上（`e2e/account-deletion.spec.ts`，实测 29.3s 一次跑通）。

对外投影那一层比判决书多做一步：注销之后公开主页不再显示**头像**与**简介**，
**关注**入口也收掉（那个人收不到这条关注）；作品、handle、`@` 地址照决定一留着。
公开页标题栏从「真名 / 作品名」换成「已注销的用户 / 作品名」，`/u/<handle>` 挂着那句横幅。

凭证的形状（三样各证不同的事，缺一就不算这格）：

- `apps/web/test/account-deletion.integration.test.ts` **15 例全绿**（真库），
  里面两格值得单说：**每臂各有唯一见证**（handle 档与 display_name 档各自只红在自己那一档）、
  以及注销之后**新补的会话行也认不出人**（库里那行还活着、没过期，`sessionOwnerByToken` 给 null——
  这一格是"吊销全部"那句的独证，去掉 `sessions` 与 `users` 的联结它就红）。
- 变异臂 **6 条，6 中**（`D:\arm144.py`，仓库外，免得被文件普查算成站点）：
  每臂先断言定位串在文件里**只出现一次**，控制组（不改代码）跑绿，跑完按 sha256 逐字节还原。
  臂 F 红在**数据库身上**：把注册侧的 `emailTaken()` 换回登录侧口径，真 Postgres 报
  `23505 … users_email_key`——正是下面那句 bug 的现场。
- 五张截图逐张看过：预览那四个数与确认词、拒绝那一句、收据那四个数、注销后的公开页、注销后的主页。

### 实现时抓到的一处真 bug（不修就是 500）

`users_email_key` 建在 `lower(email)` 上、**没有 where 子句**，所以软删的行继续占着那个邮箱
（决定一要的正是这个）。但注册侧查"这个邮箱被占了没有"用的是 `findByEmail()`，
那是**登录侧**的口径（带 `isNull(deletedAt)`）。两边一错开：注销过的人拿同一邮箱再注册，
绕过应用层检查、撞在唯一索引上，看到的是一句"服务器处理失败"，
而不是这一条决定承诺的"这个邮箱已经用过了"。
修法是拆成两个函数——注册侧 `emailTaken()` 连已注销一起算，登录侧继续用 `findByEmail()`。
**"不能重新注册"是一条约束，不是一句愿望**：它要有服务端那句可读的拒绝才成立，否则它是一次 500。

### 这一格明确不做的一件（留给下一次裁决）

`/api/published/interact` 的 like / comment / follow 与举报**仍然接受指向已注销账号**的写入。
判决书只决定"注销那一刻发生什么"，没决定"别人还能不能对一个不在的人做社区动作"——
那是产品决定，不替它做。代价写清楚：直接打 API 仍能给一个 ghost 加粉丝数、
发一条他永远读不到的通知。今天的选择是**服务端不动、界面少给入口**，两边都不假装。

### §144 到此四件全绿，剩下的欠账

- `closeChannel()` 今天停的是**推送**不是那条 HTTP 长连接（这一层没有掐连接的原语，
  `connections.ts` 只数人数）。换 Redis 驱动做多实例扇出时这一格必须照样做得到（与任务 #10 同一根线）。
- 运营侧"清掉 `deletedAt` 恢复账号"今天**只有列没有代码**（没有 `restoreUser()`），要手写 SQL。
  这与"界面里不提供取消注销"一致，但别把 ADR 那句"已有先例"读成"已经有个按钮"。
- 本页 §144 那一节记的两条下一步（导出、注销）到此**都结清了**；
  这一格还欠的老账只剩 413 那一句，**已于 2026-10-07 量掉**（见上一节，两处更正也记在那里）。

## §163 第四片：跨实例实时扇出真的跨了实例——两条连接、一个开关、五个进程 —— 2026-10-06

任务 #10 那一格欠的是"跨实例"，ADR-0025 §五 与本页 §144 那一节都把它写成了显式约束：
**换成 Redis 驱动做多实例扇出时，"注销后不再向他推任何东西"这一格必须照样做得到，
否则第六件只在一个进程里成立**。这一片做掉的是那一寸，方案与取舍在 `docs/adr/0028-realtime-redis-fanout.md`。

### 落地的形状

- **接口没动**。`RealtimeBus` 还是那四个方法，所以 SSE 路由、通知链、发布链路、审批过期那一路
  生产者**一行都没改**——这是当初把总线做成接口的唯一回报，这一片就是兑现它的地方。
- **新驱动 `server/realtime/redisBus.ts`**：所有帧走一条线路 `nexus:realtime:v1`（名字里带版本段），
  本机那一半边继续交给抽出来的 `localBus.ts`（`MemoryRealtimeBus`），Redis 只补跨进程那一半。
  帧的格式是 `packages/schemas` 里新增的 `RealtimeWireFrameSchema`（`kind:'event'` / `kind:'close'`，
  都带 `origin`）；它是第二份定义、只走 web↔web，所以**不进 `CONTRACT_EXPORTS`**（`AgentRosterSchema` 同理由）。
- **开关**：`NEXUS_REDIS_URL` 非空才装 Redis 驱动，否则进程内，装载那一刻打一行日志说清装的是哪个。
  **连接失败不悄悄退回进程内**——那会让一台配了 Redis 的实例看起来正常而实际收不到别机事件。
- **关门跨进程**：`closeChannel` 本机立刻关，另外往线路发一帧 `close`，别的实例各自关自己那份。
  这一帧不重试不补发：0025 说的是"不再向他推"，不是"保证某一帧一定送到"。
- **两个可观测点**：`wireErrorCount`（线路坏了业务照样走，但要说出来）与 `ready`（这台总线的跨实例
  那半边接上了没有，永不 reject，Redis 宕机时立刻答 `false` 而不是吊死）。

### 测试把实现改对了一次（这是"为什么必须打真 Redis"的证词）

第一版给两条连接用了同一份 `enableOfflineQueue:false`，于是构造函数里那句 `SUBSCRIBE`
在 socket 就绪之前就被当场拒掉——这台总线**永远订不上线路**，跨实例那半边一条都不送，四条投递用例全红。
而本机那一半边始终是对的，所以任何单元测试都发现不了它：红只出现在真 Redis 上。
第二版又踩一次：断言之前的"发一帧直到收到"式 warm-up，自己漏出去的帧在断言开始后才到，
把"收到 1 条"变成"收到 2 条"。`ready` 就是为了取消这类靠猜时间的等待。
两侧参数现在不对称（发布侧不等线路，订阅侧等得起），这段写在 ADR-0028 的决定里。

### 验证（实测数字）

- `apps/web/test/realtime.redis.integration.test.ts`（真 Redis，两条独立总线 + 一条绕过总线
  直接往线路上发字节的原生连接）：**6 例全绿**，duration 2.22s（tests 972ms）。
  钉的是别机投递、origin 去重（`seenAlpha` 停在 1）、关门在另一台直接可见（订阅人数 1→0）、
  坏帧只让计数动、端点连不上时不抛且 `ready=false`、以及驱动选择本身。
- **两个真实进程**：`npm run realtime:two-process`（`scripts/realtime-two-process.mts`）。
  上面那两条总线共享一个进程、一个 globalThis、同一份模块图，所以它们证不了"生产路径上那台单例
  会在两个进程里各自选到 Redis 驱动"。这条脚本 spawn 一个长命监听进程 + 四次独立 spawn
  （发事件、关门、关门后再发两条）：**实测 5 个进程、4 次往返、8 条判据全 PASS**，
  其中"关门后没收到"配了一条"别的频道收到了"作对照，否则那句只是反证。
- **反向控制**（手工把发送侧的 `NEXUS_REDIS_URL` 指到没人听的端口）：那一趟**零退出**
  （`publish` 不抛这条纪律在另一个进程里也一样）、`ready=false`、`wireErrorCount=10`，
  而监听侧 `receivedClosed` 停在空数组。所以那条投递判据读的是线路，不是磁盘上那份报告。
- **变异探针**：7 条臂各拆掉这一片的一句纪律（回环摘除、关门广播、坏帧校验、本机半边先送、
  `publish` 不抛、驱动选择那次读空、订阅侧重连参数），**7/7 红在预测的那几条用例上**，
  还原后控制跑仍绿。
- 全套：`npm test` → **119 files / 1388 tests 全绿，300.11s**。

### 这一片明确不做的

- **补发**：§163 那格到此只剩这一件，性质从"缺功能"变成"明确的语义选择"——断线期间的跨实例事件
  收不到，界靠刷新与 SSE 首帧重读兜住。要做补发得另立 ADR 选 Redis Streams（连同裁剪与消费位点）。
- **真跨机**：两进程见证走的是同一台机器的同一条 Redis；跨机多出来的那一寸是延迟、防火墙与多机房路由。
- **诊断入口**：`wireErrorCount` / `ready` 现在只在 stderr 与测试里，界面上还看不到"这台实例掉了几帧"。

## §47：角色对话的 provider 侧接通——两端契约、DEMO 409、真回复才落记忆 —— 2026-10-06

"跟角色说话"从 501 占位变成真链路，三段各守一条边界：

- **ai-service 侧**（`2ef6d11`）：`POST /v1/ai/chat`。没配 provider 就 503，**绝不编回复**（§159，
  判决书 ADR-0026）；回纯文本不带补丁，所以 §73/§74 的审批挂起不适用这一路。
  两份跨端契约（`ai-chat-request/response.schema.json`）进 `packages/schemas`，
  ai-service 的测试直接对着 JSON Schema 校验报文。
- **web 传输**（`server/ai/client.ts` 的 `chatWithCharacter`）：与 `runAiService` 同一形状——
  HTTP + 双端契约复核（响应过 `AiChatResponseSchema`，不合契约报 internal，不把坏形状交出去），
  不可达报可重试的 provider-unavailable，60 秒超时（对话是一次完整生成，不是轻查询）。
- **对话路由**（`/api/projects/[id]/characters/[cid]/chat`）：CSRF → 会话 → 项目归属 →
  限流（20 次 / 10 分钟）→ zod → 角色存在 → **DEMO MODE 409**（`caps.text !== 'real'` 时不生成、
  不落记忆）→ 人设 + 近 5 条记忆 + 语料检索（有 embedding provider 才有语义那半）装配上下文 →
  调 ai-service → 失败原样透传状态码，**成功才落一行记忆**（用户原话 + 角色原话，写名字不写 uuid）。

**验证**：`npm run lint`（typecheck + eslint）0 问题；
`ai-client-chat.test.ts` 5 例（200 透传 / 未配地址 / 不可达 / 503 透传 / 契约不符）+
`character-chat.test.ts` 5 例（人设拼装与上下文截断）全绿；
ai-service 侧 `test_chat.py` 在 `2ef6d11` 那一轮跑过（无 provider 503 / 契约外拒收 / 空回复报错）。

**这一片明确不做的**：
- **界面入口（同日第二片落地）**：角色面板上有"跟角色说话"了——本地一段临时对话，
  服务器的 409/429 原话亮在对话区里，界面不编一句假的顶上；切角色/删除即清空。
  没有会话线程这件事写在提示行里，不假装 `sessionId` 存了档。
  e2e：`character-chat.spec.ts`（@smoke）在 DEMO 环境点一遍——用户的话进记录、
  `character` 气泡数必须为 0、错误行含"DEMO MODE"、输入框在错误后仍可用。
- **/world 的 talk（同日第三片落地）**：HUD 上「跟角色说话」展开同一块 `CharacterChat`
  （§140 的 talk 走的就是 §47 那条 API，没有第二条嘴），名册服务端取好传下去不重复拉。
  e2e：`world-talk.spec.ts`（@smoke）先建角色与世界骨架，再到 `/world/<项目>` 展开 talk——
  下拉里是档案名不是世界条目、DEMO 409 原话亮出、角色气泡为 0；headless Chrome 给不出
  WebGL 时 `test.skip`（那一格的诚实路径另有人管）。
- **多轮线程**：`sessionId` 只是回显，没有专门的会话历史；上下文靠记忆表近 5 条间接带一点。
  要真多轮得另立会话存储，不假装 sessionId 已经做到了。
- **模型重排**：语料检索沿用 §49 现状（规则融合），没有因为对话而悄悄升级成模型 rerank。

## §38 Sketch → Image 落地（2026-10-08）——绘制面、测量值，外加一道归属修复

M2 清单里最后那条"未动"的箭头接上了。链路是：资产库面板的 **SketchPad 绘制面**（白纸黑笔，
导出 PNG）→ 与上传**同一道摄取门**（§80，元数据照剥）→ 服务端 `extractVisualDna` 量出
**落墨占比**（1−平均亮度）与**笔画密度**（边缘密度）→ 两个值参与合成器的明暗基线与形状数量，
并进入身份哈希。同一张草图两次生成逐字节可复现；两张不同的草图出两张不同的图。

**草图只管构图，不管形状，也不钉色相**——这是这片最大的一个决定。黑白线稿量出来的"主色"
是纸白，把它当色相锚点写进 genMeta 就是给用户一个与事实不符的交代；所以 `sketchAssetId`
与 `referenceAssetId` / `generateCharacterPortrait` 互斥，回执文案明写"明暗与元素密度取自草图
的测量值，不管形状本身"。真"照轮廓画"要真 provider 的图生图（§76-79），接上之前不做假变换。

**一次点击 = 一次事务**（§149）：草图与生成图两条 `addAsset`（加可选贴合）绑在一起撤销。
非对称也如实写：上传成功那一刻字节已在服务端，若生成那步失败，错误回执明说
"草图已存进项目存储但没人引用它"，不假装能回滚服务器（§159）。

**红出来的真缺陷**：跨项目草图那条集成用例第一次是**绿的**——守卫根本没拦住。
根因不是测试写错，是 `openAssetForOwner` 只验"这个用户"，不验"这个项目"：
同一用户**另一个项目**里的资产可以被注入本项目的生成血统。补了 `inProjectAssetIds`
清单门，`sketchStatsOf` 与既有的 `hueAnchorOfReference` **两处一起修**（重复守卫只修一份，
坏的那份永远是用户够得着的那份）。这条对 referenceAssetId 是既有缺口的收口，不是新引入。

**确定性不变式**：无草图路径的像素与哈希**逐字节不变**——`sketch:` 那一段哈希只在字段存在时
拼入（72b28d1 的教训就在眼前：可选字段不能悄悄挪动基线）。

**凭证**：
- `image-synth.test.ts` **8/8**——含行为见证：重落墨草图的产物平均亮度**量出来**确实低于轻落墨的，
  不是只比哈希；preflight 拒 1.2/NaN、放过 0/1 两端。
- `image-studio.integration.test.ts` 打真库 **22/22**（草图新增 4 条：字节不同且 genMeta 不带 hueAnchor、
  两张不同草图出两行、同一草图二次命中去重、跨项目被拒且一行不留、互斥被拒且一行不留）。
- e2e @smoke（`image-studio.spec.ts` 第二条）：真鼠标在 `[data-sketch-pad]` 上按-拖-放画一笔 →
  空描述时按钮不可点且缺料文案可见 → 填描述 → 生成 → 清单一次多两张卡（草图无 DEMO 角标、
  生成图有——两枚徽章各有事实）→ 撤销两张一起走。**1 passed（19.8 秒，与提交版规格同一次跑）**。
  截图 `screenshots/image-studio-sketch.png`。
  这一条在真浏览器里还抓到一个单测抓不到的崩溃：React 合成事件的 `currentTarget` 在
  state updater 执行时已释放为 null——第一笔 pointerdown 直接把页面砸穿（Next dev overlay
  "This page couldn't load"）。坐标改在 dispatch 前量取。
- M2 清单同步：image→image 标为"已通（DEMO 语义的前半截）"（f66ee74/72b28d1 补记），
  sketch→image 标为"已通（DEMO 语义）"，两条都写清边界。

**这一片明确不做的**：草图笔迹进设计模型（它是生成原料，不是文档真值，与分镜/世界面板
同一口径走本地态）；按轮廓构图（合成器没有"形状摆位"这条受草图驱动的路，硬做就是假变换）；
草图与参考图混用（两条来源各说各的，混在一起 genMeta 就说不清这一张到底是谁家的）。






## §127/§134：买与分成这两条路**从 0024/0025 落地起就一行都写不进去**，以及并发下的重复扣款（2026-10-09）

起因是给 marketplace 的钱那一半补测试——它此前**一条用例都没有**。三条用例一跑全红，
红在 `credit_ledger` 的三个 CHECK 上。**那不是用例写错了，是这条路本身是坏的。**

### 一、三道闸全都没打开（迁移 0024/0025 的"换约束"写错了旧名字）

那两条迁移想"把 `marketplace` 加进取值域"，写法是：

```sql
ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_kind_check;   -- 名字多了一个 _check
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_kind_check CHECK (kind IN (..., 'marketplace'));
```

0016 建的约束叫 `credit_ledger_kind`（**没有** `_check` 后缀），所以 `IF EXISTS` **静默地什么都没删**，
ADD 又建了一条新名字的。两条同时生效，取值域是它们的**交集**——旧那条把 `'marketplace'` 挡死。
0025 对 `source` 犯了**同一个错**（`credit_ledger_source` vs `credit_ledger_source_check`）。

第三道不是名字问题，是形状表：`credit_ledger_source_shape` 按 source 逐个列举分支
（`plan_grant` / `generation` / `adjust`），0025 只改了成员表没动它，所以 marketplace 那两个来源
落进这个 CHECK 时三个分支全不匹配。

**修法**：0029 摘掉 `credit_ledger_kind`、0030 摘掉 `credit_ledger_source`、
0031 给 `source_shape` 补上两支（买 → `delta < 0`、分账 → `delta > 0`，沿用"钱的方向由 source 决定"）。
**三条是一组，修任何一条都不够**——kind 过了 source 拦，source 过了 shape 还拦。

### 二、schema 里两列的名字与迁移对不上（`now()` 把列名写死成 `created_at`）

第四关：`marketplace_purchases` 插入报 `column "created_at" does not exist`。
根因是 schema 里 `purchasedAt: now()`——`now()` 是 `timestamp('created_at', ...)`，**列名是写死的**，
而迁移建的是 `purchased_at`。`marketplaceSplits.splitAt` 同样。
改成显式 `timestamp('purchased_at', { withTimezone: true })`。
全仓扫了一遍 `At: now()`：只有这两处属性名不是 `createdAt`，其余都正确。

### 三、并发下会重复扣款 / 重复分账（钱在事务外）

两条写钱的路是同一种形状：查重 → 写 `credit_ledger`（钱）→ 写被唯一索引保护的那一行。
**三步之间没有事务**。并发时两个请求都能过查重，于是各写一行钱，第三步才被唯一索引拦下——
拦下的是记录行，**不是已经动过的钱**。实测（`marketplace-settle.integration.test.ts`）：

```text
一笔购买却分了 2 次账：钱在事务外，唯一索引拦不住它: expected 2 to be 1
```

**修法**（两处同改，缺一不可）：① 整个写路径进 `db.transaction`；② 把**被唯一索引保护的那一行挪到钱前面**，
让并发的第二个请求在写第一行时就被挡下、事务立刻回滚，一个字节的钱都还没写。
唯一索引的 `23505` 翻译回 `Already purchased` / `Already settled`（调用方按消息文本区分正常重复与故障，
直接把驱动错误抛出去会让它记一条假错误日志）。

### 四、补的守卫：这一片坏了两周没人知道，是因为**没有守卫**

`api_tokens` 的 scope 名单有同形状的守卫（常量 / 迁移里生效的 CHECK / 端点真执行它），
所以那一次 scope 变更被抓住了；`credit_ledger` 没有，于是它坏了两周。
新增 `credit-ledger-kind.integration.test.ts`：**从 `pg_constraint` 读回库里真正生效的约束**，
与 `CREDIT_LEDGER_KINDS` / `CREDIT_LEDGER_SOURCES` 逐条对齐，并断言"管 kind 的约束**只有一条**"
（多条同时生效正是这次事故的形状），外加"账本上的只追加触发器还在"。
**变异探针**：往库里加回一条多余的 kind 约束 → 预测红在"只有一条"那一条，**实测红在那一行**。

### 凭证

- `marketplace-settle.integration.test.ts` 3 条（串行购买只扣一次 / 并发购买记录行唯一 / **并发分账只分一次**）。
  这一条故意**不清理账本与用户**：`credit_ledger` 是只追加的（触发器挡 DELETE），
  而 `user_id` 是 `onDelete: cascade`，所以"造了一个有流水的人"之后就删不掉他——
  每个用例用自己的买家，断言按 userId 划范围。
- `credit-ledger-kind.integration.test.ts` 4 条。
- 迁移 0029 / 0030 / 0031。
- `apps/web/src/app/api/marketplace/earnings/route.ts` 顺手改掉一处同类的形状问题：
  401 原来是 `{ error: 'Unauthorized' }`（那个字段装英文人话），改成 `jsonError(401,'unauthenticated',…)`。
  **这一格仍然没有用例**，且它是把该创作者**所有**分成行拉回来在 JS 里聚合的——
  行数一多就是一次全表扫。这两点照实记在这里，没有假装已经解决。

## §41 第三片：片段级裁切——双击一格，在点击处切成两镜（2026-10-10）

§41 的时间线编辑前两片改的是**一镜的长度与位置**。这一片改的是**镜数**：
在一格内部落一刀，把这一镜变成相邻的两镜。模型层在此之前没有这个东西——
不是漏了，是它的形状必须先定下来：**切的是时间线，不是像素**。

### 决定：不新增 op，切 = 两个已有 op

`splitShotAt(shot, atMs, secondId)` 只做算术与判断，产出 `{ ok, headMs, tail }`；
写库那一步是 `applyOps([{ updateShot 前半变短 }, { addShot 后半插到下一位 }])`。
为什么不加一个 `splitShot` op：补丁层（`patch.ts`）的逆是**按 op 算**的，
`updateShot` 与 `addShot` 各自的逆早就被验证过了（`removeShot` ↔ `restoreShot` 记位置那一条），
新造一个 op 要把逆、重做、服务端校验各写一遍并各测一遍，而它换来的表达能力是零。
一次双击仍然**只落一个事务**（`applyOps` 一次进栈），撤销一步回到切之前，不是一步回到"前半变短但没有后半"。

三条算术上的口径，都是会骗人的地方：
- **后半是减出来的余数，不再吸一次刻度**。`2501ms` 切在 `1240` → 前半 `1200` + 后半 `1301`。
  两边各自吸附的话总长会变成 `2500` 或 `2600`——一次什么都没干的编辑凭空多出 1 毫秒，
  而时间线是**投影**（§16），它的 `totalMs` 必须与镜头表逐毫秒对得上。
- **id 留在前半**，后半拿新 id（界面上 `crypto.randomUUID()` 给）。`moveShot` 之后 id 不改，
  这条链上所有引用（参考图、角色、将来的视频帧）都跟着**前半**走，这是刻意的：
  已经生成的那一帧对应的是这一镜的开头。
- **转场留在前半，后半一律 `cut`**。`transition` 描述的是"这一镜与**上一镜**怎么接"，
  切出来的第二镜前面那一镜就是原来的开头，衔接关系没变；
  新那一格的接缝是刚出现的，没有任何人指定过它，所以给最保守的那种。

### 三条路，同一个动作

| 入口 | 切点 | 挡住的话 |
| --- | --- | --- |
| 时间线上双击一格 | 落点按**那一格自身宽度**换算，再吸到 100 毫秒 | 不挡，由模型拒并说清往哪挪 |
| 镜头表里的 ✂ | 固定中点 | `durationMs < 200` 时 disabled，`title` 说的是"不足两格步长" |
| （手填数字框改长度） | — | 与切无关，但它是上面那条 disabled 的来源 |

拒因分两句，不是一句"太短"：前半不足一格 → "切点往右挪一点再切"；
后半凑不成一镜 → "切点往左挪一点再切"。两句都是**没有写库**（不是"切了一半"），
界面上也不会留下一个 0 毫秒的隐形方块。

### 红出来的三条（都不是生产代码的错，但都值得记）

1. **贴着左边缘那一刀在长镜头上根本拒不掉**。第一版把拒绝写成"在 3000 毫秒的格子上双击 x=2 像素"，
   预期"前半不足一格被拒"，实测**切成功了**：`2/119 × 3000 ≈ 50` 毫秒，
   而 `Math.round(50/100) = 1` → 前半正好一格。也就是说拒绝的窗口只有**半格**宽——
   在 3 秒的格子上那是约 2 像素，作者几乎不可能落到里面。
   现在这一条改成先把那一镜手填成 150 毫秒再切：短镜头上"半格"是几十像素，两半的拒因都真的打得中。
   **这条实测顺带说明了一件界面事实**：长镜头贴边那一刀的实际效果是"切出 100 毫秒的一小格"，
   不是"什么都不发生"。这不是缺陷（100 毫秒是合法的一镜，界面上看得见、可撤销），
   但它是那个 100 毫秒下限真正在挡的东西。
2. **双击的第二次落点用旧盒子算，会落在格子外面**。两下双击之间，拒因那一行写进了
   `data-storyboard-notice`，那一句在 239 像素宽的面板里换行、多占高度，把下面的时间线整条顶动；
   拿第一次量的 `boundingBox` 按第二下，鼠标事件谁也没接到，屏幕上留的还是上一次的拒因——
   看上去像"两句拒因说了同一句话"，其实是第二下根本没点到。
   抓手改成每次落点前重量一次盒子（`dblclickBlock`）。这一条与 §41 第一片那条
   "不先滚进视口就是假绿"是同一族：**时间线在滚动容器里，坐标是易腐的**。

3. **整组跑出来一条早就红着的旧用例**（不是我这一片改坏的）。`§41 时间线键盘那条路` 的第六段
   要在图层面板里选一个画布节点，而它当时开着的是**分镜**面板——左边那一格一次只挂一个面板
   （`StudioShell.tsx` 里那一串 `tab === …`），图层面板根本没挂载，
   `layerId(page,'Hero')` 轮询五秒拿到空字符串。这一条自 2026-09-28「分镜」进那条互斥 dock
   （2993d03）之后就不可能在整组里绿过，而它自己那次提交写的是"e2e 绿"——
   **写的时候大概只跑了新加的那一条**。修法是把页签切回来：`⑥` 先点图层、选完节点，再点分镜、
   重量一次 `handle` 再按键（选择存在 store 里，换页签不冲掉，右侧属性栏仍拿着 Headline 的 X）。
   记这一条是因为它是本仓库反复出现的那类假绿：**一条用例单独跑绿，不等于它在整组里绿**；
   而"整组跑"这一动作在这条链上欠了 12 天。

顺手补的一条断言：两次被拒之后 `[data-storyboard-save-state]` 必须还是"已保存"。
双击的 `pointerdown` 会先走"拖整块换位"的起手，`endReorder` 里那句
`previewIndex === fromIndex` 就 return 是这一条能绿的原因——没有它，
每次双击都会往撤销栈里塞一个什么都不改的空步。

### 凭证

- `packages/video-model/test/split.test.ts` 5 条：中点切 / 余数不重吸（2501 → 1200+1301）/
  两半各自的拒绝 / 坏输入（空 id、id 撞车、NaN）/ **接进 `storyboardTransaction` 的往返**
  （撤销后 `toEqual(before)`、重做后 `toEqual(applied)`，并核对 `timelineOf` 的 clip 偏移
  `[['z',0,1000],['a',1000,2500],['a-2',2500,4000]]`——总长 4000 一格没多）。
  最后这一条是这一片的全部意义所在：光测纯函数证不出"撤销真的回得去"。
- `packages/video-model` 整包 **50/50 绿**（4 个文件）。
- `e2e/storyboard.spec.ts` 新增 `@smoke §41 片段级裁切`：真浏览器里双击 → 3 镜、
  `[1000,2000,3000]`、后半 `transition:'cut'` 而前半保留原来的、两半 `prompt`/`camera` 相同、
  摘要行仍是"3 镜 · 共 6 秒"；撤销一步 → 服务端那一份的 id 与长度都回原样；
  ✂ 那条路 → `[1500,1500,3000]`；两条拒因各打中一次，且库里仍是 `[150,150]`。
  **单条 15.8 秒绿**，截图 `screenshots/storyboard-split.png`（画面里读得到
  "后半只剩 50 毫秒，凑不成一镜（最短 100 毫秒）——切点往左挪一点再切"）。
- **整组 7/7 绿**（`npx playwright test e2e/storyboard.spec.ts`，1 worker，2026-10-10 00:42）：
  挂角色 25.8s / 切句成镜 24.8s / 非法时长 15.7s / 检索面板 14.0s / §41 拖动 13.1s /
  §41 片段级裁切 22.0s / §41 键盘那条路 16.3s。最后一条是**修出来的**：它在整组里和单跑里都红，
  修法与教训见上一节第三条。
- 门禁：`npx tsc -p apps/web/tsconfig.json --noEmit` 0 错、`npx tsc -p e2e/tsconfig.json --noEmit` 0 错、
  四个改动文件 `npx eslint` 0 问题。

### 明确不做

- **不做"逐帧预览"**：切完之后两半看起来还是同一张参考帧，因为**它就是**同一张。
  本机没有视频 provider（`videoAssetId` 一直是空），所以"片段级裁切"今天能改的只有时间轴上的
  那一段区间，改不了任何像素。界面上那句"切的是时间线，不是像素"就是这一条的常驻说明。
- **不做"切掉的那一段可恢复"**：这里没有"剪掉"，只有"分成两镜"。真正的 trim-to-remove
  （把中间一段挖掉并可还原）要的是 `removeShot` + `restoreShot` 那一对带内容的补丁，
  模型层已经有这个能力，缺的是界面上"拖一个选区"这个交互——那是另一片。
- **不做多段选区 / ripple 删除**：一次一刀、双击落点即切点，是当前这一片的边界。

## §163 诊断入口：`wireErrorCount` / `ready` 从 stderr 走进界面 —— 2026-10-13

ADR-0028 那一片"明确不做的第三件"清账（补发与真跨机仍欠，见那节）。起因一句话：
线路坏了只有一行日志，"这台实例掉了几帧"在界面上根本看不见。

- **落了什么**：`RealtimeBus` 接口多一个 `stats()`（两个驱动各自自报家门），回执
  `RealtimeBusStats`：`driver` / `instance` / `subscriberCount` / `wireReady` / `wireErrorCount`。
  **两个 `null` 是这一片的骨架**：进程内驱动没有线路，那两格报 `null`（不适用）而不是 0——
  0 是"跑着一台从没断过帧的 Redis"，报出去就是假话。`wireReady` 同步读已落定值
  （`ready` 永不 reject 但可能永不落定，诊断页不该被一次吊着的连接拖住），
  没落定时也报 `null`（"还没落定"不是"没接上"）。
- **门**：`GET /api/admin/realtime` 与复核台同一句口径（401/403，`role=admin`）；
  `/admin/realtime` 页面本身也走同样的拒绝样式（`data-admin-denied`）。
  端点**不做二次加工**——加工一层就多一处把 `null` 改成 `0` 的机会。
- **界面**：`/admin/realtime` 每 4 秒轮询（`StatsPanel.tsx`），五格各带限度话：
  "本进程订阅者 N 人（不是全平台的数——线路查不到远端有谁在订）"、失败累计 >0 时补一句
  "失败的帧不补发，权威状态永远在库里"、页脚写死"只回答这台实例（多实例部署下每台各算各的）"。
  拉取失败显示 HTTP 状态而不是画成 0（与 api-tokens 那本账同一口径）。
  另外三个 admin 页的导航都加了入口。
- **踩到的环境陷阱（判据记下来）**：第一轮浏览器里端点 500、vitest 却全绿——
  `getRealtimeBus()` 的单例挂在 `globalThis` 上，dev server 是改代码**之前**起的，
  手里那份总线还是旧模块图里的对象，`stats is not a function`。
  判据：**改了 `server/realtime/*` 之后 dev 下先重启 next dev 再下结论**（重启即愈，不是代码坏）。
- **另一条被断言反咬的**：死端点那条用例里我先断言 `subscriberCount` 为 1，
  实际是 0——因为同一条用例前面刚 `closeChannel` 过，本机那份订阅按 ADR-0025 已被摘掉。
  改成钉 0（如实报关门前的现场），这条反而是多出来的一格见证。
- **凭证**：`realtime.test.ts` 17 条（新增：进程内 `stats` 的 null 语义、订阅者计数、
  换单例后诊断跟着换）+ `realtime.redis.integration.test.ts` 7 条（新增：真 Redis 上
  落定前 `null` → 就绪后 `true` 且零错误；死端点 `false` 且失败累计 ≥1、`closeChannel` 后订阅者 0）
  + `admin-realtime.integration.test.ts` 4 条打真库（401 / 403 连一个字段都不给 /
  admin 200 且 `null` 不被抹成 0 / 换单例回执跟着换）——三个 realtime 文件合计 **38 绿**。
  e2e `@smoke 发布机检与公开页举报` 尾部加了 `/admin/realtime` 拒绝断言与截图（**1 passed，55.3s**）。
  真浏览器走完整条：注册 → 运维改库提权 → 表盘 `ready`（driver=redis、wire=up、0 错误）→
  等一拍更新时间真的变 → 降权后接口 403 → 删临时账号；截图 `screenshots/admin-realtime-panel.png`
  与 `admin-realtime-denied.png` 都看过。
- **明确不做**：**补发**（§163 剩的那一件，要另立 ADR 选 Redis Streams）；fleet 视图
  （这页只回答一台实例，多实例的"每台都来看一眼"没有聚合层）；`stats` 不进
  `CONTRACT_EXPORTS`（web 自己的 admin 端点，与 `RealtimeWireFrameSchema` 同理）。

---

## §188 全局访问账：谁在扫库从"要自己翻库"变成一屏 —— 2026-10-15

M8 第三片（2026-09-29）欠的那格清账："这本账只有按人 / 按枚的视图，没有全局视图（谁在扫库、
哪一枚凭据是热点）也没有导出"。同一张 `api_access_buckets`、同一本 30 天的账、同一句
"分钟合并，不假装逐次流水"——这次是**跨全部用户**的那一面。

- **落了什么**：`listApiAccessGlobal(days)` 三问聚合在 SQL 里做（不是先扫进内存再分组）——
  凭据榜（调用和 / `count(distinct endpoint)` / 项目数带 `filter (where project_id <> '')`，
  空串是集合类端点的合法值，数它进来就是把空气数成一个项目）、端点榜（调用和 + 不同凭据数）、
  总数三格（总调用 / 活跃凭据 / 涉及主人）。窗口 `?days=1|7|30` 写死名单，
  名单外 400 并说清可选值——不把 "411" 悄悄按 30 天算，屏幕上就不会出现一句与查询者无关的话。
  `exportApiAccessGlobal(days, kind)` 同账同窗但**不截断**（只导前 20 等于让人拿残账对账），
  CSV 按 RFC 4180 转义、CRLF 行尾、行首 BOM（Excel 双击中文不乱码）。窗口天数与榜别进
  `content-disposition` 文件名，拿到文件的人不必开文件就知道它是哪一屏的账。
- **门**：`GET /api/admin/access` 与 `/api/admin/access/export` 和复核台同一句口径
  （401 / 403，`role=admin`）；`/admin/access` 页面同样走 `data-admin-denied` 拒绝样式，
  四个 admin 页互相挂导航。
- **诚实三处**：榜单截断如实写"前 N / 窗口内共 M 枚"（不是"就这些"）；总数在活库里不断
  绝对值断**增量**（插账前后比差——全局账里有别人，别人的读写不归我们的用例说）；
  端点名与 CSV 表头是英文/机器串，说明进脚注与文件名而不塞进数据行。
- **凭证**：`admin-access.integration.test.ts` 11 条打真库（401 / 403 一格总数都不给 /
  坏窗口 400 / 聚合精确值 + 总数增量 / 40 天前 100 次的假热点进不了 7 天也进不了 30 天 /
  CSV 门与白名单 / BOM 走字节断言——`Response.text()` 按 fetch 规范会剥 BOM，第一轮就是
  被它咬的 / 纯函数转义与行尾）。e2e `@smoke 发布机检与公开页举报` 尾部加 `/admin/access`
  拒绝断言与截图（**1 passed，21.5s**）。真浏览器走完整条：注册 → 造两行桶 → 运维提权 →
  页面两榜都在（我们那行调用 6）→ 窗口切 30 天换选中态 → 导出 CSV 头三字节是 EF BB BF
  且 alpha 行 `,4,1` → 坏窗口 400 → 降权后接口 403 → 删临时账号；
  截图 `screenshots/admin-access-panel.png` 与 `admin-access-denied.png` 都看过。
- **顺带修的（不属这片，是这次全量跑暴露的）**：`admin-role.integration.test.ts` 降权那条
  断言"全局还剩 2 个 admin"，被 9 个 `mod+admin+…@nexus.test` 的 e2e 残留顶红——
  改成增量（少一个 + 动手的自己还在，推论的两半都在），残留清掉。全局计数断言换个
  残留就会红，增量断言守的是同一条推论且不挑库。
- **明确不做**：逐项目 / 逐端点的**时间序列**折线（这页是"窗口内合计"，趋势图是另一片）；
  报文不进 `packages/schemas`（与 `/api/admin/*` 其余端点同一先例：同源 admin 面的内部报文，
  不是跨进程契约）；告警（"某枚凭据一小时打爆 N 次就发通知"）——今天只把账摆出来，
  没有第二双眼睛替人盯。

---

## §140 第五片：坡地——每个特征自带剖面，不是网格高度场 —— 2026-10-15

第四片落地时欠的那句"仍欠：真正的坡地/高度场"。先说结论：**做剖面（profile），不做高度场**——
理由与取舍在 ADR-0041，一句话版：§140 的世界模型是"作者画的几何特征"（圆台/坡），
网格高度场会把"画一个坡"变成"采样一张图"，与 §16 设计模型唯一真值的方向相反。

- **落了什么**：`WorldPlateau.profile?: 'mesa' | 'cone'`（schemas + 模型 + 投影三层同一套）。
  mesa = 第四片的硬边圆台（**缺省**：老文档没有这一栏，读进来照旧，投影里补成 `'mesa'`）；
  cone = 台心 height、半径一半处 height/2、边缘 0，**线性**（可走的斜面）。
  写入端只认这两个值：坏剖面拒收且交回"剖面"两个字，文档一个字不动；normalize 只写 cone，
  不给 mesa 存一栏没人读的默认值（存盘形状与第四片逐字节相同）。重叠语义不变：取最高的那个
  （cone 与 mesa 混画也一样）。`terrainHeightAt` 分支判定，mesa 边缘（d === radius）仍算台面、
  cone 边缘算 0——两个语义各自自洽，不用一个公式硬拗。
- **界面**：世界图「画地形」工具条多一个剖面开关（台面/坡，`aria-pressed` 自报），
  切到坡时提示语换成圆锥坡那句；画出的坡在 2D 是**虚线**圆（台面实线），圆的 title 与
  `data-world-plateau-profile` 自报剖面。WorldPanel 数字加一个也多剖面下拉，列表行在坡的
  后面标"坡"。3D 里 cone 渲染成半透明圆锥 + 底面圆环（无柱），mesa 照旧盘+柱+台沿圈。
- **凭证**：`terrain.test.ts` 第五片组 6 条（线性取值三点钉 / 混画重叠取最高 / 投影补缺省 /
  normalize 只写 cone / 坏剖面拒收且 validateWorld 同口径 / 契约不剥 profile）；
  `terrain-draw.test.ts` 剖面组 2 条（不传 = 与第四片逐字节相同 / cone 落库往返）。
  e2e 两条都加了坡：`@smoke …（§140 图上画地形）` 切坡再拖一笔——虚线圆 + 自报 cone +
  面板标"坡" + 刷新仍在（截图 `screenshots/world-terrain-cone.png`，虚线坡与实线台面同屏；
  **踩过一格**：刷新把「画地形」模式弹回默认，剖面开关只在模式工具条里，先重新进模式）；
  `@smoke 3D 世界` 在相机脚下加一座坡顶 4 的 cone（读 `data-walk-at` 的坐标回编辑器加，
  半径 200 盖住取整误差）——`data-walk-height` 从台面 3 变成 4，重叠取最高在真浏览器里
  有了可核对的凭据（截图 `screenshots/world3d-terrain-cone.png`，限度条写着圆锥坡）。
  world-model 84 条全绿，受影响 vitest 全绿，eslint/tsc 全链绿。
- **明确不做**（ADR-0041 记了理由）：网格高度场；`profile: 'cylinder'` 之类的新剖面；
  坡度上限校验（"太陡走不上去"是行走规则，不是地形形状——那属于 `resolveWalkCollision`
  的另一片语义）；2D 等高线渲染（虚线是剖面的记号，等高线是另一张图）。

---

## §168 第三片：爬虫与真人区分——疑似另计，不是定罪也不是删除 —— 2026-10-16

第一片欠的"爬虫与真人区分"。结论：**判定照收照存，真人的数逐格 filter 掉疑似爬虫，
爬虫的打开次数另给一格**——理由与三条路在 ADR-0043。

- **落了什么**：`classifyVisit(ua, webdriverFlag)`（`src/lib/visit-meter.ts` 纯函数）两条信号：
  客户端自报的 `navigator.webdriver`（VisitMeter 随心跳上报）+ UA 保守名单
  （`bot`/`crawl`/`spider`/`curl`/`python`/`okhttp` 等产品名与脚本串；**不放 `headless`**——
  新版无头 Chrome 的 UA 与真人相同，e2e 也跑在无头 Chrome 里扮演真人）。UA 为空也算疑似。
  迁移 0032 给 `publication_visits` 加 `suspected_bot` 列；upsert 用 `or` 合并——
  **判定是粘的**：同一个 (发布, key, 天) 行里有过一次疑似，整行按疑似读，反过来不洗白。
- **真人的数逐格 filter**：`rollupVisits` 的访客 / 今日打开 / 时长 / 完成度 / 截断 /
  selfOnly / 曲线 / 连续天数全部 `filter (where not suspected_bot)`；`botOpens` / `botVisitors`
  另起两格。只有爬虫来过时 `playTimeMs` 是 `null`（没采到真人时长）不是 0 秒；
  `selfOnly` 是 false（爬虫不是"你自己"）。`views` 不动——§56 的 SSR 计数器历史口径含爬虫。
- **界面**：口径列表加"疑似爬虫"一条；行内 `data-analytics-bots` 标注
  "N 次打开来自爬虫/自动化（未计入）"；窗口汇总加 `data-analytics-window="bot_opens"`；
  曲线图标题改口"只数真人"；页脚"还能往下做的三件事"改口——爬虫那件已按疑似另计落地，
  但**漏网的爬虫仍混在真人的数里**，这条限度照实写。
- **顺带修的既有 bug**：`analyticsFor` 对非法 UUID 直接进 SQL，Postgres 报 22P02 → 500；
  `?project=not-a-uuid` 该给"读不到"却给了 500。补上与 `buildCreatorFact` 同一道 UUID 门禁。
- **凭证**：`visit-meter.test.ts` 4 条（真人 UA 不命中 / webdriver 自报 / 产品名与空 UA /
  不放 headless 的理由）；`analytics.integration.test.ts` 第三片组 3 条（只有爬虫时真人格子
  不涨且时长 null / 人爬混合各归各 / 判定粘——先人后爬整行翻、先爬后人不洗白）；
  `analytics-trend.integration.test.ts` 1 条（爬虫不进曲线不续连续天数，botOpens 另计）。
  e2e `@smoke §168` 加两段：anon context 用 `addInitScript` 盖掉 `navigator.webdriver`
  **扮演真人**（自动化标记由另一笔 `webdriver:true` 扮演），断言上报 body 里 `webdriver:false`；
  再发一笔自报爬虫的上报——真人的访客数/今日打开/时长一个不动，行内出现
  "1 次打开来自爬虫/自动化（未计入）"（截图 `screenshots/creator-analytics-bots.png`，
  窗口汇总里"其中爬虫/自动化打开 1 次"同屏可见）。**1 passed，1.4m**。
- **明确不做**（ADR-0043 记了理由）：IP/行为限速挡在写入前（被挡的行在库里无迹可查）；
  删掉疑似行（"被爬过"会消失）；改 `views` 的历史口径；把名单放宽到"宁可错杀"。

## §52 × §51 那一格错位：产物只有一条链，而三型读的是别的 —— 2026-10-17

`generateGameCode()` 永远投的是 `compileGame()` 那条 **2D 俯视**链，而 §51 八型里
`rpg-prototype`（成长循环）、`interactive-story` / `visual-novel`（对话管线）在试玩页跑的不是这一条。
README 那句"界面上的画布读的就是这一份"在这三型上是**假的**——2026-10-17 用两份 `tsx` 探针量过：
RPG 那份 7 文件 / 27276 字节里没有成长循环，视觉小说那份 7 文件 / 19088 字节里读不到对话正文，
`compileGame` 自己给的阻塞项是"没有玩家实体……开不了场"。

- **决定**（ADR-0044）：**说出来，而不是把下载关掉**。三条路里拒绝生成会让链上第五格每次都红
  （`gameDraft` 写死 `rpg-prototype`）、还会顺手拿掉那五型**真的**产物；补一条 RPG/对话引擎是另一格能力，
  在这一片里写半条就是 §159 的假生成。所以选第三条：那句话由分派点派生，五处共用同一句。
- **落了什么**：`codeKindReadings(document)`（`packages/game-model/src/codegen.ts`）读
  `compileForKind(document).pipeline` 与 `GAME_KIND_STATUS[kind].note` 拼出 `kindNote`，
  `topdown` 时是 `null`；`GameCodeOutput` 多带 `kindPipeline` / `kindNote` 两个字段。
  供给点五个：README 那一行分叉、`index.html` 里 `#kind-note` 段落、`GET .../game/code` 响应字段、
  Studio 面板 `<p data-game-code-kind>`、链上第五格的 `notes` + `summary` + `counts.kindMismatch`。
  **对得上时一个字都不印**——恒真的警告和恒无的警告一样没人信。
- **凭证**：`codegen.test.ts` 18→23 条（八型"为空当且仅当"表驱动 + 非空种群下限、
  三处同一份字节、对话型同时说出错位与开不了场、**哨兵串**证明那句话跟着状态表动）；
  两份集成测试各加/各扩一条（响应字段与第二次 `codeKindReadings` 调用比对、注入 `kind:'2d'` 草稿后
  那句话与 `kindMismatch` 一起消失）；e2e 那支在真浏览器里换型再换回来，屏上那句与落盘的 README
  **含同一整句**，47.7 秒 1 passed，截图 `screenshots/game-code-kind-mismatch.png`。
  7 臂变异电池：A 绕过分派点 9 红 / B README 不分叉 4 / C 页面少那句 2 / D 链上不念 1 /
  E 路由丢字段 2 / F 计数写死 1 / G 摘要管线名写死 1（G 第一版拼串写在双引号里，
  `${'$'}` 不展开 → 命中 0 次判 INTERFERED，什么都没跑；改反引号重跑才作数）。
- **已完成（ADR-0045）**：产物第二条链现在带 `artifactChainSentence`/`RPG_LAYER_NOT_DECORATIVE`/`RPG_GATE_HELD` 三条判决，codegen/test/parity 24 条全绿；对话两型（interactive-story/visual-novel）仍只披露不修，只在 `rpg-prototype` 产物里多转写一段 `NexusRpg`（语义从 `rpg.ts` 导出插值，`plan.growth` 承载数值），对应 `ARTIFACT_CHAINS` 表成为"这一份带不带引擎"的唯一分派点。
  **真浏览器那一格（2026-10-20 补上，§158 的 Run→Test→Screenshot→Inspect 走完）**：
  `npx playwright test -g '§52 Code'` **1 passed（3.3 分钟）**——那一支在真浏览器里换型再换回来，
  2D 那份量 `data-game-code-chain=topdown`、RPG 那份量 `data-game-code-chain=rpg`，
  并把屏上那句与**下载到的** `index.html`/`README.txt` 里那句对账（两处各量一遍，量的是"过没过时"）；
  截图 `screenshots/game-code-rpg-chain.png` 已看过：左栏游戏类型写着「RPG 原型」，
  下面明写「这条产物跑的是RPG 那条链（NexusSim 之外再多一段 NexusRpg，转写的是 rpg.ts：经验、升级与等级门）」，
  右上角 DEMO MODE 标识在位（§160）。
  那格落地时这一句 `kindNote` 会随 `compileForKind` 自己变空，不用改文案。
  #139（链上草稿带 `kind`）本片后**要重新划范围**：它原先的一条理由（`pipeline: null` 走不到）今天不成立，
  八型全接了，该挑的是可达接缝——`playtest` 那格今天恒跑 `playtestRpg`，一份 2D 草稿的
  "四种走法"读数其实是 RPG 成长循环的读数。

- **ADR-0046 第三条链（2026-10-20，片 1 已落地）**：`ARTIFACT_CHAINS` 多了第三个键 `story`，
  `interactive-story` / `visual-novel` 这两型**真的带对话引擎**了（转写 `story.ts` 的语义：
  正文、选择、分支；**判定全在编译期**，产物只播放），产物页面按链选画法（对话那型用 DOM、不带画布）。
  于是八型**全部**带上引擎——`kindNote`（那句错位披露）今天恒为空，而它仍然是派生的：
  "机制还在"由一条**反向控制**钉着（临时把状态表某一型的管线改成 null，那句话必须出来）。
  `ArtifactPlan` 改成了带 `chain` tag 的**判别联合**（三条链各一种形状），逼着每一处按链分支。
  **两个坑是在真浏览器验证之前抓到的**（用 Node 的 `vm` 直接跑产物里的 `NexusStory`——
  它是纯逻辑，不碰 `document`，于是内存紧、Chrome 起不来时仍有凭证）：
  ① 引擎读 `plan.story`——而 story 那链的载荷**就是** `StoryPlan` 本身（不是包一层）→ `undefined` → 页面一打开就崩；
  ② 起点没记进 `visited` → 绕回起点那一步认不出是环（要绕两圈才标得出来）。
  两条都补了单测（38 条），也写进了 `docs/adr/0046-artifact-third-chain-story-pipeline.md`。
  **顺带修掉一个既有缺陷**：README 念链名用的是「这一条链：X。」，页面念的是「这条产物跑的是X。」——
  两处各拼一遍（ADR-0045 说那句话只有一个写法），现在都走 `artifactChainSentence()`。
  浏览器那一层（parity 的 7 条 `STORY_*` 判决 + e2e 那一段）**还在路上**。

## §49 契约的行为第一次有凭证：92 个 schema 全部 —— 2026-10-20

- **发现**：`packages/schemas/src/index.ts` 导出 **92 个 schema**，其中 **62 个从未被任何测试引用**。
  之前 `packages/schemas/test/contract.test.ts` 只保证"导出的 `contracts/*.json` 与 zod 定义逐字节一致"
  （**文件没漂移**），却没有任何一条用例说"这份契约收到这样的报文会怎样"。
  于是三件事都能在两边文件同步更新的情况下悄悄发生：枚举改名、给字段加 `.min(1)`、把必填改成可选。
- **落了什么**（`cc4e72a`）：`packages/schemas/test/contract-behavior.test.ts`（**283 条**）。
  判据是三条，**每条对全部 92 个 schema 生效**：
  ① 照 `z.toJSONSchema` 的 `required` 与类型**自动造**一份最小合法报文 → zod 必须接受它；
  ② 把 `required` 名单里的字段**逐个**去掉 → zod 必须拒绝它（每一个必填字段都得是真的必填）；
  ③ 传 `undefined` → zod 必须拒绝它。
  **自动造**这件事是关键：以后新增一个 schema，这份自检**自动覆盖它**，不用记得来补一条用例。
  只有 6 个 schema 要手写样例（数组最少一条 / refine / 自定义格式），写在 `OVERRIDES` 里并注明原因。
- **专项断言**（判别联合与"这几档不能混"的地方）：
  - `RealtimeEvent` 七档各自成立、**未知 type 必须被拒**（跨进程收到陌生帧不能当现场）；
    `build.status` 四档；`generation.progress` 的 0..1；`RealtimeWireFrame` 两档。
  - §162 作业状态是五档：`cancelled` 与 `failed` 分开（一个是"做砸了"，一个是"有人不要了"），
    而 `canceled`（拼写不同的一档）**不认**。
  - §74 审批请求**只有 `decision`**：自报归属与 `confirm` 会被 zod 剥掉，剥完就当没有过。
- **另外两份**（同片）：
  - `apps/web/test/validation.test.ts`（14 条）——`parseDocument` 是 `PUT /api/projects/[id]`、快照、导入、
    公开 API 写端点**四道门共用的那一个**。规模门（整份 20000 节点）另有集成测试打在用户走的那条路上，
    **形状门与结构门此前没有直接单测**（坏了只能看到"某个 400"，说不清是哪一条约束）。
  - `apps/web/test/mock-jobs.test.ts`（11 条）——DEMO 内存作业队列，钉的是 §162 最容易弄错的那句：
    **取消被受理 ≠ 作业已经停了**（`cancel()` 遇到 running 的**只立标志**，状态不动）；
    外加"已取消的不会被 worker 再领走""终态再取消原样交回""查不到返回 null"。
    测法是直接 `new DemoJobStore()`——不启动 worker 循环，不等那两段 1.2~1.8s 的等待。
- **第四片（`da0d5d6`）**：`reciprocalRankFusion` 与 `estimateTokens` 原先是**私有的**，
  只加 `export`（不改逻辑）就能钉：13 条钉住 rank 是 **1-based**、文本侧存的 `textRank` 是
  **BM25 原始分**而不是名次、两边命中时分数相加、k 与权重怎么起作用。
  另补 `tokenUsage` 11 条：一个节点只算一次、名字与正文里的 `{token}` 不算引用、
  组件侧**每个组件**算一次。**这一片有一条断言是实测纠正的**——先按"组件不是节点、所以两个字段算两次"写，
  跑出来是 1，读实现才看清它是**按组件**去重的。
- **一条教训**：**"这个文件自己写着『这段算法有语义要钉住』"不是凭证**——
  `token-usage.ts` 的注释把两条语义写得很清楚，却一次都没有被验证过。
  补测的第一问不是"写什么用例"，而是"**这段代码自己声称的语义，哪一条没人验证**"。

## §127 交付那一格：`下载（N）` 从此只有一个写入方 —— 2026-10-21

- **发现（不是推测，四条各用一条请求量出来）**：`GET /api/marketplace/[id]/content` 从 2026-10-07 就在，
  但那条路上有四个洞——① 建包传的是 `userId ?? creatorId`，而 §144 的归属门（ADR-0024）判"项目在谁名下"，
  **买家扣了点数却永远拿 404**；② `Content-Disposition` 的 `filename` 原样带中文标题，HTTP 头的值是
  ByteString（latin1），构造响应时直接抛 `TypeError`——**标题是中文的条目每次交付都 500**，而平台上标题
  几乎必是中文；③ 免费那一路先 `+1` 再建包，"没有源项目／源项目已删／导出抛错"三条失败路径照样让数字变大；
  ④ 还留着第二条写同一个数字的门 `POST /[id]/download`（只记数不交付，界面改走交付门后**全站零调用方**）——
  一条 curl 循环就能把「下载（N）」灌成任意大而一次交付都没发生，那是 §159 禁的假发布。
  另外两处形状：非 uuid 的 id 撞 22P02 翻 500（`domain/ids.ts` 的口径，update/delete 早已按 404 处理，这道门漏了）；
  匿名可下免费物品却没有任何限流。
- **落了什么**：删掉 `POST /[id]/download` 与它的 5 条套件；交付门成为 `incrementDownloadCount` 的**唯一 HTTP 写入方**，
  顺序钉成"门 → 建包 → 做成能发出去的响应 → 写计数与审计 → 返回"；建包恒以 `item.creatorId` 走 §144（买家的授权
  来自购买判定，不来自项目归属）；头部口径抄 §144 导出门（ASCII `filename` + RFC 5987 `filename*`，`Buffer.from` 收体）；
  非 uuid 在读库前 404；按"条目 + IP"限流 `MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR = 60`（常量放域层，
  界面那句限度和洪水用例读的都是同一个数）。界面侧 `MarketplaceItemRow` 不再把 `<a>` 直接挂到门上，
  改 fetch + 状态码判失败，把服务端那句实话念出来；`下载（N）` 改读 `item.downloadCount`（原先是挂载时冻结的
  `useState`，交付完数字不动）。
- **测试**：`apps/web/test/marketplace-content.integration.test.ts` **14 条**，基线 14/14 绿（166s）。
  四只变异臂各改坏一条律、跑完都还原成字节相同的原文件，**红数是输出里读的**：
  `count_before_build` 7 条（凡"成功一次数才动一次"的读数全多算）、`export_as_downloader` 2 条
  （第一条断言就是"买过的人拿不到包，交付这一格就没存在过：expected 404 to be 200"）、
  `no_limiter` 2 条（那两条洪水）、`raw_title_header` 5 条（能真交付的路径全崩在构造响应那一步）。
  两条结构断言把"唯一写入方"从注释变成机检：数 `apps/web/src` 生产文件里 `incrementDownloadCount(` 的调用点
  （排除 `*.test|spec`，理由写在测试里）恰好两处 = 定义 + 交付门；再加一条 `existsSync('…/download/route.ts') === false`。
  e2e `@smoke §127` 补了**正反两半**：没挂来源项目的条目界面念"没有可导出的源项目"且计数**停在 0**，
  挂上来源项目的条目在真浏览器里收到一个 zip（前两字节 `PK`、文件名是标题本体）且计数**走到 1**——
  只留一半，任何一边写错都能自洽（1.6m 过）。
- **明确不做**（ADR-0047 记了理由）：ZIP 里的**资产字节**（要开作者名下私有素材的读路径，买家未必要得到，另作一片）。
  市场其余**读路径**的形状门这一片没动（`GET /api/marketplace/not-a-uuid/preview` 当场实测是 **500 空报文**，
  匿名可达）——留给下一片。
- **2026-10-21 第二片（#147）：形状门收进域层**。四个域助手按"查不到"回答：`getMarketplaceItem` → null
  （详情 / 预览图 / 交付三条读路共用）、`hasPurchased` → false、`incrementDownloadCount` → 0、
  `purchaseMarketplaceItem` → 与"不存在或已下架"同一句（路由翻成 404）；交付门当初那道**临时路由级 `isUuid`**
  随之删掉，同一件事只剩一处实现。见证补进 `id-shape.integration.test.ts`（第十个家族，27/27 绿）：
  修前实测 **7 条红**（四个域助手 + 详情 GET + 预览 GET 各以 PostgresError 22P02 失败，购买 POST 是 500），
  修后三条路由 404；正对照钉住"真条目照旧读得到、买得成（价格 0，不写扣点流水）、数得上"。
  市场七套件回归 87/87 绿。PATCH / DELETE 仍回 400（域函数早挡、路由 catch 成 400）——那是另一处口径差别，
  被 `marketplace-update.integration.test.ts` 钉着，不在这一片顺手改。
- **2026-10-21 第三片（#149）：PATCH / DELETE 的答复码收敛**。`updateMarketplaceItem` /
  `deleteMarketplaceItem` 从"抛一句英文"改成**判别式结果**（`{ok:true,item}` /
  `{ok:false,reason:'not_found'|'forbidden'|'preview_asset_not_found'}`），路由按语义翻码：
  不存在 / 已下架 / 私有条目被别人动 → **404**，可见条目但不是你的 → **403**，预览素材不存在 → 400；
  未知异常走 `failure()` 回 500，不再把库错误 catch 成 400 回显正文。正文只留稳定机器码 + 一句中文
  `message`（§26）；界面的"保存 / 下架"失败改念 `message`。私有条目对外一律 404 与详情、预览同一口径——
  403 等于告诉陌生人"这个 id 存在"。见证：`id-shape` 家族 27 → 30 条（update/delete 的形状门 + 两条路由 404），
  `marketplace-update` 由 12 → 14 条（新增私有别人的 PATCH/DELETE 404），三份套件 59/59、市场六套件（含 update）66/66 绿；
  tsc / eslint 0。
- **2026-10-21 第四片（#150）：买家侧的「我的购买」**。此前的读路只有店面、我的物品与创作者收益，
  **买过的人没有自己的单子**：买了什么、条目还在不在卖，页面上无处可看。域层加 `listBuyerPurchases`
  （从购买行出发 join 条目与作者，**包括已软删的条目**；按购买时间倒序），路由
  `GET /api/marketplace/purchases` 只读自己的（匿名 401，`cache-control: no-store`），页面
  `/marketplace/purchases` 三态如实显示：在售 / 已转私密（已购仍可下载）/ 已下架（不再交付，
  不渲染下载按钮）。**不替产品拍板**"买过的权利是否随下架终止"——交付门对下架条目仍是 404，
  这一片只把这条事实写进页面与用例。见证：`marketplace-purchases.integration.test.ts` 8 条全绿
  （三态各一行、陌生人只看到自己那一笔、登录未买过 → 200 空列表、下架条目交付 404）；
  真浏览器里三条购买同屏、状态与按钮有无都对、点下载收到交付门那句话，截图
  `screenshots/marketplace-purchases-150.png`；tsc / eslint 0。
- **2026-10-21 第五片（#151）：购买判定收成判别式结果**。`purchaseMarketplaceItem` 此前以句子 throw，
  路由靠比对四句英文翻码——句子是内部措辞，改一个词就会悄悄改掉 HTTP 状态码（#149 已对 update/delete
  收过同一口径）。域层改为 `{ok:true,purchaseId,pricePaid}` /
  `{ok:false,reason:'not_found'|'free_item'|'own_item'|'already_purchased'}`，路由按 reason 翻 404/400，
  界面失败改念正文里的中文 `message`；未知异常仍 throw → 500（"买家不该买"与"系统坏了"不是一件事）。
  **顺带挖出一个被旧用例盖住的真洞**：并发重复购买撞唯一索引时，`isUniqueViolation` 只读顶层 `.code`，
  而 Drizzle 把驱动错误包在 `DrizzleQueryError` 里（`23505` 在 **cause 链**上）——这个函数从未命中，
  输家一路抛到路由变 500；旧并发用例只数"恰好 1 个 fulfilled"，从没检查被拒的那个为什么被拒。
  改为沿 cause 链判：输家现在回 `already_purchased`，事务回滚、一分不扣。见证：市场九套件 + id-shape
  129/129 绿（settle 并发用例拿到 `ok:true | ok:false:already_purchased`；visibility 7 → 9 条：
  自己买自己的公开条目 400 `own_item`、路由层重复购买 400 `already_purchased`；id-shape 30 条按新
  结果形状断言）；tsc / eslint 0。
- **2026-10-21 第六片（#152）：结算判定也收成判别式结果**。`settlePurchase` 是购买路径上最后一段
  靠英文句子传递语义的钱逻辑：路由用 `msg !== 'Already settled' && msg !== 'No revenue to split'`
  决定"正常重复"还是"记一条错误日志"，句子一改日志就失真。域层改为
  `{ok:true,splitId,amount}` / `{ok:false,reason:'purchase_not_found'|'item_not_found'|'already_settled'|'no_revenue'}`，
  路由按 reason 判断：`already_settled` / `no_revenue` 静默，其余 reason 记日志；真正的异常仍 throw
  进 catch。这一片**没有新的行为洞**——#151 修好 `isUniqueViolation` 后，并发结算的输家已经能翻成
  `already_settled`，这里只是把同一条路从句子换成判别式，并补齐此前没钉的结局：串行二次结算
  （`already_settled`，钱只分一次）、价格 0（`no_revenue`，不写分成与收入流水）、不存在的购买
  （`purchase_not_found`，不抛）；并发用例从"只数 fulfilled"改为断言恰好一个 `ok:true` +
  一个 `ok:false:already_settled`。见证：settle 3 → 6 条，市场九套件 + id-shape **132/132** 绿；
  tsc / eslint 0。
- **2026-10-21 第七片（#153）：详情 GET 的「包括已下架的，用于收藏者查看原因」是一句谎**。
  `getMarketplaceItem` 从第一天就 `isNull(deletedAt)`——下架后详情本来就 404，没有"原因"可看；
  市场里也没有收藏表，这句话的受益者不存在。买过的人要在「我的购买」看状态与下架时间（#150）。
  行为不动（软删除保住数据、不保住可读性：详情 / 预览 / 交付三条读路同一口径），改的是文档与
  答复形状：详情两处 404 从裸 `NextResponse.json({error:'Item not found'})` 换成
  `jsonError(404,'not_found',{message:'物品不存在或已下架'})`，与市场其余 `[id]` 门同一个稳定机器码。
  见证：visibility 9 → 10 条（下架后匿名与创作者本人都是 404 `not_found` + 中文 message）；
  市场九套件 + id-shape **133/133** 绿；tsc / eslint 0。
- **2026-10-21 第八片（#154）：「我的物品」看不到私密草稿——店面页拿店面结果过滤出的"我的物品"**。
  店面列表（`listMarketplaceItems`）只出 public/free，页面的「我的物品」却是 `items.filter(creatorId)`：
  私密草稿（创建表单第三个选项、API 与域层的缺省值）在任何界面都不出现——创建成功、找不到，
  改可见性与下架两个按钮永远碰不到它；页面自己的文档还写着"私密在那里可见、可删"。
  加一条所有者视角的读路 `listOwnedMarketplaceItems(creatorId, { itemType })`：过滤只有归属与
  `deletedAt`（已下架的仍不出现——店面 e2e 按"下架后消失"断言），不看可见性；页面拿它当
  「我的物品」。见证：新套件 5 条（私密草稿在、已下架与别人的私密不在、字段够界面用、
  类型过滤、非 uuid 回空表）；单文件 5/5 绿；受影响的四个套件 52/52；e2e §127 在真浏览器里过
  （私密草稿创建 201 → 店面不列 → 重载后「我的物品」可见且带 private 标记 → 下架收尾）；
  tsc / eslint 0。
- **2026-10-22 第九片（#156）：可疑购买只有一行 warn——命中规则与读数现在落进审计**。
  `detectSuspiciousPatterns` 原来只回 boolean，路由拿到 true 只 `console.warn`：窗口一关，
  "谁、哪条规则、读数多少"都没有了；旁边的 TODO 写着"自动创建举报或标记为待审核"，
  但 `marketplace_reports.reporter_id` 是真人外键、也没有"待审核"状态列 ⇒ 不造假的系统举报，
  改为写 `marketplace_audit_log`（action=`suspicious_purchase`，metadata={rules,counts}）。
  购买结果不变（审计是旁证不是业务前提，写失败只记 stderr）。顺带核实三条规则的**可达性**：
  同一买家同一物品有唯一索引 + already_purchased ⇒ 1 小时重复计数永远 ≤1；
  自购在 `purchaseMarketplaceItem` 里先被 own_item 拒绝 ⇒ 前两条今天够不着，
  真正能命中的只有 24 小时 >50 笔。规则本身保留（约束放宽时它们该自己起作用）。
  见证：新套件 8 条（50 笔不命中 / 第 51 笔 200 且审计带 rules+counts=51 / 再买 400 不增行 /
  自购 400 不写 / 对照买家不写 / 重复计数=1 / self_purchase 直接调用能命中 / 正常 purchase 行仍在）；
  单文件 8/8 绿；tsc / eslint 0。

- **2026-10-22 第十片（#157）：管理员审计查询的两处真错——新动作筛不到、时间窗右端反了**。
  #156 把 `suspicious_purchase` 写进审计之后，`GET /api/admin/marketplace/audit` 的 action 白名单
  还是手抄的六项：管理员按新动作筛会吃 400（`validation_failed`），不筛时却能在列表里看见这些行——
  "写进去了但筛不出来"。同一查询里 `endDate` 用的是 `gte`：start 与 end 同向，
  时间窗变成"晚于 end 的那些行"，筛 6 月拿回 12 月。修法两处：动作名单收进域层 `AUDIT_ACTIONS`
  （迁移 0033 的 CHECK、路由校验同源，下次加动作不会再漂），`endDate` 改 `lte`（右端闭区间，
  与 `startDate` 对称）。真库路由用例 4 条先红后绿：`action=suspicious_purchase` 200 且带读数
  （修前 400）、`action=purchase` 不顺带新动作、`endDate` 只回这一刻及以前（修前回的是之后那一行）、
  起止围出中间一行。相邻九个市场套件 93/93、`tsc -p apps/web` 与改动文件 eslint 均 0。

- **2026-10-23 第十一片（#158）：举报工单只会积压——处置状态三列没有写入方**。
  `marketplace_reports` 的 `status / admin_notes / resolved_at` 建表起就没有写入方：举报能提交、能按状态列出，
  却没有任何入口把工单推进一格，`GET ?status=resolved` 永远拿回空数组——一个只进不出的收件箱。
  落法：域层 `REPORT_STATUSES` / `REPORT_CLOSED_STATUSES` / `REPORT_TRANSITION_STATUSES` 名单收成一处
  （查询校验与处置正文同源，不手抄）；`updateReportStatus` 用条件 UPDATE
  （`WHERE status NOT IN ('resolved','dismissed')`）把终态不可改写焊在 SQL 里——两位审核员同时点"结案/驳回"时，
  后来者拿到 0 行而不是覆盖前一位的结论；0 行时重读一次，`not_found` 与 `already_closed`（带当前状态）分开答。
  结案/驳回落 `resolved_at`，不传备注保留原备注；成功处置与"改写结案记录"两路都写 `audit_events`
  （`marketplace.report.update`，被挡那路 `allowed=false`）。
  路由 `PATCH /api/admin/marketplace/reports/[id]` 与裁决台同一口径：401 → 限流 429（30 次/10 分钟，
  放在 admin 判定**之前**，否则非审核员的循环请求能把审计表刷满）→ 非 admin 403 + 拒绝审计 → CSRF 403 →
  正文 zod 400（只收 reviewing/resolved/dismissed，`pending` 不是回退目标）→ 404 / 409（带当前状态与中文话）→ 200 带 message。
  见证：`admin-marketplace.integration.test.ts` 从 27 条长到 **40 条**（13 条新用例：401 / 403 且审计有拒绝行 /
  CSRF / 非 UUID 404 / 不存在 404 / pending 目标 400 / 名单外 400 / 备注超长 400 / reviewing 推进并读回 /
  resolved 落 resolvedAt 并读回且两次成功各留一行允许审计 / 终态再改 409 且原结论一字不改 / dismissed 终态 /
  处置不是删除）；单文件 40/40 绿，相邻九个市场套件 93/93（与 #157 基线同数），
  `tsc -p apps/web` 与改动文件 eslint 均 0。

- **2026-10-23 第十二片（#159）：举报工单有了写入方，审核员却只能用 curl 推**。
  #158 把 `PATCH /api/admin/marketplace/reports/[id]` 接上之后，工单仍只在接口层可用：
  管理员没有一个能看见队列、看见交易证据、点击处置的页面，`pending` 依旧靠手敲请求推进。
  落法：`/admin/marketplace`（admin-only，未登录/非 admin 各一句拒绝且不泄露队列内容）——
  顶部明写"结案/驳回落的是工单结论，**不会**下架物品或撤下公开页"并链到复核台的「拒绝并撤下」
  （界线写反就是界面替产品说反话，§159）；四个状态筛选链走 `?status=`，行内展示原因/物品/举报人/
  补充说明，终态显示结案时间与处置依据，非终态给 `TriageButtons`（受理 / 结案 / 驳回 + 可选依据）。
  页面底部并列最近的 `marketplace_audit_log`（购买/下载/结算/改价/上下架/可疑购买），
  与 `audit_events` 里的处置审计各归各表，不混成一句"都记了"。
  真浏览器见证里发现并修掉一处：处置成功后 `router.refresh()` 会复用客户端组件状态，
  原实现把三个按钮换成一行"已受理"，审核员必须手动刷新才能接着结案——改成提示与按钮并排。
  见证（Playwright + 系统 Chrome + 真 dev server + 真库）：注册账号→SQL 提权→打开管理台待处理行；
  点「受理」→ 行变 reviewing 且按钮仍在；填依据→点「结案」→ 行变 resolved、按钮消失、
  依据与结案时间出现、库里 `admin_notes/resolved_at` 一致；`?status=resolved` 看得到、
  `?status=pending` 看不到；未登录与普通成员分别落在 `data-admin-denied` 两种拒绝页。

- **2026-10-23 第十三片（#160）：举报能收进工单台，买家侧却只有接口没有入口**。
  #158/#159 把处置端与管理台接上之后，举报链的另一端仍是空的：店面行里没有「举报」，
  买家看见骗下载只能去 curl `/api/admin/marketplace/reports`。落法：原因名单收进
  `apps/web/src/lib/marketplaceReports.ts`（值同时喂路由 zod 与界面下拉，标签只给界面；
  放 lib 是因为提交面板是客户端组件，域层会把数据库带进浏览器包；数据库 CHECK 是第三处同名单，改时要走迁移）；
  `MarketplaceItemRow` 新增 `signedIn` 与行内面板——原因下拉、可选说明（与服务端同一个 1000 字上限）、
  提交 / 取消；自己的物品、未登录、已举报三种情况不给入口。成功后留下「已举报」标记；
  409（唯一索引挡住同一人对同一物品的重复举报）把服务端那句原样念出来并收起入口，不做会无限重试的假失败。
  面板旁明写「举报进审核员工单台；结案 / 驳回都不会自动下架物品」，与工单台那条界线同一句话。
  见证（Playwright + 系统 Chrome + 真 dev server + 真库）：注册买家→别人的物品有举报入口、
  自己的物品在「在售」与「我的物品」两处都没有→打开面板选「欺诈」写说明→提交后出现「已举报」，
  库里一行且举报人 / 原因 / 说明 / `pending` 全对→刷新再提交念服务端那句「您已经举报过该物品」
  且库里仍是一行→未登录看同一件物品没有入口；两张截图（面板、提交后）逐张看过。
  `tsc -p apps/web` 与改动文件 eslint 均 0；市场集成套件 40/40 不回归。

- **2026-10-23 第十四片（#161）：「已举报」只活在标签页里——刷新之后入口又出现**。
  #160 让买家能提交举报，但「我举报过这件」只有客户端 state：提交成功当页留下徽标，
  刷新之后行又变回「举报」，买家必须再点一次提交、从 409 才知道重复。
  落法：域层读路 `listReportedItemIds(reporterId, itemIds)`——只回答当前这一页的物品集合
  （一次 `inArray`，不扫全表），非 UUID 的举报人 / 物品 id 按 22P02 同一个口径丢掉；
  店面页渲染时读一次，把 `alreadyReported` 交给行组件，徽标与入口都由服务端已知状态初始化。
  409 保留为并发兜底：两个标签页同时提交时，唯一索引仍然挡着，服务端那句照旧原样返回。
  见证：集成 4/4（只算自己的、只回答传入那一页、形状不对不 500、空列表不查库）；
  真浏览器里提交→刷新→徽标仍在且入口不再出现→绕过界面直接再 POST 仍拿 409 且库里仍一行；
  截图逐张看过。`tsc -p apps/web` 与改动文件 eslint 均 0。

- **2026-10-23 第十五片（#162）：举报交出去之后，举报人看不到自己的工单怎么了**。
  #160/#161 让买家能提交并记住「已举报」，但工单之后是受理、成立还是驳回，只有审核员那一侧看得到；
  举报人手里只剩提交时那一句回执。落法：域层读路 `listReportsByReporter(reporterId, limit = 100)`——
  按举报人一次查询、提交时间倒序，`innerJoin` 物品读出标题与**此刻**的可见性 / 软删状态
  （举报后作者转私密或下架，页面要跟得上）；`admin_notes` 刻意不进 select：那是审核员的内部笔记，
  写的人没打算给举报人看，这里也不借"透明"之名把它端出去；形状不对的举报人回空表，不撞 22P02。
  页面 `/marketplace/reports`：未登录只给一句"举报按举报人存放"；空态说明同一件物品只能举报一次；
  每行给物品名 + 此刻状态（在售 / 免费在售 / 已转私密 / 已删除）、原因标签、自己写的说明、
  提交与处置两个 UTC 时间；状态标签按 `Record<ReportStatus, …>` 钉死，域层加状态时这里漏写直接编译失败。
  结案 / 驳回各配一句**边界**：结案是工单结论，物品是否撤下由人工复核台另行处理，不是这里下架。
  店面头部加「我的举报」入口（与「我的购买」并列，仅登录可见）。
  见证：集成 5/5（只回自己的且倒序、别人的举报不串门、join 跟得上转私密与软删、
  结案结论可读而库里确实存着的 `admin_notes` 不出现在返回对象键里、limit 只截断不改顺序 / 非 UUID 回空表）；
  与 #161 的 4 条同桌再跑 9/9。真浏览器见证（Playwright + 系统 Chrome + 真 dev server + 真库）：
  两次举报都从店面真实入口提交→点头部「我的举报」→两条均为待受理、原因与说明对得上；
  另一上下文里真注册的审核员走 PATCH + CSRF 一条结案一条驳回→举报人刷新后看到「举报成立 / 举报不成立」、
  处置时间与边界句，页面全文不含内部笔记而库里 `admin_notes` 一字不差；物品仍是 public 且无 `deleted_at`、
  页面仍写「物品在售」（结案 ≠ 下架在同一张图上）；未登录直达只有拒绝页、没有工单行；三张截图逐张看过。
  `tsc -p apps/web` 与改动文件 eslint 均 0。
- **2026-10-23 第十六片（#163）：举报交出去、工单结了案，举报人自己却不知道**。
  #160-#162 让买家能举报、能记住"已举报"、能在「我的举报」里看到结论，但结论只在举报人主动回去看时才看得见；
  审核员结案 / 驳回发生在举报请求早已结束之后，和人工裁决同一类——这正是 §164 收件箱该管的事。
  落法：`NotifyEvent` 加第十一类 `marketplace_report`（只接受 `resolved` / `dismissed`；`pending` / `reviewing`
  是状态不是结论，受理不打扰）；`planNotification` 的标题念出物品名并把成立 / 驳回写成两句不同的话，
  正文与「我的举报」页共用同一句边界（结案 / 驳回都不自动下架物品），链接指回 `/marketplace/reports`；
  `dedupeKey = marketplace_report:<工单号>`——终态不可改写，所以一张工单只会有一条结论通知。
  生产者 `server/domain/marketplace-report-notify.ts` 是唯一构造点：`skipped`（本来就不该发）、
  `suppressed`（收件人关掉了这一类）、`duplicate`（同一工单已说过）三种"没发"分开报。
  `updateReportStatus` 成功时顺带读出物品标题（`item_id` 对举报人没有意义；级联外键保证物品行在，
  不为"物品不见了"编一个空标题），路由在结论与审计都落库之后才通知。`levelOf` 把这一类归到 info；
  通知偏好默认全开、`Kind` 两处标签表补齐。迁移 0036 重写 `notification_settings.kind` 的 CHECK：
  0022 那份是手写十类名单，不改约束，用户一保存「举报结论」这一格就是 23514。
  见证：`notify-plan` 单测新增 6 条（两句标题、键挂工单、链接与边界句、success/info、用户输入裁短、
  注册表与终态表）；域层集成 6/6（pending/reviewing 均 skipped 零行、结案 created 的字段、
  同单重放 duplicate 仍一行、驳回答句、关掉这一类 suppressed 零行且重开后 created、收件箱读回 3 条且链接指得动）；
  `admin-marketplace` 的 PATCH 组补上接线断言（受理后 0 行、结案后 1 行且标题含物品名、409 翻案不补发、
  驳回 1 行）——路由与域层同桌 3 文件 94/94。真浏览器见证（Playwright + 系统 Chrome + 已有 dev server + 真库）：
  举报人注册→收件箱空但披露面已是「登记了 11 类」且含举报结论→审核员 PATCH 受理后库里零通知、页面仍空→
  结案后刷新看到「举报结论 / 举报成立」，点「打开」落到「我的举报」里那一条已成立→驳回后两条且标题分开读→
  在通知偏好里把「举报结论」关掉（真 PUT + 迁移 0036 生效，刷新仍为关）→静音期间第三单结案库里零行、
  收件箱仍是两条→恢复开关并再证一次落库；三张截图逐张看过。`tsc -p apps/web` 与改动文件 eslint 均 0。
- **2026-10-23 第十七片（#164）：id 形状门的第二种形状——不是每条路由都先过一道已守住的归属门**。
  前十个家族（`id-shape.integration.test.ts`）的洞都长在"路由 → 域助手 → 裸 `eq()`"上，
  判据也因此写成了"域助手要守"。横向审计换了个问法：**探针实测**——拿 `not-a-uuid`
  打全部 22 条动态 id 路由（有效报体 + 真会话/真凭据），逐条看状态码。五处现出原形：
  - `DELETE /api/v1/projects/<id>` → **500**：`softDeleteProject` 的 `eq(projects.id,…)` 裸跑。
    v1 这条**不像界面那条先过 `projectBelongsTo`**，所以同样的函数在界面上从来没红过；
  - `PATCH /api/admin/users/<id>` 与 `…/plan` → **整个请求以 PostgresError 抛出**（22P02）：
    `setUserRole` / `setUserPlan` 的 `eq(users.id, targetId)` 裸跑，路由连 `try/catch` 都没有；
  - `POST …/characters/<id>/chat` → **500「对话失败」**：那次 `eq(characters.id,…)` 查询**写在路由里**
    （域助手 `characters.ts` 反而守着——守错了一层照样漏）；
  - `GET /api/projects/<id>/tasks` → **500**：`listProjectTasks` 的归属查询自己一句 `eq`。
  修法同族同一口径：域层 `isUuid` 守卫，形状不对按"不存在"答（404 `not_found`），
  与合法 UUID 查不到是同一种答案——不给"存在但不给你看"留侧信道（§159）。
  角色对话那一处补在路由的查询前（它不在域层，补在域层就得为它新造一个域函数——
  那一跃留给真需要复用时再做）。`getTask` 今天没有调用方，但它是导出的域函数，一并补上：
  下一个调用方不该再踩同一个坑。
  **没被漏掉的那些也记下**（证明审计是全扫不是挑软的）：branches switch / snapshots restore /
  characters PATCH·DELETE / memories DELETE / assets 两跳 / avatar / public assets / ai jobs·tasks /
  v1 GET·design·publish / admin reports 全部 404·400·409 如实回答；`notifications/read` 的
  `inArray` 看着同族，但报文层 `z.string().uuid()` 已经挡住（schema 层的不变量）；
  blocks/follow 按 handle 查文本列，本就不适用。
  见证：`id-shape.integration.test.ts` 30 → **38 条**（域层直调 + 路由 + 正对照：改档位/改角色拿
  "本来就是那个值"的真账号、任务账本 200、真角色对话走到 DEMO 409——没有真 provider 不生成回复）；
  相邻七套件（agent-tasks / ai-jobs / api-tokens / audit / plan-admin / project-delete / tasks-ledger）
  **111/111** 不回归；`route-security-gate` 5/5；`tsc -p apps/web` 0、改动文件 eslint 0。
  **变异探针五臂**各摘一处守卫：红数 1/2/2/1/1，全部精确红在对应那条上，跑完逐字节还原。
  方法论补一条：**"守在哪一层"不能靠文件位置推断**——`characters.ts` 的域助手全守着，
  而 chat 路由自己查库的那一句照样漏；探针要打的是**路由**，不是域函数名单。


- **2026-10-23 第十八片（#165）：社交三连的并发双点 500——insert 缺一句 onConflictDoNothing**。
  toggleLike / toggleFollow / toggleSave 都是"先查有没有 → 没有就 insert"的读—改—写。
  两个请求同时到（双击、两个标签页、移动端连击），两边都查到"没有" →
  都 insert → 唯一索引把后到的那条判 23505 → 500。同族的 `setBlock`
  早就用 `onConflictDoNothing` 挡着，这三个漏了。修法同族同一口径：
  insert 补 `onConflictDoNothing()`。终局与库一致——谁先谁后不重要，终态都是"已点赞"，
  回执都是 200，不给"点一下 500、刷新发现赞没了"留窗口。竞态探针：`Promise.all`
  两发同一 (user, target)，修前稳定复现 23505，修后两发都 200。见证：`697dc7c`；
  social.integration 两条（like / follow）、profile.integration 一条（save）钉住；
  今日复跑 social / profile / blocks / publish / api-v1-publish / unpublish / publish-build-status
  七套件 **53/53** 绿。

- **2026-10-23 第十九片（#166）：并发双发发布 500——读—改—写整段收进 advisory lock 事务**。
  publish 的读—改—写（读 publication → 改 version / snapshotId → 写回）不在事务里；
  两个发布请求并发时，后到者覆盖先行者的 version / snapshotId，甚至撞
  `published_path_key` 唯一约束（23505）→ 整个请求 500。第一版修法（onConflictDoUpdate +
  写后重读）被自己的测试抓出不诚实：后到者会把先行回执里的 snapshotId
  改成过期值 → 回执与库不一致（正是 §159 要禁的"假完成"）。最终修法回到 §64
  既有模式：读—改—写整段收进 `db.transaction` + `lockProjectWrites`（advisory lock，
  与 saveDocument 同一把），版本号与快照标签锁内同源定。见证：`a04f974`；
  publish.integration 8/8（含并发双发那条）；变异探针摘锁精确红。

- **2026-10-23 第二十片（#167）：layoutCache 命中判据补回文档对象身份——"键相同文档已变"不再交出旧布局**。
  `77404ed` 把 buildSnapshot 里 layoutCache 的 early-return 从 `key + doc 身份` 换成 `key + 代数`，
  理由是"applyPatch 每次返新对象、doc 身份永远 miss"。探针实测这个判断对纯选中帧是错的：
  选中不动文档，`doc === document` 本来就成立；那一下的真实效果是砍掉了"事务内文档变了而
  revision 不跳"的护栏（`applyWithinTransaction` 不跳 revision 也不跳代数）——键一字不差而文档对象已换，
  缓存把上一帧那份解交出去，画布画的是上一帧内容。`derivedCache` 用身份判据防的是同一件事（过期
  token 表），两处判据本该平行。修法：命中条件三样全上（key + 代数 + 文档对象身份）；
  纯选中帧照旧命中，§147 选中响应不受影响。测试 `apps/web/test/studio-layout-cache.test.ts`
  三帧各钉一条（选中命中 / 半程提交不陈旧 / 换视口重算）；变异探针四臂全精确红。
  见证：`91cadd4`；studio 五套件 16/16。

- **2026-10-23 第二十一片（#168）：games / worlds "一个项目一份"补上建库约束——并发双发不再插出两份**。
  这两张表的"一个项目一份"一直只是应用层 read-then-insert 的约定（storyboards 的 project_id
  一早就有 `.unique()`，它们漏了）。两个并发创建——双击「接受草稿」（agent/draft，createOnly）、
  两个标签页各存一次——都查不到已有行 → 都 insert → 库里两份：用户看到"接受成功"两次，
  其中一份永远看不见（currentRow 按 updatedAt 取最新），但导出/发布读的都是那一份，
  另一份成幽灵行。修法两层缺一不可：① 迁移 0037 先按 updated_at 收敛历史重复行
  （每项目留最新、id 断序），再加唯一约束——**只做迁移不做代码，并发下第二发会从
  "静默多一行"变成 23505 直接 500**；② saveGame / saveWorld 的 insert 补
  `onConflictDoNothing`，撞约束后重读走更新路径（createOnly 照旧拒、旧写拒照旧生效），
  既有更新路径抽成 applyGameUpdate / applyWorldUpdate 两个助手两路共用。
  测试：games / worlds 各加一条 Promise.all 双发探针（games 断言一成一拒且拒因含
  "已经有一份"、countGames=1；worlds 断言两发都 ok、countWorlds=1）。
  变异探针摘掉两处 onConflictDoNothing → 两条精确红（23505 抛出）。
  见证：`520ab42`；八套件 99/99（games / worlds / agent-draft-accept / game-code /
  game-publish / knowledge / context / agent-orchestration）；tsc 0、eslint 0；
  迁移已应用到 nexus 与 nexus_regress。

- **2026-10-23 第二十二片（#170）：并发补 main / 建同名分支不再 23505——insert 补一句 onConflictDoNothing**。
  `ensureDefaultBranch` 与 `createVariantBranch` 都是"先查有没有 → 没有就 insert"的读—改—写。
  两个请求同时到（两个标签页同时打开一个还没有分支的项目、双击「生成方案」），两边预检都在任何
  insert 之前发出 → 都 insert → 库里 `branches_project_name_key` 把后到的那条判 23505 → 500。
  修法与 #165/#168 同一口径：`ensureDefaultBranch` insert 补 `onConflictDoNothing`，返回空行时
  回头读该项目现成第一条分支交回去（backfill 留给赢家——行已在、历史快照归类也已做过）；
  `createVariantBranch` insert 补 `onConflictDoNothing`，拿不到行就 `return null`（既有契约，
  调用方据此记"没能落成分支"），不再让 23505 冒到路由层。
  测试上的一个坑：`createProject` 现在就建 main，所以 `ensureDefaultBranch` 的 insert 支对正常项目
  **不可达**——第一版"并发双读分支列表"是空转的（main 早已存在，根本不 insert，变异摘了守卫也不红）。
  真正触达那一支要造 legacy 状态：删掉分支行（`snapshots.branchId` 外键是 `onDelete:'set null'`，
  删不坏快照），再开一个事务把 main 插进去**但不提交**——两处 select 都看不见未提交行，于是都走到
  insert，后到者阻塞在唯一索引上，等那个事务落地后才发现插重了。这样竞态是确定性的，不靠时序碰运气。
  见证：`c4254f7`；branches + variants 两套件 21/21；tsc -p apps/web 0、改动文件 eslint 0；
  变异探针两臂各摘一处守卫，全部精确红后逐字节还原。

- **2026-10-23 第二十三片（#171）：并发开同名分支不再 23505——`createBranch` 补 onConflictDoNothing**。
  `createBranch` 与 `createVariantBranch` 是同一族读—改—写：先 clash 预检（同名就答
  "已经有叫 X 的分支"），再 insert。#170 只修了后者，前者漏了。两个标签页同时开同名分支时，
  两边预检都在任何 insert 之前发出 → 都 insert → `branches_project_name_key` 判 23505 →
  路由 catch 住变 500，而本该是那句人话 400。修法：insert 补 `onConflictDoNothing`，
  拿不到行就回 `{ok:false, reason:"已经有叫 X 的分支"}`——与预检那条**同一句措辞**。
  见证：`be8e60d`；branches + variants 22/22，新测试连跑三遍稳定。

- **2026-10-23 第二十四片（#172）：并发双发举报不再 500——撞唯一索引回头读现成那条（#172）**。
  `flagSuspiciousActivity` 是"先查有没有 → 没有就 insert"，而
  `marketplace_reports_unique_reporter_item` 一早就有唯一索引（幂等契约写在函数头）。
  双击「举报」、两个标签页各提交一次，两边预检都查不到 → 都 insert → 后到的那条判 23505 →
  路由 catch 住变 500「举报失败」，而串行时只答 409。修法同族：insert 补
  `onConflictDoNothing`，拿不到行就按 (reporter, item) 重读一次回 `{isDuplicate:true}`。
  测试两条：域层用未提交事务把竞态窗口钉死（确定性杀死变异）；路由层只钉用户看得见的结局
  （两发都不是 500、库里只有一行）——**这条不承担杀变异的责任**，注释里写明了，
  因为两个 HTTP 请求在同一进程里不保证真的在 insert 处交叉（实测会串成一条 409）。
  见证：`75cecf5`；marketplace-reported 4/4 + admin-marketplace 41/41，市场七套件 79/79。

- **2026-10-23 第二十五片（#173）：并发同名建项目不再 500——slug 撞唯一索引就换后缀重来**。
  `createProject` 的 slug 是"查一遍有没有重名 → 没有就用 base"的读—改—写，而
  `projects_owner_slug_key` 是 (owner_id, slug) 上的唯一索引。双击「新建项目」、两个标签页
  同时开，两边都查不到对方 → 都插 base → 后到的那条判 23505 → 500。旧写法还藏一个静默的坑：
  50 个候选全撞也不会报错，最后拿着一个必然冲突的 slug 去插。修法：事务体抽成
  `writeNewProject`，由 createProject 循环驱动——查重只是省掉一次无谓的插入尝试，
  **真正的裁判是唯一索引**：撞了 `projects_owner_slug_key` 就换下一个后缀重来，全撞满才抛
  一句人话。认约束名是必须的：文档自己带重名页 / 重名 token 也会报 23505，那不是换 slug
  后缀能解决的事。`isSlugConflict` 沿 cause 链走（#151 的教训）。
  见证：`b34aefd`；projects / project-meta / project-delete / import / api-v1-write /
  branches / snapshots 七套件 73/73。

- **2026-10-23 第二十六片（#174）：并发拿同一个邮箱注册不再 500——撞 users_email_key 翻译回 409**。
  `register` 的"这个邮箱被占了没有"是读—改—写的前半截：`emailTaken` 查一遍 → update 自己
  那一行写死 email。两个标签页同时注册同一个邮箱，两边都查不到对方 → 都 update →
  `users_email_key` 判 23505 → 500，而串行时只答 409「该邮箱已被注册」。
  修法：update 包 try/catch，撞 `users_email_key` 就回 `email_taken`——和预检同一句回执。
  测试上有个发现值得记：**直接 Promise.all 两发 register 复现不了这个竞态**——口令哈希把窗口
  拉得足够宽，实测两发会串成"一发成功、一发 email_taken"，update 根本没交叉。所以照 #171
  的办法把窗口钉死：另一个事务先把同一个邮箱写进 users 但不提交，`emailTaken` 看不见未提交行，
  于是照样走到 update 并阻塞在唯一索引上。见证：`f49cff2`；auth.integration 7/7（连跑三遍稳定）。

- **2026-10-23 第二十七片（#175）：并发同步语料不再 23505——删与插收进同一事务、同一把项目写锁**。
  `syncDesignKnowledge` / `syncProjectKnowledge` 都是"删光这一类 → 逐块插回"，两步之间没有
  事务也没有锁。两个并发同步（自动保存 + 「重建索引」、双击重建、同时存世界与存角色）各自删一轮
  各自插一轮，后到的那发撞 `knowledge_chunks_source_key` 判 23505 → 500。串行时同样的事只是
  "后一次同步覆盖前一次"，所以这是把一次正常并发报成了服务器故障。修法：删与插收进同一个事务，
  并在事务里拿同一把项目写锁（ADR-0016）；调用方全都在事务**外**调同步，不会嵌套死锁；
  锁函数用动态 import 取（绕开 knowledge ↔ projects 的模块循环，与 :455 已有的套路同一招）。
  测试的坑：第一版拿 `design` 那一类的块键去撞，而默认路径根本不重切 design（删除范围必须等于
  重写范围），于是窗口根本没造出来——只取非 design 的键才复现。
  见证：knowledge / memory-search / memories 29/29 + world / games / storyboards / characters /
  context 48/48；tsc 0、eslint 0。

- **2026-10-23 第二十八片（#176）：恢复路由对非 UUID 的 id 不再 500——`restoreProject` 补形状门，20 条动态参数路由全扫**。
  拿 `not-a-uuid` 把 id-shape 测试没覆盖到的动态参数路由全部打了一遍（20 条），
  只有一条真漏：`POST /api/projects/<id>/restore`。恢复这条路**直达域层**（不像别的
  项目路由先过 `projectBelongsTo`），而 `restoreProject` 的 UPDATE 是裸
  `eq(projects.id, …)`——非 UUID 的 id 撞 22P02，路由 catch 住变 500「恢复失败」，
  而它只是一次打错的请求。修法同族：域层形状不对按"不存在"处理回 null，路由照旧
  翻 404，与 `softDeleteProject` 同一道门、同一句回执。其余 19 条实测全部安全：
  `ai/jobs` 两条路的 `taskByJobId` 查的是 text 列 `providerJobId`（作业号本来就不是
  UUID 形状）；tasks 的 approval/retry 走已有的门；assets 两条走 `rowById`；
  branches switch 双 id 都验；characters/memories/snapshots 三族的子 id 门都在；
  v1 三条先过 `projectBelongsTo`。这 19 条没有修复动作，收编进测试是为了锁住
  "不打 500"这条不变式。**收编时避开了空转**：角色 PATCH 的报文按
  `CharacterProfileSchema` 填满、v1 补丁带必填的 `summary`——第一版探针这两条都只在
  zod 层拿了 400，守卫根本没被走到（#170 的教训）；v1 design PATCH 补上 summary 后
  从 400 变 404，正是"真的走到域层"的证据。
  见证：`5e3180f`；id-shape 42/42；projects / project-delete / snapshots / branches
  四套件加 id-shape 共 92/92；api-v1 8/8；tsc 0、改动文件 eslint 0。
  变异探针：摘掉 `restoreProject` 的守卫，域层与路由两条测试精确红，其余 40 条不受影响。

- **2026-10-23 第二十九片（#177）：两个"已知不修"落成 ADR，等产品表态**。
  并发审计（#170-#176）扫到最后剩两处竞态，都**不修但记下**：
  ① `moderation.ts` `fileReport` 的举报升级是读—改—写且 `moderation_cases`
  无唯一索引——并发双举报同一 publication 会建两条未结案。加部分唯一索引有真实
  副作用（同 publication 新版发布的 findings 会被旧未结案挡掉）；收进项目写锁则让
  机检与举报共用入口全排队，换来的只是"审核员少看一眼重复行"。
  ② `assets.ts` 上传的 checksum twin 无唯一索引——并发双传同一字节会多一行、
  配额多算一份（不 500、不损毁）。加唯一索引会堵死"同项目传两张一样的图"
  与"归属不同角色"的合理诉求。两处的修法都等一个产品决定
  （"同 publication 允许多少条并行未结案" / "同项目同字节是否必须一行"），
  判决书：`docs/adr/0058-report-escalation-duplicate-cases.md` 与
  `docs/adr/0059-asset-checksum-twin-duplicates.md`。
  在此之前，新代码不许给这两处加唯一索引。

- **2026-10-23 第二十九片半（#178）：流式首屏落地并实测（§147 第三片）**。
  `page.tsx` 创建文档 promise 后**不 await**，流给客户端；`StudioShell` 里新增 `DocumentStream`
  （`use()` 解包 + `bootstrap`，包在 `<Suspense fallback={null}>`）⇒ shell 先 flush、文档 chunk 后到。
  **2026-10-21 记的那个产品问题有工程答案了**：当时说流式的前置是"文档是否完整"这个状态——
  **这个状态本来就有**（`state.ready`：画布只在 bootstrap/load 装好全量文档后渲染）⇒
  编辑不可能早于文档到齐 ⇒ "用户多久开始编辑"两种答案都安全，不必等产品拍板。
  `bootstrap` 与 `load()` 谁先到都安全（bootstrap 对已 load 过的同一项目是幂等 no-op）。
  **生产构建 A/B**（同一构建、`NEXUS_STUDIO_SSR_DOCUMENT=1/0`、`perf-browser.mts` 1000 档）：
  起手 8 节点首帧 **46.6ms vs 103.1ms**（流式快 2.2×，省一次 fetch 往返）；
  1000 节点首帧 283ms vs 161.9ms（流式稍慢——flight 序列化比 fetch+JSON.parse 重，但同量级）；
  属性写入 8.8 vs 9.3ms、选中 14.7 vs 19.4ms、帧距 6.1ms 两态持平。
  见证：`5e3180f` 之后的 studio 接线（见本次提交）；`@smoke studio slice` 两条 dev 下通过；
  生产构建全档量到；调试手动复刻确认 perf 脚本首轮挂 `typography.fontSize` 是偶发非回归。
  数与口径写进 `docs/PERFORMANCE.md` 末尾（2026-10-23 晚那一节）。

- **2026-10-23 第三十片（#179）：项目简介 PATCH 对非 UUID 的 id 不再 500——`updateProjectDescription` 补形状门，43 条动态参数路由二轮全扫**。
  **探针换了个问法**：#176 扫的是"路由 → 域助手 → 裸 eq()"这一族（收了 20 条）。
  这一轮反过来问"**id-shape 测试还没碰过的动态参数路由有哪些**"——91 条路由里约 56 条带路径参数，
  已覆盖 21 条，剩下 43 条全部拿 `not-a-uuid` 打了一遍（`.scratch` 探针，判据是"不得 500"）。
  **43 条里只有一条真漏：`PATCH /api/projects/<id>`（改项目简介）**。
  根因不是"漏了一道归属门"，而是这条路由**结构上就跟同目录的兄弟不一样**：
  GET / PUT / DELETE 都先过 `projectBelongsTo`，只有它不过——`updateProjectDescription`
  把所有权写在了 SQL 的 `owner_id` 里（函数头注释写明了这个取舍）。于是非 UUID 的 id
  一路裸 `eq(projects.id, …)` 撞 22P02，被路由 catch 成 500「更新失败」，而它只是一次打错的请求。
  修法同族：域层 `if (!isUuid(projectId)) return null` → 路由照旧 404，与 `softDeleteProject` /
  `restoreProject` 同一道门、同一句回执。**不是越权**（ownerId 一直在 SQL 里），是"坏形状被当成服务端故障"。
  **避空转的账**（#170 的教训第三次派上用场）：第一版探针有 4 条只拿到 400——zod 那层就收了，
  守卫根本没被走到。逐个补满契约后才真到域层：`PATCH /design` 要 `patches` 数组、
  `knowledge/block` 的 `sourceType` 必须在 `SOURCE_LABELS` 里（传 `world` 是 400，
  合法值里没有 `world`，只有 `lore/history/...`）、删除项目的确认词字段叫 `confirm` 不是 `confirmName`、
  `PUT`/`POST /snapshots` 要一份**形状合法**的真文档（只改 id 会被 `parseDocument` 先拦）。
  补满之后 43 条**全部 404**——这才是"走到数据库再答不存在"的证据。
  **二轮全扫的判据比一轮严**：一条探针只证明"这个坏字符串不 500"。所以这一轮加了两组对照：
  ① 五种坏形状（空串 / `1` / `abc-def` / 200 个 x / 版本位不对的假 UUID）在 PATCH 上全部 404；
  ② **三条正对照**（真项目 id 走 context / knowledge / snapshots 全部 200）——守卫挡的是坏形状，
  不是正常路径，"为了不打 500 把真用户也挡了"同样是缺陷，这一组就是钉这个的。
  见证：`id-shape.integration.test.ts` 42 → **47 条全绿**；projects / project-delete / snapshots /
  branches 四套件 50/50；tsc 0、改动文件 eslint 0。
  变异探针：摘掉 `updateProjectDescription` 的守卫 → 新块内 3 条精确红（域层 null、路由 404、
  五种坏形状），其余 44 条不受影响；逐字节还原后 47/47 复绿。

- **2026-10-23 第三十片半（#180）：五条生成入口的额度闸逐一实证——"generation 记账但不拦截"判为过期行**。
  上一轮（394c43d）核 credits 时留了一句"欠 generation 的执行方"，这一轮不问"写没写"，
  改问"**超额度的时候到底发不发出得去**"——把四类余额压到 0，五条入口逐个打：
  ① `refusalForRun` 本身；② `submitClientRequest`（`POST /api/ai/jobs` 与 `/api/ai/tasks/<id>/retry`
  都走它）；③ `runReadinessCheck`（`POST /api/projects/<id>/agent`）；④ `POST /api/ai/run` 路由；
  ⑤ `generateDemoImage`（Image Studio）。判据两层：回 `credits_exhausted` / `credits`（429）
  **且 `agent_tasks` 一条都没多**——只看状态码的话，一条没建的作业也会回 200。
  正对照：把额度加回去，`refusalForRun` 回 null、本地合成照旧出图（闸挡的是超额，不是正常路径）。
  **写测试时踩到的两个真坑（都值得记住）**：
  ① `requireUser()` 会话查不到时会**就地造一个 guest 用户**（§137 设计）⇒ 测试里 sessions 行的
  `tokenHash` 必须存 SHA-256（`crypto.subtle.digest`），存明文会让身份悄悄换成 guest——
  症状是 `projectBelongsTo` 返 false、整条路以 `404 project_not_found` 收场，
  **看起来像"项目不见了"，其实是身份换了**；
  ② `credit_ledger` 是只追加账本（DELETE 被 plpgsql 触发器挡，报 P0001），
  清理只能靠删 users 时间接清（afterAll 里不要 `db.delete(creditLedger)`）。
  **标签与事实的对应（写进正文免得下次再判错）**：`ENFORCED_PLAN_AXES` 里的 `aiUsage`
  指的就是这道按 `creditKindForAgentKey` 分桶（ai/image/video/compute 四桶）、
  按 `GENERATION_COST`（ai 1 / image 2 / video 5 / compute 1）计价的闸 ⇒ "生成次数"这一格
  **已生效**，只是标签叫 aiUsage；`generation` 与它是同一道门，没有第二道。
  team collaboration 与 publishing 仍无执行方。**不改 `ENFORCED_PLAN_AXES` 的代码语义**
  （标签命名是产品决策，本轮只修事实陈述）。
  见证：`apps/web/test/credits-enforcement.integration.test.ts` 2/2 绿；credits / credits.test /
  tasks-ledger(.integration) / tasks-ledger.test 五套件 39/39；tsc 0、改动文件 eslint 0。
  变异探针：摘掉 `submit.ts` 的额度门 → 该文件精确红（`expected true to be false`），
  从 `.scratch/submit.ts.fixed` 逐字节还原后复绿。

- **2026-10-23 第三十一片（#181）：坏 JSON 正文不再变成 500——`req.json()` 抛的 SyntaxError 按 400 收，三条路由同族修完**。
  `marketplace/route.ts` 里那句注释早就记着这一族："此前 `await req.json()` 在 try 之外，
  非 JSON 正文直接把请求带崩成 500"——当时只修了那一条。这一轮反过来问
  "还有哪些路由把 `await req.json()` 放在了会把它接住的地方"，全仓扫出**三条**：
  `POST /api/projects/<id>/knowledge/block`、`POST /api/projects/<id>/knowledge/search`、
  `POST /api/projects/<id>/characters/<characterId>/chat`。三处都是同一个形状：
  `req.json()` 在 try 里，SyntaxError 被 catch 收走，回的话从"请求体不是 JSON"
  变成"读取语料块失败 / 检索失败 / 对话失败"——**调用方写错了请求，服务端报自己的故障**。
  错误码是契约的一部分：500 会让客户端走上重试与报警，而它该做的是改正文。
  修法用仓库里早就有的 `readJson(req)`（`server/http.ts`，解析失败回 null），
  不新造helper：三条路由的 zod schema 都是 `z.object(...)`，`safeParse(null)` 照旧 400，
  话术与 marketplace 那条一致（`validation_failed` + 指出是 body）。
  **同族扫完的结论**：`/api/ai/run` 与 `/api/ai/jobs` 早就做对了（try 包 `req.text()` + `JSON.parse`，
  坏正文回 400「请求体必须是 JSON」），`import.ts` 里两处 `JSON.parse` 也各自拒收；
  这三条是这一族剩下的全部。
  见证：新文件 `apps/web/test/bad-json-body.integration.test.ts` 5/5 绿。判据三层——
  ① 六种坏法（截断 JSON / 空正文 / 数组 / 字符串 / 数字 / null）全部 400；
  ② 只打三条路由不够，另钉两条**早就做对了**的同族路由（`/api/ai/run`、`/api/ai/jobs`），
  将来谁把它们"统一"成上面那种写法，这条会红；
  ③ **正对照**：正常正文照旧走完——block/search 200，chat 停在 409 `demo_mode`
  （今天的正确答案：没有真 provider 就不假装角色在说话；它在这里的含义是正文解析成功了）。
  变异探针：逐条把路由还原成 `await req.json()` → 每次精确红 1 条（就是那条路由那一组），
  其余 4 条不受影响；逐字节还原后 5/5 复绿。
  tsc -p apps/web 0；改动文件 eslint 0；相邻七套件（knowledge ×3 / character ×3 / 本文件）71/71。

- **2026-10-24 第三十二片（#182）：`/api/blocks` 补上路由级见证——§132 拉黑/屏蔽的三条边界各有钉子**。
  起因是"91 条路由里哪些从来没有被路由模块直接 import 过"这个问法：
  逐条比对测试源码后剩 7 条，其中 `/api/blocks`（§132 block/mute）是唯一一条
  **用户可见、有真语义、却只有域层被间接调到**的。路由这一层有三件只有它说得清的事：
  ① 按 handle 寻址（界面上给的是 @name，"知道某个人的 uuid"不该是能做这件事的前提）；
  ② CSRF 双提交——写请求，没有它就是跨站就能替人拉黑；
  ③ 解除是 no-op 不是错误（"取消"点两次不该变红）。
  另两条最需要说清的语义钉在域层断言里：**block 把两个方向的关注一起拆掉**
  （留一条"我关注了我拉黑的人"，关注流里就还会冒出他的内容，等于自己给 block 留口子），
  **mute 不动关注**（"还想知道他在做什么，但不想被他找到"是合法用法），
  以及 mute 不挡互动、block 双向都挡——把 mute 当禁言用会以为自己在处理骚扰，其实没有。
  见证：新文件 `apps/web/test/blocks-route.integration.test.ts` 9/9 绿。
  变异探针六种，全部精确红：摘 CSRF 门（连带把"一个关系都不写"那条一起打红）、
  去掉 self-block 检查、把 block 拆关注改成谁都拆、完全不去拆关注、
  `canInteract` 全放行、`userByHandle` 对不存在的人也返回一行。还原后 9/9 复绿，
  源码零改动（只新增测试文件）。tsc -p apps/web 0；eslint 0；相邻 social 套件 19/19。
  同批扫出的另外 6 条（`account/avatar`、`auth/login`、`auth/logout`、`ai/pending-approvals`、
  `discover`、`published/report`）逐个看过实现：都有 zod/CSRF/`isUuid` 门，无洞，留待后续补见证。

- **2026-10-24 第三十三片（#183）：§137 的 guest 自动签发把"按 user.id 限流"那一族变成了空转——10 条写入口补上"身份之前的闸"**。
  `middleware` 给每个没有会话 cookie 的请求签一个**随机** token，`requireUser()`
  拿不到会话行就**就地建一个 guest 用户**。于是 `rateKey(route, ip, userId)` 拼出来的
  `${route}|${userId}|${ip}` 对不存 cookie 的客户端每次都是新键。探针实测（打真库，
  `POST /api/published/report`）：**12 个不同 token → 建 12 个 guest、0 次 429**；
  同一个 token 打 12 次 → 只建 1 个 guest、第 11 次起 429（按身份的那道闸本身是生效的，
  失效的只是它的键）。`marketplace/route.ts` 的注释早就点破过这件事并加了双键，
  但双键挡不住新身份。
  **更糟的是扫下来三条写入口本来就没有任何限流**：`POST /api/projects`、
  `POST /api/ai/run`、`POST /api/account/api-tokens`——一个绕开 cookie 的客户端
  可以无上限地建用户 + 项目 + 文档 + 任务行 + 凭据。`/api/ai/run` 虽有 §133 的额度闸，
  但 free 档每月发 100 点而 guest 可以无限新建：额度闸限的是"一个身份做多少"，
  限不住"建多少个身份"。
  修法：新增 `ipWriteGate(route, req, limit, windowMs)`（`server/security/rateLimit.ts`），
  接到 10 条写入口上，**一律放在 `requireUser()` 之前**——被挡住的请求一个 guest 都不该建
  （建了就是"限流了但还是付了代价"）。与 `auth/register` 完全同形状。
  两条限度说清而不是绕过去：① 标识不出 IP（没有 XFF）的请求不进这个桶——
  给它们一个共享桶会把正常用户一起挡掉，那是用一种故障换另一种故障；
  ② IP 是粗粒度身份，限额取宽，各路由原有的按身份闸一条没删（兜底，不是替代）。
  见证：新文件 `apps/web/test/guest-write-gate.integration.test.ts` 4/4 绿。
  判据三层：① 25 个不同 token 打 `POST /api/projects` → 前 20 个 201、后 5 个 429，
  **且只建 20 个 guest**（被挡的没付代价）；② 公开举报入口同样兜住；
  ③ 正对照：稳定身份照旧放行（3/3 个 201、只建 1 个 guest），以及无 XFF 时闸让路。
  变异探针两种都精确红：摘掉闸、以及**把闸挪到 `requireUser()` 之后**（顺序错 =
  被挡的请求照样建 guest）。还原后 4/4 复绿。
  受影响五套件 43/43、social 相关 26/26；tsc -p apps/web 0；改动文件 eslint 0。
  判决书：`docs/adr/0060-guest-autoprovisioning-needs-pre-identity-rate-limit.md`。
  **遗留（写进 ADR，不假装没有）**：`GET /api/auth/me`、`GET /api/projects` 这类
  **读**入口也会建 guest（一个用户行，没别的副产品）。没给读入口加闸——
  给 GET 回 429 会让账号面板直接坏掉，值得单独评估。

- **2026-10-24 第三十四片（#184）：UUID 形状判定收回"只此一处"——又冒出来的三份手抄正则合并进 `domain/ids.ts`，并修正一处与实测不符的注释**。
  `domain/ids.ts` 的文件头写着"UUID 形状校验——**只此一处**"，并且记着已经合并过
  `assets.ts` 的 `UUID_SHAPE` 一份。这次反过来问"还有谁在自己手抄"，扫出**三份**：
  `api/avatar/[userId]/[file]/route.ts`、`domain/analytics.ts`、`domain/analytics-agent.ts`
  ——三份都是同一句注释、同一个正则，与权威实现并存。
  **合并前先证明行为等价**（不靠读代码猜）：拿 zod 4.6.5 的 `z.string().uuid()` 与手抄正则对拍，
  2000 个 `crypto.randomUUID()` **0 处分歧**；逐位试出来唯一差别在**第四组第一位**——
  zod 要求 `8/9/a/b`（RFC 4122 的变体位），手抄那份收任何十六进制，
  另外 zod 额外放行全 0 与全 f 两个特例，版本位两边都不管。
  所以真实 id（`defaultRandom()` 出的是 v4）两种都认，被挡下的那几位恰好是
  "长得像 UUID 但不是 UUID"的输入——合并是行为等价且更严一点。
  **顺带修掉 `ids.ts` 里一句与实测不符的话**：原注释说 zod "比手抄的严一点点（版本位与变体位）"，
  实测版本位两边都不管，只有变体位有差别。注释说错了比没有注释更糟——
  下一个照它做判断的人会被带偏。
  见证：合并后全仓 `[0-9a-f]{8}-[0-9a-f]{4}-` 形状的本地正则 **0 份**；
  tsc -p apps/web 0；改动文件 eslint 0；analytics 四套件 + id-shape 共 115/115 绿。

- **2026-10-24 第三十五片（#185）：批注的「已解决」状态落地——一行时间戳，并且它改变了 AI 能看到什么**。
  §111 那一行挂了很久的"只剩一项"（2026-10-21 核实）在这次补齐：`comments.resolved_at`
  （迁移 0038）+ `setAnnotationResolved` + `PATCH /api/annotations/[id]` + 界面 + 上下文。
  四处值得记下来的判断：
  1. **时间戳不是布尔**。与 `projects.deleted_at` 同一条纪律：状态由存在性推出（NULL = 未解决），
     "什么时候解决的"与"是不是解决的"是两个问题，存布尔就永远答不出前者。
     顺带白拿一样：重新打开再标一次，第二次盖掉第一次，"反复开关过"在数据里留得下痕迹。
  2. **库上是第二道门**：CHECK `comments_resolved_at_only_annotations` 管住
     "公开评论（§59，node_id 为空）不能有 resolved_at"。服务端 PATCH 按同一条件取行，
     但直接连库的人到得了那里。探针实测：摘掉约束，那条 CHECK 测试精确红。
  3. **幂等由两道共同保证**（早退 + `next` 读回原值）。单独摘任意一道另一道还在、测试仍绿——
     所以探针要两道一起摘才红。这条写进注释，免得下一个人把其中一道当多余的删掉。
  4. **已解决的批注不再进 AI 上下文**，这是本片真正的行为变更：不带上去，但
     `annotationsNote` 写明"1 条批注已标记为已解决，没有带上"（§159 不静默降级）。
     `@Agent` 提名同样只认未解决的——收工的话不该再点名哪个 Agent。
  见证：`annotations.integration.test.ts` 13/13、`annotation-resolve-route.integration.test.ts` 5/5、
  `id-shape.integration.test.ts` 49/49、ai-assemble + agents + 安全结构门 43/43；
  画布 e2e 一条绿（标上 → 默认收起 → 展开 → 刷新后仍在 → 重新打开）。
  变异探针 6 种（不过滤已解决 / 公开评论门 / 回复门 / 归属门 / 幂等两道齐摘 / CSRF）+ 库上约束摘除，
  全部精确红后逐字节还原。tsc -p apps/web 0；改动文件 eslint 0。
  判决书：`docs/adr/0061-annotation-resolved-state.md`。
  **没做的**：`PATCH` / `DELETE /api/annotations/[id]` 没加 IP 闸。它们要先过
  `projectBelongsTo`，guest 建不出任何东西（只有一个用户行，与 `GET /api/auth/me` 同一笔欠账，
  见 ADR-0060 的遗留段）——不在这片里顺带扩面。

## M5 第一片（#186）：时间线 → 渲染计划——"没有 provider 时能诚实做出来的那一半"定成契约

`packages/video-model/src/render.ts`：`planVideoRender(storyboard)` 把时间线投影成一份
**可渲染的帧计划**——哪一镜在第几毫秒、画面从哪来、怎么动、和下一镜怎么接。
渲染器（ffmpeg）照着它做就行，不需要再猜任何一个决定。

为什么不直接上 ffmpeg：决定比命令值钱。机位怎么映射成推拉摇移、转场吃不吃总时长、
没有参考帧时画面上是什么——这些判错一次，渲出来的片子就是错的，而错在
"模型没想清"比错在"命令行写错"难查得多。所以先是模型，后才是渲染（与 §40 前四片同一顺序）。

四处判断：
1. **转场吃这一镜的尾段**，不另加时间。总时长必须恒等于各镜时长之和，
   否则在时间线上 trim 一镜就会偷偷改变总长（§16：投影不是第二份真值）。
2. **推演用"缩放 + 平移"而不是归一化裁剪框**。源图长宽比五花八门，裁剪框要在
   "保持比例"与"恰好铺满 16:9"之间二选一；缩放+平移让渲染器先 cover 适配再推拉，
   输出帧永远 16:9，变形与否由素材决定，不由计划决定。
3. **色卡是这一镜的画面，不是"素材加载失败"的占位图**：颜色由 shotId 的 FNV-1a
   散列定（同一镜永远同一个颜色，§16 要能重放），且**不给它一套假运动**——
   一张静态卡片推拉等于假装有运镜。
4. **`demo: true` 写进计划本身**。本机没有视频 provider（§79 要真 key），
   像素来自本地推演；把它当真 provider 的产物显示就是 §160 禁的那件事。

见证：`packages/video-model/test/render.test.ts` 14 条，全套 video-model 62/62 绿。
变异探针 6 种全部精确红：转场不吃尾段 / 给色卡假运动 / 色卡颜色改随机 /
renderable 忽略总时长 / caption 不截断 / tracking 改成也推拉。
tsc -p packages/video-model 0；改动文件 eslint 0。

**下一步**：`buildFfmpegArgs(plan, inputs)`——把计划翻成可执行的 ffmpeg 命令，
并用真 ffmpeg 渲一条 3 镜的样片，ffprobe 验时长与分辨率（下一片）。

## M5 第二片（#187）：渲染计划 → 真的能跑的 ffmpeg 命令行，并且真的跑出了一条片子

`packages/video-model/src/ffmpeg.ts`：`buildFfmpegArgs(plan, files, {output, fontFile})`
把上一片的计划翻成 argv。**这一层用真 ffmpeg 8.1.1 验过**，不是"看起来对"：

三镜样片（参考帧 1600×900 竖图 + 色卡字幕 + tracking 横摇，转场 fade→cut），
`ffprobe` 实测：`1280x720 / 30fps / h264 / yuv420p / nb_frames=360 / duration=12.000000`，
与 `plan.totalMs = 12000` **一帧不差**。抽帧看过：两张参考帧按 cover 适配铺满、
色卡居中烧字幕（中文字体 msyh.ttc，arial 只有方框——所以字体文件是入参，不是硬编码）。

过程中测试抓到一个真 bug：帧数被当成毫秒传进了 `seconds()`，30 帧写成 `0.001` 秒，
zoompan 于是每 33 毫秒就被输入掐一次，推演停在原处不动。已加 `durationSeconds(frames, fps)`
并把这一格写成钉子（变异探针 E：把 `/fps` 改回 `/1000`，测试精确红）。

四处判断：
1. **参考镜多渲 `transitionInMs` 毫秒**：转场叠在"上一镜尾段 + 本镜开头"这个共享窗口上，
   少给这几帧，`xfade` 会把片尾啃掉一口（成片比时间线短）。
2. **`xfade` 的 offset = 本镜起点 − 转场时长**，正好铺在上一镜尾段上；
   `cut` 边界走 `concat`（不需要两段重叠）。最后一镜的 `transitionOut` 没人接——
   这一点现在写进计划的 `notes`，否则界面上改它不会有任何效果却说不出为什么。
3. **滤镜链转义单独一个函数**：`:` `,` `;` `[` `]` `'` `\` `%` 全是结构字符，
   不转义要么解析失败，要么被悄悄吃掉一段字幕。
4. **不说谎**：计划里有色卡字幕但没给字体文件时，不静默丢——进 `warnings`，
   调用方必须显示。计划说有参考帧却找不到文件时直接抛错，不静默换成色卡。

见证：`packages/video-model/test/ffmpeg.test.ts` 15 条，全套 video-model 77/77 绿。
变异探针 8 种全部精确红：参考镜不多渲头 / xfade offset 用错 /
缺文件时静默跳过 / 缺字体不告警 / 帧数当毫秒 / 完全不去转义 / 摘 renderable 门 /
（E 与 F 各自单独摘都曾失手过——第一版探针只摘了 `\` 一条 replace，其余七条还在，
所以是绿的；改成整函数替换后才红。探针要摘到"这条性质的全部承担者"。）

tsc -p packages/video-model 0；改动文件 eslint 0。

## §52 产物第三条链的补记（#188）：对话的播放语义收回模型层，产物转写跟着改

`packages/game-model/src/story.ts` 新增 `StoryState` / `storyInitial` / `storyStep` / `storySummary`，
与 `sim.step`、`rpgStep` 同形：纯函数、不改传入的 state、同一输入跑出同一结果。
之前播放语义分两处各写一遍——`StoryPlay.tsx` 的 `currentId + path` 数组、产物 `NexusStory` 的
`visited` 布尔表；两处都是"播放器"，却没有一处能被平台页与转写同时引用（§16）。
现在"走过几次"记成计数（`visited: Record<string, number>`）并保留 `trail`，面包屑与"第 N 次走到这里"
都从这两个字段现算，不再各留一份。

两个语义点：

1. **起点开场即算走过一次**（ADR-0046 那个坑的延续）：`storyInitial` 同时写 `visited[startId] = 1`
   与 `trail = [startId]`，绕回起点当步就认得出环，不用绕两圈。
2. **打不中的选择返回同一个 state**，不是拷贝——"点下去没反应"就该真的没反应。

产物转写同步：`NexusStory` 的 `visited` 由布尔改成计数、补 `trail`，空场那句拒绝语从 `story.ts`
的导出插进产物（模板里不再重打一遍）。

见证：`story.test.ts` 新增 8 条（计数与顺序、成环且 loop 不回退、no-op 身份、事件上限、摘要原文、
两次同结果）；`codegen.test.ts` 那条"起点记进 visited"改成计数写法；`scripts/story-engine-proof.mts`
9 条 → 11 条：同一串 5 步（含一次重访与一次打不中）之后，模型与 `NexusStory` 的状态
`JSON.stringify` 逐字段相同、摘要逐字相同。game-model 全量 235/235 绿、tsc 0、eslint 0。
浏览器那一段：`screenshots/story-play-first.png` / `story-play-end.png` 已看过——正文、唯一选项、
空正文说明、结束句与「走过 2 段」都对。

**一条环境记号**：`@smoke §51 类型分派` 这一支一次走八种画法，冷 dev server 上光 RPG 页首帧就等了
123 秒，300s 总预算在最后一张截图前被吃光（trace 里所有断言当时都已通过）。按仓库既有惯例
（§52 Code 那支同因放到 600s）把这一支的预算也调到 600s——**只放宽时间，不动任何断言**。

**仍然欠的**：产物侧是转写，不是 import——`story.ts` 改逻辑而产物不重新生成仍会分叉，
这条限度留在 `CODEGEN_LIMITS` 里。

## §52 产物第三条链的补记（#188 的见证补记）：对话那一段也有浏览器 scripted 见证，且"打不中"的引用契约与模型同形

`scripts/game-code-parity.mts` 原先只有页面级 STORY_* 判决：正文会换、成环会标、plan 不被写死——
但没有**同一串选择在模型与产物两边跑出同一串状态**这一格，那正是 ADR-0046 给产物立的规矩。
现在三条链各有一段 scripted trace 逐字节比：story 那一段 6 步（起点→第二段→起点成环→
两个打不中→再走一圈），两个"打不中"分别是**不存在的 id** 与**别段的选择 id**。

这一步同时抓出一个转写分叉：模型层 `storyStep` 打不中时原样返回**同一个 state**（`story.test.ts`
用 `toBe(state)` 钉住），而产物 `NexusStory` 当时先造了 `next` 再 `return next`——JSON 一样、
引用不一样，页面 `setState` 会多一次无意义重渲染。产物改成检查全部放在构造之前、打不中 `return state`，
与模型同形；`codegen.test.ts` 加一条静态钉子（四个 guard 都返回 state，且 `return next;` 只出现在成功那一步）。

判决从 31 条加到 38 条：新增 `STORY_STATE_TRACE_PARITY`（1208 字节逐字符相同）、
`STORY_SUMMARY_PARITY`、`STORY_NOOP_IS_A_NOOP`（打不中 2 步步数与对象都没动、走通 4 步各 +1 并换新对象）、
`STORY_LOOP_EXERCISED`（重访 d1×3 / d2×2、成环事件 3 条，按 `t` 去重——状态每一步都带整份旧事件，
直接 flatMap 会把 3 条数成 8 条）、`STORY_ENDING_PARITY`（末段没有出边的摘要）、
`STORY_UNPLAYABLE_REFUSAL`（一条对话都没有：`ended` + 同一句 outcome + 点一下返回同一对象）、
`STORY_CONTROL_MUTATED_SCRIPT`（把第一步换成打不中，两边一起变且仍逐字节相同）。

见证读数：`scripts/game-code-parity.mts` 38/38 绿（`PARITY_EXIT=0`）、`scripts/story-engine-proof.mts`
11/11、game-model 全量 236/236、game-model 与 tools 的 tsc 0。**先量旧行为再修**：同一份见证在改转写之前
跑出 38 条里 2 条红（`STORY_NOOP_IS_A_NOOP`、`STORY_UNPLAYABLE_REFUSAL`，其余含逐字节 trace 全绿），
修完才全绿——那两条红就是这次修改的因果凭证，不是补写的断言。

## M5 第三片（#189）：资产链路收下视频字节——只收本服务 ffmpeg 渲染出来的产物

`apps/web/src/server/storage/videos.ts`（新）+ `assets.ts` 的 `uploadVideoAsset`：视频字节
第一次能进资产库。与 `uploadImageAsset` 共用同一条摄取链（magic 嗅探 → 限额 → 去重 → 配额 →
落存储 → 落库），但有两条**刻意不同**：

1. **没有 `source` 参数，写死 `generated`**。视频字节今天只有一个来源：本服务自己跑的 ffmpeg
   （§40-42 的 DEMO 渲染）。用户上传通道对视频保持关闭——mp4/webm 的元数据长在容器结构里、
   摘不掉（见下），收下一颗来路不明的视频等于收下它的 GPS 与设备指纹。将来导入真的需要视频时，
   入口开在领域函数里，不开在调用方那里。
2. **元数据在摄入时复核，不在摄入时剥**。位图那条链是"剥干净再入库"；视频剥不了，所以改成
   "渲染命令里就不写，摄入时按容器结构验一遍"。少了这一遍，"渲染命令忘了配旗"会静默产出一颗
   带着设备信息的成片，还照样进得了资产库。

"干净"按容器分别定义，定义的依据是**"本服务的渲染链能做到多干净"**（拿做不到的标准当门禁，
只会把自家渲染产物拒之门外）：

- mp4：`ilst` 里不许住东西，顶层也不许有 `meta`/`udta`/`uuid` 盒。注意 ffmpeg 的 bitexact 产物
  也会留一个**空的** ilst 盒（实测 8 字节无子项）——那是容器形状，不是内容，所以判的是"非空"。
- webm：matroska muxer 无论如何都会写 `Tags`（实测 `-bitexact` 只能抹掉版本号，去不掉
  ENCODER / DURATION 本身），所以白名单只认这两个 muxer 自己的名字；出现第三个
  （TITLE / GPS / 评论…）就说明这颗字节不是本服务渲染链的产物。

**测试抓到的真 bug（比这片本身更重要）**：`zoompan` 的 `d` 是"**每个输入帧**产出 d 帧"。
#187 用 `-loop 1 -t 1.400` 喂静态图参考帧，实际给出 35 帧输入，zoompan 于是产出 35×42=1470 帧，
整条时间线被输出侧的 `-t` 截断——**成片只剩第一镜**，后两镜一帧未现，而 ffprobe 量时长
还是"对"的（360 帧 / 12.000000s）。#187 那条"抽帧看过三镜"的见证因此是假的，这里一并纠正。
修法：参考帧按**单帧**进（不给 `-loop` / `-stream_loop`、不给输入侧 `-t`），滤镜链前加
`select='eq(n\,0)'` 兜住视频输入。修后重验三镜样片：1280x720 / 30fps / h264 / yuv420p /
nb_frames=360 / duration=12.000000，t=1 第一镜参考图、t=5 第二镜竖图 cover、t=9.5 深色卡 +
居中中文烧字幕，三镜各自在位。

渲染命令因此补三个旗：`-map_metadata -1 -map_chapters -1 -bitexact`。三者各自承重，
都有实测依据：摘 `-map_metadata -1`，参考帧自带的 `comment=GPS: 31.23,121.47` 整段流进成片
ilst（真 ffmpeg 复现，正是 §80 里"位置信息顺着编码器流进成片"的现场——所以渲染器**不信任
上游已经剥干净了**）；摘 `-bitexact`，ffmpeg 自己的 `©too=Lavf…` 品牌标签写进 ilst。

见证：`apps/web/test/video-asset.integration.test.ts` 13 条（真 ffmpeg 渲出真字节再喂摄入门，
干净/带元数据两个方向都测）；`packages/video-model` 79/79 绿；tsc 0、改动文件 eslint 0。
变异探针 14 种全部精确红、逐字节还原：sniff 不看 DocType（mkv 改姓）/ ilst 出现即违规 /
不递归进 moov/udta/meta / 读不懂时假装干净 / webm 白名单全拒 / webm 白名单全放行 /
去体积上限 / 摄入不复核元数据 / 摄入不去重 / 摄入不问配额 / 去 -bitexact / 去 -map_metadata -1 /
参考输入加回 -loop 1 / 去 select 首帧。

**下一步**：把渲染接进服务端——一个"渲染这一条分镜（DEMO）"的作业，产物走这条刚接上的
视频摄入链回填 `shot.videoAssetId`，UI 入口明码标注 DEMO 并把 warnings 显示出来。

## M5 第四片（#191）：渲染接进服务端与界面——分镜真的渲成一条 mp4，DEMO 三个字明码标注

`storyboard-render.ts`（领域函数）+ `POST /api/projects/[projectId]/storyboard/render`（路由）+
`StoryboardPanel` 的「DEMO 渲染整条分镜」按钮。把 #186/#187/#189 三片接成一条完整的链：
`loadStoryboard → planVideoRender → buildFfmpegArgs → runFfmpeg → uploadVideoAsset`，
四道顺序纪律与两条生成链同口径（额度门在 `startTask` 之前、参考帧按 id 取字节走 `openAssetForOwner`、
扣点只在成功收尾、渲染进程有 120s 墙上时钟上限）。

三条**说不说谎**的设计：

1. **DEMO 三个字出现在三处**：按钮标题、结果区的角标、`genMeta.demoMode: true`。
   像素来自本地确定性推演 + 真 ffmpeg——字节是真的、来源是假的，这两件事必须分开说（§160）。
2. **warnings 必须显示**：没有中文字体时 drawtext 烧不出汉字，`buildFfmpegArgs` 会明说
   "字幕没有烧进画面"；路由把 warnings 原样带回，界面渲染出来——没做到的事不许静默（§159）。
3. **成片挂回第一镜**：整条分镜一条片子，走 `applyOps` 的 `updateShot` 补丁挂
   `videoAssetId`（§150），一次渲染 = 一个可撤销事务，不新增补丁形状。

失败码十一种各有各的说法：`no_storyboard / unreadable_storyboard / not_renderable /
reference_unreadable / reference_not_visual / credits_exhausted / storage_exhausted /
invalid_video / ffmpeg_missing / ffmpeg_failed / render_timeout`。路由层与 /images 对齐：
429（额度）/ 413（存储）/ 400（其余）/ 201（成片）。

**测试抓到的两件真事**：

- **免费档每月只发 5 点 video 额度**：快乐路径一次渲染就见底，后面的用例撞上的是额度门
  而不是自己要测的那道门。修法与 image-studio 测试同口径：开跑前兜到 10 点，测完还回去。
- **`node:fs` 的 `readFile`/`writeFile` 在 @types/node 24 里是回调式**，同步版叫
  `readFileSync`/`writeFileSync`：第一版 import 错了，`await readFile(output)` 的类型是 void。
  仓库里 `storage/index.ts` 一贯从 `node:fs/promises` import，就按这个来。

见证：`apps/web/test/storyboard-render.integration.test.ts` 9 条（真 ffmpeg 真渲染，含 ffprobe
验时长 2.4s = 两镜之和）、`storyboard-render-route.integration.test.ts` 5 条（CSRF 403 /
别人项目 404 / 无分镜与空分镜 400 / 快乐路径 201 / 额度 429 且三表行数不变）。
变异探针 6 种全部精确红、逐字节还原：摘额度门 / 参考帧不做归属校验（`openAssetForOwner` →
`openAssetFile`）/ 删参考帧 mime 门 / 删超时 kill / 失败路径不 `finishTask`（任务永远 running）/
扣点提前到 ffmpeg 之前（失败也扣钱）。tsc 0、改动文件 eslint 0。

**下一步**：分镜面板的时间线与资产库之间还差一格——成片挂上之后，资产清单里要能按
"哪条分镜的产物"反查（`genMeta.storyboardId` 已经在了，缺的是列表页的展示与筛选）。

## M5 第五片（#192）：资产清单里的"分镜产物"反查——渲过几版、哪版正挂着

`listStoryboardRenders(projectId)`（领域）+ `GET /api/projects/[projectId]/storyboard/render`（路由）+
面板上的历史清单。判据只有一条：`genMeta.storyboardId` 在。那一格从 #191 起由
`renderStoryboardDemo` 自己写——没有它的 video 资产（直接插库的、别的链路产的）不算
"分镜的产物"，混进来只会让面板指着一条来路不明的片子说"这是你渲染的"。

顺带补上一格**投影缺口**：`assetRowToRef` 的 `generatedBy`（DEMO 角标与"回到那一次任务"
的唯一依据）认 `gen.prompt`，而 #191 的视频 genMeta 里没有这一格——渲染链唯一的产物
在资产面板里因此拿不到 DEMO 角标，看着像"不是生成的"。修法是在 genMeta 里补
`prompt: document.source.prompt`（分镜的来源那句话），不新开字段。

**测试抓到的真行为**：同一份分镜原样再渲一次，成片**逐字节相同**，摄入门按 checksum
去重——"渲过两次"不等于"两行"。注意 `finishTask` 每次都会扣点：钱按次收，资产按内容算，
这两件事分开钉（去重那条用例 + 扣点那条用例各管一头）。改过一个镜头再渲，字节不同了，
才是新的一版——清单两条、新的在前。

见证：`storyboard-render.integration.test.ts` 12 条（新增去重 / 两版排序 / 跨项目隔离 /
plain video 不算产物）、`storyboard-render-route.integration.test.ts` 8 条（GET 的 200 空清单 /
404 / 渲后清单对得上）。变异探针 5 种全部精确红、逐字节还原：列成片不看 storyboardId /
列成片不过项目 / 排序改成旧在前 / GET 路由不验归属 / genMeta 不写 prompt。tsc 0、eslint 0。

**下一步**：时间线预览还差"点时间线上某一格跳到那一镜"；以及 §163 build.status 与分镜
渲染的关系（一次渲染就是一个会完成的构建操作，`build.status` 至今只有导出那一个生产者）。

## M5 第六片（#193）：渲染成为 build.status 的第三个生产者——被拒的请求一条刻度都不留

`renderStoryboardDemo` 往项目频道发 `build.status`（§163）：ffmpeg 起跑前 `building`、
字节进了资产库 `ok`、中间任何一步断了 `failed`。口径与发布链路同一句话：**每一格都挂在
一个真发生了的节点上，中间不插刻度**。

最关键的一条是**不发射的地方**：额度门与"没有分镜"那些拒绝一条事件都没有——渲染从未
开始，就没有"构建中"可言（#191 的额度门在 startTask 之前，被拒的请求一行任务都不落，
也不该在项目频道上留一串假刻度）。`failed` 的 log 与返回给调用方的 message 逐字相同——
两处各写一遍就会漂移，发布链路的用例钉的就是这一条。PublishPanel 本来就订着项目频道，
所以渲染进度从这一刻起出现在同一个读数行里，不用改界面。

见证：`apps/web/test/storyboard-render-build-status.integration.test.ts` 4 条（记账总线 +
项目频道事件串：快乐路径 building→ok 且不发 preview.status / ffmpeg 起不来 building→failed
且 log 与 message 逐字相同 / 额度耗尽与没有分镜各零事件）。变异探针 5 种全部精确红：
不发射 building / 失败不发射 failed / 成功不发射 ok / 额度门之前就发射 building /
failed 的 log 与 message 漂移。tsc 0、eslint 0。

**下一步**：时间线预览与镜头列表的互相定位（点时间线格子找到那一镜、反过来也能跳）——
面板联动，纯界面层，按 §90 的键盘可达要求一起做。

## M5 第七片（#194）：时间线 ↔ 镜头列表互相定位——联动是取景框，不进撤销栈

`timelineBlockWidths` / `shotIndexAtX`（video-model 纯函数）+ StoryboardPanel 的联动：
点条上任意一格，镜头列表滚到并高亮那一镜；点镜头行里的「定位」，条上那一格滚进视野。
读屏各有一句播报（§90）。

两条设计立场：

1. **联动不改模型**。它是投影上的取景框，不是一次编辑——所以没有补丁、不进撤销栈
   （§150 管的是改动，不是查看）。高亮只是 `border-accent-2` 与一个 data 属性。
2. **命中判据用布局后的累计宽度，不用时长线性换算**。短格有 6px 下限（一格 100 毫秒
   在 9 秒的条上只有 2.67px，不抬下限这一镜就"没有"了），线性换算会把点在被抬宽的
   短格上的点击算到邻居身上。下限改的是布局不是数据：`durationMs` 一个字节没动（§16）。
   像素坐标取点击那一刻的 rect——条宽随面板伸缩，拿状态里的旧宽度会对偏。

见证：`packages/video-model/test/timeline-edit.test.ts` 新增 4 条（占比与下限 / 总长 0 不出 NaN /
命中含下限的累计宽度 / 越界夹到两端与空分镜 -1），video-model 全量 83/83 绿；tsc 0、eslint 0。
变异探针 4 种全部精确红：去下限 / 命中改线性换算 / 空分镜返回 0 / 越界不夹。
DOM 联动层（onClick → scrollIntoView）按仓库惯例不进单测（无组件测试设施），
其判定逻辑已在纯函数侧钉死。

**下一步**：M5 收尾两格——① 分镜导出（把整条分镜连同成片打进导出 zip，§105 的
"导出必须能被重新导入"要覆盖视频产物）；② 或 §133 的 generation 档位在 render 链上的
呈现（哪个档位每月能渲几版，页面上看得见）。

## §124 状态层：`states` 从模型走到四个投影，其中只有只读页面会真的自己变（#164-167，2026-10-24）

`DesignNode.states` 从模型建立那天就在，但四处投影里只有生成代码会写 `hover:bg-…`：
画布、预览、发布页都只读 `nodeStyle(node)`，状态补丁被静默丢掉。§16 要求四处同源，
§159 又不许"看着像功能、实际不改变任何行为"——所以按四片补齐：

1. **codegen**：`hover:` / `active:` / `focus:` / `disabled:` / `data-[state=loading|error|success]:`
   变体类；状态是整通道替换，因此"基础态有、状态态没有"的通道要显式发射重置
   （`bg-none`、`bg-transparent`、`border-0`、`border-[transparent]`、`shadow-none`、`blur-none`、
   `backdrop-blur-none`、`text-inherit`）。状态名与变体名的唯一来源是 `states.ts`。
2. **code-parse**：同一张表反向解码；解出的补丁与基础态相同的类按 unmapped 报告（生成侧不会产它），
   源代码里没有的状态直接丢掉（`states: {}`），零字段的分组保留模型原值。
3. **预览 / 发布**：`stateStyleSheetFor` 用同一个 `nodeStyle` 算基础态与状态态、对 `CSSProperties`
   求差，写成 `[data-node-id="…"]:hover { … !important }`——基础样式是内联的，不加 `!important`
   就永远赢不了。没有状态节点时返回空串，页面也不产出 `<style>` 标签。
4. **画布是编辑面，故意不加状态规则**：hover 改外观会和选择、拖拽、手柄互相干扰；
   要看状态就开预览。这条边界写进 ADR-0062。

**未兑现的口径**：`loading` / `error` / `success` 靠 `data-state="…"`，只读页没有运行时驱动去设这个属性，
它们只在导出的代码里有语义；`disabled:` 只对真实 disabled 元素生效，生成的 JSX 目前是 `div`。
只读页上真正自己会变的是 hover / active / focus。

见证：codegen 5 条、code-parse 5 条、render 6 条；`e2e/studio.spec.ts` 的
「§124 状态层在预览与发布页真的生效」走完整回路（代码视图加 `hover:bg-[#123456]` → 回写模型 →
重载后仍在 → 预览页移上指针读计算色 `rgb(18, 52, 86)` → 移开读回基础色 → 发布后访客页再读一遍）。

**下一步**：Properties 面板的状态编辑器（现在唯一入口是代码视图与 AI 补丁）；
`loading` 三种状态要真可见，得先有一个设置 `data-state` 的运行时（试玩/预览驱动），不是再写一段 CSS。


## M5 第八片（#195）：分镜导出与导回——包里多一层 storyboard，导入侧按字节类型分派摄取门

M5 收尾两格的第一格（§105 的"导出必须能被重新导入"要覆盖视频产物）：

- **导出侧**：`ExportPart` 加 `storyboard`；`EXPORT_FORMAT_VERSION` 2 → 3——加 part 必须升版本，
  导入侧按**相等**判版本，不升就是自家导的包被自家拒收。README 两种文案（有 / 没有分镜）
  外加 §160 的 DEMO 声明；`storyboard/storyboard.json` 就是 `loadStoryboard` 那份文档，
  参考帧不重复带字节（按 id 引用 `assets/`，同一个 mp4 进包两遍只是让包变大）。
- **导入侧**：`readManifest` 的 parts 放行 `storyboard`；`versionHint` 补 v2 分支
  （"v2 的包里没有分镜那一层……请重新导出一次（v3）"）；`PackagePlan.storyboard`，
  缺文件 / 坏 JSON / 过不了 `StoryboardSaveRequestSchema` 都整包拒收——包是外部输入，
  "是自家导出的"不免检，与 design 同一口径。
- **摄取门按字节类型分派**：`importProjectZip` 的资产循环先 `sniffVideoMime`，视频字节走
  `uploadVideoAsset`（genMeta 记 `storyboardId` = 源分镜 id / `provider` / `demoMode` /
  `importedFrom`），否则走原 `uploadImageAsset`。**v3 之前视频资产其实进不来**——
  成片被当图片递过去必被拒，"导入成功但成片没了"是个既有洞，这一片补上。
- **分镜写在资产之后**（idMap 齐了才能换号）：`remapStoryboard` 做三件事——引用过 idMap
  换号、不在 idMap 里的引用**删字段不删镜头**（留着就是悬空指针，`saveStoryboard` 的
  firstForeignRef 会整份拒收；为一处断引用丢掉整份分镜不如删掉它并记 note）、
  `characterId` 一律剥掉（导出格式没有角色这一 part，不剥照样被整份拒收——
  那是拿"导入失败"掩盖"角色没随包走"）。`ImportReceipt` 多一个 `storyboardNotes`：
  剥了谁、断了哪条引用、库里新 id 与源 id 对不上是正常的，全部点名（§159）。
- 路由 `QuerySchema` 枚举放行 `storyboard`；`ExportPanel` 多一个勾选；
  `ImportPanel` 回执显示分镜份数与 notes。

见证：`zip-import.test.ts` 27 条（v1/v2 拒收各带版本提示；storyboard 缺文件 / 坏 JSON /
过不了契约三条拒收；正面用例钉住计划里带着分镜）；`export.integration.test.ts` 11 条
（有分镜 `counts.storyboard=1` 且 README 含"分镜"与 DEMO 声明；没有分镜照实写
"这一版没有分镜可导"；版本断言升 3）；新文件 `storyboard-import.integration.test.ts`
2 条真往返（换号 / 剥角色 / 断引用删字段 / 成片走视频摄取门）。五文件合跑 52/52 绿，
tsc 0、eslint 0。变异探针 4 种全部精确红：不按 mime 分派（assets 1≠2）/ 不剥 characterId
（saveStoryboard 拒）/ 不删断引用（firstForeignRef 拒）/ 版本不升（export 版本断言红）。

**下一步**：M5 收尾最后一格——§133 的 generation 档位在 render 链上的呈现；以及
"角色随包走"仍是缺口（导出格式无 character part，当前口径是剥掉并点名，要补得先加 part 再升 v4）。


## M5 第九片（#196）：§133 generation 档位接上 render 链——"本月还可渲几次"与门同源

M5 收尾第二格（也是最后一格）：#191 落成渲染额度门之后，"哪个档位每月能渲几版"
一直只是 credits 页表格上的一列字。这一片把它接到渲染链上：

- `credits.ts` 加纯函数 `videoRenderQuota(plan, videoBalance)`：转述 `PLAN_MONTHLY_GRANTS`
  与 `GENERATION_COST`（每月发几点 / 一次扣几点 / 余额还够几版，向下取整、负余额夹 0）。
  不新算一份成本——展示与门（`refusalForRun`）必须读同一组数，对不上比不展示更糟（§159）。
- `credit-ledger.ts` 加 `renderQuotaFor(userId)`：与 `refusalForRun` 同样先
  `ensureMonthlyGrants` 再读余额。只读入口触发幂等发放，没有第二份真相。
- render 路由 GET 带回 `quota`；StoryboardPanel 在渲染按钮下显示
  "Free 档：每月 5 次成片渲染 · 每次 5 点 · 本月还可渲 N 次"，0 次时按钮置灰
  （服务端本来就会 429，置灰只是不让你白点）。
- **两处随之不再是谎的旧文案**：`ENFORCED_PLAN_AXES` 把 generation 从"表格上的字"
  挪进"有真的拦截方"（#191 的门就是它的拦截方）；credits 页"Video 没有消耗方"
  （#191 起成片渲染每次扣 5 点）与"只有 ai 一类有消耗方"两处照实改。
  e2e 钉的 image 格"今天没有消耗方"不动——变的是 video 那一格。

见证：`credits.test.ts` 新增 `videoRenderQuota` 4 条（整数倍 / 向下取整 / 负余额夹 0 /
逐档转述），axes 两条断言跟着升格；route 集成测试新增 GET quota 用例（关系断言 +
与 `readCredits` 对源 + 连看两次不重复发放）。三文件 40/40 绿，tsc 0、eslint 0。
变异探针 3 种全部精确红：rendersLeft 不除以成本 / 路由不吐 quota / generation 挪回未生效列。

**下一步**：M5 全部收尾。候选：①"角色随包走"（导出格式加 character part 再升 v4，
当前口径是剥掉并点名）；② §133 剩余两格（teamCollaboration / publishing）的拦截方；
③ Studio 画布上 videoAssetId 成片的播放预览（时间线 playable 仍是 false，§160）。


## M5 第十片（#197）：角色随包走——导出加 character part，格式版本升到 v4

#195 留下的明确缺口：分镜的镜头可以挂角色，但导出格式里没有角色那一层，导入侧只能把
`characterId` 一律剥掉。这一片把角色接进包里：

- **导出侧**：`ExportPart` 加 `character`；`EXPORT_FORMAT_VERSION` 3 → 4（加 part 必须升版本，
  导入侧按相等判，不升就是自家包被自家拒）。`character/characters.json` 是角色档案数组；
  `projectId` / `worldId` **不随包走**——导入时角色挂到新项目自己的世界上（§46，与资产换号
  同一规矩）。读不出来的档案不进包，README 点名数量。
- **导入侧**：parts 放行 `character`；`versionHint` 补 v3 分支；`PackagePlan.characters`
  每位过 `CharacterSchema`（缺文件 / 坏 JSON / 不是数组 / 形状不过，都整包拒收）。
  建档两步走：`createProjectCharacter`（只带名字）→ `updateCharacterProfile`（档案整份恢复）。
- **角色档案里的参考图也换号**：`remapCharacterProfile` 把 `visualIdentity.referenceAssetId`
  过 idMap，换不到号就置空（nullable 是契约允许的形状）并记 note——悬空引用才是Bug。
- **分镜的 characterId 从"一律剥掉"变成"过 characterIdMap 换号"**：换不到（没导角色 /
  那位建档失败）才剥掉并点名。`remapStoryboard` 现在是资产与角色两条换号线。
- `ImportReceipt` 加 `counts.character` 与 `characterNotes`（没建档 / 档案没写回去 / 参考图
  置空，全部点名）；路由枚举、ExportPanel 勾选、ImportPanel 回执同步。

见证：`zip-import.test.ts` 33 条（v3 拒收带"重新导出一次（v4）"、character 四种拒收、
正面计划带角色）；`export.integration.test.ts` 13 条（有/无角色两种 README 文案、版本断言升 4）；
`storyboard-import.integration.test.ts` 往返 4 条（v4 happy path 角色换号 + 档案参考图换号、
建档失败剥角色、参考图悬空置空）。五文件 62/62 绿，tsc 0、eslint 0。
变异探针 3 种全部精确红：不建档角色 / 档案参考图不换号 / 版本不升。


## M5 第十一片（#198）：成片播放预览——渲出的 mp4 在面板里直接播，DEMO 三个字照旧

#191 起分镜能真渲出 mp4，但 Studio 里看不了成片：点完「DEMO 渲染整条分镜」只有一个
文字回执，成片字节躺在资产里，界面上没有任何东西能播它。这一片把播放接上：

- `StoryboardPanel` 渲染结果区加 `<video controls preload="metadata">`，src 走
  `apiAssetUrl(assetId)`（`apps/web/src/studio/assets.ts`）——assetId → URL 本来就是投影，
  鉴权路由 `/api/assets/<id>/file` 按嗅探 mime 吐字节，同源带 cookie 直接就能播（§16）。
  没有新写 URL 拼接，也没有摆一个播不出来的假播放器。
- 历史清单每条也各挂一个播放器（同样 `preload="metadata"` 控制成本）：渲过几版就能挨个
  回看，哪版正挂在某一镜上照旧在文本里点名（#192 的反查不动）。
- DEMO 标注一处没撤：按钮、角标、播放器 title 三处都写着"真 ffmpeg 字节、像素是本地
  确定性推演、不是 AI 生成"（§160）——能播了，来源照实。
- 时间线 `playable` 仍只认"每镜都有 videoAssetId"（§40/§41）：DEMO 整条一条片子只挂
  第一镜，多镜分镜 playable 仍是 false——播放预览与 playable 不矛盾，没有为了好看
  去动那个语义。

见证：`e2e/storyboard.spec.ts` 新增真 Chrome 见证（渲染前 0 个播放器 → 渲完结果区 1 个、
src 是 `/api/assets/<uuid>/file` 形状、readyState≥1 即元数据真的从鉴权路由流了回来、
DEMO 角标还在、历史清单每条各一个）。21.4s 通过。
变异探针 2 种全部精确红：src 改坏（toHaveAttribute 红）/ 两个 video 删掉（toHaveCount 红）。
DOM 胶水层按仓库惯例不进 vitest 单测（同 #194 先例），钉子打在 e2e 上。

**下一步**：候选：① §133 剩余两格（teamCollaboration / publishing）的拦截方；
② 渲染完成后时间线自动定位到挂着成片的那一镜（renderNote → focusShot）；
③ e2e storyboard 全量回归（七条一起跑）。


## M5 第十二片（#199）：publishing 档位接上发布链——"同时最多公开发几个项目"从此真的会拦

§133 五格里剩下的 publishing 一格（`PLAN_LIMITS.concurrentPublishes`）此前只是 credits 页
表格上的一列字。这一片给它落了一个真拦截方：

- `credits.ts` 加纯函数 `refusalForPublishSlot(check)`：转述 `PLAN_LIMITS[plan].concurrentPublishes`，
  没满放行、占满拒，拒绝话里带档位/上限/当前数（与 `refusalForStorage` 同一条口径）。
- `credit-ledger.ts` 加 `activePublicationCount(ownerId, excludeProjectId)` 与
  `publishSlotRefusalFor(ownerId, projectId)`。三条口径写进注释：只数 `visibility != 'private'`
  的行（unpublish 切 private 即释放名额）；排除本次发布的项目自己（一条 path 一行，
  换版本是 UPDATE 不占新名额）；软删项目不占（URL 随项目消失，与 storage"软删仍占空间"不同）。
- `publishProject` 在 scan 之后、门禁检查旁边接入：outward 且名额满 → `emitBuildStatus('failed')`
  + 返回 `{ ok: false, reason, gate, scan }`（与相邻被拒分支同一形状，不自创第三种流法）。
  切 private 的下架动作永远放行——挡住架等于逼着页面继续挂公网。
- `ENFORCED_PLAN_AXES` 加入 publishing，`UNENFORCED_PLAN_AXES` 只剩 teamCollaboration；
  credits 页"今天有真的拦截方的只有…三格"改四格并点名发布名额，新增"你的发布名额：已公开 N / M 个"
  实览（与门读同一口径）。
- **测试数据的档位修正**：门一生效，21 个既有集成文件里"同一 owner 反复发布多个项目"的用法
  （free 档上限 1）全部误伤。修法不是松门，是新建 `test/support/test-plan.ts` 的 `raisePlan`
  把这些用例的用户升到 studio 档——它们测的不是档位；名额门本身由 `publish.integration.test.ts`
  新增用例用一个 free 档新用户钉全（第二个项目被拒且话里带数 / 换版本不占名额 / unpublish 释放 /
  private 永远放行 / 被拒项目零行）。

见证：credits.test.ts +4 条（26/26）；publish.integration 9/9；受影响的 21 个集成文件逐个复跑
全绿（api-v1-publish / notifications / account-deletion 三处漏网逐个补上）。tsc 0、eslint 0。
变异探针 3 种全部精确红：门整个禁用 / 去掉"排除本项目"（换版本被误拒）/ 边界 `<` 改 `<=`。

**下一步**：候选：① §133 最后一格 teamCollaboration 的拦截方（需要先有成员/邀请模型，
是比前四格大的一块）；② 渲染完成后时间线自动定位到挂着成片的那一镜；③ e2e storyboard 全量回归。


## M5 第十三片（#200）：渲完成片，镜头列表自己找到挂着它的那一镜

#198 让成片能播之后，还剩一个小缺口：渲染结果区在面板底部，而"成片挂在哪一镜"在
镜头列表的第一行——用户刚点完渲染，界面上没有任何东西告诉他该看哪。这一片补上：

- `renderDemo` 成功后（刷完历史清单之后）`setLinkedShotId(first.id)` + 滚动 + 播报：
  那一镜滚进视野并高亮，读屏听到"成片已挂到第 1 镜，镜头列表已定位到它"。
- **不走 `focusShot()`**：那个函数的播报话是"用户点了定位"的口径，这里是渲染完成的
  副作用，话要说明白是"成片挂在了这一镜"——同一个联动，两种来历，不共用一句播报。
- 同样只动视图状态，不进撤销栈：§150 管的是改动，查看类的定位从来不是事务
  （#194 立的规矩，这里沿用）。

见证：e2e storyboard 播放预览用例追加三断言（linked 计数为 1、linked 的就是渲染前取的
那个 shotId、播报含"成片已挂到第 1 镜"）。真 Chrome 两连跑通过。
变异探针精确红：摘掉 `setLinkedShotId(first.id)` → linked 计数断言红。


## M5 第十四片（#201）：teamCollaboration 档位落库——成员/邀请模型 + §133 五格全有拦截方

§133 五格的最后一格。前三格（aiUsage / storage / generation）与 publishing（#199）都已落门，
这片把"每个项目除 owner 外能拉几个协作者"从表格上的字变成真拦截：

- **库**（迁移 0039，可重入）：`project_members`（既成事实，unique(projectId, userId) 挡
  两个标签页同时接受同一枚邀请）+ `project_invites`（未兑现的承诺，token 是链接 secret，
  pending / accepted / revoked 三态）。owner 自己不是成员行——teamMembers 数的是
  "除 owner 外还能拉几个人"，把 owner 算进去 free 档（1）连自己都装不下。
- **`credits.ts` 纯函数** `refusalForTeamSlot`：转述 `PLAN_LIMITS.teamMembers`，
  没满放行、占满拒，拒绝话带档位/上限/当前数，并点名"撤回/移除释放名额"。
- **`credit-ledger.ts` `teamSlotRefusalFor`**：成员 + pending 邀请**一起数**——
  邀请没兑现也先占住，否则同一邮箱可以刷出任意多封等额度松了再兑现，门就白拦了。
- **`team.ts` 领域层**：invite / accept / revoke / remove / list 五件事，三条纪律：
  只有 owner 能拉人踢人（协作者互相拉人，团队就会自己长大）；**同一邮箱 pending 去重
  必须在名额门之前**（重复邀请同一封不是拉第二个人，先过门会误伤——这条是测试跑出来
  逼出来的顺序）；接受时邮箱必须与邀请相同（链接可转交，"发给谁的邮箱"在库里拦着，
  不靠 secret 猜不到当唯一防线，§159）。
- `ENFORCED_PLAN_AXES` 五格全满，`UNENFORCED_PLAN_AXES` 空数组（空不是漏，是没有还没
  拦截方的格子）；credits 页文案改"五件事全都有真的拦截方"，空列分支照实说。
- schemas 加四份报文：邀请请求 / 成员视图 / 邀请视图 / 名册回执（teamLimit 跟着回执走，
  界面才说得出"3/5"）。token 不进任何回执。

见证：`team.integration.test.ts` 5 条真库用例（接受落库+幂等 / pending 去重 / 名额门+
撤回与移除释放 / owner-only 权限 / 邮箱匹配与 token 失效）；credits.test.ts +4 条
（31/31 合跑绿）。tsc 0、eslint 0。
变异探针 3 种全部精确红：pending 不计数（③ 红）/ 摘 owner 检查（④ 红）/ 摘邮箱匹配（⑤ 红）。

**下一步**：① 成员/邀请的 API 路由与 Studio 界面（名册面板、邀请链接接受页）；
② e2e 见证邀请→接受全链路；③ e2e storyboard 全量回归。


## M5 第十五片（#202）：成员/邀请的 API 路由——转发的全部艺术是不重写

#201 落好了领域层，这片把五条路由接上，全部是 team.ts 的转发（§74：路由里另起一套
"先判归属再过门"的顺序，就是那条教训在发布上重演）：

- `GET /api/projects/<id>/members`：名册（成员 + 邀请 + teamLimit）。owner 与协作者都能看
  （team.ts 的 `projectVisibleTo`：被拉进一个项目的最低语义是看得见同伴），陌生人 404。
  `teamLimit` 跟着回执走——界面要说得清"3/5"，不能只罗列人名。token 不进任何回执。
- `POST .../members/invite` / `.../members/remove` / `.../invites/<inviteId>/revoke`：
  CSRF → requireUser → team.ts。被拒时错误码分得清：不在名下 404（与 characters 路由
  同一口径，不泄露存在性），名额满 400 `invite_rejected`（话里带数字）。
- `POST /api/projects/invites/<token>/accept`：按**当前登录用户**接受——token 证明
  "这枚邀请是真的"，用户的邮箱证明"这封是发给我的"，缺一不可（team.ts 里校）。
- schemas 补 `ApiMemberRemoveRequestSchema`（报文只传递"移除谁"，归属在域层判）。

见证：`team-routes.integration.test.ts` 6 条（roster 三方可见性 + token 不回显 / 名额门
经路由生效 / 非 owner 写 404 / remove 与名额释放 / revoke 与重复撤回 404 / accept 的
邮箱与 token 两道校验）。`route-security-gate` 结构门 5/5（新路由全部 csrfOk + requireUser）。
tsc 0、eslint 0。

**下一步**：① TeamPanel 界面（名册 + 邀请表单 + 邀请链接）+ StudioShell 加 tab；
② e2e 见证邀请→接受全链路；③ e2e storyboard 全量回归。


## M5 第十六片（#203）：TeamPanel + 邀请接受页——§133 团队协作的界面落地

#201/#202 把领域层与路由都落好了，这片是同一件事的最后一厘米：浏览器里真能走完
"owner 发邀请 → 协作者接受 → 名册多一个人"。

- `TeamPanel`（Studio 新 tab「团队」）：名册（成员 + 邀请 + teamLimit 三数齐全，
  界面说得出"已占 1 / 1"）、邀请表单、**一次性链接展示区**（`data-team-fresh-link`）。
  链接旁边明写"本机没有发信服务，链接由你转交"——不假装有邮件（§160）。
- `InviteResult.token` 只在**新建这一下**返回（#202 漏接的这段补上）：roster 永远不给它，
  去重命中也不给。前端的展示纪律跟着这条走——刷新页面链接就没了，要链接只能撤回再邀。
- `/invites/[token]` 落地页：未登录只说"先去登录再打开这条链接"（accept 按当前用户校邮箱）；
  已登录给接受按钮，被拒的话原样显示服务端的原因，不猜不重试。
- `StudioShell` 加 `team` tab；满员时邀请按钮照旧能点——服务端会拒，界面先说清为什么
  （§159：展示与门不许对不上）。

见证：`team.integration.test.ts` 契约随演进更新（新邀回执带 token 且与库中一致 / 去重不返
token / 名册 JSON 不含 token），11/11 与 team-routes 合跑绿；e2e `team.spec.ts` 真 Chrome
全链路通过（owner 发邀 → 满员拒绝话术 → 换 editor 登录接受 → 回 owner 视角名册+1，
32.9s）。变异探针 2 种精确红：摘新邀分支 token（① 红）/ 去重分支加 token（② 红）。
顺带修了两个环境坑：e2e 的 dev server 库 `nexus` 补打迁移 0039（两个库都要打，
ENVIRONMENT.md 的规矩）；playwright webServer 超时 120s→180s、用例 300s→360s
（冷编译偶发超时）。

**下一步**：① e2e storyboard 全量回归（七条一起跑）；② 协作者进得了其它面板
（design/assets 的 projectBelongsTo 目前只认 owner，可扩 projectVisibleTo）；
③ editor/viewer 的实质读写差别（目前只是档案标签，§160 已明码标注）。


## M5 第十七片（#204）：storyboard e2e 全量回归——揪出两个真 bug：双击裁切在界面上根本完不成

#198/#200 之后这套 e2e 只单跑过播放预览那一条，整组没跑过。整组一跑，红两条，
而且两条都不是测试的错，是产品真的坏了：

- **片段级裁切：双击永远切不成两镜**。根因不在坐标竞态，在结构：`locateFromStrip`
  （点条上任意一格 → 把那一镜滚进视野）和双击裁切共用**同一个滚动容器**——双击的
  第一击触发定位滚动，把时间线条自己推走了，第二击落空，`dblclick` 事件根本不合成。
  事件流里看得清清楚楚：只有一轮 click，没有 dblclick。只要条在折叠线下方（#191/#198
  把渲染区插进镜头列表和时间线之间之后它就在），这个交互在界面上就是死的。
- **修法（产品侧）**：时间线的交互面（标题 + 可播性 + 条 + 拖动读数 + 读屏播报）钉成
  面板底部常驻（`shrink-0`），说明文字/轨道/blockers 留在上面的滚动区。点条定位镜头时
  滚的是镜头列表，条不动了——双击的两击都落在同一块上。顺带这是更像视频编辑器的布局：
  时间线不再埋在三张卡片加一整段渲染区下面。
- **切句成镜：最后一镜的删除钮 toBeInViewport 红**。这条断言的字面契约（注释里写着）
  是"按钮不被面板那 264px 裁坏"——横向。#194 给每卡加了「定位」钮，卡片从三个包装行
  变四个，三镜时最后一镜的按钮跌到折叠线下 13px。竖直方向本来就不是这条断言管的事：
  镜头列表是滚动区，滚一下就到。把断言收敛到它的字面意图（按钮左右不出面板左右），
  并在注释里写清为什么不再要求两个方向都在视口里。
- **dblclickBlock 助手改走 `locator.dblclick({ position })`**：原来手量视口坐标再
  `page.mouse.dblclick`，布局在两次点击之间动一下（点名/配额段异步落库、第一击触发
  定位滚动）坐标就对偏了。locator 的点击自带行动性检查（可见、稳定、命中本元素），
  位移发生时会等它稳下来——这才是 Playwright 里点东西的标准方式。

见证：`e2e/storyboard.spec.ts` 整组 8/8 绿（1.6m；此前 6/8）。tsc 0、eslint 0。
变异探针 2 种全部精确红：把时间线 section 搬回滚动区 → 裁切用例立刻回到"切不成"
（证明钉住是承载性修复）；摘掉卡片的 `flex-wrap` → 删除钮右缘 685 ≫ 面板右缘 308，
新断言精确红（证明收敛后的断言仍抓着横向裁切）。两种探针均逐字节还原（sha256 25bde39a0b9e）。

**环境坑（重要，会反复遇到）**：`POST /api/projects` 的限流是 **dev server 进程内的内存态**
（`security/rateLimit.ts`，按 IP 计数）。连续几十次建项目之后它会 429，e2e 全部卡在
`waitForURL` 上每条耗到超时——症状是"整组突然慢如蜗牛"而不是"明确失败"。
**解法：杀掉 3100 上的 dev server 再重跑**（playwright 的 `reuseExistingServer` 会接新起的），
限流状态随进程清空。判据：dev log 里出现 `POST /api/projects 429` 就是撞限流了。

**下一步**：① 协作者进得了其它面板（design/assets 等路由的 projectBelongsTo 只认 owner，
可扩 `projectVisibleTo`）；② editor/viewer 的实质读写差别；③ v1 API 的 team 端点。


## M5 第十八片（#205）：协作者可见性贯通——读路径放名册成员，写路径仍 owner-only

#201-#203 把团队功能立了起来（成员/邀请/名册/接受页），但成员进了项目**只能看到名册**：
其余 30+ 条路由的 `projectBelongsTo` 只认 owner，协作者点不开项目本身。本片把**读路径**
的归属判定换成 team.ts 里已有的 `projectVisibleTo`（owner 或名册成员），写路径一律不动
（留给 #206 的 editor/viewer 角色门禁）。

- **28 处读判定换门**：4 个面板页（studio/world/game/preview）+ 19 条 GET 路由
  （project/assets/context/export/snapshots/world/game/storyboard/publish/characters/
  knowledge/memories/agent/annotations/variants/retrieve/knowledge-search/visual-dna/
  knowledge-block GET）+ retrieve 与 knowledge/search 两个语义上是读的 POST +
  5 个领域读函数（assetProjectId / apiProjectDetail / apiDesignDocument /
  projectGameCode / buildProjectExport / assembleAiRequest）。
- **写路径保持 owner-only**：所有 POST/PUT/PATCH/DELETE 变更路由（design、assets 上传、
  publish、snapshots、branches、memories、annotations、characters、agent、images 等）
  仍走 `projectBelongsTo`。#206 再按 editor/viewer 给写操作分角色。
- **踩到并修掉一个真回归**：`projectBelongsTo` 进门第一件事是 `isUuid` 形状门，
  `projectVisibleTo` 走的 `ownerOf` 没有——非 UUID 的 projectId 直接进 `eq()` 撞 22P02，
  404 变 500。id-shape.integration.test.ts 三条精确抓住。修法：`ownerOf` 补同一道形状门
  （与 projects.ts:485/503 同族函数同一写法）。
- **视觉 dna / knowledge search 的判定**：visual-dna POST 只算不写（写入走客户端
  setVisualDna 事务，那边是 owner 门），knowledge/search 与 retrieve POST 只读语料，
  都按"读"放行；knowledge/block 的 POST（Agent 组装用）同样只读，一并放行。
  GET 变体对"块不存在"如实回 404 block_not_found，与"人不该看"的 404 不是一回事。

见证：新增 `apps/web/test/collaborator-visibility.integration.test.ts` 3 例（成员四条读路
径 200/陌生人 404；成员 POST memories 404 而 owner 201；owner 读路径回归护栏），打真
Postgres（nexus_regress）。靶向回归 32 个集成测试文件 376 例：373 过 + id-shape 3 红
（即上述回归，修复后 63/63 全绿）。变异探针 2 种精确红：assets GET 门换回
projectBelongsTo → 成员读立刻 404；摘 ownerOf 形状门 → id-shape 回 500。均逐字节还原。

**下一步**：① editor/viewer 的实质读写差别（#206：协作者按角色门禁写操作）；
② v1 API 的 team 端点（#207）；③ 并行会话丢失的 ADR-0062 状态层投影四片可接手重做。


## M5 第十九片（#206）：editor/viewer 的实质读写差别——写路径三态门，role 不再是档案标签

#201-#205 之后协作者能读项目了，但**所有写路径仍然只认 owner**：邀请时选的
editor/viewer 只是名册上的一个字符串（§160 早就明码标注"未接"）。本片把 role 接进写门。

- **team.ts 新增 `projectWriteAccess(projectId, userId)`**：三态 `'ok' | 'read_only' |
  'not_found'`。owner 与 editor → ok；viewer → read_only；陌生人/不存在 → not_found。
  为什么不是布尔：viewer 是名册上的人，给他 404"项目不存在"是假话；陌生人必须继续
  404（不泄露项目存在性，与全站同一口径）。形状门复用 ownerOf 的 isUuid（#205 的教训）。
- **25 条写路由换门**：`not_found` → notFound()（原行为）；`read_only` →
  `jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；
  写入权限在 owner 与 editor 手里' })`。覆盖 design/assets/storyboard/world/game/
  characters/knowledge/memories/annotations/variants/branches/publish/agent/images/
  duplicate/snapshots 全家。
- **5 个领域层写函数同源换门**：annotations 的 add/delete/setResolved（add 的拒绝话
  说清"查看者只读，不能加批注"；AnnotationResolveResult 的 reason 联合加 `read_only`）、
  deleteAsset、apiPatchDesign（v1 API 保持 404 一律的约，但审计 reason 区分
  read_only_role 与 not_owner——"谁试过写别人的项目"这张表要能回答）。
- 团队管理（邀请/撤回/移除）仍 owner-only，不动（§133：协作者之间不能互相拉人）。

见证：collaborator-visibility.integration.test.ts 扩到 7 例——viewer 读 200 / 写 403
read_only_role（不是 404）、editor 写 201、陌生人写 404、owner 护栏。#205 的旧 ②
（"写路径仍 owner-only"）随本片改约为"editor 可写、陌生人 404"——那是 #205 时代的
临时契约，本片就是来兑现它的。靶向回归 36 文件 406 例全绿。变异探针 2 种精确红：
projectWriteAccess 摘角色判定 → viewer 写变 201；memories POST 门换回 owner-only →
editor 404、viewer 403 变 404。均逐字节还原（bda62ccde72e / 07948d067aa9）。

**下一步**：① v1 API 的 team 端点（#207）；② ADR-0062 状态层投影四片（并行会话丢失，
可接手重做）；③ 协作者通知/邀请过期等团队体验边角。


## M5 第二十片（#207）：v1 API 的 team 端点——名册读端点 + team:read 一格

§188 的公开 API 到 #206 为止只有项目/设计/发布四口，团队功能（#201-#203）一点没露出去。
本片补上最保守也最有用的一格：**名册只读端点**。

- **迁移 0040**：`api_tokens_scopes_known` CHECK 加 `team:read`（形状同 0019/0027/0028：
  text[] + CHECK，不重建 pg enum）。两个库都打（regress 供集成测试、nexus 供 e2e）。
- **schemas**：`API_TOKEN_SCOPES` 加 `team:read`；`ApiTokensPanel` 的 SCOPE_LABELS
  同步补文案（Record<ApiTokenScope, string> 逼着补，漏一个 tsc 就红）。
- **域函数 `apiTeamRoster`**：与界面名册路由**同一套装配**（listMembers/listInvites/
  teamMemberLimit，§74 不在路由里重写第二遍）；owner 与协作者读得着（projectVisibleTo），
  外人 null → 路由 404 project_not_found（v1 各端点同一句"不存在"）。邀请 token 是
  secret，回执里不出现。
- **路由 `GET /api/v1/projects/[projectId]/members`**：authorizeApiRequest('team:read')
  → apiTeamRoster → schema 校验 → recordApiAccess → apiJson。没有 POST：邀请/撤回/移除
  是 owner 的管理动作，公网凭据背后没有人可批（§133）。
- **静态三方一致测试自动把关**：api-tokens.test.ts 的"常量 / 迁移里生效的 CHECK /
  v1 端点真的执行它"三处比对——加 scope 不加端点会红，加端点不加 scope 也会红；
  端点名从文件位置推导，手抄的第四份名单同步更新。

见证：新增 `api-v1-team.integration.test.ts` 5 例（owner 读到名册且无 token 泄漏、协作者
凭据也读得着、外人 404、无 team:read 凭据 403、访问账留行 + 非 UUID 404）；id-shape 补
一条 v1 members 的 not-a-uuid 探针（不打 500 不变式）。api-tokens.test.ts 24 例全绿。
变异探针 2 种精确红：apiTeamRoster 改回 owner-only → 协作者读 404；摘 recordApiAccess
→ 账目断言红。均逐字节还原（2bee4e55ec35 / b38d085351b8）。

**下一步**：① ADR-0062 状态层投影四片（并行会话丢失，设计文档幸存，可接手重做）；
② 协作者通知/邀请过期等团队体验边角；③ e2e 覆盖协作者跨面板读（浏览器见证）。
