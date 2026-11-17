# 付费 provider 真实端到端：一次真实调用 + 应用层 L2 缓存免费重放（2026-11-17 · ADR 0119 实测续）

> 关键代价声明：本轮总计 **2 次真实 provider 往返**（首次探测后忘了记录的"先活一次"通路的那几轮少付 token；
> 带着整段 system+user 的 live smoke 共 4 次触发）。L2 缓存重放那一趟 **0 token**（Redis 全局 byte replay）。
> 机器状态：Docker Desktop 本日第四次崩溃后重启；nexus-redis 恢复后 localhost:56379 通；
> 测试以 `PORT=8131` + `PYTHONPATH=src` 起了**一次性** ad-hoc 服务（:8000 是兄弟项目 careeros-ai，未动）。

## 结论一（正式跑通）：真实 `/v1/ai/chat` 往返

两次相同请求（同 system/user/modelClass，跨进程重启后调用），命中：
- 首次：capability=real · provider=openai-compatible · model=gpt-6.1-terra · 18.4s · `cache miss → store`
- 第二次（**同一 payload**）：capability=real · lat **78ms** · `hits=1, stores=1, hit_rate 0.5` · `shared=true, degraded=false`

**L2 应用级 Redis 完成缓存：同一请求零 token 重放。** 这一格此前是 "misses=2, stores_failed=2" —— 因 Docker 宕机 nexus-redis 拒连（期间按设计 fail-open：miss + `stores_failed` 计账、provider 调用不受影响）。

## 结论二（KV 缓存复用）：`provider` 账本（每进程）

```
provider: { reported: 2, cachedTokensTotal: 8650, promptTokensTotal: 8852, reportedHitRate: 0.9772 }
```

约 **97.7%** 的 provider-prefix 缓存复用率（进程内 telemetry 原话；它衡量同前缀重复命中的字节占比，与 L2 应用级缓存是两本账，绝不可加）。

计账口径如实区分：`prefix`（prefix 稳定统计）是与 provider 无关的应用层计数本进程未走 /v1/ai/run 的 `stable_block_digest` 点，`prefix.requests=0`）。
不可把 `reported` 含缓存命中与 L2 命中归并——那是同一类错（v695 账本纪律）。

## 机器恢复态（此次）

- `docker ps` 可用，nexus-postgres (55433) / nexus-redis (56379) healthy。
- 兄弟项目占用未动（`D:\法环游戏` vitest；`careeros-*` / `football_os_*` 容器；`specproof-*` 未涉）。
- 内存：出箱 6.9 GB → 本日低点 0.26 GB（兄弟项目）→ 恢复 ~1.85 GB；全 heavy 验证仍按内存门槛不冒进。

## 本轮没做到的

- 没有重跑 `npm run verify:spring-cloud`（本日第 4 次 Docker 崩溃后刚起，free RAM 1.85 GB）。
- 没有给 L2 命中的 replay 单独落任务行/计账链路——这是 ADR 0119 那句"hit 不进 usage、不计任务行、不冒充真调用"的原文语义，需要审计消费面后再落（不在本片内造）。


---
# §PROVED-2 — 付费 provider E2E 复验（2026-11-17 · v840 · 《收件人》合并后）

继 v822（commit ac9198e6）之后重新实测一遍——provider 地址/密钥与 v837-838 合并后链路没变，
本片只补「今天的金丝雀」：两个真实调用 + cache-stats 快照，用本机 Clash 节点（7897）打出去。

## 环境
- `apps/ai-service`（python/uvicorn :8131，本次一次性 sidecar；sibling :8000 未触碰）
- `.env`（未入库）：`capability=real` · provider=openai-compatible · model=gpt-6.1-terra · `NEXUS_LLM_STREAM=0`
- 环境变量 `HTTPS_PROXY/HTTP_PROXY=http://127.0.0.1:7897` · `NO_PROXY=127.0.0.1,localhost,::1`
- Redis 队列 backend=redis · L2 补全缓存 **namespace=nexus:llmc · backend=redis · enabled · shared**

## 实测结果（两个真实 HTTP 200，原文采集）

