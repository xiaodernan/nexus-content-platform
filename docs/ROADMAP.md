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
  仍欠：界面上的提交入口、Redis 后端跨实例（今天默认内存）、embedding/RAG、图像/视频 provider
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
- [ ] Nexus Image Studio（text→image / image→image / sketch→image / reference→variation / character→scene）
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
- [ ] 角色一致性生成（§39）

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
  见下方进度记录；§47 的"跟角色说话"要真 provider，没接之前不做假对话。
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
  仍欠：`talk`（§47 角色对话要 provider，界面上写死了"不放假聊天"）、地形/碰撞/寻路、
  3D 资产与贴图（§34 的 model 类资产还没接进场景）。条目名字已经用 DOM 投影标签解决（没引 drei）
- [~] Game Studio：2D / 2.5D / 3D / Interactive Story / RPG 原型 / Puzzle / Visual Novel（§51）
  — **2026-09-25 第一片（2D 可玩）落地**：`packages/game-model` 新增 `play.ts`（编译关卡计划）与
  `sim.ts`（纯函数模拟器），`/game/<项目>` 用 canvas 把它跑起来，Studio 的「游戏」面板上有「试玩这份设计 →」。
  **这一片守的是 §16：试玩读的就是那份 §54 文档，没有第二份"关卡文件"**——改完数值回这一页刷新，
  跑起来的东西跟着变（e2e 就钉这条：把敌人 `health` 从 10 改成 999，同一套按键就打不死了）。
  八种类型里 2D 与「互动故事 / 视觉小说」这三种有构建管线，其余五种只有清单没有投影，
  界面上照实这么说（§51 要的是"至少支持"，今天支持三种就写三种）。
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
  没接的那五种给出原因，不给空场子、也不拿 2D 关卡顶上。Studio「游戏」面板的类型下拉
  把 `GAME_KIND_STATUS.note` 原样显示，所以"面板说能玩、点进去没得玩"这两句话不可能同时出现。
  测试：`story.test.ts`（10 条，含一条拿状态表当准绳的分派对齐）、`game-contract.test.ts`（+4 条，
  含"kind 会被未知键剥掉"那次的反向对照与老文档缺省）、`game-publish.integration.test.ts`（+1 条
  往返：存 interactive-story → 钉住那份读出来还是它 → 分派出 story）、
  `@smoke §51 类型分派`（真浏览器里换类型 → 对话播放器 → 点选项跳到空正文那段 → 改成 3D 后同一页
  照实说"还没接"，三张截图核对过长相）。
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
  **仍欠**：§53 的 Capture screenshots / Fix 两格（要接浏览器与模型）、§52 那条
  Game Design → Combat → Level → … → Code 的编排链。
  前置条件已经好了：`sim.ts` 是无头、定步长、可复现的（同一份计划 + 同一段输入 = 同一个状态，有测试钉住）。
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
  **仍欠**：§52 Game Agent 与 §53 Playtest Agent 的编排、§51 其余五种类型的构建管线、
  地形与碰撞、`talk`（§47 要 provider）——所以是 `[~]` 不是 `[x]`。
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
- **仍欠**：`referenceGraph` 的画布视图（模型层投影已经有了，UI 还没画）、§52/§53 的 Agent 编排、
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
- **§54 现在欠的**：§52/§53 的 Game Agent 与 Playtest 编排、§51 其余五种类型的构建管线
  ——这两样都要真 provider 或真运行时，不在面板里塞假按钮。（"引擎类型选择"本身已经在
  2026-09-26 接上：类型是文档字段，两个试玩页共用 `compileForKind` 分派。）

## M5 — 视频（§185）
- [ ] Video Studio（text/image/storyboard→video）
- [ ] Storyboard → Shot list → 参考图 → 生成 → Timeline（§40-42）
- [ ] Timeline 编辑：trim / reorder / regenerate shot / extend / transition（§41）

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
  子串匹配对中英文一视同仁——代价是没有相关度打分，组内按更新时间排，这点不装、写在页面上。

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
  仍欠：带真实图片资产的封面只在单测里覆盖谓词，浏览器里那一张还是空清单；
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

  仍欠：按天曲线（数据已经按天存，缺的只是图）；爬虫与真人不区分（现在只有一句"含爬虫"）；
  游戏与互动作品的 completion 需要"玩到哪儿"的运行时事件，要等 §50-§53，现在那一列对它们是未采集；
  **取消发布会把这一版的统计一起删掉**——`unpublishProject` 删 `published_projects` 行，
  `publication_visits` 跟着 `ON DELETE CASCADE`（`views` 本来就是这个行为，新表继承了它），
  要留历史得把粒度改成挂 project_id 或让下架只改 visibility；没有导出；没有跨作品的汇总视图。
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
  仍欠：没有邮件 / Webpush；没有每人 NotificationSettings（§164 只点名了"看到"，没点名"可配置"，
  默认全开是今天的口径）；没有分页（一页 50 条，超了在页面上写总数）。
  `projects.deletedAt` 那条谓词以前是防御性的（全库没有软删写入方），2026-09-26 §74 补上写入方之后它才真的可测：
  §74 的集成用例里删掉项目，指向它的那条历史通知**行还在**（那是作者的事件历史），但链接收走、
  理由写明"项目已经不存在"，恢复后又原样能点开——不需要重发一条。
