# ADR 0310 — 能力行只读探测结论：`real` 是"网关答过"，不是"环境里有 key"

日期：2026-11-22
状态：已采纳

## 背景

`/healthz` 的 `providers[]` 是 web 侧唯一的真假判据：`apps/web/src/lib/env.ts` 按
`kind='llm'` 那一行定 `text`，`text!=='real'` 的分支直接走 `mockProvider`（§160 的 DEMO MODE）。
这一行此前由 `Registry.text_status()` 写成 `return "real" if self._llm`——也就是
**"进程环境里有一串非空密钥"**。

2026-11-22 一天之内连续撞到四种网关答复，全都被同一句话覆盖了：

| 现场 | 网关原话 | 正确处置 | 当时报的 |
| --- | --- | --- | --- |
| 账号耗尽 | `403 insufficient_user_quota`，余额 `$-0.001488` | 充值 | `llm=real` |
| 令牌失效 | `401 Invalid token` | 换 key | `llm=real` |
| 地理封锁 | `403 本站不对您所在的国家及地区进行商业服务` | 走代理 | `llm=real` |
| 模型下架 | `404 model_not_found`（embedding，2026-11-13） | 换模型 | 已修 |

前三种都不是"适配器造不出来"，是"这条链路今天不给你用"。同一份 payload 里
`llmLive.state` 已经写 `failed`，`providers[llm].status` 还写 `real`——两个读数各说各话，
而 web 读的是那个说谎的。

## 选项

- **A. 只把 `llmLive` 拿给面板看**：能力行不动。说谎的读数仍是 web 的输入，本 ADR 想修的bug 原样留着。
- **B. 能力行改读探测结论，`unknown` 也算不可用**：与 embeddings（§AILIVE-3，`embedding_status()`）
  同一条判据。代价：ai-service 冷启动到第一次探测落地之间有一个短窗口报 `unavailable`，
  web 在这个窗口内走 mock。
- **C. `unknown` 仍算 `real`、只有 `failed` 落**：消掉冷启动窗口，但"没问过就答能"这个习惯
  留着，下次换个死法（比如探测线程没起来）就 again。

## 决定

**B**，并顺手把 401/403 的原因分类做掉：

1. `text_status()` / `providers()` 的 llm 行只认 `LlmLiveness.state=="ok"`；理由与状态成对来自
   `text_reason()`，没探过写"未验证"，探过失败写网关原话；不是 `real` 就不列 `models`
   （列出模型名会被读成"这个模型在这条链路上"）。
2. `describe_auth_failure(status, body, subject=…)` 按网关自己的 `code`/`message`
   分四类：额度耗尽（附"换 key 没用"）、没有这条模型、地理封锁（"需要走代理"）、
   其余才回"检查 NEXUS_OPENAI_API_KEY"。同步、流式、embeddings 三条出站路径共用它，
   同一次 403 不再有两套说法。
3. `capability()` 汇总跟着落：没有一条真链路时它不许站 `real`。

## 后果

- **正面**：key 被吊销的那一刻起，`/healthz` 说的是实话，web 显示 DEMO MODE 而不是把请求
  发给一条死链路吃 5xx；运维看一眼就知道该充值还是该换 key。
- **代价（接受）**：冷启动窗口内 `text=unavailable`，web 走 mock 几秒。`lifespan` 启动即起
  后台探测（不阻塞启动），且 `/healthz` 每次读到过期都会补一次，窗口有界。
  判据在 `test_healthz_does_not_call_an_unprobed_llm_real`。
- **测试口径变化**：桩 provider（`FakeProvider`）永远拿不到探测结论，凡是要 `llm=real` 的臂
  必须显式 `LlmLiveness().record(True, "")` 提供证据——这正是"要证据"的契约，
  两条旧臂（`test_healthz_reports_configured_provider_as_real`、embedding gate 那条）按此改名/补证据。
- **未覆盖**：探测本身的花费（一次 2-token ping，TTL 900s）；真计费读数 `costUsd=0` 仍未解；
  web 侧对 `unavailable` 与 `demo` 不做区分（`statusOf` 只认 `real`）。