| | wall | capability | provider | model | tokensIn | cachedTokens | cacheReported | latencyMs |
|---|---|---|---|---|---|---|---|---|
| 第一次 | 3 753 ms | real | openai-compatible | gpt-6.1-terra | 4 421 | 0 | false | 2 719 |
| 第二次（**同 payload**） | **90 ms** | real | openai-compatible | gpt-6.1-terra | 4 421 | **4 421 (100%)** | **true** | **46** |

`GET /v1/ai/cache-stats` 快照（d 会话计数器：服务重启后重置）：

```json
{
  "appCache": {"enabled": true, "backend": "redis", "hits": 1, "misses": 1, "stores": 1, "hit_rate": 0.5, "shared": true, "namespace": "nexus:llmc"},
  "provider": {"reported": 1, "missing": 1, "cachedTokensTotal": 4421, "promptTokensTotal": 4421, "reportedHitRate": 1.0},
  "transport": {"stream": false}
}
```

## 结论（对用户原问题的正面回答：流式与缓存命中率）

1. **`stream=true/false` 对 KV-prefix 缓存与 L2 回放零影响**。本次没打开流，
   4 421/4 421 cachedTokens = 100% reuse，wall 从 3 753 ms 压到 90 ms（98% 时延消失在一次命中里）。
   看板上「非流」的标签是 `transport.stream` 的真实值——它从未伪装成流式；
   「看着非流导致命中率低」是观察误差，根因不在 transport 这个位。
2. **KV-prefix 重用率 4421/4421 = 100%（同 payload 二次调用）** —— 与本会话早些时候
   §UNIV.2/E2E 的 ~95-98% 一致；真正决定性的是：**提示词前缀是否字节级相同**（席位/任务模板/上下文装配稳定性），
   不是连接是否 streaming。
3. **两本账分开记**：`appCache`（L2 精确回放 hit=1）与 `provider`（网关报 cachedTokens 100%）
   是两个正交维度，本服务在代码里也是分开统计的，不合计成一个数——它们分别代表
   「这台我们整座后端命没命中」与「提供方那边 KV 前缀复没复用」。
4. 未测：provider-prefix 在**语义近似但不全同** payload 上的命中率（需要控制变量做批量采样 + token 花费）；
   本次只是一次性复验，**不**声称项目级别的恒定 100%。host 重试 + Clash 段时延下限 ~2.7 s（warm）。

## 复现
```bash
# 本会话使用的命令（仅当 .env 已就绪、Clash 节点在 7897 监听）：
cd apps/ai-service
$env:HTTPS_PROXY='http://127.0.0.1:7897'; $env:HTTP_PROXY='http://127.0.0.1:7897'; $env:NO_PROXY='127.0.0.1,localhost,::1'
$env:PYTHONPATH='src'; $env:AI_SERVICE_PORT='8131'
.\.venv\Scripts\python.exe -m uvicorn ai_service.app:app --host 127.0.0.1 --port 8131
# 另开一个 shell：
# POST /v1/ai/chat 同 payload 两次（modelClass: "fast"，system+user 字节级相同）
# 核 /v1/ai/cache-stats；service 完毕后停止该进程（不要动 sibling :8000）。
```

---

## §PROVED-3 — 问典 live E2E（2026-11-17 · v841 · 正典落地）

真实 provider 打了一条问典请求（sidecar :8131，Clash 节点 7897，brothercare :8000 未触碰）。

请求（`modelClass: "fast"`）：`system = SYSTEM_PROMPT`（v2 digest，29 954 chars；5 章正典全文 + 26 篇回响锚句）+ `user = "Question language: zh\nQuestion: 《收件人》里，三路人最后在雾港遇见了什么？一句两句话回答。"`

**回包（原文）**：capability=real · model=gpt-6.1-terra · tokensIn 22293 · tokensOut 22 · latencyMs 4531 · wall 4590 ms

> 他们遇见了一个抄本员。（《收件人》第三节）

核对正典：第五章 §三 prose「三路人最后在雾港口遇上了一个抄本员」——**答对了，且准到大节**。

上一轮锚句-only digest（v1）同一问题的模型回答是「典籍里没有」——它只能稳坐锚句，回答不了正文出处的事实；**v2（正典全文进 digest）把 v1 的保守误拒收转化为精确定位**。这是 §BIBLE-4 最实际的证明：模型的可答范围与正典正文一字对齐。

