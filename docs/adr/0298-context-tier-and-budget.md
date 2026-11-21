# 0298 — 分层上下文前缀与可配预算（§CTX-TIER + §CTX-BUDGET）

- **日期**: 2026-11-21
- **状态**: Accepted（代码 + 测试已落地）
- **里程碑**: M8 / LLM 基础设施 · 上下文与缓存效率

## 背景

用户长期反馈两件事：

1. **输入上下文太少**——Codex 一次能打进 5 万～9 万 token，而本项目设计 prompt 的节点表被硬编码在 `MAX_TREE_CHARS = 60_000`（约 1.5 万 token），且没有环境变量可配；有能力的大模型（gpt-6.2-sol）的上下文容量没有被用满。
2. **并行会话掉缓存**——ADR 0296 已用会话级 `cacheLane` 解决"同一 system 的多个会话互挤"。但还有另一半：observer/digest、deep-read、discover、editor-note、marketplace、notifications、pulse 这七条路由**复核的是平台自己的实测数字**，却在 system 里塞了整份 265,808 字符的 `SYSTEM_PROMPT`（≈171K token，13 章 + 205 回响 + 4 附录）。这些正典正文对"判断一组聚合指标"毫无帮助，却按调用重复占用 KV 前缀容量，与并行会话互相挤出缓存——这正是"中途掉缓存"的另一来源。

## 选项

A. 把所有路由的 system 都换成短前缀，包括问典链路（bible/q、insight/chat、ship/digest、canonGraph）。
   - 否。那些链路的合法性依赖正典逐字在场（§CACHE-4）；抽掉正典会让答案失去唯一真值。

B. 把 60_000 上限直接改成一个更大的固定值（如 200_000）。
   - 否。固定值无法适配不同 provider/模型；且过大只会徒增 KV 前缀占用，反过来加剧 ADR 0296 的并行挤出问题。

C. **分层 + 可配**（采用）：
   - 复核类路由用轻量、字节稳定的"身份前缀"（~0.4K token），真正需要正典的链路保留 `canonPrelude`；
   - 设计树预算改为环境变量 `NEXUS_DESIGN_TREE_CHARS`，默认仍是 60_000（老部署字节级不变），上限 400_000（约 10 万 token），由运维按模型能力决定。

## 决定

1. `apps/web/src/lib/canonPrefix.ts` 新增 `canonIdentityPrelude(locale, label)` 与硬上界 `CANON_IDENTITY_MAX_CHARS = 1200`：只含平台身份、语气、数字纪律、语言纪律，字节稳定；同一 locale 的复核调用共享同一短前缀。
2. 七条复核路由（observer/digest、deep-read、discover/interest、editor-note、marketplace/picks、notifications/digest、pulse/review）的 system 由 `canonPrelude` 改为 `canonIdentityPrelude`；问典链路不动。
3. `apps/ai-service/src/ai_service/design_prompt.py` 以 `_tree_chars()` 从 `NEXUS_DESIGN_TREE_CHARS` 读取预算（1..400000，非法/越界回落 60_000），`MAX_TREE_CHARS` 在 import 时求得，保持引用点不变。
4. 测试：`canon-prefix-tier.test.ts`（13 项，钉住轻量前缀 <1% 正典长度、同 locale 字节稳定、问典链路仍用全前缀）；`test_prompt.py` 新增 env 预算边界用例（22 passed）。

## 后果

### 变好的事

- 复核类调用的前缀占用从 ≈171K token 降到 ~0.4K，KV 前缀不再被无用的正典正文撑满，与 ADR 0296 的会话车道叠加后并行缓存更稳。
- 有能力的大模型可通过一个环境变量用满上下文，无需改代码；缺省形状字节级不变。

### 变差的事 / 边界

- 复核类路由的模型不再"看到"正典正文——这是有意的：它们只该依据 user 消息里的实测数字作答；问典类路由不受影响。
- 把预算抬得过高会增加每次调用的 KV 前缀占用，可能与并行会话互相挤出；400_000 是护栏不是目标，需实测后按模型能力调。
- 本 ADR 不声称复核类调用达到稳定 90% 命中——只声明前缀结构不再自相矛盾；命中率的真机读数见 `docs/evidence/stategraph-live-session-lane-2026-11-20.md` 与 ADR 0296。

## 相关

- ADR 0296（会话级 prompt_cache_key 车道）
- ADR 0126（provider 前缀缓存 / 字节稳定 system）
- `docs/evidence/ci/evidence-census-proof.mjs`（census 门）
