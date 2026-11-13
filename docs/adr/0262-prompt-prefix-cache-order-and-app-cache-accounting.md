# ADR 0262 — 提示词前缀序决定缓存命中率；应用级缓存命中必须如实记账（§CACHE-2）

- 状态：ACCEPTED（2026-11-13）
- 上游：ADR 0123（SSE 默认 + prompt_cache_key + 前缀序初版）、ADR 0119（Redis completion cache）、ADR 0113（缓存组件语义未定项）
- 范围：`apps/ai-service`（`design_prompt.py` / `completion_cache.py` / 测试）、`scripts/`（两个新判据）
- 兄弟：ADR 0171（capability 短 TTL 缓存，web 侧那一片）

## 背景

用户**第二次**报告同一件事：「调用我的 openai 大模型 api 的时候缓存命中率这么低，而且一直显示非流，
好像显示流的时候缓存命中率好的多，肯定是调用方法出了问题。」

上一轮（ADR 0123 / §AILIVE-4）的结论是「缺 `prompt_cache_key`」，并给出了 95.3% 命中的读数。
但那些读数全部来自**同一份 payload 连发两次**。真实 Studio 不是这样：同一个项目里目录逐字节不变，
只有选中节点、批注、近期改动与诉求在变。旧证据量的是「重放」，用户遇到的是「连续多轮」。

## 先量：两个零成本判据

### 1）字节前缀复用率（`scripts/prompt-prefix-audit.py`，新增）

不联网，直接 import 生产同源的 `build_prompt`，构造「目录不变、现场在变」的三轮请求，
量相邻两轮 `user` 载荷的公共前缀 / 较短者长度。

重排前：

```
system 跨轮逐字节稳定 = True
system 跨 Agent 稳定  = False          ← _agent_note 拼在 system 里
user 字节/轮          = [24628, 24628, 24634]
同 payload 重发前缀率 = 100.00%        ← 旧证据量的就是这个
真实连续多轮前缀率    = ['0.45%', '0.45%']
```

**0.45%（≈111 字节 / 24.6 KB）**。原因：旧键序把
`selection` → `selectionDigest` → `annotations` → `recentChanges` → `corpus`
排在 `pages/frames/components/assets/interactions/tokens` 之前。provider 的自动前缀缓存
按字节前缀命中，第一处不同之后全部作废——那份占体量 95% 的目录**从未进过缓存**。

### 2）真机 A/B（`scripts/probe-cache-turns.py`，新增）

同一份内容按新旧两种键序重排，各用独立 `prompt_cache_key` lane，各发两轮。
结果**打脸了「顺序决定网关读数」这个假设**：

```
A 新序 turn2: prompt=13239 cached=5248 (39.6%)
B 旧序 turn2: prompt=13799 cached=5471 (39.6%)
差 = -0.0%
```

跟进四个受控实验才看清网关的真实行为：

| 实验 | 与首请求的前缀关系 | 网关报的 cached |
|---|---|---|
| L1 同 payload 连发 | 100% | 10865 / 13695 = 79.3% |
| L2 只改最后 40 字符 | 99.8% | **13056 / 13222 = 98.7%** |
| L3 真实下一轮（第 96% 处开始不同） | 96.1% | **5248 / 13239 = 39.6%** |
| L4 内容完全不同（第 2 字节分叉） | 0% | **5248 / 21425 = 24.5%** |

**L4 是决定性反证**：两份毫无重叠的内容也报 5248。同一份内容两次请求报的
`prompt_tokens` 还能差 500。结论：**这个网关的 `cached_tokens` 不可作为精密仪器**，
拿它算「命中率 X%」是给一个抖动数字编故事。

但 L2 与 L3 的对比同时证明**前缀缓存本身是真的**：只改尾部 40 字节 → 98.7%；
改在第 96% 处 → 39.6%。所以「把稳定字节放前面」这个方向成立，只是**证据必须由
我们自己可复算的字节指标来给，不能由网关的自报数来给**。

### 3）流式到底有没有 usage

同一 payload 分别非流与流式（`stream_options.include_usage=true`）：

```
[non-stream] usage = {"prompt_tokens": 21494, "completion_tokens": 36, ...}
[stream]     usage = {"prompt_tokens": 7663,  "completion_tokens": 36, ...}   ← 34 个 SSE data 帧
```

**流式有 usage，token 数照常到达**。ADR 0123 之前那句「流式 usage 帧不含 cached_tokens」
被后续证据（`dc1c31eb`）读成了「流式拿不到账本数据」，进而有了「为看见 cache 而牺牲流式」
的倾向——那是误读。流式保留：首字更早，token 同样可记账。

**继续追查后必须再修正一次（2026-11-13 晚，本节初稿写的是「流式下 cached 一项永久缺席」，
这句过强，已按下面读数改）。** 同一段前缀连发两轮流式：

```
stream call1 (冷) usage = {"prompt_tokens": 7410, "completion_tokens": 29, "total_tokens": 7439}
stream call2 (暖) usage = {"prompt_tokens": 7410, "completion_tokens": 29, "total_tokens": 7439,
                           "prompt_tokens_details": {"cached_tokens": 7168}}
```

