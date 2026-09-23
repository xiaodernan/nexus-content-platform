# SECURITY

生成式平台的攻击面比普通 Web 应用大得多：用户与 Agent 都能产生代码、发起网络请求、读写文件。
本文件是**硬约束清单**，不满足就不允许合并。

## 认证与授权

- 密码：Argon2id（回落 bcrypt）；绝不存明文或可逆
- 会话：HttpOnly + SameSite=Lax + Secure（生产）Cookie，服务端校验，支持吊销；不用 localStorage 存 token
- CSRF：状态变更走 SameSite + 同源校验 + 双提交 token（表单/AJAX）
- RBAC：`role` × `permission`（§80）。项目级 owner/editor/viewer；平台级 admin/moderator
- 每个 route handler 必须显式声明所需权限，默认拒绝（deny by default），不靠 UI 隐藏
- 速率限制：Redis 滑动窗口，按用户 + IP + 路由；生成类接口按 credits 配额

**实现现状（任务 #9d，认证竖向切片）**：口令哈希走本文件允许的 **bcrypt 回落分支**（`bcryptjs` 纯 JS，cost=10），
算法封在 `apps/web/src/server/domain/password.ts` 一处，`verifyPassword` 按 `$2` 前缀分派——将来接 Argon2id 只改这一处，
旧串仍可验证；换之前不声称已是 Argon2id。会话 HttpOnly+SameSite=Lax cookie、服务端校验、可吊销，且**提权即轮换**
（register/login 删旧 token 会话行、发新随机 token，防会话固定；guest 会话由 middleware 用客户端可见 cookie 签发，
所以轮换不是可选项）。CSRF 双提交（`nexus_csrf` 非 HttpOnly cookie + `x-csrf-token` 头比对）**覆盖全部 mutation 路由**——
auth 之外的 projects/snapshots/restore/branches/switch/duplicate/variants/merge/publish/assets/ai-run 一律先过 `csrfOk` 再动作，
不过即 `403 csrf_failed`；客户端统一由 `src/lib/csrf.ts` 的 `csrfHeaders()` 带该头。会话 cookie 的 SameSite=Lax 仍是第一道防线。限流是 `RateLimiter` 接口 + **内存滑动窗口**（单实例正确，
形状对齐 Redis 有序集，多实例部署前需接 Redis）。登录对"邮箱不存在"也跑 dummy-hash 比较以对齐时序，防账号枚举。
详见 `docs/adr/0002-password-hashing-and-csrf.md`。

**`/api/ai/run` 的归属校验（§68 带来的新面）**：这条路由从"只转发客户端上传的文档"改成"服务端按 `projectId` 读库装配上下文"
之后，它第一次成了**读取他人项目内容的入口**——所以 `assembleAiRequest` 在装配前先 `projectBelongsTo(projectId, userId)`，
不属于你就 404（不区分"不存在"与"不是你的"，避免探测），软删除的项目同样读不到。顺序很要紧：先鉴权再读文档，
反过来写就等于亲手造一个 IDOR。客户端再想自己塞 `context.document` 一律 400，归属检查不能被"我自带一份"绕过。

## 生成代码执行（§81，最高优先）

用户/Agent 产出的代码**绝不在主机进程执行**。允许的执行路径只有：

1. 受限渲染器：只解释设计模型，不执行任意 JS（M1 默认）
2. 浏览器沙箱 iframe：`sandbox="allow-scripts"`，**不给** `allow-same-origin`；`null` origin；独立子域；
   CSP `script-src` 白名单、`connect-src` 只允许预览自身的消息通道、`frame-ancestors` 限定
3. 构建沙箱：容器内临时目录、CPU/内存上限、超时、无出网（需出网时改白名单代理）、只读基础镜像、
   构建产物体积上限、禁止读取环境变量中的 provider key

PostMessage 是唯一跨界通道：校验 `origin` + `source`，schema 校验载荷，禁止透传 eval。

## SSRF（§80/§31）

网站导入与 `search_web` / `open_browser` 必须：
- 只允许 http/https；拒绝 URL 内凭据
- 解析后 IP 校验：拒绝 loopback / 私有 / 链路本地 / 组播 / 云 metadata；**对 DNS 重绑定做解析后二次校验**
- 重定向逐跳重新校验；限制跳转次数、响应体大小、总耗时
- 拒绝非默认端口白名单外的地址

## 注入与 XSS

- SQL：只走 Drizzle/参数化，禁止字符串拼接
- 输出：React 默认转义；任何 `dangerouslySetInnerHTML` 需要白名单净化（sanitize 在服务端）+ 代码审查注释
- HTML/Markdown 导入：净化后再入设计模型
- Shell：`run_command` 走 `execFile` + 参数数组，禁止 `sh -c` 拼接用户输入
- 文件路径：所有路径经 `resolveInside(workspaceRoot, userPath)`，拒绝越界与符号链接逃逸

## 文件上传（§80/§130）

- 校验真实 MIME（magic bytes）而非扩展名；图像重新编码后再存（去 EXIF，含 GPS/人脸定位元数据）
- 体积与像素上限；zip 解压防 zip-bomb（条目数、总大小、压缩比、路径穿越）
- 存储桶公有读仅限资产缩略图，原始上传私有
- 人脸/真人照片：consent-aware 流程 + 身份/肖像保护（§129-130）