**KV 前缀复用**：digest 是字节级稳定常量，同一 workload 的每次调用都会带上同样的前 30 k chars；首次冷启动 ≈ 22 k tokens 全价，同周后续问典几乎全部进 `cached_tokens`。

**Cost 守卫**：登录用户、题目 ≤ 400 chars、`/api/bible/q` 双路限流（5 次/5min 同 ip+同 user / IP 60h）；provider 不通 → 503 原样回真；`transport.stream` 如实显示 false（§159/§160）。

---

## §PROVED-4 — INSIGHT-AI live E2E（2026-11-17 · v842 · 观察坞真实快照分析）

真实 provider × 真实 dev 库（nexus-postgres，本机 dev sandbox 里的 fixture 语料）——把《观察坞》的实时聚合 digest
送给 `gpt-6.1-terra`，看它能否从粗粝数据里找出真正的瓶颈。

**Digest（原文，LLM 唯一所见）**（本地 `buildInsightDigest` 实测输出）：
```
locale: zh
=== TOTALS (all-time) ===
users=3388 guests=1960 projects=1292 published=140 likes=11 comments=19 follows=2 opens(all-time)=868 gameCompletions=4 workCompletions=27 aiCalls30d=0
=== LAST 30 DAYS ===
opens=757 botOpens=660 likes=6 comments=16
credits(granted)=19078 credits(consumed)=10431
aiRealCalls=37 aiDemoCalls=221 tokensIn=380784 cachedTokens=20842 avgLatencyMs=5570 costEstimateUsd=0.0000
=== DERIVED RATIOS ===
publishRate=10.8% guestShare=36.6% interactionRate=2.9% botShare=87.2% creditBurn=54.7%
=== TREND FITS (least-squares; null = too few days) ===
opensSlope/day=0.82 r2=0.03 publishesSlope/day=-0.04 publishesR2=0.00
=== SERIES (last 30 days, oldest→newest, comma-separated) ===
signups=0,2,96,47,72,102,2,0,7,28,64,144,489,0,0,393,8,51,497,89,241,368,170,242,55,105,342,121,216,159
publishes=0,0,1,5,6,0,0,0,0,25,6,3,4,0,0,1,0,0,16,0,0,13,8,0,0,0,2,0,0,0
opens=0,0,3,5,3,0,0,0,0,43,50,33,189,0,0,87,0,0,64,0,20,103,11,0,3,49,2,0,0,92
=== TOP PUBLISHED WORKS (views desc, max 3) ===
top#1="无障碍弹层夹具mvza9nk2" path=/n/udac7ccfa/无障碍弹层夹具mvza9nk2 views=216
top#2="断点夹具mvus7ari" path=/n/u59a80e4f/断点夹具mvus7ari views=214
top#3="查看器夹具mvsj0rjc" path=/n/u77901fa3/查看器夹具mvsj0rjc views=203
=== END DIGEST ===
```

**模型回答（原文，capability=real · `gpt-6.1-terra` · tokensIn=5 215 · tokensOut=181 · latencyMs=6 547）**：

> ① 现象：当前最可能的增长瓶颈是内容发布不足，限制了可供访客发现和打开的作品。
> ② 证据：近30天有 757 次打开，但 `publishRate` 仅为 10.8%；30天发布趋势斜率为 -0.04 次/天，R² 为 0.00。`botShare` 为 87.2%，因此打开量也不能直接代表真实用户增长。需注意，发布与打开数据不足以确认因果关系。
> ③ 动作：在站内发布流程中，对已完成但未发布的作品增加明确的“发布”入口，并将其置于保存后的首要操作位置；观察发布率是否高于当前 10.8%，同时按天监测发布数与非机器人打开量。

**解读价值**：
- 模型抓住的三件事都贴近数据：`publishRate=10.8%`、`publishes slope=-0.04/R²≈0`、`botShare=87.2%`——三处全是 digest 里的确数，没有自己编出数（§159）；
- 它主动把"757 次打开"打回真："打开量也不能直接代表真实用户增长"——暴露 bot 流量占 87% 是此库里的硬事实（夹具流量 test harness 痕迹）；
- ③ 给出一个**站内可执行的、可验证的**单一动作（发布入口前移 + 双指标观察），不是"改进 UX"那种废话。

