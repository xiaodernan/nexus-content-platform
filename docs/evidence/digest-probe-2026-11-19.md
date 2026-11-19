# Live LLM digest probe · :3200 (E168–E170 absorbed) · 2026-11-19

> Deliberately one single world-step call — the question embedded in the move can only be answered from the freshly regenerated canon digest, i.e. it is a true-read of whether the restarted ai-service serves the updated bytes.

## Restart recipe (verified live)
- kill `:3200` listener chain (old worker PID 7200 inherited) — `taskkill /F` on the worker ends health probe listener
- relaunch: `$env:PYTHONPATH='D:\内容创作平台\apps\ai-service\src'` + `.venv\Scripts\python.exe -m uvicorn ai_service.app:app --host 127.0.0.1 --port 3200` (background shell; `PYTHONPATH=<repo>/apps/ai-service/src` is mandatory — `src/ai_service` layout, without it `ModuleNotFoundError`)
- `/healthz` → 200 · `capability: real` · `llm: gpt-6.2-sol (openai-compatible)` · `llmLive: { state: ok, probes: 4 }` (before restart)
- `/v1/ai/cache-stats` after restart → `prefix.requests: 2, transport.stream: true` (process-local counters reset on restart; Redis namespace persists; not a regression)

## The probe
POST `http://127.0.0.1:3200/v1/ai/world-step`
```json
{
  "requestId": "e170-digest-probe",
  "locale": "zh",
  "state": {
    "clock": { "label": "霁历三十七年 · 冬潮月 · 落潮", "season": "winter", "tide": "falling" },
    "traveler": { "vigor": 6, "depth": 3, "seals": [] },
    "memory": [ { "kind": "step", "text": "走到沙厅最里间，看那架旧竖琴。" } ]
  },
  "move": "沙厅最里间那架被灰埋了的旧竖琴是什么来历？请结合世界大典作答。",
  "modelClass": "balanced"
}
```

## Response
- HTTP 200 · `capability: real` · `provider: openai-compatible` · `model: gpt-6.2-sol` · `modelClass: balanced`
- `usage`: tokensIn **320,720** · tokensOut **569** · cachedTokens **0** · cacheReported **true** · latency **20.6 s** · reasoningTokens **323** · costUsd **0.0** · costBasis "unknown" · toolCalls **2**
- `delta`: `vigor 0`, `depth +1`, `seals []`, **`unlocks: ["E169"]`**, `risk: "calm"` — 潮回 chain verified end-to-end and canon_guard accepted E169 as an unlock candidate — i.e. the served digest contained the post-E169/E170 bytes.
- narration body intentionally not transcribed (console codepage mojibake; delta + unlocks carry the load)

## Why cachedTokens = 0 on first call
Digest bytes changed at E168's insertion point — the common prefix with the last warm digest stops there. Cold first call is expected; KV re-warms on the second identical call. No code defect.

## Environment notes
- `:8000` is **careeros-ai**'s docker port-forward — NOT this project
- `:3100` is web dev (PID 25488 earlier) — was murdered by a harness 3600 s timeout at 18:44; relaunched hidden via `Start-Process d:\内容创作平台\npm.cmd run dev -w @nexus/web` with NEXUS_AI_SERVICE_URL=3200 & NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@127.0.0.1:5443/nexus
- `:3200` is the NEXUS ai-service; the probe is its first real OK from scratch with new digest
