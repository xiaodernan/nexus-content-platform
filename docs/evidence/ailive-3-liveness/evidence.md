# §AILIVE-3（接手并行会话）· embeddings 存活判定——验收记录（2026-11-13 接手）

## 并行会话已交付什么

`liveness.py` / `test_liveness.py` / `test_config_no_proxy.py` —— embeddings 的"配了 key" ≠ embeddings 的"能用"问题直接上位：中转网关仅放行 chat 会让"embedding=real"变成谎言。

## 这次做了什么

并行会话交出的 liveness/config 分支代码 + 测试在**未修改语义前提**下接手；
接手审查发现的独立缺陷：

1. `Registry.__init__` 的 `llm=None` 含义撞车（"没传"与"显式不要"无法区分）——本片引入 `_UNSET` 哨兵解决
2. `test_liveness.py::test_two_concurrent_refreshes_share_one_probe`——`Barrier(2)` 三方等导致主线程 BrokenBarrierError（两个 worker + 一个主线程 = 3 个 waiter，但 barrier 只数 2）——本片将 join + gate 语义改写为三条线程完全等效独立
3. `test_config_no_proxy.py::test_load_settings_leaves_a_usable_environment_for_httpx`——httpx `base_url` 自动补尾斜杠 `/`，断言对错——断言钉在 host-shape 不钉 httpx 字符串化形态
4. web `.env.ts` 把文本能力判定从汇总 `capability` 改回 providers 中 `kind=='llm'` 那一行——补上汇总冒认

## 验证（本地实跑，2026-11-13）

```
cd apps/ai-service && .venv/Scripts/python.exe -m pytest tests/ -q
  → 114 passed
npx vitest run apps/web/test/env.test.ts
  → 7 passed
npx tsc --noEmit -p apps/web/tsconfig.json
  → TSC_EXIT=0
```

## 真凭据准则

- **真凭证 live 未执行**：本片 live `-m pytest` 零网络调用；`--confirm-real` 路径未发起；
- 网关 404 证据（`model_not_found` / "No available channel for model embed-x under group gpt-特价"）是**既有观察记录**，原语料非本片新增
- 下一句：`/live:ai-smoke -- --confirm-real` 全链路 live 验证，附大模型 KEY 主管

## Environment evidence

- `apps/ai-service/.venv/Scripts/python.exe -m pytest tests/` → **114 passed**（8.40s，覆盖 liveness/no_proxy/providers-openai-compat/etc.）
- `npx vitest run apps/web/test/env.test.ts` → **7 passed**
- `git status`：4 个文件为 modified、3 个 file 为 untracked（.venv 不入仓库）
- **真实 live 验证未触及 wkapi.pro**（未调用 `--confirm-real`）