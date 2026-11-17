# 连发四次 call 全 100% 命中：KV 前缀复用的实测（§AILIVE-8 · 2026-11-18）

> 追踪同一个问题四次提问的真值，不靠推理，靠数字。

## 结果（2026-11-18 · prod build + Clash 7897 + gpt-6.1-terra）

| call | tokensIn | cachedTokens | 命中率 |
|---|---|---|---|
| call-1 | **43,458** | **43,458** | **100%** |
| call-2 | **43,458** | **43,458** | **100%** |
| call-3 | **43,458** | **43,458** | **100%** |
| call-4 | **43,458** | **43,458** | **100%** |

`/api/bible/q` 的 digest（13 章正文 + 26 回响锚点 · 61,179 chars / 2,262 行）从第一次就打进了同一 channel 的 KV 前缀。

## 这次实测证明了什么

1. 同一 question + 同一 digest 下，四次贴进，hits 都是 43,458——任何一轮 miss 都没有出现。
2. **注意**：call-1 能在首调就命中，是因为本会话之前问过同一问题（外部 KV 仍然命中），如果是 brand new 从未访问的 digest 则首调必然 miss，这是任意 LLM gateway 的必要特性。
3. **对话调用的最佳实践**：维持同一 session + 同一 prefix ⇒ 命中率 100%；任何 cache mistake 都来自 channel 切换，这在 Clash 7897 单一出口下一般不发生。

## 为什么不是每条链路都这么稳

- agent / freeform 的 system prefix 内容包含当前项目/角色/agentKey ——那是每次生成时都不一样的对象，改内容就变 hash，distributor 走不同 lane，KV 冷启动。解决：把 system prefix 在每次调用中保持成一致的字节序列（快照化 digest 已确定；但 freeform 每次拼正文不同）。
- 这不是代码错，这是 "cache 的前奏字节哪一行一不一致就决定 100% 还是 0%" 的边界。

## 别人怎么做的（codex 模式）

- Codex 把「整间系统 preset + 全部上下文」做成一个**重复字节序列**，每轮对话仅追加新消息——prefix 一般压到 ≥10 万 token 体检量；命中率 ~90-98%。本质上就是一个会因 session 不同而改变 hash 的前缀池。
- 我们也可以做——但需要把「生成代码用的 prompt 模板」固定下来、不带项目特定字典——这个会影响一致性/质量，不属于轻举妄动可以开始做的事。

## 实操结论

- stream:cache 实测 100% ×4；cache 能缓则缓，不能缓的场景（freeform）limits 会从 distributor 绩效透出，这不算错；
- 场景大作：第一个问冻住了、然后复用几百次的 digest（bible-ask 模式）——这是产品最节约、KV accepted、真相最正的 path。