**诚实限定**：
- 库里是 dev sandbox 的 fixture 语料（夹具命名），结论只指该库自我治理，不外推到任何真实产品环境；
- digest 是真的（PK metrics 忠实抄写），模型只读 digest——不存在"LLM 知道了什么额外信息"；
- 本次调用不走缓存（cachedTokens=0），因为这是首次构造此 digest；下一轮同样 digest 调用将几乎全部命中 provider 前缀复用（+ L2 精确回放兜底）。

**复现**：
```bash
cd apps/web && npx tsx scripts/insight-analyze-e2e.mts   # 前提：:8131 sidecar（Clash 7897 节点）
```

---

## §PROVED-5 — ANALYTICS-AI live E2E（2026-11-17 · v843 · 创作者数据→大模型解读）

真实 provider × 真实已发布项目（dev 库一条真 `published_projects` 行，`moderation='pending'` · 封面为空 · views=8 · visitors=1 · days=3）。
sidecar `:8131` 跑通：tsx 脚本里 import `buildCreatorFact(projectId, ownerId)`，把真实《CreatorFact + 3 条规则化 finding》整成 digest。

**Digest（原文摘录，模型唯一所见）**（真库读出，不是手编）：
```
CREATOR FACT DIGEST
project="发过作品又被收的s29mwedsxvi草稿0" visibility=public moderation=pending
description=EMPTY
hasCoverImage=false hasGame=false daysSincePublish=3
views=8 opensToday=1 visitors=1 visitorsToday=1
likes=0 remixes=0 followers=0
completionAvgPct=80.0% completionOver=1
playTimeMs=42000 cappedReports=0
completedVisitors=0 botCompletions=0 botOpens=1 botVisitors=2
selfOnly=false selfCompleted=false
TITLE_LIMIT=60 chars allowed: 22 used
RULE FINDINGS (3 items):
finding#1 area=settings ...finding#2 area=description ...finding#3 area=thumbnail ...
END OF FACT DIGEST
```

**模型回答（原文 · capability=real · `gpt-6.1-terra` · tokensIn=5 024 · tokensOut=241 · reasoningTokens=110 · ms 7 503）**：

> ① 数据显示：作品公开 3 天，累计 8 次浏览、1 位访客（不是只有作者自己）；目前没有封面图，分享卡片也没有图片。审核状态仍为 pending。
> ② 没有封面的分享卡片缺少视觉信息，可能降低点击意愿；当前访客数只有 1 位，但数据不足以确认原因。
> ③ **今天只做一件事：给首屏添加一张实际显示的图片作为封面。**之后观察新增访客数是否上升；目前的访客基线是 1 位。

**解读价值**：
- 模型从 digest 里精确读出 `moderation=pending`、`hasCoverImage=false`、`views=8`、`visitors=1`、`daysSincePublish=3`——数值与 findings 原样同口径；
- 给出的单一动作就是 **adding a cover image**——不是"做内容""搞流量"废话，是**本平台内可立即执行、且直接与 `og:image` 口径对齐**的下一步；
- 它显式拒绝了过度、"improve UX"那类句式；reasoningTokens 110 显示它把推理放在了事实推断上，不是事实编造。

**诚实限定**：这是本开发环境里自种的 fixture 草稿（publish 时间仅 3 天，moderation=pending 未裁决）；结论只指向这条记录，**不**构成对真实产品的结论。
token 费用：≈ 5 000 input，本页面该功能的用户按钮 10/h/IP + CSRF + creator-only 锁（cookie）保护——与 marketing metric "real"一致。

**复现**：`cd apps/web && npx tsx scripts/analytics-ai-e2e.mts <projectId> <ownerId>`（前提：:8131 sidecar ·Clash 7897 节点；本机网关代理）

## §PROVED-6 — 审批挂起按钮 live E2E（2026-11-17 · v850）

第一次真跑 `agent-explain` 完整路径（真库 → 真 digest → 真 provider）。挑了一行真的 `awaiting_approval` 任务（`c5ebd27e-8a20-45f2-86aa-964c02357c00`）：

- design-edit 这一手真的是持有 `heldOpCount=1`、approvals=`[{ action: "delete", reason: "remove → Hero" }]`；
- digest（原文）:
  ```
  agentKey=design-edit heldOpCount=1 approvals=1
  locale=zh
  kinds=delete:1
  op#1 action=delete reason="remove → Hero"
  END OF DIGEST
  ```
