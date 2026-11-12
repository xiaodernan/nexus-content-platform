# §AILIVE-3 · 真 provider 走 Studio 风格的设计请求——整套 CSRF + session + 项目 + 装配 + AI 之后，拿到真模型的真句子

## 目的

§AILIVE-1 接通了 provider，§AILIVE-2 证明 CSRF→session→项目→ai/run 链路真走着。本片再补两次：
`scripts/live-ai-smoke.mts`（§AILIVE-3 后置）和 `scripts/live-design-verify.mts`（纯查库判断补丁是否落库）。

## 跑法

```
npx tsx --tsconfig apps/web/tsconfig.json scripts/live-ai-smoke.mts --confirm-real
npx tsx --tsconfig apps/web/tsconfig.json scripts/live-design-smoke.mts --confirm-real
```

（后一个等于 §AILIVE-3 所示：先建项目 → 读文档 → 提交 design-edit 诉求 → 查 DB）

## 实测（user 供给的 `gpt-6-sol` + localhost:3100 web）

每轮 `design-smoke <ns>` 产生一个 throwaway 项目；document 层有 8 个 nodes 全是初始 Home 的
Eyebrow/Headline/Subhead/Primary/Secondary/Hero/Frame/Actions。

- `POST /api/ai/run` HTTP 200；
  `capability: real`，`provider: openai-compatible`，`model: gpt-6-sol`，`patches: 1`；
  explanation=「已在 Home 页的「Eyebrow」文本节点（<nodeId>）上用 set op 把 fontSize 从 **12** 改为 **28**」；
- `agent_tasks` 落 6 行 `status=succeeded, cap=real`；

## 说不清的地方（如实记）

- **patches 未落库**：本次走"web assemble → ai-service → 返回 patches 给 client"这一最简 contract——
  Studio 的 client（`StudioDock` 的 useAgentSubmit 路径）才真正 applyPatch 并发 `/design` → 表。
  本次 smoke 不走那一步；design_nodes.tutorials 在 pdf-use.dan…，`fontSize=12` 没变不属于链路 bug。
- token 没跑通完整 Studio UX；`/studio/<projectId>` 页面没被本脚本打开，无渲染证据。
- 模型自述 "Eyebrow" 以"首段文字"挑节点——真模型确实挑到真实节点 id，链路走通真，但未独立校验到 op→DB。
- 本库有 ~1100 个历史测试 project；本片只观察 id 最大那三次。

## 仍欠

- 完整编排 → patches → `/design` PATCH → 查 op 确实落了 DB 的真端到端链（有截图才叫验证）；
- 模型自称 小纳，OpenAI 开发——prompt 行为仍有国度问题（ADR-0168 已指出）；
- 没装满 document prune（自己建项目自己长，必然 tokenPrice ≈ 0）
- 模型 `/plan` 字形被 `applyPatch` 严格校验（§ lanes）的地方没验证，多数仍然风险。

---

## 接手正名（2026-11-12 / ADR-0170）——把「查库假绿/假红」换成内存 dry-run 真判据

上面这份初稿如实记了「patches 未落库」，但**脚本本体**仍留着一处自相矛盾的验证段：请求点名
`Headline` 改字号，却去 `GET /api/projects/{id}` 读 `Eyebrow.fontSize`，然后宣称
`[verify] patches persisted to DB ✓` / `[verify-FAIL] fontSize not persisted`。这段既不成立
（服务端 `deliver` 根本不落库）、又目标错位（改 A 验 B），而且 `if (eyebrow && …)` 在 Eyebrow
不存在时会跳过整段校验并打出假绿。接手后据实正名为**内存 dry-run 判据**。

### 先量：旧版真跑坐实假红（不是凭记忆）

真服务就绪（web `127.0.0.1:3100` 200 / ai-service `:3200` `/healthz capability=real` /
真库 `:55433`），原样真跑 HEAD 版 `live-design-smoke.mts --confirm-real`：

- 链路全真：`capability=real provider=openai-compatible model=gpt-6-sol demoMode=false`，
  `tokensIn=9014 tokensOut=230 latencyMs=33530`，`patches=1`；
