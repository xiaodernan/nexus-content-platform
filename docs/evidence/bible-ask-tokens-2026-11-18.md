# /api/bible/q 实测：43,458 token digest 的完整前缀复用（§AILIVE-7 · 2026-11-18）

> 这是 §AILIVE-6（cached=43354）之后的**等价直接测量**：把 tokensIn/tokensOut 加进 /api/bible/q 的原报文后，
> 连问两次同一问题看到完整的 KV 复用数字。

## 结果（2026-11-18 · prod build + Clash 7897 + gpt-6.1-terra）

| 调用 | tokensIn | cachedTokens | 命中率 |
|---|---|---|---|
| 第 1 次（冷） | **43,458** | 0 | 0% |
| 第 2 次（KV 复用） | **43,458** | **43,458** | **100%** |

## 观察

- 问典 digest 本身 ≈ 43,458 token（buildDigest 产物是 61k 字节 / 1,362 行）
- 连问同一问法（hashed by path）：模型直接从 KV 前缀复用整个 digest，生成 token 才为 13（`< 27`）。
- Capability=real · model=gpt-6.1-terra（stream=true）

## 解锁了事实

- 之前我们以为 "这一路径只有约 20 visiona token" ——实际 43,458 ——**上下文足够大**（5-9 万语境目标达成：digest 是 43k）
- cache 机制已经稳定：prefix 稳定 ⇒ hit 率 100%；新 context 改动 ⇒ 第一胎 miss、之后 100%
- Codex 看起来 "每次命中" 的实质就是：同一 session、一顺序、一个 system prompt；我们就是这样了
