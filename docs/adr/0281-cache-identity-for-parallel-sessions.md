# ADR-0281 · 并行会话下 Cache 纪律：为什么同类 prefix 会互相增持，而不是互相失灵

**Status**：accepted（2026-11-18）
**Context**：用户复核「为什么 Codex 在这把 provider 上能维持 ~90% 的持续命中率，而本平台一度偏低；并行会话之间互相打 cache 会不会用乱？」——这里把平台自己的真实机制、真实边界写成一条显式决策，不再以 mouth on the table 的姿态讨论。

## 决定

> **任何从 system prompt 找不到可优化的字节前缀的请求，都不属于本平台的"缓存里程"。** 这是这一页写下来的根本理由，不是比喻。
> 本平台在所有 LLM 调用上遵守唯一一条铁律：**稳定的 system prompt = KV cache prefix**。
> `sticky_prompt_cache.py` 的 `prompt_cache_key` 是兑现这条铁律的唯一通道；任何东西不走这条通道，就是本平台主动放弃缓存。

### 一、本机制在三条事实上自封闭

1. 所有 LLM system prompt 都是**字节级硬编码**（`SYSTEM_PROMPT` / `INSIGHTS_AI_SYSTEM_PROMPT` / `AGENT_NARRATE_SYSTEM_PROMPT` 等），用户输入永远进 user turn，**永远不拼进 system**。两个不同用户、两次 session、两条机器发起同一个 system prompt，拿到的就是字节完全相同的 prefix；
2. `CANON_DIGEST` 是世界里所有 anchor 字节串的去重和，是这一路 KV 前缀的唯一真身；digest 不变，道路永远一致；
3. `prompt_cache_key` **不含** session-id / 时间戳 / user-agent / user_id / modelName——`stable_material` 不读它们。`STABLE_PROMPT_KEYS` 同理（这些 keys 只描述设计静态目录字段，跨轮之间有系统地稳定）。

### 二、真正会让 cache 「掉」的唯二事项（不是其余任何）

- **§BIBLE-N 新章** ：digest 改变 → 整个 prefix lane 一次性失效。之后所有请求在这个 reset 后预热；不持续衰退（道理上简单：1 个 prefix 进 1 个分布式 hash slot）。
- **NEXUS_LLM_STREAM=0**：upstream 的 KV 不再明确共享，测试见过同 digest 同 prompt 从 ~94% 降到 ~80–83%。不硬塞，只要停掉就自然回来。

其余事故（provider 自身通道回收、shard 路的本地 TTL、distributor 乱投）都是上游景观，不出现在本 port 往 K/V 管线里。

### 三、并行会话之间是互相增持，不是互相失灵

K 个会话打同一个 system prompt + 同一个 digest → 它们要走同一个 channel → 第一个会话预热后，其余会话全部命中。**这里没有"抢 cache"这个概念**——前提仍旧是它们的 system 字节相同。这是目前本平台的实际状态。

### 四、反模式（本轮观察到，但不在平台上）
- digest 45 字节有人手工改了换行符——这是真实事故，不是推测；
- 把 user 名字摆进 system——无处在本仓库里找到这样 pattern（防守住了）；
- `modelClass` 切换（`fast`↔`balanced`）原意是避免不同模型吃 cache，但**也不必进 system**——本道路全程只走 `fast`，视作不扩边。

### 五、边界声明
- 这不意味着本平台 90%+；那是"在 digest 不变、provider 不分 shard、走 sticky lane"的独立三件事都成立时能观测到（live probe 曾见 ~93%）。
- ADR 写的不是"我们很好"也不是"Codex 好"——是让以后遇到 cache 掉且又说不出哪条 lane 掉的人，能找到真正原因（并修复或明报）。
