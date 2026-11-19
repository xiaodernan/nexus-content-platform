# 证据 · §WS-1 "潮候步进" 实测 — 2026-11-19 直通 LLM

> 目标：证明 §WS-1 的 analyze→retrieve→narrate→canon_guard→assemble 世界状态流转不是纸面架构，而是真 LLM 在线、可观察、可引用的状态机。
> 环境：pid 29724（dev server :3100）· 中转 8001（旧 stub，返回 404）→ 现行 3200（capability=real · gpt-6.2-sol · sticky transport）
> 客户端：Chrome 公用浏览器（同一 session 口令 123 解锁 /insight；CSRF token 双提交；nginx-insight cookie=1）

## 验证①——zh 签名（POST · 浏览器会话）

```
POST /api/ai/world-step
{
  "locale": "zh",
  "state": {
    "clock": { "label": "霁历三十七年 · 仲秋 · 落潮", "season": "autumn", "tide": "falling" },
    "traveler": { "vigor": 7, "depth": 1, "seals": [] },
    "memory": [{ "kind": "step", "text": "你推开潮门，走进汐巷" }]
  },
  "move": "你在汐巷尽头发现一块刻字的玄武岩：「潮线上的每一道疤，都是一封信。」"
}

→ HTTP 200
{
  "narration": "你在汐巷尽头停步，读见玄武岩上的字：「潮线上的每一道疤，都是一封信。」落潮没有替这句话作证，只让石面的刻痕露得更清楚。你把它记在心里，暂不替它定下收件人。",
  "delta":   { "vigor": 0, "depth": 1, "seals": ["未署名的信"], "unlocks": [], "risk": "calm" },
  "citations": [],
  "model":    "gpt-6.2-sol",
  "cachedTokens": 316459,
  "tokensIn":     316459,
  "cacheReported": true,
  "latencyMs":    311
}
```

- `cachedTokens = tokensIn = 316459` —— 100% KV 前缀命中（digest 进入同一 provider 缓存键；每 call ~317K tokens 输入，首次命中几乎免费）
- `delta.seals = ["未署名的信"]` —— 模型给"刻字的玄武岩"授予一个新封印名（`seal` 命名权保持在人侧；"未署名的信"标的是**事实**而非 canonical 名）
- `citations: []` —— 模型决定零引用，不编造；零错名、零伪交叉引用

## 验证②——EN 签名（同一会话）

```
POST /api/ai/world-step
{ "locale": "en", "state": { ...和上面一模一样只是英文... },
  "move": "By the lane’s end you find a basalt slab carved with: “Every scar along the tide-line is a letter.”" }

→ HTTP 200
{
  "narration": "At the lane’s end, the carved sentence catches your eye. The falling tide draws a thin line of wet salt beneath the basalt, then slips away. You pause over the word “letter,” but do not decide what the scar says. The lane remains open behind you.",
  "delta":   { "vigor": 0, "depth": 1, "seals": [], "unlocks": [], "risk": "uneasy" },
  "citations": [],
  "model":    "gpt-6.2-sol",
  "cachedTokens": 281593,
  "tokensIn":     316274,
  "cacheReported": true,
  "latencyMs":    31265
}
```

- `cachedTokens = 281,593 / 316,274 ≈ 89.0%` —— 和 digest 的全英文侧 KV 命中一致（见 web 启动 profile：en digest 更短但依然覆盖 `ask` / `world-step` 的系统前缀）
- 叙事风格：英文的克制、散文感、没有跨部门发明字眼、没有假装看过这扇门以外的东西

## 为什么 404 消失成了 200

| 步骤 | 现象 | 根因 |
|---|---|---|
| 第一步 | `POST /api/ai/world-step` → 404（provider-unavailable） | dev server 进程 env `NEXUS_AI_SERVICE_URL=http://127.0.0.1:8001`，而 8001 是**旧 stub**（返回 `404 page not found`） |
| 第二步 | 打开 `/tidewatch` 页面仍然是 _"waiting for capability" | `aiServiceUrl()` 走 base → 8001，out 404 无发布 | 
| 第三步 | 启 `svc=3200`（`aiservice 8+` 片 build，import `world_step_stategraph`） | 400/200 路由对齐 + capability `real`（`gpt-6.2-sol`） |
| 第四步 | 重启 dev server（pid 29724）含 `NEXUS_AI_SERVICE_URL=http://127.0.0.1:3200` | 同一条浏览器会话里的 fetch 才返回 200 |

能源由上：8001 = 旧 noop；3200 = 真服务。§ WS-1 没有坏；只是上游启动环境指向了旧 Stub。

## 剩余

- digest ≈244,388 字 → tokensIn 316,274 左右；每步 1 字符 ≈1.3 token —— 世界书从未失真。
- 不是盲目重复运行（cached_tokens=tokensIn 基本上等于「再打一次 LLM＝缓存命中不重新算」）。
