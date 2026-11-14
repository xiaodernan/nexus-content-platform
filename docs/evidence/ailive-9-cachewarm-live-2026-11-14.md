# §AILIVE-9（2026-11-14）：合并后真 provider 复测——缓存链四层全通（实测，未推）

承接 §AILIVE-4/6 与 §CACHE-2（含本窗口与并行线双双落的改动）。本页只记**合并后**在这台机器上真跑到的数字，全部未截尾、未修饰。

## 1. 直连 provider（§CACHE-4 探针，`scripts/probe-cache-warm.py`，lane `nexus-cache4`）

同一份字节完全相同的载荷连发 5 次（`max_tokens=1`，`prompt_cache_key=nexus-cache4`）：

```
turn1: prompt=27294 cached=27291 (100.0%)
turn2: prompt=27294 cached=27291 (100.0%)
turn3: prompt=27294 cached=27291 (100.0%)
turn4: prompt=27294 cached=27291 (100.0%)
turn5: prompt=27294 cached=27291 (100.0%)
判定 = full（27291/27291）——前缀基本上全进缓存
```

注：turn1 也报 100% 是**网关自报**——这条 lane 的前缀此前已在 provider 侧热住（并行线 Lane 跑过 §CACHE-2 验证）。
「网关自报并非精密仪器」的教训仍有效（§CACHE-2：内容零重叠也报 5248），但上限参考意义足够。

## 2. Byte-level 前缀复用（本地可复算，`scripts/prompt-prefix-audit.py`）

并行线 2026-11-13 实测：旧语序只有 **0.45%**（≈111B / 24.6KB）；载荷三块重排（稳定目录 → 每轮现场 → 诉求，system 只回常量，稳定块递归剔空）后 **96.05%**；system 跨 Agent 恒等；token 体量 −9.4%。

## 3. 合并后 ai-service（3200 重起 merged 代码）真 HTTP 回路

```
POST /v1/ai/run（design-edit，dryRun）
cold call 1 HTTP 200 (10138ms) · tokensIn=1216 cachedTokens=0 demoMode=false
warm call 2 HTTP 200 (1412ms)  · tokensIn=1216 cachedTokens=1216 demoMode=false
warm call 3 HTTP 200 (109ms)   · tokensIn=1216 cachedTokens=1216 demoMode=false
/healthz: llmCache { enabled:true, backend:"redis", shared:true, namespace:"nexus:llmc" }
capability=real, embedding=unavailable("未验证：还没对真实 embeddings 探过一次")
```

冷→暖 0 → 1216/1216；第三次 109ms = 应用级 Redis 完成缓存直接回放。

## 4. 流式语义（并行线实测修正本线此前纪律的事实）

本线 2026-11-13 记过「wkapi 流式把 usage 整体砍掉」。并行线 2026-11-13 晚实测：
**流式有 usage；`cached_tokens` 的规律是冷前缀不报、暖前缀照报**（`stream call1(冷)` 无
`prompt_tokens_details`，`stream call2(暖，同前缀)` 报 `cached_tokens=7168`（96.7%））。
初稿「流式只缺这一项」过强 —— 以并行线实测为准。另：wkapi 网关自报仍存在不可信区间，
**本项目只认可复算的字节前缀率**作为复用率凭据。

## 5. 今天的诚实边界

- 命中率的「低」这件事已经闭环：根因是语序（0.45%）→ 重排（96%）→ 直连复测 100% → 三态 UI（未报/未命中/命中 N·%）防把「没报」画成 0%。
- 非流路径仍是唯一稳定出 `cached_tokens` 的路径之一；流式暖前缀也能报，但这是网关行为，不同 lane 可能不同，别把一次实测读成定律。
- 5 turns 全 100% 是同一 lane 同一前缀 —— 不外推到任何别的前缀；
- 3200 自本片起以合并后代码运行；embedding 仍 unavailable（网关没有 embedding 通道，不假装真）。

未 push。
