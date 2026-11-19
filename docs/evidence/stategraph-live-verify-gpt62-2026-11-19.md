# 证据 · /v1/ai/chat-graph 真链路 live（gpt-6.2-sol + Digest · 157 回响） — 2026-11-19

> 纪律（§159/§160）：下面全部是本会话实测，不冒充其他验证。
>
> 用户的 #四 三项：深度嵌入状态图 / 大输入上下文 / 真 provider 一整套车道。

## 上下文

- provider：`https://api.aizzz.xyz/v1` · model **`gpt-6.2-sol`**（用户 2026-11-19 尾部明示换模）· Clash 7897 节点；
- system = 真 digest **241,652 chars**（13 章 · 157 回响 · 955 锚句 · anchors zh/en 逐字）；
- service：ai-service @ 127.0.0.1:8001（Redis 56379 healthy · `llmLive.state=ok`）。

## 实测记录

| 轮 | lane-header | ms | cached | 答 |
|---|---|---|---|---|
| #1（冷） | `stategraph` | 15,472 | 138,700 / 155,925（**89.0%**） | 「值更册最后一页写着：最后那一格不是漏写的——它是留给下一任的。（回响一百五十七《祠殿南廊尽头那只只欠最后一格的盐账》）」 |
| #2（暖） | `stategraph` | **90** | 155,925 / 155,925（**100%**，appCache 整体命中·provider 零调用） | 与 #1 逐字一致 |

结论：StateGraph 路径在真 provider 上干净工作——`x-nexus-orchestration: stategraph` 回话头真实返回；整 digest 字节稳定前缀（sticky `prompt_cache_key=nexus-<sha256(digest)>`）+ Redis appCache 双层命中兑现；回答逐字贴合《低语诸王》第 157 回响原文锚句。

## 仍然欠的

- **Spring Cloud proof 重跑**：仍需 ≥6 GB 空闲 RAM；本机本时段依然没到过。`docs/evidence/spring-cloud-proof-2026-11-18.md` 原样保留，不冒充重跑。
- **admin deep-read 数字类幻觉**：eval 记录了 Q9 编了一个数字（六把）——digest 在 system 内仍可能让模型编出具体的数字类 canon 事实；建议问典 lane 中对数字题单独加注 "逐字照抄原文数字" 的守门；记在账上，不假装修了。
