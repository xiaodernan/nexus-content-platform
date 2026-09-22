# ARCHITECTURE

## 全局形态

NEXUS 是 **AI-native 创作平台**：自然语言 → 设计模型 → 代码 → 可运行产物 → 发布。
权威表达（source of truth）永远是 **Nexus Design Model**，不是 DOM、不是代码（§16）。

```
                        ┌──────────────────────────────┐
  浏览器               │  apps/web  (Next.js 15)      │
  ────────────────────►│  · Studio (Canvas/Layers/Props)
                        │  · Explore / Runtime / Share │
                        │  · Route Handlers = BFF/API  │
                        │  · Drizzle → Postgres        │
                        └───────┬──────────────┬───────┘
                                │ HTTP/WS      │ design patch (JSON)
                        ┌───────▼──────────────▼───────┐
                        │ apps/ai-service (FastAPI)    │
                        │ · Agent Runtime / Orchestrator│
                        │ · Providers (LLM/Image/Video/Embed) │
                        │ · RAG / Evaluation / Screenshot (Playwright) │
                        └───────┬──────────────────────┘
                                │
        ┌───────────────┬───────┴────────┬───────────────┐
   Postgres+pgvector   Redis         MinIO(S3)      Provider APIs
   (领域 + 向量)     (队列/缓存/WS)  (资产/导出)      (外部，可替换)
```

M6 起增加 `apps/api`（Java Spring Boot）作为用户/项目/社区/权限/计费的**权威写入服务**，
Next.js 退化为纯表现层并改为通过它读写。此边界现在就要在文档与模块划分上预留，见下"边界纪律"。

## 目录

```
apps/
  web/          Next.js App Router：Studio + 站点 + BFF route handlers
  ai-service/   FastAPI：agent 编排、provider 抽象、RAG、评测、截图
packages/
  design-model/ @nexus/design-model：设计对象模型、布局求解、Command 事务、序列化（纯 TS，无 IO）
  schemas/      @nexus/schemas：跨端 zod 契约（AI 请求/响应、事件、补丁操作）
infra/
  docker-compose.yml   postgres+pgvector / redis / minio（端口见 ENVIRONMENT.md）
docs/           本目录；adr/ 存放决策记录
```

### AI Service 现状（M1）

已落地：`/healthz` 与 `/v1/capabilities` 能力矩阵、`/v1/ai/run`（请求契约校验 → Model Router →
provider 调用 → 补丁结构校验 → 删除类动作审批门 → 响应自校验）、OpenAI 兼容适配器、双端契约强制。

未落地（不假装）：异步生成作业与任务队列（随 M2 图像/视频 + Redis 落地）、embedding/RAG、
截图与视觉评测、Anthropic/Gemini 适配器（检测到 key 会在 `/healthz` 里如实标 unavailable）。

DEMO 路径不在 ai-service 里：确定性 Mock 需要 design model 才能产出合法补丁，因此留在 web，
输出恒带 `capability: 'demo'`（§160）；ai-service 只说真话——要么真调用，要么 `provider-unavailable`。

## 边界纪律

1. **设计模型不依赖渲染**：`packages/design-model` 不允许 import React/DOM/Node fs。渲染层与代码生成层各自依赖它。
2. **AI Service 不写业务库**：它只接收上下文、返回计划与补丁；持久化由 web 完成。避免双写与权限蔓延（§73）。
3. **所有编辑走 Command**：画布、属性面板、AI 补丁、代码回写一律通过 `Command{execute,undo,redo}`（§150），
   一次 AI 操作是一个事务（§149）。本地撤销栈负责 Ctrl+Z；用户项目历史（§27/§108）是服务端 `snapshots`
   表里的整份 `DesignDocument`，两者不是一回事：恢复快照会清空撤销栈，且恢复前后各留一条快照。
   Compare（§27）用 `diffDocuments` 把两份文档比成同一形状的 `DiffEntry[]`，
   所以 AI Diff 与快照比较共用一套展示；三者都建立在 `sameValue`（键顺序无关）之上。
4. **契约单点定义**：web ↔ ai-service 的报文只在 `@nexus/schemas` 里用 zod 定义；
   `npm run contract:export` 导出 `contracts/*.schema.json`，Python 侧用 `jsonschema` 做运行期校验，
   `packages/schemas/test/contract.test.ts` 保证导出文件与 zod 不漂移。补丁的**语义**校验（节点是否存在、
   尺寸是否重算）仍只在 web 做，因为它才持有 design model。
5. **Provider 可替换**（§76-79）：`LLMProvider / ImageProvider / VideoProvider / EmbeddingProvider / SpeechProvider`
   五个抽象接口 + Model Router；任何业务代码不得直接 import 具体 SDK。
6. **不可逆代码保留**：Code→Design 无法安全映射的片段不回写设计模型（§19）——结构性改动只在代码视图里
   如实报告，模型侧的原文区域用 `code` 节点（`node.code.content`）按字面承载，生成与解析都原样透传。
7. **分支不设"当前"列**（§28）：分支是带名字、带 head 的快照线，当前分支 = head 指回
   `projects.currentSnapshotId` 的那一条。少一个状态就少一处会漂移的地方，代价是新分支必须自带 head 快照，
   所以"开分支"必然留下一条历史。推论：**任何时刻只能有一条分支的 head 指着 `currentSnapshotId`**——
   所以插入分支行时 head 留空，等它自己的 head 快照建好再由 `createSnapshot` 补上，并且"离开的是哪条分支"
   必须在插入之前问清楚，否则两条线共用一个 head，`currentBranchId()` 的答案就变成查询顺序决定的了。
   切分支与恢复同构：先把离开的现场存回原分支（内容已等于 head 时跳过，避免噪音快照），再落到目标 head。
