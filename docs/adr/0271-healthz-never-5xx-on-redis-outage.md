# ADR 0271 — healthz 绝不因 Redis 不可达而 5xx：queue 计数 350ms 超时显式降级

## 背景（2026-11-17 现场证据）

Docker Desktop 当天多次熄火，`nexus-redis`（127.0.0.1:56379）在进程存活期间断开。
ai-service 的 `/healthz` 把 `state.store.counts()` 直接 await 进去：

- redis-py 默认无 socket 超时；命令在半开连接上重试数秒后抛 `ConnectionError`；
- FastAPI 未捕获 → **HTTP 500**，响应约 4 秒返回；
- web 侧 `fetchAiServiceHealth` 只有 1.5s 探测预算 → 永远超时 → health=null →
  `getAiCapabilities().text === 'demo'` → **整个 web 的 AI 入口一起退进 DEMO MODE**
  （`/api/stategraph` 实测 409 `demo_mode`）。

换言之：Redis 抖一下，所有"这个 provider 到底是不是真的"全部判错——不是 provider 的问题，是热路径读了不该读的东西。

## 选项

1. 给 redis 客户端配 socket/connect 超时：治标不治本——任何 Redis 故障仍然会让 hot path 抖动；
   而且 `llm_cache_state()` 等同步读数一律无法等待（sync 函数）。
2. 删掉 healthz 的 queue 计数：最便宜，但 §162 明确禁止——pending 必须来自真计数器。
3. **bounded read + honest degradation（本次采纳）**：healthz 对 `counts()` 套 350ms `asyncio.wait_for`；
   任何异常（ConnectionError / TimeoutError / …）→ pending/running 如实填 0，
   `queue.note` 追加 `counts-unavailable:<exc>`，其余字段不变；HTTP 恒为 200。

## 决定

采用 3。附带契约测试 `test_healthz_degrades_when_queue_counts_explode`：
启动后把 `state.store.counts` 实例级替换为 raise ConnectionError，断言
`/healthz` 仍 200、`pending/running == (0,0)`、`note` 含 `counts-unavailable`。

## 后果

- web 的 AI 能力判定（`providers[].status`）与队列读数解耦：Redis 断开时 LLM 链路仍判 `real`，
  503/409/429 只在 provider 真实不可用时出现，不再被 Redis 误伤；
- queue 读数在降级窗口内标注 `counts-unavailable`（不是"读到了 0，是没读到"）——
  违反"0 就是 0"的误判被消除；
- 350ms 是拍脑袋的保守值：小于 web 1.5s 探测预算一个数量级，大于正常 LLEN+SCAN 的 p99（本机 < 5ms）；
- 服务重启时若 Redis 未就绪仍按 `build_store` 的既有语义**拒绝启动**（fail loudly），
  本 ADR 只修"启动后 Redis 断开"这一窗口。