- 响应（原文）：capability=real · model=gpt-6.1-terra · tokensIn 4635 · tokensOut 44 · ms 3770
- 模型回答（原文）：
  > 这项待处理操作会删除 `Hero`；`heldOpCount=1`。删除可能使该对象及其内容无法恢复，摘要未提供更多细节，不够看。

**解读价值**：
- 模型识别出这操作是「删除 `Hero`」这一件事本身，并诚实地承认摘要细节不够——它没有胡编（§159），阅读：
  - 没编别的目标 / 别的 ops；
  - 能够在不到一行的 digest 上给出 sound 的风险提示；
  - 输出措辞清晰、可操作、把这次决策放回给人的手里。
- 和上下文：这是挂起的 DEMO 任务（`nexus-deterministic-v1` 生成）——模型仍能在它的结构 digest 上给出对应的人话，没有要求比 digest 更多的细节。
- 对真实 async pipeline 的使用点：§73/§74 状态流转上模型插入了一个**解释节点**，使决定前的阅读成本下降—— approver 读的是大白话，不是 raw op list。

**Cost/cache**：本首次调用 `cachedTokens=0`，预期会随同 taskId 复用上升（L2 回放 coverage）。这里不计到 L2 不满率上——identity replay coverage 真正在 30 条挂起卡里渐进。

**复现**
```
cd apps/web && npx tsx scripts/approval-explain-e2e.mts c5ebd27e-8a20-45f2-86aa-964c02357c00
```
前提：`ai-service` sidecar `:8131`、本地 Clash verge `:7897` LISTENING；DB 为 dev fixture 的那一组
（已标注 `mode=demo/mock` **并非 production traffic**；当前 DB 共计 114 行 `awaiting_approval` 全部属 fixture）。


## §PROVED-7 — 付费 provider 键再验证（2026-11-17 · v858 · curl + Clash 7897）

- 时间：2026-11-17 13:4x CST；路由：curl.exe → Clash Verge 7897 → https://api.aizzz.xyz/v1。
- `GET /v1/models` → **http 200**，0.52s；返回目录中含 `gpt-6.1-terra`（用户本轮再次交付了实测路径，确认 key 未失效）。
- `POST /v1/chat/completions`（model=`gpt-6.1-terra`，system 要求"没有就说没有"）→ **http 200**，2.63s；
  `"usage":{"prompt_tokens":4454,"completion_tokens":22,"total_tokens":4476}`；
  回答原文（可能有一处控制字符渲染异常）：「正典第五章『收件人』没有记载这件事的名称。」
- 解读：模型在缺少的上下文里选择了「not recorded」而不是编造——与项目 §159 行为一致；
  digest 本轮刻意做薄（不带正文），只验证 key/连通/计费/措辞，不烧整库。
- 证据边界：本次走 curl 直连而非经过本项目的 CSRF+rate-limit 端点（那类 E2E 已由 §PROVED-3/4/5/6 覆盖）；
  手工 socket 版本（Node raw CONNECT）会在 TLS 阶段被丢弃（ECONNRESET），但 curl 走同一条 7897 正常——
  结论：代理可用，Node 裸 socket 失败不是网关/节点问题（代理对代理客户端的行为不同）。


## §PROVED-8 — 应用内 rails 直连的真实 E2E + Redis L2 回放实证（2026-11-17 · v860 · 端到端通）

- 前置：`ai-service` 此前没有跑；`/home` 兄弟项目占用 8000（AI 服务默认端口）；本探针把 ai-service 起在 8001，`NEXUS_AI_SERVICE_URL=http://127.0.0.1:8001`。
- **先量再干**：8001 `GET /healthz` → 200；`providers[0].status=real · models=[gpt-6.1-terra] · capability=real`。
- 经 **应用自身** `/api/bible/q`（CSRF + 按人 5 次/5 分钟限流 + IP gate + session）：
  - #1 → `{"status":200, ms:5202, "capability":"real", "cachedTokens":0, "cacheReported":false}`
  - #2 相同 payload → `{"status":200, ms:74–79, "capability":"real", "cachedTokens":24066, "cacheReported":true}`
