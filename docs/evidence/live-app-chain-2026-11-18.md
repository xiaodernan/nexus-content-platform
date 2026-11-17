# Live provider-in-app chain（2026-11-18 · §AILIVE-2）

> §AILIVE-2 脚本通过**web 的真实入口**验证 apps/web → apps/ai-service → 真实 provider 全链。
> 2026-11-18 再次实测：本机 Clash 节点（7897）出口、apps/ai-service 跑在 127.0.0.1:3200、prod web 提供 `NEXUS_AI_SERVICE_URL=http://127.0.0.1:3200`。

## 运行

```
cd apps/web
NEXUS_AI_SERVICE_URL=http://127.0.0.1:3200 NEXUS_LLM_STREAM=1 npx next start -p 3100
#另一个终端
cd D:\终极项目
npx tsx scripts/live-ai-smoke.mts --confirm-real
```

## 结果（2026-11-18T18:51）

```
GET /            → nexus_session + nexus_csrf（cookie 签发正常）
POST /api/auth/register     → HTTP 200（user: creator 角色，临时账号 live-ai-smoke-1794912911394）
POST /api/projects          → HTTP 201（project id=dc40ff56-9ca2-406f-a21a-9955c7912ae6）
POST /api/ai/run            → HTTP 200
```

```json
{
  "capability": "real",
  "provider": "openai-compatible",
  "model": "gpt-6.1-terra",
  "explanation": "WCAG AA 对正文（普通大小）文字的最低对比度要求是 4.5:1。",
  "usage": {
    "tokensIn": 8896, "tokensOut": 46,
    "cachedTokens": 0, "cacheReported": false,
    "latencyMs": 3094, "toolCalls": 1, "demoMode": false
  }
}
```

**通过：web → ai-service → aizzz.xyz（gpt-6.1-terra）全链 capability=real。**

## 诚实记录

- 本流生产 cacheReported=false + cachedTokens=0：aizzz 网关在本次 conversational 请求里没有报告缓存字段。
- 缓存命中的用法记录（stream lane ~94%）+ 为什么走 stream 的文档见 `docs/CACHE-IDENTITY.md` 与 `docs/evidence/cache-identity-2026-11-17.md`。
- 本片只证明「经 web 入口 → provider 的 app chain 真的通」，没有兑现任何「cache 命中率具体值」的声明。