**实现现状（任务 #9c，位图）**：magic-bytes 判定、体积/像素上限、按 id 生成的 object key、
`nosniff` + `CSP: default-src 'none'` 的字节响应、公开取字节需"发布行 + 钉住快照确实引用"——均已落地并有测试。
但"图像重新编码后再存"目前只做到**结构化剥离**（PNG/JPEG/WebP/GIF 的 EXIF/XMP/IPTC/注释段整段丢弃，
被剥掉的段名回传作为处理回执），**没有做像素重编码/转码**。风险差异：结构化剥离能去掉隐私元数据，
但挡不住解码器漏洞型恶意构造（重编码能，因为像素重画会丢弃异常结构）。
真正的重编码/缩略图统一化等 provider 层落地时替换 `server/storage/images.ts`，替换前不声称已满足"重编码"这一条。

## Prompt 注入与 Agent 越权

- 外部内容（网页、上传图 OCR、用户导入 repo 文本）一律视为**不可信数据**：进入上下文时包裹明确边界，
  不得作为指令解释；Agent 工具选择只能由开发者定义的指令 + 结构化 schema 驱动
- 工具按 Agent 授权（§73），越权调用即失败并审计
- 高危动作强制人工审批（§74/§177）：删除、公开发布、消耗 credits、外发消息、生产部署、支付
- 每个 Agent 步骤有步数/成本/时间预算上限，超限自动终止
- 审计：谁（user/agent）在什么 task 上用什么工具改了什么，落 `agent_tool_calls` + 事件

## 内容安全（§129-132）

不得生成：非自愿亲密影像、涉未成年性内容、用于欺骗的身份冒充、违法内容。
发布流水线（§131）已落地在 `apps/web/src/server/domain/moderation.ts`：
`publish → 机检（词表红线 + 资产出处）→ clear / review / blocked → 发布或挂人工队列`。
四条边界写在这里，不只在代码注释里：

- **机检只升级，不认证。** `clear` 不把 `published_projects.moderation` 写成 `approved`；
  那个值只能由 `role='admin'` 的人工裁决改（`POST /api/admin/moderation/[caseId]`，登录 + admin + CSRF 三样都要）。
  被拒绝的那一版公开 URL 立刻不可达（`resolvePublishedPath` 认这一列）。
- **词表能挡什么、挡不住什么都随结果发出去。** 扫描自带 `limits`（覆盖不到的部分）与 `rulesVersion`，
  发布面板逐条显示；"没命中规则"在 UI 上就写成"这次没命中规则"，不写成"内容合规"。
- **命中红线也留案。** 被挡下的那次发布没有 publication 行可挂，但 `moderation_cases` 仍记一行
  `decision='blocked'` + 证据（哪段文字、在哪个节点）——否则连"有人试过发这个"都查不到。
- **下架方向永远放行。** 切成 private 不受门禁与机检阻挡：把链接收回来比挡住收回安全。

公开互动（§59）同样在机检与限流覆盖之内：评论走 `scanTextForRedlines` —— 与发布扫描**同一份词表**，
命中直接不发出去（不是"先发出去再挂人工"）；`/api/published/interact` 每身份每分钟 20 次、评论每小时 30 条，
`/api/follow` 每分钟 30 次。发现列表与公开页解析同一口径：private 与被人工 rejected 的版本都不出现。
Remix 只读发布快照，不读作者工作稿 —— 未公开内容不会因为"有人想改编"而泄露。

社区能力：report 已落地（公开页 `POST /api/published/report`，限流 10 次/小时/身份，
命中三条硬红线的举报自动挂人工复核案并按案子去重）；block / mute 还没有——它们要的是社区关系面，
在 M7 的 like/comment 之后才有承载处。版权（§129 copyright safeguards）只有原则没有比对：
没有指纹库或外部检索，平台判断不了一段文字或一张图是不是抄的。

审核入口本身还有一个附带边界：`/api/admin/*` 用 `currentUserOrNull()` 而不是 `requireUser()` 读会话——
后者会为无会话的请求现造一个 guest 身份（§137 的首次体验），那正好让任何人反复探测 admin 端点就能白手造用户行。

谁是 admin：目前只能由运维直接改 `users.role`，平台没有自助提权路径。
复核台在 `/admin/moderation`：非审核员（包括项目作者本人）看到的是一句拒绝，队列内容与案子数都不给。
2026-09-24 在真浏览器里核对过整圈：挂起 → 队列里看到命中证据 → 放行后离开队列 →
再发一版并拒绝 → 那个公开 URL 立刻 404。

## 密钥与配置（§80）

Provider key 只在 ai-service 进程环境；web 永不接触；构建沙箱与预览 iframe 永不接收。
仓库禁止提交 `.env`、`*.key`、`*secret*.json`（全局 pre-commit 已强制）。日志对 key 与 token 做脱敏。

## 观测与响应（§84）

结构化日志字段：`request_id / user_id / agent / task_id / tool / decision / result / latency_ms / cost`。
安全事件独立告警。生产环境不开 debug 端点。