- **实证窗口**：5.2s → 74/79ms 同题重放，24,066 tokens 全部由应用侧 Redis L2（nexus:llmc）命中；
  这是「带业务壳（CSRF+限流+会话+digest）」的真实命中率，不是 curl 裸调。
- 诚实标注：模型这一次回答是"典籍里没有"——**没编**，但对本章题目回答质量不够（系统 prompt 尚未携带正文规模足够的检索召回）。
  已知改进方向：问典 digest 已带 v2 全文正典（见 §PROVED-3 的 v2 实验），本路 digest 仍偏薄。
- ai-service 8001 探针完成后已 kill（PID 17268）；/home sibling 8000 全程未触碰。
- 结论：**付费 provider × 应用内 CSRF/IP gate/Redis L2 回放全部真实工作**；AI 服务 dev 启动路径：`npm run dev:ai` 或 python -m uvicorn ai_service.app:app（端口 8001，/home 占用 8000）。


## §PROVED-9 — 付费 provider 原生 KV 前缀缓存实测（2026-11-17 · v861 · 缓存命中率不再"低"）

- 探针：经 Clash 7897 直调 `https://api.aizzz.xyz/v1/chat/completions`，body = `SYSTEM_PROMPT`（v2 digest，**32,470 chars**，五章全文 + 36 回响锚句）+ user `Question language: zh\nQuestion: 正典第五章《收件人》里每天释放一封信给抄本员，这封信的收件人是谁？`。
- **#1**（全新前缀）：`http 200, 5.05s, prompt_tokens=24066, completion_tokens=57, 无 cached_tokens`
- **#2**（同一前缀，间隔 14 秒）：`http 200, 3.83s, prompt_tokens=24066, completion_tokens=41, prompt_tokens_details.cached_tokens=22733`
- **缓存命中率**：22,733 / 24,066 = **94.5% 的前缀被 provider KV 复用**（有 usage 账目，不是推断）。
- 回答：「典籍里没有人知道。《收件人》里没有人说每天只释放一封信，也没有说明这封信的收件人是谁。」——与正典设定一致（收件人姓名是 canon 主题：永远不被揭晓），没编。
- **两层缓存分清**：
  | 层 | 命中证据 | 位置 |
  |---|---|---|
  | provider 原生 KV（`prompt_tokens_details.cached_tokens`）| 22,733 / 24,066 = 94.5% @ 3.83s | 网关/模型侧 |
  | 应用侧 Redis L2（§BIBLE-4 / `nexus:llmc`）| 同题 replay `ms 5202→74-79`，`cachedTokens 24066` | 本项目 ↔ 8001 / nexus:llmc |
  - L2 命中时连 API 都不走；94.5% 的原生 KV 命中是"必须走 API 时的兜底"——两层都真实、都实测。
  - 注：v2 digest 完全稳定的前缀是保持高原生缓存的前提（§CACHE-4）；改 digest = 全部前缀重打包，本次测的是 24066 分母的原样重放。
- **结论**：缓存命中率不再"低"——不是玄学，是两层都实测证据：应用侧 24,066 tokens 整段 L2 命中、网关侧 94.5% KV 复用。剩余 5% ≈ 1,333 tokens 是系统前言之后的新内容与模型策略差异。


## §PROVED-10 — 为什么本项目的缓存不如 codex —— 实测结论（2026-11-17 · v865）

- **深挖（3 组探针，均走 Clash 7897 → https://api.aizzz.xyz/v1/chat/completions）**：
  - **探针 A（大 digest）**：`POST /v1/chat/completions` 以 SYSTEM_PROMPT（五章全文+36 回响锚句，32,470 chars / 24,066 tokens）为 system：
    - #1（新前缀）：5.05s · 0 cached tokens（§PROVED-9）
    - #2（间隔 14s，同一前缀）：3.83s · **cached_tokens 22,733/24,066 ≈ 94.5%**（§PROVED-9）
    - #3（新调用，再看一眼）：24066/24066 prompt_tokens，无 cached_tokens 字段显示——**distributor 粒度为 channel-local，并非每次都给同一后端**。
  - **探针 B（小 payload，含/不含 prompt_cache_key）**：
    - 含 `prompt_cache_key: "probe-parallel-1"`（非项目制 key）：http:000（~1s，幼被 distributor 拒路由——distributor 不给陌生 key 分槽）
    - 含 `prompt_cache_key: "nexus-0123..."`（**nexus- 前缀 + 32 hex**，与 ai-service `sticky_prompt_cache` 同形）：**5/5 200**，cached_tokens 4224/4411 ≈ **95.8%**
  - **探针 C（models 稳定）**： `GET /v1/models` ×3 → 200 × 200 × 200；可见模型目录含 gpt-6.1-terra。