**流式不是「不报」，是「冷前缀不报」。** 第一轮前缀没进缓存池，provider 给不出可报的数；
第二轮同一前缀已在池里，流式一样把 `cached_tokens` 送回来。这与「prefix cache 有最小可缓存
长度」一致：短 prompt、首轮、前缀刚变过，这几种情况下该字段不出现。

于是不变的那条只剩**「没报」≠「报了 0」**——而它现在有了第二维度的解：
`Completion.cache_reported`（见决定 6）与 `ProviderCacheLedger`（分母只算报过账的样本），
不再靠单看一个 `cached_tokens` 猜。

## 决定

1. **载荷三块序**（`design_prompt.build_prompt`）：
   ① 稳定块（`contextSource` / `pages` / `frames` / `components` / `assets` /
   `interactions` / `tokens` / `totals` / `omissions` / `catalogTrimmed` / `code` /
   `indexChars` / `budgetChars`）→ ② 现场块（`pageId` / `modelClass` / `viewport` /
   `selection` / `selectionDigest` / `annotations` / `recentChanges` / `corpus` /
   `agent` / `agentNote`）→ ③ 诉求块（`intent` / `prompt` / `variants`）。
2. **system 只回常量**：`_agent_note` 从 system 移到载荷。理由是位置而不是措辞——
   system 是整条前缀的第一段，带上每轮会变的内容，换 Agent 就从第一个字节失配。
   「没有 `design.patch` 就不许改文档」这条规则改写进 `SYSTEM_PROMPT` 第 7 条（静态）。
3. **稳定块剔空**（`_compact`）：递归去掉 `null` / `""` / `[]` / `{}`。
   `0` / `false` 不剔——「0 个实例」与「没给这一项」是两件事。
   只作用稳定块：现场块的 `missing: []` / `dropped: []` 是「这次没有」的答案。
4. **启用应用级 completion 缓存**（`NEXUS_LLM_COMPLETION_CACHE_URL` → 真 Redis），
   并修正命中记账：命中时 `cached_tokens = tokens_in`、`latency_ms = 查缓存真实耗时`。
   直接回放当初那份 `Completion` 会把「没花的 token、没等的 1.6 秒」再报一遍。
5. **判据升级**：`test_prompt_order.py` 从「键顺序」改为直接断言
   **连续两轮公共前缀 ≥90%**，另加 system 跨 Agent 恒等、同请求重建字节相同两条。
6. **补第二维度 `Completion.cache_reported`**：`providers/base.py` 默认 `False`，
   语义是「provider 没报」而不是「报了 0」。`openai_compatible._usage_details`
   返回三元组并区分三种形状（`prompt_tokens_details.cached_tokens` /
   `prompt_cache_hit_tokens` / 都没有）。旧构造点不感知，行为不变。
7. **缓存读数自证**（`cache_telemetry.py`，挂在 Registry 上、随实例隔离）：

   | 账本 | 它回答什么 | 分母 |
   |---|---|---|
   | `PrefixReuseTracker` | 我们的提示词本身可不可缓存 | 全部请求 |
   | `ProviderCacheLedger` | provider 到底报没报 | **只算报过账的样本** |
   | 应用缓存 `stats()` | 同一个键有没有被问第二次 | 全部请求 |

   前两者由 `/v1/ai/cache-stats` 暴露（**不塞进 `/healthz`**：healthz 有 1.5 s 预算、
   被 web 每页探测，塞进去等于让运维面板拖慢探活）。零样本时 `reuseRate` /
   `reportedHitRate` 返回 **`null` 而不是 `0`**——`0%` 是一句具体的谎，它暗示「试过但全没命中」。
   存储纪律：只留十六进制摘要，**不留 prompt 正文**；有界 LRU（512），进程内，重启即失，
   不声称跨实例。

## 后果（实测）

字节前缀复用率：

```
真实连续多轮前缀率 = ['96.05%', '96.04%']   （阈值 90%，PASS）
system 跨轮/跨 Agent 逐字节稳定 = True
```

token 体量（契约夹具 `ai-request-with-index.json`）：

```
剔空前 8486 B → 剔空后 7691 B（省 795 B，9.4%）
```

应用级缓存端到端（真 Redis，同一 `AiRequest` 连发两次）：

```
call1 miss：wall 8689.0ms · tokensIn 22846 · cached 0
call2 hit ：wall   71.4ms · cached 22846（= tokensIn，100% 复用）· latencyMs 31
墙钟 8689ms → 71.4ms（122×）；healthz llmCache hits=1 misses=1 hit_rate=0.5
```

三层读数端点（`GET /v1/ai/cache-stats`，同一进程内两轮真调用后）：

```
"prefix"  : {requests: 2, reused: 1, uniquePrefixes: 1, capacity: 512, reuseRate: 0.5}
"appCache": {enabled: true, backend: "redis", hits: 1, misses: 1, hit_rate: 0.5,
             shared: true, degraded: false, namespace: "nexus:llmc"}
"provider": {reported: 2, missing: 0, cachedTokensTotal: 43362,
             promptTokensTotal: 45692, reportedHitRate: 0.949}
```

