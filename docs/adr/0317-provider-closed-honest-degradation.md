# ADR 0317 · 供应商 API 关闭后：保留可替换 provider，能力由真调用判定，失败如实降级

日期：2026-11-23 · 状态：已采纳 · 关联：`docs/KNOWN_ISSUES.md` 顶部 2026-11-22 纪律、
`apps/ai-service/src/ai_service/providers/registry.py`（`capability()` / `text_status()`）、
`providers/llm_liveness.py`（真调用探测）、`providers/openai_compatible.py`（失败分类）、
`apps/web/src/server/ai/client.ts`（`provider-unavailable`）、`§76–79`（provider 可替换）、
`§159`（不伪造 AI）、`§160`（DEMO MODE 标识）

## 背景

用户于本轮明确通知：**因成本与用量控制，那个一直用于实测的大模型 API 已关闭，后续开发可能无法再调用**。
这与仓库里的客观状态并存：

- `apps/ai-service/.env` 里仍留着原来的 `NEXUS_OPENAI_API_KEY` / `NEXUS_OPENAI_BASE_URL`，
  表面上"配置齐全"；
- 历史 live 证据（prompt cache 命中、world-step、bible-ask）都是**当时快照**，不代表此刻能出网或有额度；
- 用户第〇点要求"必须实测跑通"，但现状是跑不通——继续反复打那个网关只会浪费时间，
  且若把失败伪装成成功，就违反 §159。

## 选项

| | 做法 | 代价 |
|---|---|---|
| A | 再找一把新 key / 换网关继续打 | 用户已说关闭，没有新凭据；反复重试是浪费，且拿不到真结果 |
| B | 把 provider 配置从代码和 `.env` 里删干净，项目退回纯 mock | 丢掉 §76–79 的可替换架构；日后恢复要重接一遍；历史调用链与缓存读数失去锚点 |
| C | **保留 provider 抽象与配置，能力状态改由真调用探测决定，失败如实降级** | 每次 healthz 过期要付一次失败探测（TTL 900s，已由后台守护线程承担）；需要门把"配置了≠可用"说清楚 |

## 决定

选 **C**。具体边界：

1. **能力状态只由真调用得出**。`registry.text_status()` 不看"有没有 key"，
   只看 `LlmLiveness.state`：`LlmProber` 用 `system=ping / user=ping / json_mode=False` 打一次真补全，
   空回复、异常、鉴权失败一律记 `failed`。`unknown` 按不可用处理。
   `capability()` 汇总各 provider 状态，因此配着一把死 key 也不会自称 `real`。
2. **失败分类要能说人话**。`describe_auth_failure()` 区分 401/403、额度耗尽、网关无该模型通道、
   需要代理出站；web 侧 `runAiService()` 把不可达/非 2xx 包装成 `provider-unavailable` / `provider-failed`，
   不生成假回答。DEMO MODE 标识在失败时必须出现（§160）。
3. **离线路径是主路径，但不冒充模型输出**。确定性组合、hash embedding 继续工作，
   界面必须如实写成离线/DEMO，不写成"模型说"。
4. **live 测试不再自动跑**。`test_provider_live.py` / `test_live_completion_cache.py` 已有
   `NEXUS_LIVE_LLM=1` opt-in 门，无 key 就 skip（不发网络、不假绿）；保持这个门，不放开。
5. **密钥不进版本库**。入册历史探针时把明文 key 改成 `NEXUS_API_KEY` 环境变量注入；
   无 key 时明确 SKIP 并指向历史读数，不伪造返回（`.scratch/probe-e151-clash.py`）。

## 后果

- 用户第〇点的"必须实测跑通"**在当前凭据状态下无法兑现**；本 ADR 不假装兑现。
  历史读数作为快照保留，可在 API 恢复后由人显式触发重跑。
- 第〇点的"缓存稳定 90% / 上下文 5–9 万"**暂停实测**，相关代码路径与 parallel-session 修复保留，
  不以静态推断冒充实测结论。
- 开发重心转向不依赖该 API 的部分：世界内容、前端体验与目验、i18n、压测、管理员观测、
  离线确定性能力。这些都有真实可验证的判据，不靠 provider。
- 若日后 API 恢复：**只需重置 liveness（等 TTL 或直接重启 service）并更新环境变量**，
  不需要改 provider 抽象、web 客户端或任何业务代码——这正是选 C 而不是 B 的回报。

## 验证

静态核对（本轮已完成）：

- `registry.capability()` 经由 `providers() → text_status() → LlmLiveness.state`，
  不存在"有 key 就报 real"的短路；
- live 测试两处 opt-in 门存在，无 `NEXUS_LIVE_LLM=1` 不发包；
- `apps/web/test/i18n-zh-kicker.test.ts` 与证据链门 4/4 全绿，本轮 i18n/证据改动未触碰 provider 语义。

**未验证**：关闭后的真实调用失败回执（需要起 ai-service 打一次真请求）。按用户"不再浪费 API"的约束，
本轮不主动打；若后续起栈，可用一个明确的坏 key 走失败臂，只验错误分类，不消耗额度。
