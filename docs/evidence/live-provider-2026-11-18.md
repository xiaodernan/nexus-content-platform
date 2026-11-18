# NEXUS 实证探针 · 大模型 API 实测（2026-11-18）

> 本探针只做最小可复原细节，不泄漏任何密钥——密钥只在 `apps/ai-service/.env`（封存于 git，.env 本来在 .gitignore 里）。

## 环境配置核对（真实值掩码）

- `NEXUS_OPENAI_BASE_URL = https://api.aizzz.xyz/v1`
- `NEXUS_OPENAI_API_KEY` 已在 `apps/ai-service/.env` 配置（用户 2026-11 提交的新秘钥，本证据档不落盘其值）
- `NEXUS_MODEL_BALANCED = gpt-6.1-terra`
- `HTTPS_PROXY = http://127.0.0.1:7897`（本机 Clash Verge；不走梯子会被上游按国家拦截）
- `NEXUS_LLM_STREAM = 1`，`NEXUS_LLM_MAX_ATTEMPTS = 3`，completion-cache 指向 `redis://…:56379/8`

## 探针（2026-11-18 · Clash Verge 7897 节点）

```
POST https://api.aizzz.xyz/v1/chat/completions  (Bearer（掩码），via HTTP_PROXY=127.0.0.1:7897)
```

payload（节选）：system「You answer in one short sentence.」+ user「Reply with exactly: NEXUS LIVE PROBE OK」，
`max_tokens: 16`，`stream: false`，`prompt_cache_key: "nexus-probe-2026-11-18"`。

**结果**：`HTTP 200` · 耗时 **2.58s** · 返回 `content = "NEXUS LIVE PROBE OK"` ·
`usage: prompt_tokens=4406, completion_tokens=11, total_tokens=4417`。

## 与历史实证对照

- v791（2026-11-16）：首次切换到 aizzz.xyz + Clash Verge 命中（直连 403，走代理 200）
- v788-795：stream lane 97-98% 缓存命中；distributor per-channel cache 事实档案
- v878（缓存身份文档化）：`docs/CACHE-IDENTITY.md`——三层判据（sticky `prompt_cache_key` + v2 digest + Redis L2）

## 结论

- 新地址、新秘钥、Clash 节点、gpt-6.1-terra 全部可用（2026-11-18 再次实测）。
- 直连仍然无法过境，一切请求必须走 127.0.0.1:7897。
- 下一验收：若任何页面显示 `DEMO MODE`，先查 `.env` 是否被同步覆盖。
