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
- [~] AI Service 任务队列 / 异步生成作业（§162 Redis 后端已落地，见进度记录第五段）；embedding/RAG、图像/视频 provider 仍未接
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
- [ ] Game Studio：2D / 2.5D / 3D / Interactive Story / RPG 原型 / Puzzle / Visual Novel（§51）
- [ ] Game Agent + Playtest Agent（§52-53）
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
  **仍欠**：§52 Game Agent 与 §53 Playtest Agent 的编排、§51 的类型选择与 §50 的构建管线
  ——所以是 `[~]` 不是 `[x]`。

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
  §50/§51 的构建管线与类型选择。

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
- **§54 现在欠的**：§52/§53 的 Game Agent 与 Playtest 编排、§50/§51 的构建管线与引擎类型选择
  ——这三样都要真 provider 或真运行时，不在面板里塞假按钮。

## M5 — 视频（§185）
- [ ] Video Studio（text/image/storyboard→video）
- [ ] Storyboard → Shot list → 参考图 → 生成 → Timeline（§40-42）
- [ ] Timeline 编辑：trim / reorder / regenerate shot / extend / transition（§41）

## M6 — 社区（§186）
- [~] 社区与发现（§59 / §61）— **2026-09-24 第一片落地**：公开作品页上有 Like / Comment / Follow / Remix / Share
  （`apps/web/src/server/domain/social.ts`，路由 `/api/published/interact`、
  `/api/follow`、`/api/discover`），发现页 `/discover` 三个排得出来的标签（最新 / 最多人看与赞 / 我关注的作者）。
  三条写进代码与界面的边界：**评论走发布机检同一份红线词表**（命中就不发出去，不"先发再等人看"）；
  **Remix 分叉的是发布出去的那一版快照**，作者工作区里没公开的改动不会跟着出去（§58，测试专门钉这条）；
  **Trending 与 AI Picks 排不出来就写在页面上**（前者要互动时间序列、我们只有累计数；后者要模型），
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
  仍欠：头像上传（users.avatar_url 还没有写它的地方）、
  Trending / AI Picks、§132 的 block / mute。§168 Analytics 已在下面单独落地——主页上那几个数仍然只是浏览量，
  真正的六个数在 `/analytics`
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
  仍欠：`projects.description` **全库没有写入方**（也没有项目元信息编辑入口），所以 og:description
  现在稳定走第二级摘要，这个入口补上才算收口；`projects.deletedAt` 同样只有读没有写（软删链路没落地），
  sitemap 那条谓词目前是防御性的；带真实图片资产的封面只在单测里覆盖谓词，浏览器里那一张还是空清单；
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
  仍欠：没有实时推送（铃铛在挂载时取一次，靠刷新拿新数；§163 的进度流接上后一起改）；
  没有邮件 / Webpush；没有每人 NotificationSettings（§164 只点名了"看到"，没点名"可配置"，
  默认全开是今天的口径）；没有分页（一页 50 条，超了在页面上写总数）；
  `projects.deletedAt` 那条失效谓词仍是防御性的（全库没有软删写入方，与 §166 同一处境）。
- [~] 画布批注（§111）— **2026-09-24 落地**：点中元素 → 写一句话钉在它上面（`comments.node_id`，
  不另起一张表）。定位由服务端按文档算（页面、元素名），节点被删后批注仍列得出并标明悬空；
  随 AI 请求上线走 §68 那条路（客户端上传 `annotations` 一律 400，超出 20 条与悬空都写进
  `annotationsNote`），提示词里写清"批注回答该动哪个元素，不是要照抄进设计的文案"。
  还没做：`@Agent` 提及解析、批注的已解决状态、回复线程（`parent_id` 还没有写它的地方）。
  验证：`annotations.integration.test.ts` 8 条 + 一条画布 e2e（含刷新后仍在、以及
  "浮层挡住画布点击"这条反向实验——去掉 stopPropagation 那条断言立刻红）
