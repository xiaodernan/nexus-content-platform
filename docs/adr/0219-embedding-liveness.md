# ADR-0219：§AILIVE-3（接手并行会话）`ai-service` embeddings 存活判定——能力状态由真调用得出

- 状态：Accepted
- 日期：2026-11-13
- 关联：§21(§§NEXUS chapters) · `apps/ai-service/tests/test_liveness.py` · `docs/evidence/ailive-3-liveness/evidence.md`

## 背景

中转网关只放行 chat 模型：`text-embedding-3-small` 直接 `model_not_found`，而 `/healthz` 一直报 embedding=real——因为状态是 `if self._embedding` 推的（有 key 就当成能用）。本片把"探过一次、结果如何、什么时候再探"收成一个对象：

- `EmbeddingLiveness`：进程内存的 ttl 对象（900 秒）；`record()` 盖章；`claim_refresh()` 独占探测令牌；
- `EmbeddingProber`：拿一个真输入打一次 `/v1/embeddings`，翻译成 `(ok, reason)`；
- `refresh_in_background()`：过期就起守护线程探，本次调用不等网络（healthz 的预算是毫秒级）；
- `Registry.embedding_status()` 改为三档：未探 → `unavailable`（ reason 写"未验证"）、探失败 → `unavailable`、探过 → `real`（只报 `real` 时才列 `models`）。

`sanitize_no_proxy()`：把 NO_PROXY / no_proxy 里的 `[::1]` 改成裸 `::1`；其他语法原样保留；传进来的 environ（测试现场）不动。
web 侧（`env.ts`）配套调整：`text:` 不再读汇总 `capability`，改为直读 `providers[]` 里 kind=`llm` 那行——汇总"任一 real 即 real"会嵌入 real 冒认文本 real（**embedding 就绪、llm 没就绪的部署会向一条没有文本 provider 的链路发请求**）。

## 决定

1. **并行会话原作**：`liveness.py`、`test_liveness.py`、`test_config_no_proxy.py`、`registry.py`、`config.py`、`app.py`——以上**由并行会话原样交出**；本片替其完成适配 + 修两处测试假绿（barrier 三方等）、httpx base_url 尾斜杠钉错。
2. **接手发现的独立缺陷**：`Registry.__init__` 的 `llm=None` 与默认"按 key 自动构造"撞车——测试期望 `llm=None` 表示"没有文本 provider"，而实现方向是"key 在就照样造一个"。修复：引入 `_UNSET` 哨兵区分"没传（按 key 构造）"与"显式不要（llm=None）"。
3. **顺手完成 §AILIVE-3 未完成的环境兼容**：web 的 `env.ts` 文本能力判定改为读 `providers[]` 中 kind=llm 行（汇总冒认闭合）。

## 取舍

- 不把探测做成强同步（healthz 会变慢到 1.5s+ 超时——web 侧探测只有 1.5s，整条链路变 DEMO）；
- 不向 `/healthz` 返回模型名，除非 `real`——列出来会被读成"这条模型在这儿"；
- 不伪造探测结果——`unknown` 报 `"unavailable"` 而不是经验性 "real"；
- 不删 `has_llm`——它只证明"这个环境里有一串密钥"，仍是 `load_settings` 必须的判断，不改。

## 后果

`ai-service` 与 `web` 文本/嵌入能力同一口径 llm-row real → text real。`wapi.pro` 凭证下 `embed-x` 返回 `model_not_found`，所以本机上 `embedding` 的能力状态仍是 `unavailable`，§AILIVE-2 汇出的 `/healthz` 中 embedding=real 为错值——**不拜这一页盖章，拜 `registry` 自己**。

## 完整边界（如实）

- **真凭证（`sk-…` `wkapi.pro`）没有由本片触发真调用**——本片没跑 `npm run live:…` 中的 `--confirm-real` 任一臂；探测单测用 mock 覆盖 `OK` / `model_not_found` 两条路径；live path（真调 `https://wkapi.pro/v1/embeddings`）未主动打出
- `wkapi.pro` 对 `text-embedding-3-small` 的 `model_not_found` 是既有事实
- web 侧只 tsc + vitest env.test.ts 过；合约层 SPEC/packages 与本片无关，**没动过**
- 依然欠：provider 就绪 live 取证（`--confirm-real` 路径 + 逐 chunk 证据链落地 `docs/evidence/ailive-3-liveness/evidence.md`）
