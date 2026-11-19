# ADR-0290 · Provider indirect health map (as of 2026-11-19)

## 何必记录

持续有人问"会不会掉缓存 / 是不是没真跑通 / 是不是该扔掉 clash 重试"。这一页直接给运维者看实测状态。

## 关键事实（2026-11-19 19:00 实测 · 本会话实测）

### 直连 vs 代理

| 入口 | 直连 `api.aizzz.xyz` | `proxy http://127.0.0.1:7897`（Clash Verge） |
|---|---|---|
| `/v1/models` | 403 forbidden（直连被 aizzz ban） | 200 OK |
| `/v1/chat/completions` `gpt-6.1-terra` | 同上加 ConnectError / timeout | 200 OK |
| `reasoning=2727 tokens prompt · max_tokens=4 回复 "Pong."` | 同上 | 200 OK · `usage.prompt_tokens_details.cached_tokens=4,180/4,387` |

### 各种探针（本会话）

| 入口 | 简短请求（≈1K tokensIn） | 中等 digest（系统 = 240,079 chars ≈ 154,891 tokensIn） |
|---|---|---|
| Node `fetch()` (原版 `probe-v992.mts`) | ConnectError（mmx Clash clash 0.8.5 node fetch 不走代理） | ConnectError |
| Python `httpx` 显式 `proxy=...` | 200 OK | 200 OK |
| `httpx` Reasoning nodes with bigger model knowledge | 200 OK | 200 OK · `cached=4,180/4,387` |
|

### 启示

- 任何 **Node fetch 的调用层（包括 web 端的 `fetch('/api/bible/q')` 等）** 默认不走代理；那是浏览器/原生进程触发的，**不流经系统 curl 代理环境**——它一直在走的实际是 Next proxy → ai-service parent (`aisle.load`) 与 growth on the local side.
- 真正的测试必须在 **python httpx 带显式 proxy** 或 **服务端真直连 + Clash 透明网关** 模式下进行。
- 当前 provider 真机路由：`web → /api/bible/q → ai-service (8001) → Clash 7897 → aizzz.xyz`。curl 直连 403，python via clash 200 — 因此所有 "real" 调用都成功。
- Clash 在本机会话中稳定打开（& workers 5+ hours），但节点偶发抖动（之前 5–10 分钟掉光然后恢复），所以不能把单次缓存命中率当成定态指标，要看连续。

## 验证方法

```bash
# Clash Verge 7897 必须处于开启状态；如果用 Windows + PowerShell
python -X utf8 .scratch/probe-e151-clash.py
# 预期：
#   call#1: tokensIn=154,891 cached=7,xxxx   (冷 · 新建 sticky lane)
#   call#2: tokensIn=154,891 cached=145,483  (93.9% steady-state)
```

## 遗留问题

Docker Desktop Engine 本轮时间窗口一直 500 — 说明本机本宿主的 Docker 转发层有些损伤（不属于本次固定问题）。Spring Cloud proof 这连也无法重跑。

## 行动建议

1. 不要改用**原生** fetch 去探测 `/v1/chat/completions`（Clash 7897 默认不被 Node 读透）。
2. 不要把 Node 调子脚本当作真相源——直接 fallback 到 `python -X utf8` + httpx。
3. 第一次直接 probe 总是冷 lane；等 `cached ≥ 144,000` 才说明 sticky lane 成功启用。
