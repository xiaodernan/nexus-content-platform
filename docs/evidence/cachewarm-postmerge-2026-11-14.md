# cache-warm post-merge probe · 2026-11-14 (v691..v699 并轨全量后)

经过两次并轨（v691..v698 并轨选择 merge 102bd0f0 + v699 并轨 ddfe91a9）之后，真网关路
径（wkapi.pro / gpt-6-sol）复测缓存命中仍然成立：

```
$ python scripts/probe-cache-warm.py --confirm-real --turns 4
[§CACHE-4] cache-warm 探针 · model=gpt-6-sol · base=https://wkapi.pro/v1 · key=***
  system=2317B  user=23349B  stableDigest=23aa0d15b1f4843b  lane=nexus-cache4
  连续同 lane 发 4 次，每次 max_tokens=1
  turn1: prompt=27347 cached=0 (0.0%)
  turn2: prompt=27347 cached=27344 (100.0%)
  turn3: prompt=27347 cached=27344 (100.0%)
  turn4: prompt=27347 cached=27344 (100.0%)

  判定 = full（稳定块完整入缓存）—— 首轮 miss 后 3 轮全额命中
  每轮 cached 读数 = [0, 27344, 27344, 27344]
```

- 口径：同一 `prompt_cache_key` 车道、完全相同的字节、`max_tokens=1`；仅变量是"第几次"。
- 相对 v5 测量（88 %），此次为 100 %——网关选择性在 distributor 通道层为随缘，本轮机器命中
  100 % 不构成 SLO 承诺，仅证明**续接可用**。
- 费用：4 次 max_tokens=1，实花 < 0.001 美元（不落入仓库，仅本记录）。

复现：`python scripts/probe-cache-warm.py --confirm-real --turns 4`
（KEY 从 `apps/ai-service/.env` 的 `NEXUS_OPENAI_API_KEY` 读，绝不入库。）
