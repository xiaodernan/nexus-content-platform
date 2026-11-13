# ADR 0128 — completion cache single-flight：并发 miss 只打一次真 LLM

- 状态：已落地（v696）
- 日期：2026-11-14
- 关联：ADR 0113（completion cache 组件，仍欠 ④）、ADR 0119（跨实例 Redis completion cache）、
  ADR 0123（流式 + 缓存接线）、ADR 0127（provider 前缀缓存 / 粘性路由）、
  ADR 0090/0094（门不惩罚正当改动）、ADR 0095（声称必须有门读）、
  ADR 0110（真线路 opt-in 三纪律）、ADR 0112（代理量正向锚）、ADR 0114（判据钉边界）
- 镜像对象：Spring Cache `@Cacheable(sync = true)` 与 Caffeine 的 coalescing loader；
  Spring Cloud Stream / Resilience4j 不参与本片（重试、断路器另见 ADR 0115/0120）。

## 1. 背景：为什么缓存开着也省不下"热点并发"

`execution.py` 用 `anyio.to_thread.run_sync` 调同步的 `registry.llm.complete(...)`。
`CachedLlm.complete()` 的顺序是

```
get(key) -> miss -> inner.complete() -> store(key, completion)
```

N 个用户在同一瞬间提交**同一份 prompt**（设计任务的热门模板、批量变体、重试风暴）时，
N 个线程都在 leader 写入之前完成了 `get`，于是**全部 miss、全部打真 LLM**。缓存只省了
"先后到来"的重复，省不了"同时到来"的重复：这正是 ADR 0113 仍欠 ④ 记的那条。

ADR 0127 修的是 **provider 侧前缀缓存命中率**（少算 prompt token）；本片修的是
**应用侧真调用次数**（少发请求、少花 output token、少占上游连接）。两层互补，
不能互相替代，也不许把一层的收益记到另一层账上。

## 2. 决定

新增 `apps/ai-service/src/ai_service/single_flight.py`：

- 进程内 `threading.Lock` + `threading.Event` + `dict[Hashable, _Flight]`。
  同 key 第一个调用成为 **leader** 并注册在飞项，其余 **follower** 等同一个 Event。
  `get/pop` 都是 O(1) 定点操作，不扫描在飞表；leader 在成功/失败的 finally 语义里
  删除表项并 `set()`，不依赖后台清扫。
- `FlightStats` 是诚实账本：`leaders / joined / coalesced / failures / timeouts`，
  `real_calls = leaders + timeouts`（leader 真调用 + 超时后 follower 自己补打的真调用）。

四条诚实边界（本片最要紧的部分，全部有门）：

1. **失败不缓存、不伪造**：leader 抛异常时，所有 follower 收到**同一个异常对象**；
   不返回半条 `Completion`、不静默重试、不写毒缓存。失败路径同样清在飞表。
2. **有界等待**：follower 只等 `wait_timeout_s`；leader 卡死时 follower 不无限挂住，
   而是自己打一次真调用并如实计 `timeouts`。门把注入的 `wait` 收到的 timeout 值也
   断言了，防止"配了上限却没透传"。
3. **合并 ≠ 命中**：`cache.stats().hits` 不因 coalescing 增加；`coalesced` 单独记账。
   这条是 ADR 0113 "命中不是一次新的 provider 调用"的延伸——合并也不是命中，
   不许拿它去粉饰命中率看板。
4. **不跨进程**：这是进程内锁。多副本各有各的 flight，跨实例共享由 Redis completion
   cache（ADR 0119）负责。绝不声称集群级 single-flight。

接线（避开并行 lane 正在编辑的 `openai_compatible.py`，改动全在 `registry.py`）：

```python
flight = None
if settings.llm_single_flight:
    flight = SingleFlight(wait_timeout_s=settings.llm_single_flight_wait_s)
return CachedLlm(provider, cache, flight=flight)
```

- `NEXUS_LLM_SINGLE_FLIGHT=1`（默认）；`=0` → `flight=None`，`CachedLlm` 与 v695
  字节级一致（门用 Barrier 强制 N 路同时进 provider 验"并发各打各的"）。
- **作用域如实写明**：single-flight 是 `CachedLlm` 的属性，只有
  `NEXUS_LLM_COMPLETION_CACHE_URL` 启用缓存层时才生效——没有 miss 就无从合并。
  默认配置下（`llm_cache_url=""`）该旋钮不产生行为，这一点写进 config 注释、
  `env.example` 和本 ADR，不做"配了就生效"的虚假声称。
- `Settings.__repr__` 暴露两个旋钮且继续脱敏 key（门同时验"看得见旋钮"和"看不见 key"）。

## 3. 顺带修掉的真 bug：并发过期删除竞态

写门时发现 v696 的并发前提把 `LlmCompletionCache` 的一个既有洞变成了**必现崩溃**：

```python
entry = self._entries.get(key)      # N 个线程都看到同一过期条目
if self._now() - stored_at >= ttl:
    del self._entries[key]          # N 个线程都 del 同一键 -> KeyError
```

N 路同 key 请求在 `flight.run` **之前**都会先 `cache.get(key)`，所以这不是理论竞态。
修法：给 `LlmCompletionCache` 加一把只护本实例状态的 `threading.Lock`，覆盖
`get / store / stats / __len__ / clear` 的"读条目 → 判过期 → 删或移动 → 计数"整段。
锁不跨 provider 调用、不跨网络；热路径成本是一次无争用 Lock 获取。

