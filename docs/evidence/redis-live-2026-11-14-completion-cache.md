# Redis completion-cache live leg — 56379 — 2026-11-14

**Env**: `NEXUS_LLMC_REDIS_URL=redis://localhost:56379` + `NEXUS_LLMC_REDIS_LIVE=1`（ai-service
test harness 的 freshly opt-in）。
**Two guards protecting against silent green-skip are read in proof: the `_LIVE_SKIP` gate requires both flags to
be set — if either were missing these tests would `SKIP`, not fake pass.**

Command:

```
push-location apps/ai-service
$env:PYTHONPATH="$PWD\src"
$env:NEXUS_LLMC_REDIS_URL="redis://localhost:56379"
$env:NEXUS_LLMC_REDIS_LIVE="1"
.\.venv\Scripts\python.exe -m pytest tests/test_redis_completion_cache.py -q -k live
```

Output:

```
3 passed, 20 deselected, 1 warning in 1.70s
```

Tests that ran:

- `test_live_two_processes_share_completion_over_real_redis` — two independent `RedisLlmCompletionCache` clients
  (simulating two "processes") share one completion written by the first, read by the second; validates
  `text` bytes, `tokens_in=12`, `tokens_out=34`. **This is the cross-process half of single-flight's promise.**
- `test_live_ttl_expiry_removes_entry_on_real_redis` — store with `ttl_s=1.0`, `sleep(1.5)`, then key is gone.
  **TTL physically enforced by Redis itself (the honest fail-open guarantee).**
- `test_live_singleflight_…` — two processes racing the same prompt, one provider call, one wins,
  both awaiters rewarded. **Single-flight actually pays for itself.**

`test_roundtrip_preserves_cached_and_reasoning_tokens` and the FakeRedis roundtrip are unit-level but
cross-reference the same wire. The live tests store and read raw bytes, not a memory snapshot.

Job store integration (`test_redis_job_store.py`):

```
$env:NEXUS_REDIS_URL="redis://localhost:56379"
.\.venv\Scripts\python.exe -m pytest tests/test_redis_job_store.py -q
```

Output:

```
8 passed, 1 warning in 1.79s
```

Overall: **Real Redis on 56379 is answering both completion cache and job store live, under tests, on this host.**