`provider.missing = 0` 是这一片推翻自己初稿的那一行：两次都报账了，
其中一次还是流式。`reportedHitRate` 的分母只算这 2 次报过账的样本。

## 仍欠（诚实边界）

1. **网关 `cached_tokens` 不可信**：L4 证明它会报一个与内容无关的数。
   本项目**不**用它做任何"命中率 X%"的对外承诺；对外只能说我们自己可复算的
   「字节前缀复用率」与「应用缓存 hits/misses」。
2. **`UsageSchema.cachedTokens` 仍是 `default(0)`**（web 契约那一侧）：ai-service 已经有
   `cache_reported` 这一维，但跨服务契约还没带上，所以 web 侧仍分不出「没报」与「0」。
   要分清需要在契约里加 nullable 或加 `cacheReported: bool`，属跨模块改动，另立。
3. **`cachedTokens` 尚未在 UI 渲染**：只进账本。用户能看到的仍是网关控制台那张表。
   做一块诚实的缓存读数面板是下一步（三层：前缀复用率 / 应用缓存 / provider 自报）。
4. **前缀复用率 96% 不是 100%**：尾部 4% 是每轮必然变的现场 + 诉求，这是信息本身，
   压不掉；要再高只能减少现场内容，那是产品取舍不是工程优化。
5. **`NEXUS_LLM_COMPLETION_CACHE_URL` 仍默认关闭**：本机 `.env` 已开（gitignored），
   仓库默认保持关闭，因为启用需要真 Redis；连接失败 fail-open。
6. **未 push**（约定）。

## Amendment（同日收尾）：把三本账做成一块能看的界面

前面几节把「缓存到底有没有生效」拆成了三本互不冒充的账，并给了端点
`GET /v1/ai/cache-stats`。但**判据没有仪表就只是判据**：运维仍然要 curl 才知道这一台
此刻是什么状态。而用户连着两次问的正是「为什么命中率这么低」——那个问题的正确答法
不是一句解释，是一块他能自己看的界面。

### 新增

- `apps/web/src/server/ai/cache-stats.ts`：跨进程取 `/v1/ai/cache-stats`。
  **逐字段校验形状**，不用 `as`：`as` 只是让编译器闭嘴，真到了字段缺失那天，
  `undefined` 会一路传进渲染变成 `NaN%`——那不是"读数不对"，那是**编了一个读数**。
  三种失败分开说（没配地址 / 连不上 / 形状不认识），合并成一句"读取失败"等于让人从零查。
- `apps/web/src/app/admin/ai-cache/`：页面 + 面板 + `cache-view.ts`（展示判据抽成纯函数）。
- `apps/web/src/app/api/admin/ai-cache/route.ts`：同一道 role=admin 门 + `no-store`。
- `AdminNav` 加一格「缓存读数」（名单仍收在 `LINKS` 一处）。
- `.cx-*` 样式段：分段条 / 账目网格 / 判定卡。零 hex、零新增颜色 token。

### 四条刻意的诚实

1. **`appCache: null`（缓存没启用）单独一档**，绝不画成 `hits/misses` 四个 0。
   这一条是整片的核心口径在界面上的最后一次落地。
2. **没有样本时不画条**：一根空条会被读成 0%。`Bar` 在 `first === null` 时渲染
   「没有样本，不画比例」而不是一个宽度 0 的 div。
3. **比例的分母写进正文**：`provider` 那个命中率旁边直接写「只算报过账的 N 次
   （M prompt tokens），不是全部 T 次」。
4. **前缀复用率说的是「请求份额」不是「字节份额」**：96% 的含义是"每 100 次请求里有
   96 次建立在已见过的稳定前缀上"，不是"提示词有 96% 的字节被复用"。后者要靠
   `npm run audit:prompt-prefix`。把这两件事混成一句，就是给一个正确的数字配了一句错话。

### 判据

```
apps/web/test/admin-ai-cache-view.test.ts          21 条（null≠0、分段和恒 100、三格文案、
                                                          判定阈值闭区间、四档各有话说）
apps/web/test/admin-ai-cache-visual-style.test.ts  11 条（门禁/轮询/门面类/类都有定义/
                                                          token 全在 tokens.css/零 hex/
                                                          null 独立分支/空条不画/钩子守恒）
verify:no-raw-tailwind OK   verify:census OK（1774 类全部有引用方）   tsc -p apps/web OK
```

### 仍欠

1. **没有真机浏览器读数**：面板的 4s 轮询、390 下的条形图折行、两主题对比都没有截图。
2. **没有跨实例聚合**：这一页只看一台进程（页脚已写明）。多实例要各看各的，或用
   Prometheus 一类的东西聚合——那是另一个工程，不在这一片。
3. **分段条的过渡动画没有在真机上量过掉帧**；`prefers-reduced-motion` 已归零。