这个锁是**负载-bearing** 的，不是装饰：`test_arm_removing_the_cache_lock_reintroduces_the_expiry_race`
把锁换成直通、并用注入时钟让 N 个线程确定性汇合在 `get()` 与 `del` 之间，
旧竞态必须复现 `KeyError`；否则上一条"不崩"的门就是假的。

## 4. 真机 A/B（wkapi.pro /v1，`gpt-6-sol`，2026-11-14）

两条腿都走**生产 `OpenAICompatibleProvider` + 生产 `CachedLlm`**，计数放在
`httpx.BaseTransport` 层（SSE 与非流两条 body 路径的共同出站点，ADR 0127 的方法），
同进程、同 ORACLE prompt、各自独立 cache，函数级 `skipif(NEXUS_LIVE_LLM!=1)`：

| 臂 | 并发请求 | 真网关请求 | coalesced | cache_hits | prompt tokens |
| --- | --- | --- | --- | --- | --- |
| `flight=on` | 3 | **1** | 2 | 0 | 4438（单次实测，latency 2203–4468 ms） |
| `flight=off` | 3 | **3** | — | 0 | 约 3 × 4438 |

`flight=on` 腿另验证返回的仍是合法 JSON mode 真回复（`tokens_in/out > 0`、
`{"pong": true}`），避免"把一次失败或空响应合并给三路"的假绿。
**省下的两路调用可归因给 single-flight**：反事实臂在同一 provider 上确实打了 3 次。

## 5. 门（`apps/ai-service/tests/test_single_flight.py`）

- 判据纯函数 `_judge_*` 是单一真值，真组件场景 / 正向对照臂 / 变异臂共用。
- 钉性质不钉字面：`real_calls == 1`（与并发数无关）、`coalesced == requests-1`
  （随成本增长）、`inflight_peak == requests`（ADR 0112 正向锚，防代理量恒 0 假绿）。
- 并发不用 `sleep` 猜调度：leader 被 Event 门住，主线程等 `joined == N-1` 才放行；
  需要"所有线程同时在 provider 内"的臂用 `threading.Barrier`，少来一路就
  `BrokenBarrierError`（比静默串行化诚实）。
- 覆盖：并发合并、不同 key 不串台、失败传播同一异常且无重复真调、有界等待超时
  自己补打、禁用零回归、flight 收尾不留悬挂项、配置旋钮经 `Registry._build_llm`
  真生效、并发过期删除竞态、2 条真机 A/B。
- 恒跑变异臂：不合并、合并虚报命中、代理量恒定、跨 key 合并、follower 异常不同、
  超时伪装成合并、等待无上界、禁用却仍合并、真组件 `SingleFlight.run` 退化、
  真组件锁退化。每个臂都断言对应判据**必须红**；另有正向对照臂证明判据不惩罚正确实现。
- 结果：离线 `20 passed / 2 skipped`；ai-service 离线全套 `289 passed / 17 skipped`
  （v695 为 268 / 15）；`NEXUS_LIVE_LLM=1` + 真 Redis 全 opt-in 全套
  **`306 passed / 0 skipped`**（114 s，所有真腿都真跑了，无一跳过）；真机 A/B 两条腿
  `2 passed`。全套重复 3 次无 flaky。

## 6. 后果与仍欠

- 收益：热点并发的 token / 上游连接从 O(N) 降到 O(1)（**每进程**），失败与超时都不
  伪造结果；缓存命中率语义没被污染。
- **仍欠 ①**：跨进程 single-flight。多副本各打各的一次，要合并需 Redis 分布式锁 +
  pub/sub 结果广播（或让 follower 轮询共享缓存）。这是集群级语义决策，牵涉锁租期、
  leader 崩溃、结果序列化，未定之前不接线、不钉门。
- **仍欠 ②**：`coalesced / timeouts / failures` 尚未进 `/healthz` 或 Prometheus。
  账本只对进程内可查，运维看不到"省了多少真调用"。
- **仍欠 ③**：follower 超时后自己补打真调用，若 leader 同时仍在工作，会出现
  "同一 key 两次真调用"的短暂双花。这是有界等待的诚实代价，不是 bug；若要消除需改为
  取消 leader 或共享结果（跨线程取消 httpx 请求是另一个语义决策）。
- **仍欠 ④**：超时补打没有抖动，极端情况下 N 个 follower 会同拍重试（thundering herd）。
  ADR 0117/0118 的 jitter 组件已存在，可接，但要先定"超时补打算不算一次 attempt"。
- **仍欠 ⑤**：`temperature` 仍未进 completion cache 键（ADR 0113 仍欠项，provider 目前
  硬编码 0.2）。若开放该旋钮，键与 Redis digest 必须同步。
- 已知边界：Redis 后端的 stats 计数仍是进程内 best-effort（无跨进程聚合）；
  `LlmCompletionCache` 的锁让**进程内**计数严格，不改变 Redis 侧口径。

## 7. 复用价值（方法论）

- "并发优化"类改动，门必须自己造出**确定性并发**：Event 门住 leader + Barrier 强制
  汇合，比 `time.sleep` 猜调度可靠得多，也跑得快（全套 1 秒）。
- 代理量（在飞表项数、coalesced）必须随成本增长且带变异臂证其非恒 0，否则实现一换
  代理量归零、门全绿而功能已坏（ADR 0112）。
- 新能力上线前先查"它把哪条旧路径的并发前提变强了"：本片就是这么挖出
  `LlmCompletionCache` 的过期删除竞态的。加并发而不查共享状态，等于把旧竞态变必现。
- 真机 A/B 要带**反事实臂**（关掉新能力仍打 N 次），否则"1 次"可能来自缓存或网关去重，
  归因不成立。
