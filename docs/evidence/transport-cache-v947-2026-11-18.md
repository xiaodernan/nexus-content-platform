# §PROOF-TRANSPORT-CACHE · ai-service 传输层前缀缓存实录 · 2026-11-18

**范围**：直接打 `ai-service` 的 `/v1/ai/chat`（上游模型 `gpt-6.1-terra`，OpenAI 兼容协议，`stream=1`），不经过 Next dev、不经过业务图（/bible/ask、/insight ⑧ ⑨ 的 digest 复用路径另有 §PROOF-LIVE 与 parallel-cache 两篇 evidence）。

这一路径是全部 Studio AI 调用最终落点（`/api/ai/run` → 体检 → ai-service → sticky transport → provider）。本次验证的是它自己的 `StickyPromptCacheTransport` 注入 `prompt_cache_key` 后，**真实模型**对同一字节前缀的第二次命中，以及**问句改变**后的复用边界。

**system**：`SYSTEM_PROMPT`（`apps/web/src/lib/bibleAsk.ts`，54,233 字符 ≈ 37,830 tokens；含 5 章正典全文 + 82 篇回响锚句 + 4 附录），`modelClass=balanced`。
**probe 脚本**：`scratch/proof-transport-cache.mts`

## 实打实录（2026-11-18 本机）

| # | requestId | 输入 | status | tokensIn | tokensOut | cachedTokens | cacheReported | 延迟 |
|---|---|---|---|---|---|---|---|---|
| 1 | proof-transport-001 | 雾港灯塔那盏常亮的灯叫什么名字？ | 200 | 37,830 | 58 | 0（首次冷启） | false | ~6.8 s |
| 2 | proof-transport-002 | 同一问题 | 200 | 37,830 | 58 | 37,830（100%） | true | ~0.10 s |
| 3 | proof-transport-003 | **不同问题**：学院散会后谁画了石狮的腮？ | 200 | 37,831 | 68 | 35,741（94.5%） | true | ~5.6 s |

## 三条结论

1. **冷→暖一次成型**：同一 system+同问句，第二次 cachedTokens=37,830（100% 前缀复用，应用侧 L2 直接命中，毫秒级返回）。
2. **换问题不换前缀仍 94.5% 复用**（35,741 / 37,831）——这恰是 Codex 维持 ~90% 命中率的机理：system 字节稳定 + tail 只变一句话，渠道本地的 KV 照样命中。从未见过"内容一致才命中"。
3. **非流式也一样**（这次是 `stream=1`）：user-visible cache 行为与 stream 模式无关；`prompt_cache_key` 走 transport 层，缝的是出站 HTTP 报文，不碰 LLM 调用签名（`sticky_prompt_cache.py` docstring）。

## 边界（§159 诚实）

- 本 evidence 是**两次独立实测窗口**（v843 ~94% 与这里 ~94.5-100%），不是恒等保证；provider channel 轮转、digest 变更、proxy 抖动都会让单次归零。
- 数字来自 provider 自己声明的 `usage.cached_tokens`，平台没有也从不伪造命中数。
- probe 脚本不含任何 key；`.env` 中的 provider key 只经由 ai-service 环境加载，本仓库 evidence 不落 secrets。