- [~] 画布批注（§111）— **2026-09-24 落地**：点中元素 → 写一句话钉在它上面（`comments.node_id`，
  不另起一张表）。定位由服务端按文档算（页面、元素名），节点被删后批注仍列得出并标明悬空；
  随 AI 请求上线走 §68 那条路（客户端上传 `annotations` 一律 400，超出 20 条与悬空都写进
  `annotationsNote`），提示词里写清"批注回答该动哪个元素，不是要照抄进设计的文案"。
  还没做：`@Agent` 提及解析、批注的已解决状态、回复线程（`parent_id` 还没有写它的地方）。
  **后两样不是欠账而是没写进需求**：2026-09-25 回看 §111 原文，它要的只有"点元素 → 写评论 → Agent 自动定位"，
  三样都已落地；回复线程与 resolved 状态是产品直觉，不是需求，不自动开工（要做得先有人提）。
  `@Agent` 提及解析才是真欠的那一条，它挂在 §112/§113 的多 Agent 那条链上 ——
  **2026-09-26 已接上**（见 M6 的"Agent 名册有写入方"那一条）：批注正文里的 `@xxx` 现在是解析的第三来源
  （排在请求提名与提示词提及之后），并且它读的是同一名册、同一道门；不是给批注单独写一套匹配。
  验证：`annotations.integration.test.ts` 8 条 + 一条画布 e2e（含刷新后仍在、以及
  "浮层挡住画布点击"这条反向实验——去掉 stopPropagation 那条断言立刻红）
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
- [ ] **Java Spring Boot 领域服务在此落地**（用户/项目/社区/权限/计费的权威写入方）

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
- [ ] Marketplace（组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色）
- [~] Credits 与订阅（Free/Pro/Creator/Studio/Enterprise），消费透明（§133-134）
  —— 第一片已落地（账本 + 一类消费 + 一格拦截，见文末"§133/§134 第一片"）；
  欠的是 image/video/compute 三类的消耗方、另四格上限的执行方、改档位的入口

## M8 — 开放能力（§188）
- [ ] MCP、外部 Agent、公开 API

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
  `awaiting_approval` 的行**没有过期与清理**，没人决定就一直等着（界面上常驻可见，但库侧无 TTL）；
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
  仍欠的两笔如实记下：① Code Index 的**后半截**——"按 path 取正文"的通道还没有，Agent 知道有哪份文件、里面有什么符号，
  读不到实现；这条在面板的 `unavailable` 列表里，e2e 有断言，不会因为目录做完就被划掉。
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
  与 `security/rateLimit.ts` 同一口径：**多实例下收不到别的实例的事件**，接 Redis pub/sub 时换驱动、生产者不动）。
  一条连接覆盖用户频道（通知）与项目频道（进度），带 `?projectId=` 时校验归属（不是你的项目一律 404）、
  每账号同时最多 8 条连接（每条都握着订阅与心跳定时器，开多少条不能由客户端说了算）、写请求一律 405。
  **今天真的有生产者的有四类**：`generation.progress`（任务开始推 0、终态推 1，失败也推——
  界面上那句"正在生成"要能自己停下来）、`notification`（真的新写了一条才推，duplicate/suppressed 不推）、
  以及 §162 的 web 侧消费者上线后的 `agent.step` / `agent.activity`（异步作业的活动按游标推，推过的不推第二遍）。
  仍欠：`build.status` / `preview.status` / `agent.plan` 三种事件**还没有生产者**
  （它们要的是"会分步完成的构建/多步 Agent 作业"，与 §112 的编排是同一件事）；
  断线期间的事件不补发（没有 `Last-Event-ID`），所以实时只当加速器、权威状态一律读库——这条限度写在 ADR 后果第 4 条，
  UI 上断开时显示"以刷新后的数据为准"而不是假装还在实时。
  顺带修掉一处会污染终态的假象：provider 带 `error` 返回 HTTP 200（DEMO Mock 遇到没实现的指令就是这样）
  以前会记成 `succeeded` + "生成完成"，现在账本、通知、实时进度三处都按 `error` 判失败。
  验证：`realtime.test.ts` 12 条纯单测（总线不跨频道泄漏、订阅者抛异常不连累别人、退订幂等、连接上限与归零）；
  `realtime.integration.test.ts` 10 条打真库（该发的发了、duplicate 不发、suppressed 不发、无项目的任务不发、
  收尾不存在的任务不发）；`@smoke §163` 在真浏览器里跑两个身份：作者停在首页**不 reload**，
  访客点赞后铃铛从 1 变 2，且这期间收件箱接口只被请求了一次（数请求条数，不是数"数对不对"——轮询也能让数变对）；
  Studio 里跑一次真 AI 请求，进度行由事件流自己推出来（成功那条写"完成"，Mock 不认的那条写"失败：provider-unavailable"），
  别人的项目频道拿 404、匿名拿 401、POST 拿 405（截图 `realtime-bell.png` / `realtime-studio*.png`）。
