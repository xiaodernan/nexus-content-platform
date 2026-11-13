# ADR 0127 — LLM 缓存命中率深度修正：粘性路由 + 前缀序 + 缓存键第四维（v695）

- 状态：ACCEPTED（2026-11-14）
- 上游：ADR 0123（流默认 + completion cache + prompt 重排）、ADR 0124（usage 带 cached/reasoning）、
  ADR 0125（live probe 三条观察）、ADR 0094/0095/0110/0112（门纪律）
- 范围：`apps/ai-service`（sticky_prompt_cache 新组件、config、registry、design_prompt、
  completion_cache、redis_completion_cache、新门）；零 web / 契约改动

## 背景：用户报告与真机复现

用户："调用我的 openai 大模型 api 的时候缓存命中率这么低，而且一直显示非流，
好像显示流的时候缓存命中率好的多，肯定是调用方法出了问题，进行深度修正并且实测。"

先复现，不猜。真机 wkapi.pro / gpt-6-sol，`/v1`，模型 `gpt-6-sol`，真 key（gitignore 的 `.env`）：

### 观察 1：ADR 0123 的"流/非流"结论不能当规律用

同一段稳定前缀连续请求，本轮实测**流式 0/8 次上报 `prompt_tokens_details`**，
非流 5/8 次上报；ADR 0123 记的是"SSE 首发即报、非流冷启动不报"。两次都真，方向相反。
`prompt_tokens` 对**同一份文本**在 {4358, 8721, 22800, 24363, 38441, 60236} 之间跳，
与 ADR 0125 观察 3 一致（该 distributor 各通道注入不同长度隐藏前缀 / 报数口径不同）。
结论：**流式本身不是命中率好的原因**，"显示流时命中好"是通道 draw 的相关而非因果。
保留 ADR 0123 的 SSE 默认（它对的理由是可观测 + 首发延迟，不是命中率），但不再声称
"SSE 必然报 cached_tokens"。

### 观察 2（根因 A）：prompt 前缀在第 81 字节就断了

`design_prompt.build_prompt` 旧序把 `modelClass / viewport / pageId / selection /
selectionDigest / annotations / recentChanges / corpus` 放在 JSON **最前**，
稳定目录（pages/frames/components/tokens/totals，体量最大）跟在后面。
用 `contracts/fixtures/ai-request-with-index.json` 造两轮真实差异（选中、批注、
recentChanges、corpus query、诉求、variants 全变）：

| | 两轮共享字节前缀 | user 总长 |
|---|---|---|
| 旧序 | **81** | 6,876 |
| 稳定现场在前 | **6,328** | 6,876 |

provider 前缀缓存按**从第 0 字节起的连续前缀**计，旧序下整份目录永远进不了缓存。
ADR 0123 只把 `intent/prompt/variants` 挪到尾部，门 `test_prompt_order.py` 也只钉
"最后 3 个键"——所以门全绿而前缀依旧是坏的（典型"钉字面不钉形状"）。

### 观察 3（根因 B，决定性）：缺 `prompt_cache_key` 粘性路由

该 distributor 把请求分发到不同后端通道，**前缀缓存是通道本地的**。不给稳定路由键，
连续两轮落到不同通道，上一轮建的前缀缓存就用不上。

同进程交替 A/B（每轮 warm-up 建前缀 + 2 次测量，4 轮，奇偶顺序固定以抵时变）：

| 场景 | 命中调用 | mean cached/prompt | p50 | 原始 |
|---|---|---|---|---|
| 流 / 不带键 | 1/8 | 0.124 | **0.0** | [0,0,0,0,0.991,0,0,0] |
| 流 / 带稳定键 | **8/8** | **0.778** | **0.778** | [0.762,0.775,0.766,0.795,0.794,0.768,0.786,0.78] |
| 非流 / 不带键 | 2/6 | 0.330 | 0.0 | [0,0,0.991,0,0,0.991] |
| 非流 / 带稳定键 | 5/6 | 0.629 | 0.638 | [0.638,0.638,0.638,0,0.929,0.929] |
| `user` 字段代替键 | 1/3 | — | — | 只 sporadic 命中，不可用 |

`prompt_cache_key` 是 OpenAI 兼容的**路由提示**，不是模型参数，不改输出、不进 completion
cache 键。加了它，命中从"随缘"变成"稳定"；流比非流更好，解释了用户的观察。

### 观察 4：completion cache 键漏了 `json_mode`

`CachedLlm` 键是 `(model, system, user)`，但 `complete()` 收 `json_mode` 且它决定
`response_format`。chat 路由显式 `json_mode=False`（纯文本），run 用默认（JSON 对象）：
同一份 (model, system, user) 会共用一条缓存 → chat 可能拿到 run 缓存的 JSON 对象。
这是正确性洞，不只是效率问题。

## 决定

