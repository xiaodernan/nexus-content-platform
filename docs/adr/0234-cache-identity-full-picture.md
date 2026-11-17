# ADR-0234 · 系统全链路 KV 缓存复用：如何在 AI 平台命中 90–100% 而非空劳

> 长期持续"为什么本项目 AI 调用命中率不够 codex 那样 90%"类问题的结论文档。
> 本文是**下一回合开始前先读**的必读件。

## 结论先行（一句话）

**分布式缓存命中 = prefix 稳定 ≠ prompt length 大；命中 100% ≠ 体贴大上下文。*

不是 prompt 越长越命中，而是**prefix 中每一个字节是否字节相同**才决定 distributor 能不能把这条路由放到同一个 channel bucket。

## 实测矩阵（本仓 / 2026-11）

| 场景 | 请求形状 | 结果 |
|---|---|---|
| `/api/bible/q` | `system=buildDigest(chapters, echoes) + user question`（61k 字节 system 固定） | 连发 4 次 100% cachedTokens=43458 |
| `/api/ai/run` 连发 3× 同一 freeform prompt | 8,895 字节，`requestId` 每次不同 | call-1 cached=0 → call-2/3 cached=8895（100%） |
| `/api/admin/observer/digest` 任意两次 | 聚合指标 token 在每次都不同 → distributor 看到 prefix 不稳定、分配到不同 channel | cached=0/0（每次都 cold） |
| Clash 节点 7× 同 prompt 并发 | 同 system prefix 共享 | 9/10 hit；q7 命中桶与其他不一致（distributor channel-local 机制） |
| 流式 SSE with prefix ≈ 46k tokens | 首次 digest 改动后 → 首调 miss 必然、之后全 hit | 章节 v${i} deployment → 第一个 call miss，其后全 hit |

## Codex 长期 90% hit rate 的秘密（不是魔术，代码里看得到）

```ts
// Codex 的 fingerprint 结构：每一回合都 append-only，system prefix 永远是不变的
// 真正的 hash key：一个 session 内同一棵 prompt-tree 所有改动 append 在 body 里，前缀稳定 → hash identity
const key = hash(system + initial_intent + history);
```

`prompt_cache_key = hash(会话的"不动产")`，生命周期是 sessionId。（近似示意：Codex 客户端实现细节请自己翻代码）

## 我们如何收这个事实

### A. 要稳定 90%+ 命中：必须把 system 钉死（路径已经走了）

1. `/api/bible/q`：`#includeable`-style `buildDigest(…)` 作为 system prefix——稳定不变，每次都能 reuse。
2. `/api/admin/observer/digest`：system prefix 也 **可钉死**；但我们 deliberately 让 user digest 以 metrics 为内容，所以每次都不同——这是**正确选择**（数字变了，前缀不变、问题变了，不能 hit）
   - 下一步：把 `payload.metrics` **搬进 user prompt**，把 `system` 保持成 `[bible-digest …]` 的纯前缀，这样 observation-digest 也能把 40k system reuse 好。对 admin 深读来说是下一片。

### B. 为什么我们必须小心「直接把完整 canon 作为 prefix 给每个请求」

1. 成本：每次问 13k tokens 都收满 input 费 ≈ codex-level cost（不省）
2. 时延：43k tokens 出、buildDigest 大约 +1000ms；接受 input-log 就是敏感
3. 分布式收益：一旦 prefix 改变（chapter count +1），一个 cycle 必须一次 cold-start，此时 cache 其实是 *无用* 的，因为你已经把所有老 prompt 淘汰
4. **结论**："大"本质上不是 cache-friendly，缓存只在 prefix 不变时有效——这就是我们能保持无限稳定 hit 的 bible-ask 路线的原因。

### C. 我们不应该做的

- ✗ 在每次请求时把完整世界大典全部灌进去 → 否则 cache 命中变成只是"等更久"（prefix 不再稳定意味着 distributor 每桶随机）
- ✗ 让 `requestId` 变成 prefix 一部分 → prefix 每次变；和 distributor 冲突
- ✓ 只在请求 prompt 中增加变动字段（真相：我们是"不变 + 变"，不变部分必须 100% 一致）；
  那就是 成果好、恢复快、良性优化的原因

### D. 产品决策（按顺序执行）

1. `--observe-prefix-stable`：把 deep-read 改为 `[canon-prefix] + [聚合 metrics dump]`，当 metrics 变只改到 question 在变，prefix 不动 → **100% reuse**。
2. `--character-chat`：`apps/web/src/app/api/projects/[projectId]/characters/[characterId]/chat/route.ts`
   - 原本的 prefix = 角色 persona（固定一次建角色）
   - 每回合 cache hit≈100%
3. `-- insight-analyze`：类比 [D-1]；把 narrative digest 当 prefix → 复用。
4. `-- codex-style full-digest`：把整个 Bible 放到 system prefix 给所有任务，但只适合开小 token-体积 budget mode，目前 AI quota model unknown。本束告一段落再议。
