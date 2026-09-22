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
- [ ] AI Service 任务队列 / 异步生成作业（Redis）与 embedding/RAG、图像/视频 provider（随 M2/M3 落地）
- [x] Design Agent：意图 → Plan → design patch → 画布更新 → AI Diff 说明（§20/25/151，DEMO MODE 确定性规则；真实模型规划待 line 43 的 provider）
- [x] Design → Code（React + TS + Tailwind，`packages/design-model/src/codegen.ts` + Studio 代码视图）
- [x] Code → Design（受限 JSX 解析，不可逆区域保留为 code-only，§17-19，`packages/design-model/src/code-parse.ts`）
- [x] Snapshot 服务端：列表 / 创建 / 恢复，恢复自身留下一条历史（§27/§108）
- [x] Compare：快照与当前文档的字段级差异，复用 AI Diff 的条目形状（§27/§151）
- [x] Branch / Duplicate：分支线、切换、整份项目副本（§27/§28）
- [x] 多方案 A-B-C 并排比较 + "取 A 的布局 + C 的视觉"合成（§29）
- [ ] 方案生成的真实 provider 路径（现在是确定性配方，见下方进度记录）
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
圆角没有做成可换的旋钮：起手页的圆角是写死在节点上的，声称能换就是假的（见技术债）。
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
没有 worker、浏览器端指标一个数字都还没有——所以 `docs/PERFORMANCE.md` 里也不写任何浏览器端数字。
验证：`npm test` 313（克隆的 `undefined` 键 / 数组空洞 / 非纯对象回落，以及"一次 execute 只应用一遍"各一条回归）、
17 条 @smoke 全绿（编辑—撤销—自动保存那条走的就是被改过的路径）。

## M3 — 世界 / 角色 / RAG（§183）
- [ ] World Builder（Lore/History/Geography/Factions/Characters/Creatures/Items/Quests/Story）
- [ ] World Graph 可视化 + 可拖拽节点（§45）
- [ ] Character System + Character Agent 对话（§46-47）
- [ ] Memory 四类（Session/Character/World/User）可查看可删除（§48）
- [ ] pgvector RAG：hybrid retrieval + rerank（§49/93）

## M4 — 3D 与游戏（§184）
- [ ] Three.js / React Three Fiber 运行时
- [ ] 3D World Runtime：walk / explore / talk（§140）
- [ ] Game Studio：2D / 2.5D / 3D / Interactive Story / RPG 原型 / Puzzle / Visual Novel（§51）
- [ ] Game Agent + Playtest Agent（§52-53）
- [ ] 游戏设计系统：Player/Enemy/Weapon/Item/Quest/Dialogue/Trigger/NPC/Camera/Animation/Particle（§54）

## M5 — 视频（§185）
- [ ] Video Studio（text/image/storyboard→video）
- [ ] Storyboard → Shot list → 参考图 → 生成 → Timeline（§40-42）
- [ ] Timeline 编辑：trim / reorder / regenerate shot / extend / transition（§41）

## M6 — 社区（§186）
- [ ] Explore / Discovery / Trending / AI Picks（§59-61）
- [ ] Like / Comment / Follow / Remix / Save / Share
- [ ] Creator Profile + Analytics（§60/168）
- [ ] 内容安全与发布审核流水线（§129-132）
- [ ] **Java Spring Boot 领域服务在此落地**（用户/项目/社区/权限/计费的权威写入方）

## M7 — 创作者经济（§187）
- [ ] Marketplace（组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色）
- [ ] Credits 与订阅（Free/Pro/Creator/Studio/Enterprise），消费透明（§133-134）

## M8 — 开放能力（§188）
- [ ] MCP、外部 Agent、公开 API

## 横向能力（随里程碑推进，不单列里程碑）
- Agent 工具注册表 + 权限 + 人工审批门（§72-74/177）
- Context Engine / Code Index / Design Index / Project Graph（§66-71）
- Observability / Evaluation / Visual Benchmark（§84-86/156）
- 规模基准与热点路径（§146/§147）— 模型层有 `scripts/perf-baseline.mts`，实测数字与"还没做的部分"记在
  `docs/PERFORMANCE.md`；画布虚拟化、worker、浏览器端指标仍未做，所以那些数字一个都没有。
- 沙箱预览与生成代码隔离执行（§81-83）
- Design Critic + Visual QA + 无障碍/性能门禁（§32-33/90-91/178-179）—
  门禁与七行健康度已落地（`analyzeHealth`，见 M2 进度记录与 `docs/adr/0005-…`）；
  Design Critic 的**自动修复建议**仍只有 lint 的 `suggestion` 字段，没有对话式评审。

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
- ESLint 目前只有 `npm run lint` = typecheck 的占位配置，缺真实规则集。
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
- 起手页的圆角、间距是写死在节点上的数字（`cornerRadius: 10`、`padding.top: 64`），没绑到 `radius.*` /
  `space.*` token。后果具体可见：§29 的视觉语言只能换颜色与字体，"换一套圆角"这种旋钮做不了——
  做不了就别在 UI 上声称能做。等上面那条 token 类型债一起修。
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
