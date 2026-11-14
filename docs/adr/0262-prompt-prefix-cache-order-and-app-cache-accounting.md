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

### 补记：一个只有喂真报文才能发现的 bug

上面那一段写完当天就补了判据（`apps/web/test/ai-cache-stats.test.ts`，14 条），
**第一条成功路径就红了**。原因值得记下来：

`isKnownReadout` 当时同时要求「核心三段形状对」与「`measuredAt` 是字符串」，但
`measuredAt` 是 **web 侧取到时自己打的**（上游只报进程内计数，没有"采样时刻"这个概念）。
于是每一份真实报文都过不了校验，面板在真机上会永远显示"形状不认识"。

**为什么之前没被发现**：这个函数只被两处调用，一处是面板校验自家 API route 端出的
归一化读数（**有** `measuredAt`，能过），一处是 `fetchAiCacheStats` 校验上游原报文
（**没有**，过不了）。只要不喂真报文，两边看起来都正常。

**修法不是一个 `||`，是把校验劈成两半**：`hasReadoutCore`（上游原报文：三段形状 + 数字）
与 `isKnownReadout`（归一化之后：核心 + `measuredAt`）。一个校验函数服侍两个形状，
必然有一边被放松——那正是这个 bug 的成因。

这条与 ADR-0105（"宿主噪声假造了一次 7× 提速"）同族：**一个判据如果从来没被真数据喂过，
它的绿灯什么都不能证明**。

## Amendment 2（§CACHE-3）：把缓存读数送到真正付钱的那个人眼前

前两个 amendment 做完了判据与仪表，但仪表在 `/admin/ai-cache`——**运维视角**。
用户连着两次问的「为什么缓存命中率这么低」，问的是他自己的创作；而他打开 Studio
或任务账本时，一个缓存的字都看不到。`cachedTokens` 从 ai-service 一路传到库里，
在最后一步被丢掉：`usageText()` 只写 `X 进 / Y 出 token`。

这一片补的是最后那一寸。

### 契约：加一维，而不是把已有字段改成 nullable

`UsageSchema` / `TaskUsageSchema` 里 `cachedTokens` 是 `default(0)`——历史 jsonb 没有这一栏。
把这一栏改成 nullable 会让已有的大量老行从「0」变成「读不懂」，而「读不懂」比「没记」更糟。

所以**加一维** `cacheReported: z.boolean().default(false)`：

| 存储 | 含义 | 界面 |
|---|---|---|
| 老行（无此字段） | 没报 | 缓存读数未报 |
| `cacheReported: false` | 没报 | 缓存读数未报 |
| `cacheReported: true, cached: 0` | 报了一次真实的冷启动 | 缓存未命中 |
| `cacheReported: true, cached: N` | 命中 | 缓存命中 N·P% |

`cacheReported` 必须真的进门面（`additionalProperties: false` 的两个契约
`ai-response` / `ai-chat-response` 都加了）、ai-service 两处产出点都写、
mock 写 `false`（DEMO 不经过模型，没有网关可问——那是"没报"，不是"命中 0"）。

### 措辞住在 lib，不住在组件

`lib/usage-cache-text.ts`：`cacheShare` / `cacheText` / `cacheTotal` 三个纯函数。

抽出来不是为了好看——**这几句话会原样出现在界面上，措辞就是承诺**，而钉一个 JSX
表达式只能靠正则猜文本。抽成纯函数后配 13 条判据，逐句钉住：

- 没报时输出里**不出现任何数字**（0 也不许）；
- 报了 0 说「未命中」，不说「没数据」；
- `tokensIn === 0` 时不给百分比（0 做分母算出来的数是编的）；
- 负数被夹到 0，不出负命中率（脏数据不许画成负的）。

### 合计格：分母只算报过账的行

`cacheTotal` **跳过 `cacheReported === false` 的行**。把"没报"按 0 加进分母，
命中率会凭空变小——那是**用数据缺失伪造一个更差的读数**，和伪造一个更好的读数
一样不诚实。一行都没报时 `rows === 0`，界面说「这页真模型行都没报缓存读数」，
并显式写出「"没报"与"命中 0"是两件事，这里绝不画 0%」。

DEMO 行同样不进门：它不经过模型。

### 判据

```
apps/web/test/usage-cache-text.test.ts   13 条（三档互不冒充 / 0 分母 / 负数 /
                                              DEMO 与未报不进门 / 空账本 / share=0 是信息）
apps/web/test/tasks-ledger.test.ts       +2 条（老账本缺 cacheReported → false；
                                              字符串 "false" 不许混过关）
apps/web/test/tasks-visual-style.test.ts  改 1 条（措辞归 lib，组件只许调、不许再写一份）
ai-service                               两处产出点 + 两个契约 schema
```

### 仍欠

1. **Studio 内联没接**。这一片只到任务账本页。Studio 画布上的 AI 面板仍不显示用量——
   那条路走的是 chat 流式，`usage` 在最后一帧，需要另一套解析。
2. **没有真机读数**。判据覆盖了三档措辞，但没有一张 1440/390 下的截图证明它不挤。
3. **`costUsd` 仍是 0**：价格表没接，所以「省了多少钱」这一句还不能说。缓存省下的
   是**输入 token 的钱**，但换算需要单价，那是另一件事。

### Amendment 2 补记：画布上那一枚 chip

Amendment 2 的「仍欠①」写着「Studio 内联没接」。补上了。

`CommandBar` 的生成结果行（`data-ai-result`）多了一枚 `data-ai-cache` chip：

```
[LIVE] 已完成 3 个 op        ● 缓存命中 7168·97%     3 个 op · Ctrl+Z 可整体撤销本次事务
```

三态视觉是**刻意分开的**：

| 状态 | 视觉 | 为什么 |
|---|---|---|
| `hit` | 绿点实心 + 淡绿底 + 边框 | 这是好消息，但不喊——它是常态不是成绩 |
| `miss` | 灰边 + 灰点 | 一次真实的冷启动，是信息 |
| `unreported` | **虚线边** + 空心圆点 | 「没数据」必须看起来像「没数据」，不能像「数值是 0」 |

最后那条是整片的重点：**如果 `unreported` 和 `miss` 长得一样，用户会把「网关没报」读成「一次都没命中」**——那正是本项目反复在防的那个错，只是换了个界面。

实现上三件事分开：

- `cacheState()` 给 `hit | miss | unreported`，供 `data-*` 与 CSS 分支。**不从措辞反推**
  （`includes('未报')` 当协议，改一个词就静默失效）。
- `cacheText()` 给措辞，13 + 4 条纯函数判据钉住。
- CSS 只有一条新类名 `.cb-cacheBadge` + 三个 `[data-ai-cache=...]` 变体；零 hex、
  零新增颜色 token、`tabular-nums` 让连续生成时数字不左右跳。

`command-bar-visual-style.test.ts` 的 SHA 恒等门换过一次值（`d86846b8…` → `7ef8ffcc…`）——
那是**真实的新界面元素**，不是换皮；理由写在那份判据的文件头，不只改断言。

**仍欠**：`costUsd` 仍是 0。要回答「这次省了多少钱」需要单价表，而单价不能编——
它随模型、随供应商、随折扣变。现在能说的是「省了多少 token」，不是「省了多少钱」。
