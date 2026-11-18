# NEXUS · LLM 状态流转全景（2026-11-17 · cont. 200）

> 这是 §新指令·四「同时要深度剖析大模型能力在项目智能流转中的作用」的对应文档。
> 每一行都是**实测过的调用点**；每一条纪律都写明**谁来执行**和**谁拦截**。

## 0. 总纪律（不可违反的三条）

1. **AI Service 不写业务库**（§ARCH）：ai-service 只返回计划与补丁，持久化全部在 web 层；
2. **一次 AI 操作 = 一个可撤销事务**（§150）：所有设计变更经 Command/补丁进库，可 undo；
3. **未实测的 AI 不出界面贴标**（§160）：DEMO MODE 常驻徽标；真 provider 不假冒、不冒充。

## 1. 全量调用点盘点（15 处模板，9 住端到端切面 + 6 住管线工位）

### 1.1 web 层 · 用户可感知的 AI 切面（皆已真 provider 实测出厂）

| # | 调用点 | 输入数据类 | 模型决策 | 谁应用 / 谁拦截 |
|---|---|---|---|---|
| 1 | `apps/web/src/app/api/bible/whisper/route.ts` | 正典原文摘录（库内真值）+ 用户一句提问 | 答案只引用摘录；引文逐字 | 无人写入库；仅展示；『不引用不存在 → 直说没写』|
| 2 | `/api/bible/chapter-digest/route.ts` | 本章 ≤6000 字摘录 | 三句摘要 + 「思考：」一句问句 | 仅展示；provider_failed → 502 |
| 3 | `/api/ai/deep-read/route.ts`（/observatory） | `/api/pulse` 聚合数字（PG 真实聚合 + 规则外推） | 4 条按可操作性排序的建议（依据/收益/下一步/置信度） | 仅展示；DISMISS 由人点 |
| 4 | `/api/editor-note/route.ts`（/discover） | trending 前三的真实指标（views/likes/score） | 每卡一句"为什么值得打开"（必含实测数） | 仅展示；DEMO MODE 409 |
| 5 | `/api/marketplace/picks/route.ts`（/marketplace） | 仍在售前三实测字段（价格/下载量） | 每件一句"为什么值得看"（必含实测数） | 仅展示；DEMO MODE 409 |
| 6 | `/api/notifications/digest/route.ts`（/notifications） | `inboxKindHistogram`——**仅 kind+计数**（ADR-0273；不选 title/body/actor） | 哪件先开排顺序（等结论 > 纯计数）+ 一条清理建议 | 仅展示；空收件箱不调模型 |
| 7 | `/api/discover/interest/route.ts`（/discover 为你推荐） | `discoverInterestSignals`——**本人 opens 聚合** + views/likes | 前三荐语（必含 myOpens/实测数） | 仅展示；无痕迹不调模型 |
| 8 | `/api/projects/[projectId]/characters/[characterId]/chat/route.ts`（/studio · 角色对话） | 角色档案（身份/穿着/画风/角色四栏）+ 语料记忆 | 角色回复；零持久化（刷新即忘） | 仅展示；无 session 不答 |
| 9 | `apps/web/src/app/api/ai/run/route.ts`（StateGraph 设计试跑） | 用户意图 + 设计模型投影 | 状态图跑：plan → 迭代 → 收尾 | **不自动落库**——Studio 里『应用修改』由人点（Command 事务落 CommandStack） |

### 1.2 web 层 · AI 管线工位（模型决策→状态流转由 web 层把守）

| # | 调用点 | 输入 | 决策 | 状态流转 |
|---|---|---|---|---|
| 10 | `/api/stategraph`（canary 头 `x-nexus-orchestration: stategraph`） | 用户建模意图 | StateGraph 到达『需人批准』节点 | **awaiting_approval 停住**；人点批准才 CommandStack 落库（ADR 0272） |
| 11 | `/api/projects/[projectId]/images`（生成参考图/肖像） | 角色档案 / scene prompt | 图像任务（DEMO 合成器不出 provider 像素） | 任务行入库；`demo: true` 常亮 DEMO 标；asset 归入项目 |
| 12 | `/api/projects/[projectId]/agent/draft`（agent 草稿） | 项目文档 + 指令 | 草稿补丁集 | 人接受才进 CommandStack；agent_tasks 行可见 |
| 13 | 角色肖像接力：肖像 → 下一个场景参考图 | 角色肖像（参考真值） | 色相锚点注入 prompt | 同上——补丁集人接受才落库 |
| 14 | 异步任务：`design-patch` / `storyboard-render`（`/api/projects/[projectId]/jobs*` + ai-service `/v1/ai/jobs`） | 设计模型切片 | 补丁或渲染卡 | 任务行写入/推进由 web 的 jobs 表驱动（Redis 队列 + SSE 推状态）；**模型产出≠自动应用** |
| 15 | `/api/admin/behavior-sim`（admin 模拟器） | 目标行为分布 | 模拟计划（test-mode） | 只跑测试域，不碰真实用户数据；收尾如实报告 |