- 真模型正确执行：`explanation=已将节点 tex_…4olu6c 的字号设置为 28px`（改的正是点名的 Headline）；
- **旧判据却判 `[verify] Eyebrow.fontSize = 12` → `[verify-FAIL]` → EXIT=8（假红）**。
  根因：验证目标 `Eyebrow` ≠ 请求目标 `Headline`，且根本没有任何落库动作发生。

### 判据重写：与 Studio client 同一份 `applyPatch`，内存 dry-run

新增 `scripts/design-patch-verdict.mts` 的纯函数 `verifyDesignPatches(document, patches,
targetNodeId, explanation)`。拿刚 GET 到的权威 document，用**生产同源**的 `applyPatch`
（CopyOnWrite、不改入参）把 patches 打一遍，三态判定：

| 终态 | 条件 | 退出码 | 语义 |
|---|---|---|---|
| `applied` | 无 skipped + 目标被 touch + 字号达标 | 0 | 真 · 设计生成走通 |
| `honest-refusal` | 0 patches 且 explanation 有话 | 0 | 模型诚实拒改（`design_prompt.py` 规则 1/5），**不谎报走通** |
| `invalid` | 造 id / 错页 / 没碰目标 / 字号不对 / 沉默失败 | 8 | 真红 |

`applyPatch` 的 `skipped` 是其「不静默失败」契约（§159）：编造的 nodeId / 错 pageId /
重号 / 越界都落在这里，所以判据不必另写 id 白名单，造 id 当场现形。

### 判据自身的验伪：13 用例 + 8 变异臂

- `scripts/test/design-patch-verdict.test.mts`：**13/13**——合法 set/merge、造 id、
  错页、改错节点、错值、目标被 remove、honest-refusal、沉默失败、多 patch 顺序、
  全空 ops、不改入参。
- `.git/ailive3-mutate.mjs`（临时、未提交）：对判据源码逐处改坏 **8/8 KILLED**
  （放行 skipped / 不验 touch / 不验字号 / refusal 一律 applied / 沉默也 refusal /
  空 ops 放行 / 吞目标不存在 / 不顺序换手），恢复后干净门 ALL PASS，源码零 MUT 残留。
  executor 用 `process.execPath` 直调 `vitest.mjs` + JSON 新鲜生成 + 耗时 ≥400ms 防假臂。

### 修实版真跑：两态都被真模型覆盖

- **连跑 3 轮全 `applied`**：真模型稳定给 `set typography.fontSize=28` 的精准 op，
  判据每次真跑到 `targetFontSize=28`、`touched=[目标id]`，`EXIT=0`。
  其中一轮原文：`{"op":"set","nodeId":"tex_…","path":"typography.fontSize","value":28}`。
- **首轮抓到一例 `invalid`（真红，旧版看不见）**：真模型给 `merge` op 但没把字号落到 28，
  dry-run 后 `targetFontSize=56`，判据报 `目标节点字号 56 ≠ 诉求要求的 28` → `EXIT=8`。
  这说明真模型输出有随机性（同诉求有时 set 精准、有时 merge 丢值），而判据每轮都用
  `applyPatch` 真跑一遍，对了才绿、没达成诉求就红——不假设模型一定对。

### 诚实边界（未变，且更清晰）

- **仍未验落库（本片）**：`POST /api/ai/run` 只回 patches（`route.ts` 的 `deliver`），落库是
  Studio client 拿 patches 调 `applyPatch` 再发 `/design` 的活。本片纯 HTTP，不碰那条路。
  **接手期间协作事实**：并行会话正活跃推进 `§AILIVE-4`——`ffeceff8` 已提交
  `live-design-edit.mts`（硬断言 ai/run 真 `set typography.fontSize=36` + ledger succeeded），
  工作树另有 `live-design-apply.mts`（真走 `patches → PATCH /design → 重读确认落库`）与其 evidence，
  JSDoc 同样确认「`/api/ai/run` 只发回 patches、apply 走 `PATCH /design`」，与本片**正交互补**。
  本片不碰/不 stage 这些并行活跃文件，待其稳定后并轨。
- **仍未验浏览器**：`/studio/<projectId>` 没打开、无 Run→Screenshot 渲染证据。
- `scripts/live-design-verify.mts`（纯查库）保留为旁证工具：`design_nodes` 不变是 gate
  正常表现，**不再**作为 smoke 的成败判据。
- `costUsd=0`，真计费未知，不造数字。
- 未 push。
