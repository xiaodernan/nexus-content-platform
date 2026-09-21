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

## Prompt 注入与 Agent 越权

- 外部内容（网页、上传图 OCR、用户导入 repo 文本）一律视为**不可信数据**：进入上下文时包裹明确边界，
  不得作为指令解释；Agent 工具选择只能由开发者定义的指令 + 结构化 schema 驱动
- 工具按 Agent 授权（§73），越权调用即失败并审计
- 高危动作强制人工审批（§74/§177）：删除、公开发布、消耗 credits、外发消息、生产部署、支付
- 每个 Agent 步骤有步数/成本/时间预算上限，超限自动终止
- 审计：谁（user/agent）在什么 task 上用什么工具改了什么，落 `agent_tool_calls` + 事件

## 内容安全（§129-132）

不得生成：非自愿亲密影像、涉未成年性内容、用于欺骗的身份冒充、违法内容。
发布流水线：`upload → automated moderation → risk classification → publish or human review`。
社区能力：report / block / mute / moderation。版权：不复制受保护的角色、资产、剧情、网站内容，只提取风格 DNA。

## 密钥与配置（§80）

Provider key 只在 ai-service 进程环境；web 永不接触；构建沙箱与预览 iframe 永不接收。
仓库禁止提交 `.env`、`*.key`、`*secret*.json`（全局 pre-commit 已强制）。日志对 key 与 token 做脱敏。

## 观测与响应（§84）

结构化日志字段：`request_id / user_id / agent / task_id / tool / decision / result / latency_ms / cost`。
安全事件独立告警。生产环境不开 debug 端点。