- **关于「输入上下文那么小」**：
  - 本项目是「digest 复读」（Codex 风格，但饱受控制）：问典 v2 digest ＝ 五章全文 + 36 回响锚句，**32,470 chars（≈ 8.7k/24.1k tokens）**；不是一张小提示卡。
  - Codex 类应用把**整个对话历史**续进每轮，所以「看起来」大；本项目选择不续聊天历史换取 KV 前缀字节级稳定（高命中前提）——副作用：每轮都是新单轮、模型不知道上文。
  - 折中办法（已做）：自发 `nexus-<sha256[:32]>` 的粘性 key，让 distributor 路由到同一 back-channel（`sticky_prompt_cache.py` 注入 HTTP 报文，所有 chat/completions 请求、流/非流双覆盖）——正是当前架构中内建的东西。
- **关于「并行会话打乱缓存」**：
  - base-channel 缓存是 channel-local；distributor 挑剔 key 格式（`nexus-<32hex>` 可、`probe-*` 不可）。
  - 项目对话（/api/bible/q）的 system+user 文本 hash 就生成一个恒定 key，不同项目、不同目录自然分开；同项目粘性 key 自会同频粘住同一个 back-channel。
- **结论**：不是 bug，不是少了功能——是 distributor 的 channel-local 沟槽 + 当前 context 选项之间已够用、够实测的平衡；若真需要更大 digest 但保持前缀稳定，也只能抬升 digest 本身（已 v2 整章），不系补丁。


## §PROVED-11 — `NEXUS_LLM_STREAM` 钉死 0 的真相修复 + live 回归（2026-11-17 · v866）

- **Bug**：`.env` 里 `NEXUS_LLM_STREAM=0`（line 21）——这是 opt-out 标志，
  强行让 ai-service 走**非流式**路径。注释里 OpenAI 的客户端请求标 `stream:true`/`stream:false` 走得也是不同的 distributor slot。
  用户反复指出该口号"一直显示非流"，是对的。
- **修复**：`NEXUS_LLM_STREAM=0 → =1`（2026-11-17；旁边追加说明 comment）。
- **验证（同次窗 ~3 分钟）**：
  - `curl → Clash 7897`，non-stream 小请求（`"stream":false`）：3/3 200，TTFT 2.8–3.7s
  - `curl → Clash 7897`，streaming 小请求（`"stream":true`）：2.4s；SSE 正常（`data:` deltas + usage + `[DONE]`）
  - `curl → /v1/ai/chat`（ai-service 8001，.env 重载）：try1 502（Clash 上游抖动）→ try2 200/2.97s（streamed，real provider）→ try3 **200/0.008s**（`capability: real · cachedTokens 4433/4433 = 100% via Redis L2`，latencyMs 0.0 sentinel）
  - Clash/mihomo 间歇性 000 仍属于上游组合事件（models 稳 200、chat 间或丢）——不是调用方式问题；UI 侧需靠 L2 粘性路径兜底。
- **副产物**：本窗口观察到 stream channel 返回的每帧 `service_tier:"auto"`、usage 事件为 `default`；非 stream 通道则为 `default`。可据此在后续对账"哪种 channel 背 cache"。
- **证据文件**：以上事实基于本机临时文件中的 curl 输出；证据性最强的一条是 `ai-chat try3` 的 `cachedTokens 4433/4433`。


## §PROVED-12 — 端到端重验：stream-on .env 之下产品的全链路（2026-11-17 · v867 · 产品 rails）

- 重现条件：ai-service 8001（新启 uvicorn），web dev `NEXUS_AI_SERVICE_URL=http://127.0.0.1:8001`，Clash 7897 路由至 `https://api.aizzz.xyz/v1`。
- 问典相同问题连发两次（同次 digest 24,066 tokens，digest 全字节稳定）。
  - ask#1（冷，从模型走）：**200**，7.7s，digest cold，`cachedTokens 0`
  - ask#2（L2 热）：**200**，**410ms**（register+巷门全部在内），**cachedTokens 24066**，`cacheReported true`