- [~] 发布审核流水线（§131）+ 举报（§132 的一部分）— **2026-09-24 落地**：
  `publish → 机检（红线词表 + 资产出处）→ clear/review/blocked → 发布或挂人工队列`，
  机检只升级不认证（`moderation` 停在 pending，只有 role=admin 的人工裁决能写 approved/rejected，
  rejected 立刻让公开 URL 404），扫描自带 limits + rulesVersion 一路显示到发布面板，
  被挡下的发布也立案。取舍与限度见 `docs/adr/0008-moderation-escalates-never-certifies.md`。
  复核台 `/admin/moderation` 也已落地（非审核员连队列长度都看不到），整圈在真浏览器里核对过：
  挂起 → 看到命中证据 → 放行离开队列 → 拒绝后公开 URL 立刻 404（截图 `screenshots/admin-*.png`）。
  仍欠：图像/视频内容模型、版权比对、block / mute（要等 M7 的关系面有承载处）、
  以及审核员提权目前只能改库（没有管理界面，也没有审计页）
- [ ] **Java Spring Boot 领域服务在此落地**（用户/项目/社区/权限/计费的权威写入方）

## M7 — 创作者经济（§187）
- [ ] Marketplace（组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色）
- [ ] Credits 与订阅（Free/Pro/Creator/Studio/Enterprise），消费透明（§133-134）

## M8 — 开放能力（§188）
- [ ] MCP、外部 Agent、公开 API

## 横向能力（随里程碑推进，不单列里程碑）
- Agent 工具注册表 + 权限 + 人工审批门（§72-74/177）
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
  它是图片/视频/3D 那条链的前置；② §163 的 WebSocket 实时推送还没做，进度只能靠轮询查。
  验证：45 条 pytest（新增 9 条）+ 真 Redis 跑通 9/9（`NEXUS_REDIS_URL=redis://127.0.0.1:6380/0`），
  真 uvicorn 起服务手工核对过 202→failed(provider-unavailable)→404 三种回话；
  两次反向实验（计数器写死 0、worker 无论什么都算完成）各自打中对应用例。
- Observability / Evaluation / Visual Benchmark（§84-86/156）
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

- [ ] 实时通道（§163）：WebSocket 显示 generation / agent / build / preview 四类进度。
  `RealtimeEventSchema` 早就在 `packages/schemas` 里并导出成契约，但**没有任何代码发过这些事件**——
  现在界面上的进度都靠轮询或一次性回话。要做的决定：App Router 的 route handler 承载不了 WebSocket，
  是加一个独立 WS 进程（配 Redis pub/sub，§94 指定 Redis 做 realtime）还是先做 SSE ——
  这个取舍要先写 ADR，不能默默改掉 §163 写的"WebSocket"。
- [~] 通知中心（§164）— 收件箱与真事件已在上面 M6 那条落地；**剩下的正是原文点名而今天没有来源的那三类**
  （Generation / Build / Agent task complete）。它们要的都不是收件箱，而是"web 侧真有一个会结束的作业"：
  等 #10（§162/§163 队列消费者）落地时一起补，那条实时通道（§163）就是它们的终态来源。

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
  1. `projects.description` 没有任何写入方（`createProject` 的 insert 不含它，也没有编辑入口），
     所以 §165 的搜索与 §166 的 og:description 现在都命中不了这一级——SEO 那侧靠页面摘要兜底，
     搜索那侧 `or(ilike(description,…))` 是空转。欠的是一个项目元信息编辑入口（见 §166 仍欠）。
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
- **§147 只赢了一半（不伪装成做完）**：画布视口裁剪把 1000 / 4000 节点档的画布 DOM 从 1000 / 4000 降到 18 个，
  pan 平移的 p95 从 139–176ms 降到 115–127ms，**但 >33ms 的掉帧数一点没变（40 / 235）**；
  而 4000 节点那一档首帧仍然量不到（等 180 秒画不出第一个节点），同一档图层树列出 3999 行。
  结论是"整份文档铺成 DOM"的地方不止画布：下一个瓶颈在图层面板与 4000 节点的载入路径本身。
  §147 因此仍是 `[~]`，不会因为裁剪做了就划掉。