### 1.3 ai-service 层 · 供应线工位（web 经 HTTP 边界调用）

| # | 端点 | 职责 | 决策/流转 |
|---|---|---|---|
| 16 | `POST /v1/ai/run` | agent 运行（plan→execute→conclude） | 决策由 web 层消费；生产者如实把 awaiting_approval 暴露给 web |
| 17 | `POST /v1/ai/design-graph`（LangGraph） | 设计管线：StateGraph 编排（ond/chunk/judge/patch） | 状态留在 StateGraph；不出写 web 库 |
| 18 | `POST /v1/ai/chat` | §47 角色对话底层 | 无状态；web 拼人设与上下文 |
| 19 | `POST /v1/ai/jobs`（§162） | 异步任务受理：执行/取消/重试 | DLQ 有界窗口；状态由 web 消费 |
| 20 | `GET /v1/ai/cache-stats` · `/metrics` · `/healthz` · `/v1/capabilities` | 观测面（缓存/Breaker/队列/健康） | 纯观测；零业务副作用 |

## 2. 状态流转类型学（谁决定什么、谁拦截什么）

### 类型 A · 只读回答（零写库、零审批）
whisper / chapter-digest / deep-read / editor-note / picks / notifications-digest / discover-interest / character chat
——所有这些都**只展示**，不发应用命令，不落 CommandStack。

### 类型 B · 补丁"提案"→人批准→CommandStack（可撤销）
StateGraph 设计跑 / agent-draft / 角色肖像接力的色相锚点 / design.patch
——**自动化被工程手段限死**：模型永远只能提交补丁；应用动作只由用户点击；
补丁进库走 Command 事务，撤销可回滚。这是"大模型分析能力实现状态流转"的工程化形态：**流转的门由人握着**。

### 类型 C · 后台任务"提交—推进—对账"（异步流转）
ai-service /v1/ai/jobs + web jobs 表 + Redis 队列/SSE
——模型只决定"这一步对不对"；**任务的推进与对账由非 LLM 代码驱动**（RQ 式）。
任务失败 → DLQ 有界窗口；可复核、可取消、可重试——模型不直接推进计数器。

### 类型 D · 不走 LLM 的状态（故意不做，或不给模型权）
发布/下架（发布按钮）、付款/退款/结算（ledger）、删除/清空、举报受理（审核事务）、角色权限
——这些**从不接受** LLM 输出作为前置状态。理由：出了问题要有人担责。

## 3. 实测过的数字（全部来自 2026-11 生产实测，非推断）

- prefix-cache 命中：2026-11-17 cont. 178 实测 **6724/6724 = 100%**（stream=on、transport.stream=1）；此前假不命中是 `NEXUS_LLM_STREAM=0` 造成的调试残留，不是模型问题；
- 每次"不出话"都给 409 如实（DEMO MODE）或 502 如实（模型没落实测数字/没覆盖全部）——**不假装成功**；
- 频率护栏：AI 深读 10/hr、馆长批注/选品 10–20/hr、伴读 20/hr、digest 20/hr 每 IP(+用户)，LRU 1h–24h；
- 输入最小化案例：私域 AI（收件箱伴读/推荐位）喂给模型的只有**计数**；title/body/actor 一字不出服务端（ntg-visual-style / foryou-strip-visual-style 机械断言）。

## 4. 现状差距（诚实清单，非修完判定）

1. `/admin` 车道分布面板：需要 admin 登录态——没有就不做假，待会话验证后再做；
2. Studio 车道芯片真浏览器验证：in-app 浏览器非 HttpOnly 会话——SHA pin + 集成测试兜住，不做浏览器假声明；
3. 图像/视频 provider：**本机只有确定性合成器**（DEMO）——真图/真视频 provider 到达前不画 UI 贴"真图"；
4. 角色对话/whisper 无持久化记忆：到达真 provider 后待 §48 语料记忆接入；
5. push gate：本机无全局用户 git 身份——用 `-c user.name/-c user.email`，不改全局配置；
6. `load-redis-completion-cache` 等压测脚本留证于 `docs/evidence/`——下一轮可重跑 collp75。

## 5. 下一个最有价值的 LLM 接入点（优先序）

1. **E18《潮汐教团的最后一夜》人机合写**——narrative provider 全程参与状态流转（草稿→人审→落库），沿续正典仪式；
2. **ai-service 启机期 Redis 降级 ADR**（ADR 0271 的启机侧姊妹篇）——让 healthz 在启动期也诚实；
3. `/observatory` 规则外推 → LLM 独立复核（"AI 深读"已是其一半；复核位接住剩下的一半）。
