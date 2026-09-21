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
- [x] `@nexus/design-model` 类型 + 布局求解 + Command 事务 + 测试（64 tests green，`npx vitest run`）
- [x] 数据库 Schema + 迁移（29 表 / 149 语句，`scripts/db-migrate.mts` 已在空库验证幂等）

## M1 — NEXUS STUDIO 竖向切片（§181）

必须打通的闭环，**这是当前唯一的最高优先级目标**：

```
Create Project → Prompt → AI Design → Canvas → Layers → Properties
→ Design System → AI Edit → Code → Live Preview → Screenshot → Publish
```

- [ ] Studio 布局（顶栏 / 左面板 / Canvas / 右属性面板 / 底部 AI 命令栏）
- [ ] Canvas：zoom / pan / select / multi-select / drag / resize / snapping / grid / guides / viewport 切换
- [ ] 直接操作：属性编辑即时回写 design model（§15-16）
- [ ] Undo / Redo，AI 操作作为单个可撤销事务（§148-150）
- [ ] AI Service：Provider 抽象 + Model Router + Mock（DEMO MODE 明确标注）
- [ ] Design Agent：意图 → Plan → design patch → 画布更新 → AI Diff 说明（§20/25/151）
- [ ] Design → Code（React + TS + Tailwind）；Code → Design（受限 JSX 解析，不可逆区域保留为 code-only，§17-19）
- [ ] Live Preview（隔离渲染）+ Playwright 截图（§33/87）
- [ ] Snapshot / Version History / Branch / 多方案比较（§27-29）
- [ ] 免注册首次体验（§137）→ 注册保存；Publish + 分享 URL（§56-57）

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
