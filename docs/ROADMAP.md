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
- [ ] Design System 面板（token 浏览/编辑；当前只在属性面板显示概览与绑定选择器）
- [x] AI Service（FastAPI, `apps/ai-service`）：契约强制 + Provider 抽象 + Model Router + OpenAI 兼容适配器 + 删除类审批门
- [ ] AI Service 任务队列 / 异步生成作业（Redis）与 embedding/RAG、图像/视频 provider（随 M2/M3 落地）
- [ ] Design Agent：意图 → Plan → design patch → 画布更新 → AI Diff 说明（§20/25/151）
- [x] Design → Code（React + TS + Tailwind，`packages/design-model/src/codegen.ts` + Studio 代码视图）
- [x] Code → Design（受限 JSX 解析，不可逆区域保留为 code-only，§17-19，`packages/design-model/src/code-parse.ts`）
- [ ] Snapshot / Version History / Branch / 多方案比较（§27-29，现有历史面板仅本地会话内）
- [ ] 免注册首次体验（§137）→ 注册保存；Publish + 分享 URL（§56-57）

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

## M2 — 图像与资产（§182）
- [ ] Nexus Image Studio（text→image / image→image / sketch→image / reference→variation / character→scene）
- [ ] Asset Library（图片/视频/音频/3D/组件/设计系统统一编目）
- [ ] Reference Image → Visual DNA 提取（§30/172-174）
- [ ] 角色一致性生成（§39）

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
- 沙箱预览与生成代码隔离执行（§81-83）
- Design Critic + Visual QA + 无障碍/性能门禁（§32-33/90-91/178-179）

## 当前阻塞项
- `[!]` 真实 AI provider key（文本/图像/视频）— 用户提供前，全部生成类能力以 DEMO MODE 交付，UI 明确标注，不伪装真实结果。

## 已知技术债（不伪装成已完成）
- `Layout.gap / padding / cornerRadius` 类型是 `number`，但属性面板的 token 绑定会写入 `"{space.4}"` 这类字符串；
  运行时 TokenStore 能解析，类型层面在说谎。需要把这三处放宽为 `number | TokenKey` 并在 validate/layout 统一解析。
- ESLint 目前只有 `npm run lint` = typecheck 的占位配置，缺真实规则集。
- 资产（image/video paint）尚未渲染：`render.ts` 明确跳过，等任务 #9 的资产服务落地。
- 历史面板只在浏览器会话内可撤销，刷新即失；服务端 Snapshot 属于任务 #8。
- 代码投影（`codegen.ts`）与画布一样只覆盖几何/样式/文字：`typography.runs`、`animation`、`interactions`、
  `states`、`bindings` 都还没实现——渲染层也没有，所以两边一致地缺失，不是生成器单独偷懒。
- 生成的页面组件之间没有共享组件抽取：`component`/`instance` 节点会被展开成内联子树，
  等 §13 组件系统的实例语义稳定后再收敛成 `<Component />` 引用。