- [~] 通知中心（§164）— 收件箱与真事件已在上面 M6 那条落地；原文点名四类，今天**还差两类**
  （Build complete / Agent task complete）。Generation complete 已在下面单独落地（2026-09-25）。
  以前这里写着"等 §162 的队列消费者落地时一起补"——那句话现在要改口：消费者已经落地（2026-09-26），
  这两类**仍然没有来源**，而且理由变了。一个异步作业还是一次 provider 调用，worker 不会执行 plan 里的子任务，
  所以"Agent task complete"要的 §112 编排还没有；"Build complete"要的是会完成的构建操作（今天没有导出/打包端点）。
  留在单子上的不是"还没排上期"，是"要做的那件事本身还没有"。
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
  仍欠：取消 / 重试（`attempt` 列还没有第二次的写入方）；审批流当时记的是"`requires_approval` 全库无人置真"，
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
  `awaiting_approval` 的行仍然没有 TTL；跨实例游标仍靠 Redis 后端（未做）；真 worker 端到端仍欠。
  验证：`ai-jobs.integration.test.ts` 17 条（新增 6 条打真库：remove 挂起 + 通知零条 + 库里那一份完整、
  反向对照同一份报文换个非破坏 op 就一路到底、批准后报文里 op 回来了、放弃后什么都不回来、
  同一次挂起被问两次给的是同一份 `delivered`、文档里查不到的 id 理由退回那个 id 而照样拦）。
  两次行为性变异：把 `settle` 里那个 if 关掉 → **5 条红 1 条绿**，而那条绿正是反向对照（它本来就不该红）；
  把等待中交回的 `delivered` 换成 `held`（= 把补丁漏给还没批准的客户端）→ 2 条红。
  e2e `@smoke §162 异步作业入口` 在真浏览器里 1 条通过（4.9 分钟，慢的是 dev 模式首次编译那两条路由，
  不是断言在等）：截图 `screenshots/ai-async-refused.png` 上勾着"异步作业"、红字是服务端那句 409 原文、
  右侧仍是「1440 × 900 · 8 个节点」——**没有多出一条"在跑的作业"，也没有审批卡**。
  `npm run test:ai-service` 56 passed + 1 skipped（那道跨语言的 `DESTRUCTIVE_OPS` 比对读的是 web 源码，
  这次动了 `approvals.ts` 所以必须重跑）。下面那片接上名册之后，同一个命令是 62 passed + 1 skipped。
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
  按天曲线、爬虫与真人区分、游戏侧 completion 事件这三件仍是 §168 记着的欠账，这一片没有替它们说话；
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
  `states`、`bindings` 都还没实现——渲染层也没有，所以两边一致地缺失，不是生成器单独偷懒。
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
    下一步就是把它分清——**空闲机器上重跑同一档**，这条比继续加新功能值钱，所以排在 #63 之后立刻做（#62 剩下的就是它）。
  - **内存那一项还是只有数没有门**（148MB 这句不说达标）：§146 只写"度量并记录"，没写上限，
    所以这一项的缺口是"没有标准"，不是"数字太大"。
  - §147 因此仍是 `[~]`，但**下一刀的位置现在有数了**：不是画布（三档都裁在 34 个 DOM），
    而是"一次属性写入到画布重绘"那 239–477ms 里的主体——`applyPatch` 的整份文档克隆仍在（`docs/PERFORMANCE.md` 第一条欠账），
    以及选中响应这个连小文档都不过的 30ms 到底花在哪。


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
  #62/#42 那一刀（`applyPatch` 结构共享 + 增量保存）仍然是 §147 的活，本条不替它销账。
- **测试纪律又补了一条**（写在 `docs/TESTING.md`）：这一节的头三条用例全在单页上摆数字，
  所以"退回单页语义"这种改法它们一律看不见——第四条（三页各不超上限、总数超上限必须拒）
  是三颗变异探针里唯一能看见"求和没了"的那条。**改门的语义必须同时有一条跨页的用例**，
  不然绿灯守的还是旧语义。

下一步顺序不变：#62 剩下的"空闲机器重跑同一档"（分清选中响应那 30ms 是机器忙还是代码慢）→
属性写入那一刀。#63 到此关掉。


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

- storage / generation / team collaboration / publishing 那四格上限只是页面上的数字，没有代码按它拒绝任何请求。
- Image / Video / Compute 三类只有发放方、没有消耗方（要等 §38 图像、§40 视频那条路）。
- 改档位没有界面：`UPDATE users SET plan` 是服务端代码里的事。
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