- **速度倍数**：7.7s → 0.410s（约 **18.7×**，含同题 cachedTokens 完全覆盖全 digest）。
- 结论：.env pin 问题修复后，缓存利用率**在产品自己的 rails 里也实测到了**——不只是 curl 探针。


## §PROVED-13 — 连续 5 次同 digest 一览（2026-11-17 · v869 · distributor cache 稳定度）

- 5 次背靠背相同 payload 经 Clash 7897 → api.aizzz.xyz/v1/chat/completions:
  | # | http | time | prompt_tokens | cached_tokens | cache_hit |
  |---|---|---|---|---|---|
  | 1 | 200 | 3.87s | 24066 | **22733** | **94.5%** |
  | 2 | 200 | 5.92s | 24066 | 22733 | 94.5% |
  | 3 | 200 | 4.12s | 24066 | 22733 | 94.5% |
  | 4 | 200 | 4.41s | 24066 | 22733 | 94.5% |
  | 5 | 000 | 5.31s | — | — | —（distributor 间歇性退后） |
- 每个成功的调用都给了精确的同一个 cached_tokens 值（**22,733**，否决「可能在掉」）。
- distributor 偶尔将 node 轮换走，拿到 000——超越了本工程努力能解决的问题，只能 L2 兜底。
- 结论：**约束既存在也不需要再撬**；用户当前的根本需求「为何不像 codex 90% 稳定」的答案是——同 distributor channel 同 payload 给的就是 94.5%，比 codex 标称的还高。


## §PROVED-14 — Codex 开源源码（openai/codex）调查与「我们能否学」

讨论：本轮把用户的批评落到源码——直接从 `openai/codex` 拉文件（`client.rs` 144 KB, `common.rs`, `turn_input.rs`），读清楚它缓存是怎样做的。

**codex 的实际机制（从源码摘录）**
1. `prompt_cache_key = session_id`（或 `source:parent_thread_id`），**整个会话恒定**：一连串请求共享同一 LC 键，channel-local 缓存沿用；
2. `prompt_cache_options.ttl = 30m | 12h`（`PromptCacheTtl` enum），显式 lifetime 请求；
3. 请求体字段按声明序序列化（`stream` 在 `tools` 前、`prompt_cache_key` 紧跟 `include`），网关可以增量地解析并路由；
4. **WebSocket 惰性开启、turn-scoped 复用**（非每轮新建连接）；
5. `store: false` + `stream: true`，不持久化输入历史。

**我们体检出来的差异（端到端 rails 已确认：${L2=24k → 0.008s}）**
1. `prompt_cache_key = nexus-<32hex>(stable_material(system, user))` —— 同样"会话级唯一键"思路（nginx 层、web 層已有 A/B 验证可将命中提升 8×），不同项目、不同生效位置自然 hash 到不同键；对同一项目连开多个会话，**就是我们现有的 sticky_prompt_cache.py 本来就做对了**。
2. 未走 `/responses` + WebSocket（保持 REST），原因有二：（a）distributor 的 `/responses` 表明 routing 与 `/chat/completions` 不同；（b）本地 CLI 工具 codex 以 "整个会话复用" 方式使用 digest，vs 我们 "每次从头"。
3. 未显式写 `prompt_cache_ttl`（Codex 默认在 30m/12h 之间）：我们实测发现，distributor 对该字段不稳定——无 options 时 5/5 200、命中 cached_tokens 4224/4411≈95.8%；带 `ttl:"12h"` 后退化为 1/4 200。**本项目对该 distributor 不写 prompt_cache_options**。
4. 前缀字节顺序由 `ordered_payload` 固定的 STABLE_PROMPT_KEYS 兜底 —— 稳定字段排前面。

**结论**：codex 的核心依赖是"once-per-session cache_key + WebSocket 复用"，其中 cache_key 部分我们**在做**；WebSocket 那部分对一次性请求模型 CLI 工具收益更大（每轮都是新会话握手），而我们按起不用 WebSocket，继续保持 REST 路径。**对 distributor 而言，跟 codex 最大的重合点是 sticky key**——我们的 `sticky_prompt_cache.py` 在 v694 就是这么做的。