8. **副本必须换号**（§27 Duplicate）：`duplicateDocument` 重发页面 id 与组件 id（存储层的全局主键）并重写
   全部引用，节点 id 只在页面内唯一、跟着页面走所以不变。整棵子树做替换而不是点名式重写——会引用页面/组件
   的地方还会随功能增加，点名迟早漏一处。
9. **方案不另立存储**（§29）：一条候选方案 = 一条分支 + 它 head 上的那份文档，没有"变体表"。
   方向被拆成两个各自能搬走的轴——结构（只动 `pages/nodes`）与视觉语言（只动 `tokens` + `visualDna`），
   所以"A 的布局 + C 的视觉"是一次真实的合并而不是重新生成；前提仍然是节点颜色引用 token（§12）。
   生成与合成**不推进 `projects.currentSnapshotId`**（`createSnapshot` 的 `advanceWorkspace:false`）：
   候选是给人挑的，采纳才走 §28 的切换。比较板与画布、预览共用 `resolveLayout + nodeStyle`，
   看到的必须等于切过去之后看到的。
10. **发布的是快照不是工作区**（§56/§57）：`published_projects` 一行对应一条 `/n/<handle>/<slug>`，
   指向一份 `source='publish'` 的快照；重新发布就地换版本（path 有唯一索引），
   所以作者之后怎么改都不会把已经发出去的链接换掉。公开页不鉴权也不读工作区。
   门禁只报告真跑过的检查，没实现的列进"未运行"；`moderation` 停在 `pending`，不假装审核过。
11. **设计里不存字节，只存引用**（§16/§38/§64/§101）：节点 paint 只持 `assetId`，object key 由服务端按 id 生成，
    文件名只是展示文本。"这个 id 能不能显示"由**文档自己的资产清单**回答（`assetContextFor`），
    画布 / 变体 / 预览 / 公开页四条投影据此跳过清单外的层而不是画破图。字节走 `StorageDriver` 接口
    （S3 兼容实现 + 本地目录兜底，§64 provider 可替换），鉴权分两套 URL 面：作者会话取
    `/api/assets/[id]/file`，匿名访客取 `/api/public/[handle]/assets/[id]` 且必须"发布行 + 钉住快照确实引用"才放行。
    持久化在 web 层，AI Service 仍不写业务库（生成图将来也是返回计划/补丁，落库走同一入口）。

## Design ↔ Code 双通道

```
Design → Code：DesignNode 树 → IR（组件/tokens/类名）→ React+TS+Tailwind（确定性模板，不靠模型自由发挥）
Code → Design：受限 JSX 解析（自有组件与 Tailwind 白名单子集）→ DesignNode 补丁
```
AI 只负责"改设计"（产出 design patch），不直接产出整页代码文本；页面代码由生成器从设计模型派生。
这样 §17 的双向闭环可验证、可 diff、可撤销。

**Design → Code 已落地（M1）**：`packages/design-model/src/codegen.ts` 是纯函数投影，产出
`styles/tokens.css`（token → `var(--nx-*)`，含 `[data-theme]` mode 块）+ 每页一个 `.tsx` + 页面索引。
尺寸语义按父容器轴向映射（flex 主轴 fill→`flex-1`、交叉轴→`self-stretch`、hug→无类），
`mode=none/stack` 的子节点用 `absolute left/top`，与画布共用同一份模型几何。
Studio 的 代码 视图（`apps/web/src/studio/CodePanel.tsx`）展示投影并定位选中节点所在行。
**Code → Design 已落地（M1）**：`packages/design-model/src/code-parse.ts` 自带一个不依赖 React/TS 编译器的
受限 JSX 扫描器，只接受生成器自己产出的那一类元素，把类名反解成同一份模型属性，产出**仅含 `set` 的补丁**，
经 `studio.execute('代码编辑', ops)` 作为单个可撤销事务写回模型。三条不妥协的边界：
①结构性变更（加/删节点、改标签、重排、改父级）不回写，如实报告并留在代码里；
②每个识别结果都要能被重投影复现（`checked` 类名逐条核对），核对不过就放弃该节点的回写而不是半改；
③吃不下的片段一律进 `unmapped`/`issues` 清单显示给用户（§159），界面不假装可改。
关键验收是往返恒等：`codeToPageOps(generatePage(page), page)` 必须零补丁、零 unmapped（单测覆盖）。

## 运行时与预览（§81-83）

生成代码**绝不在主机执行**。预览路径：

```
design model → 构建产物(HTML/JS bundle) → 沙箱 iframe（独立 origin/随机子域，CSP 收紧，无 same-origin）
                                          └ 构建在 ai-service 的临时目录内完成，超时+资源限制
```
M1 允许"受限渲染器"模式：预览由设计模型直读渲染，不执行用户代码；一旦引入真实代码执行，必须走 §SECURITY.md 的沙箱清单。

## 数据（§92-94）

Postgres 为领域库 + pgvector 为检索；Redis 做队列/缓存/限流/实时；MinIO 存资产。
事件（§95）以 `events` 表 + Redis Stream 承载，命名 `domain.verb`（如 `design.updated`）。

## 实时（§163）

WebSocket（Next.js route handler 升级 / M6 后由 Java 侧承载）推送：
`agent.plan` `agent.step` `agent.activity` `generation.progress` `build.status` `preview.status`。
活动流只展示安全的工作状态，不暴露模型隐藏推理（§26）。

## 性能分层（§146-147）

100 节点：DOM 直渲；1000：虚拟化 + memo + 图层缓存；10000：scene graph + worker 布局 + 增量渲染 + 仅渲染视口。
渲染后端预留 `CanvasRenderer`（DOM / Canvas2D / WebGL）接口，M1 用 DOM 实现，后续替换不动模型层。
