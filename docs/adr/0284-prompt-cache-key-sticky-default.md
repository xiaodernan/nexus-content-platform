# ADR-0284 · prompt_cache_key 缺省从常量 `nexus-studio` 翻转为 sticky per-lane（2026-11-18）

## 状态
已接受（2026-11-18；附带：langgraph 声明依赖漏装补装见「后果」）

## 背景

`/v1/ai/chat`（及一切 LLM 端出口）的请求由 `OpenAICompatibleProvider` 构造 body，运行时被 `StickyPromptCacheTransport` 装饰出站。历史上：

- `NEXUS_OPENAI_PROMPT_CACHE_KEY` unset 时缺省 `nexus-studio`，provider 直接把**常量** `"nexus-studio"` 写进 body；
- sticky transport 只在 body 缺键时注入 `nexus-<sha256(system)>` —— 因 provider 先写常量，**sticky 键实际从未生效**（v865 行为）。

用户反复指出："并行会话同时打这个 API，缓存区分不明显 / 命中率掉掉 / 不像 Codex 那样稳定 90%"。

## 选项

A. 保留常量缺省（零变更；v865 行为，wkapi.pro 上实测过 8/8）。
B. unset → sticky per-lane（provider 不填键，transport 注入 `nexus-<sha256(system)>`，键对 system 稳定、对用户变体免疫）——2026-11-18 A/B 见下。
C. 完全不发 prompt_cache_key（网关自行 hash 请求）——未测；无控制权，不采纳。

## 实测（2026-11-18 · aizzz.xyz / gpt-6.1-terra · 同 digest · 12 发交替）

| 配置 | 12 发结果 | 命中 |
|---|---|---|
| A 常量 | 奇发 200（100% cached），偶发全部 **502** | 成功侧 100%，半数请求挂 |
| B sticky per-lane | **12/12 200** | `cachedTokens` ≈ 69,300（≈100%），p50 ≈ 9–13 ms |
| DEFAULT（本日后） | **12/12 200** | ≈100%，p50 ≈ 7 ms |

（证据：`docs/evidence/cache-key-ab-2026-11-18.md`）

## 决定

**B**：`config.py` 缺省（env unset）从 `"nexus-studio"` 改为 `None`——unset 或显式空串 → provider 不填 `prompt_cache_key` → sticky transport 注入 per-lane 键；常量 lane 仍可 `NEXUS_OPENAI_PROMPT_CACHE_KEY=nexus-studio` 显式选择。README / .env.example 同步改写。ADR-0282（Codex parity）的 session-derived 思路在这里落地：键 = system 的字节稳定哈希。

## 后果

- 分片网关（hash/key-based distributor）上：同 digest 全落同一健康通道——prefix 缓存 100% 复用 + 不分片重击；多个 product graph（/bible/ask / /insight / design-graph / character chat…）自然分成多个车道。
- `lane A=constant` 路径仍保留用于 wkapi.pro 风格的老网关（环境变量显式开启即回退）。
- 不引入新旋钮：本仓 `.env` 不设 `NEXUS_OPENAI_PROMPT_CACHE_KEY` = 缺省即正确；`NEXUS_LLM_STICKY_CACHE_KEY=0` 可全局关 sticky（老 gateway 降级保留）。
- 测试：pytest 455 passed / 18 skipped；新增对历史缺省改动无任何脆弱断言（之前无测试钉 `nexus-studio` 缺省值）；stategraph 8 例因 `langgraph==1.2.22` 漏装转绿。

## 不做的事

- 不改 `sticky_prompt_cache.py`（逻辑本身已是对的）。
- 不调整 usage 契约（cachedTokens 上报不变）。