1. **新增 `sticky_prompt_cache.py`**：
   - `STABLE_PROMPT_KEYS` / `TERMINAL_VOLATILE_KEYS` 是**单一真值**：`build_prompt`
     用它排插入序、粘性键用它抽稳定材料、门也读它（ADR 0095 同源纪律）。
   - `ordered_payload()` 把稳定目录放最前、本轮诉求放最后；`_encode_prompt()` 是三处
     编码点共用的单一真值。
   - `prompt_cache_key(system, user)`：稳定目录（sort_keys 规范化）哈希；chat 自由文本
     只用 system 做会话身份，不把每轮都变的正文混进键。
   - `StickyPromptCacheTransport`：httpx transport 装饰器，在出站 `chat/completions`
     报文注入键。放在 transport 层是因为 SSE 与非流是 provider 里**两条独立构造 body
     的路径**（ADR 0123 的分叉教训），transport 是唯一共同出站点；因此不改 provider
     一行、不改 `complete()` 签名、两条路自动都覆盖。同步改写 `content-length`，
     否则真机按旧长度截断 JSON。已有键不覆盖；非 chat / 非 JSON body 原样放行。
2. **`Registry._build_llm` 接线**：`NEXUS_LLM_STICKY_CACHE_KEY=0` 时 `transport=None`
   （httpx 自建默认 transport，**字节级零回归**）；默认 True。设 `=0` 是对"不认识
   `prompt_cache_key` 的网关"的降级开关。
3. **`design_prompt.build_prompt` 前缀序**：稳定目录在前，中段是会变的现场，末尾
   固定 `intent/prompt/variants`。共享前缀 81 → 6,328 字符（78×）。
4. **completion cache 键补第四维**：`(model, system, user, json_mode)`，三态
   `default/json/text` 不折叠；进程内与 Redis 两个后端共用 `LlmCompletionCache.key`
   与 `json_mode_key()` 单一真值，`_digest` 同步加 NUL 分隔的第四段。
5. **门 `test_sticky_prompt_cache.py`**（15 条）：判据纯函数、正向锚（共享前缀 >0 且
   随目录体量增长；路由键跨轮稳定且**能区分不同项目**；维度隔离读真实调用序列）、
   5 个变异臂恒跑逼红、2 个正向对照臂证明门不惩罚正确实现、真线路**函数级** skipif。

## 实测（本机，真 key 真网关）

- 生产类直出（`OpenAICompatibleProvider` + 真 transport）：两轮均
  `cached=11776/11972 ≈ 98.4%`。
- **生产 `Registry` 构造链 A/B**（隔离应用级缓存，只量 provider 前缀缓存）：

  | sticky | transport | 命中 | mean | p50 | 逐轮 |
  |---|---|---|---|---|---|
  | False | HTTPTransport | 1/4 | 0.121 | 0.0 | [0,0,0,0.484] |
  | True | StickyPromptCacheTransport | 3/4 | 0.608 | **0.81** | [0,0.81,0.81,0.81] |

  首发 0 是**冷启动的必然**（还没有可命中的前缀），warm 轮 3/3 稳定复现。
- 全量：`268 passed / 15 skipped`（离线）；`279 passed / 4 skipped`（
  `NEXUS_LIVE_LLM=1` + `NEXUS_REDIS_URL=redis://127.0.0.1:56379/0`，真 LLM + 真 Redis 腿全跑）。

## 后果

- 用户报告的"缓存命中率低"从根上修了两处：前缀可缓存长度 78×、路由命中从随缘变稳定。
- 默认开，`=0` 一键 byte-level 还原；不改 provider、不改契约、不改 web。
- `prompt_cache_key` 只是路由提示，**不保证命中**：通道轮转 / 隐藏前缀注入 / TTL 过期
  仍会让 `cached_tokens` 归零（ADR 0125）。本片不伪造 usage、不谎称省钱。
- 应用级 Redis completion cache 仍是唯一确定性 100% 命中的层（ADR 0125 观察 1），
  两层互补：一层省 token，一层省整次调用。

## 仍欠（诚实记录）

1. **不知道 distributor 的 cache TTL / 通道数**：只能从 `cached_tokens` 反推，
   不能保证跨分钟、跨进程稳定；需要供应商侧信息或长跑采样（ADR 0125 仍欠 2）。
2. **粘性键按项目目录哈希**：目录一改键就变，旧前缀缓存作废——这是正确行为，
   但编辑密集的会话会周期性冷启动。更细的"目录版本桶"未做。
3. **chat 自由文本路径**只用 system 做键，所有同 system 的会话共用一个通道；
   对话 prompt 短、前缀缓存本就很少触发，暂不为它引入会话 id（需要跨契约传 id）。
4. **未对不支持 `prompt_cache_key` 的网关做自动探测降级**：目前靠 `=0` 人工 opt-out。
   真机上该字段被接受（4 组实验 0 个 400），但没有"收到 400 就自动关掉"的自愈。
5. `temperature` 仍是 provider 硬编码 0.2，未进键（ADR 0113 仍欠）；若开放必须同步。
