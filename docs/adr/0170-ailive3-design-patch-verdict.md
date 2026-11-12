# ADR-0170：§AILIVE-3 接手正名——用内存 dry-run 判据取代「查库假绿/假红」

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0168（§AILIVE-1/2 真 provider 接通）· `docs/evidence/ai-design-smoke/evidence.md` · `scripts/live-design-smoke.mts` · `scripts/design-patch-verdict.mts` · `apps/web/src/app/api/ai/run/route.ts` · `packages/creative-model/src/patch.ts` · `apps/ai-service/src/ai_service/design_prompt.py`

## 背景

并行会话提交 `8d6e1384`（§AILIVE-3）落了 `scripts/live-design-smoke.mts` 半成品 + 一份**诚实**的
evidence。证据里已如实写明「patches 未落库、Studio client 经 `/design` 才落库、`design_nodes`
没变是 gate 正常表现非 bug」。但**脚本本体**仍留着一段自相矛盾的验证：请求点名 `Headline` 改字号，
却 `GET /api/projects/{id}` 读 `Eyebrow.fontSize`，宣称 `patches persisted to DB ✓` 或
`[verify-FAIL] fontSize not persisted`。

这段有三宗罪：① **不成立**——服务端 `/api/ai/run` 的 `deliver` 把 `gateResponse(...).delivered`
发出去就结束，没有任何 `applyPatch`→写库那一步；② **目标错位**——改 A 验 B；③ **`if (eyebrow && …)`
短路**——Eyebrow 不存在时整段校验被跳过并打出假绿。此外 JSDoc 声称「模型真产出 patches 并应用、
applyPatch 真改 id 真节、终态可被 codegen 真读出」，与 evidence 自己承认的「未落库」直接冲突；
`0 patches` 只 `console.error('[warn]')` 后放行，既不真断言也不诚实标注。

用户长期授权「并轨内容没人做了就直接接手做完，不等锁」。该脚本 mtime 稳定、无并行会话继续编辑，
故接手正名。

## 先量：真跑坐实旧版是假红，不是假绿

真服务就绪（web 200 / ai-service `/healthz capability=real` / 真库监听），原样真跑 HEAD 版：

- 链路全真：`capability=real / demoMode=false / model=gpt-6-sol`、真 token（9014/230）；
- 真模型**正确**执行：`explanation=已将节点 tex_…4olu6c 的字号设置为 28px`，改的正是点名目标；
- 旧判据 `Eyebrow.fontSize=12` → `[verify-FAIL]` → **EXIT=8 假红**。

若初始文档模板不含 Eyebrow，同一段会走另一条分支假绿。两段都要拆。

## 决定

### 一、判据换轨：从「查库」到「内存 dry-run」

`POST /api/ai/run` 只把 patches 交回客户端，落库是 Studio client 拿 patches 调 `applyPatch` 再发
`/design` 的活。纯 HTTP smoke **没有资格**用查库判成败。正解是复用 Studio client **同一份**
`applyPatch`（`packages/creative-model/src/patch.ts`，CopyOnWrite、不改入参、把未生效 op 记进
`skipped`），拿刚 GET 到的权威 document 在内存里把 patches 打一遍，验三件事：

1. 每个 op 都生效（没进 `skipped`）——`skipped` 是 §159「不静默失败」契约，编造的 nodeId /
   错 pageId / 重号 / 越界都落在这里，因此**不必另写 id 白名单，造 id 当场现形**；
2. 请求点名的目标节点真被 touch（`touchedNodeIds` 命中）；
3. 目标真达成诉求（字号 dry-run 后 = 诉求值）。

三件都成立才叫 `applied`。不碰库、不需要浏览器、不需要 Studio client，却真验到「补丁合法且达成诉求」。

### 二、三态退出码，拒绝一元的 PASS/FAIL

| 终态 | 条件 | 退出码 |
|---|---|---|
| `applied` | 无 skipped + 目标被 touch + 字号达标 | 0 |
| `honest-refusal` | 0 patches 且 explanation 有话 | 0（**不谎报走通**） |
| `invalid` | 造 id / 错页 / 没碰目标 / 字号不对 / 沉默失败 | 8 |

`design_prompt.py` 规则 1/5 明确允许模型在目录粒度不足以引用 nodeId、或诉求无法用 op 表达时
「explanation 说做不了、patches 留空」。这是**合规行为**，旧版把它当 warn 放过、JSDoc 又谎称
「真补丁应用」，两头不靠。三态把它抬成一等公民：`0 patches + 有解释` 打印「链路真通但模型诚实拒改」
且 `EXIT=0`，`0 patches + 没解释` 判 `invalid`（沉默失败不造假绿）。

### 三、判据必须被判据守着

判据抽成独立纯函数 `scripts/design-patch-verdict.mts`，不内联——内联就没人看着。两层验伪：

- `scripts/test/design-patch-verdict.test.mts` **13/13**：合法 set/merge、造 id、错页、改错节点、
  错值、目标被 remove、honest-refusal、沉默失败、多 patch 顺序应用、全空 ops、不改入参；
- 变异臂 **8/8 KILLED**：逐处改坏判据（放行 skipped / 不验 touch / 不验字号 / refusal 一律
  applied / 沉默也 refusal / 空 ops 放行 / 吞目标不存在 / 不顺序换手），每处都必须让对应用例转红，
  恢复后干净门 ALL PASS、源码零 MUT 残留。executor 用 `process.execPath` 直调 `vitest.mjs`
  + 断言 JSON 新鲜生成 + 耗时 ≥400ms，防 FE-19 踩过的「Windows npx ENOENT → 1 秒全 SURVIVED 假臂」。

### 四、真模型两态都覆盖；目标统一

修实版连跑 3 轮全 `applied`：真模型稳定给 `set typography.fontSize=28` 精准 op，判据真跑到
`targetFontSize=28`。**首轮另抓到一例 `invalid`**：模型给 `merge` 但没把字号落到 28，dry-run 后
仍是 56 → 判据报「目标节点字号 56 ≠ 28」→ `EXIT=8`。这证明真模型输出有随机性，而判据每轮
真跑一遍、对了才绿、没达成诉求就红，不假设模型一定对。旧版「查库」两段都看不见这种假补丁。

`targetNodeId` 同时作为**请求点名**与**dry-run 验证**的唯一目标（优先精确匹配
`name === 'Headline' && type === 'text'`，再退回首个 text），杜绝旧版「改 Headline 验 Eyebrow」错位。

## 后果

### 正面

- §AILIVE-3 的成败判据从「名不副实的查库」升级为「与生产同源的内存 dry-run」，
  且能识别**假补丁**（op 合法但没达成诉求）——这是查库与 0-patches-warn 都给不了的。
- 判据有独立单测 + 变异臂守着，不是一段没人看的脚本 if。
- 三态诚实：链路真 ≠ 补丁达成 ≠ 补丁落库，各自有明确说法，不再互相冒充。

### 诚实边界（未解决，不在本片 scope）

- **落库仍未验（本片）**：Studio client `applyPatch`→`/design`→`design_nodes` 那条路本片没走。
  `scripts/live-design-verify.mts` 保留为旁证，不再作为本片 smoke 成败判据。
  **接手期间的协作事实**：并行会话正活跃推进 `§AILIVE-4`——`ffeceff8` 已提交
  `scripts/live-design-edit.mts`（硬断言 ai/run 真 `set typography.fontSize=36` op + agent_tasks
  ledger succeeded），并在工作树新增 `scripts/live-design-apply.mts`（真走
  `AI 生 → patches → PATCH /api/projects/{id}/design → 重读文档确认 fontSize 落库`，硬断言落库值）
  与 `docs/evidence/ai-design-apply/evidence.md`，其 JSDoc 亦确认「`/api/ai/run` 只发回 patches、
  真正 apply 走 `PATCH /design`」——与本片边界判断一致，两者**正交互补**（本片验「补丁合法且达成
  诉求、不落库」，§AILIVE-4 验「补丁真落库」）。这些是并行会话的活跃文件，本片**不碰、不 stage**，
  待其稳定后并轨，不重复造轮子。
- 浏览器 UI 层 live smoke、`/api/ai/jobs` 异步路径、真 op batch→审批→落地仍未验。
- 真模型身份/国度 prompt 问题（ADR-0168）、`costUsd=0` 真计费未知，均不造数字。
- 未 push。

## 协作面

开工 HEAD `71cdd38f`。本片只碰 `scripts/live-design-smoke.mts`（正名）、新增
`scripts/design-patch-verdict.mts` + `scripts/test/design-patch-verdict.test.mts`、更新
`docs/evidence/ai-design-smoke/evidence.md` 与本 ADR，并追平 ROADMAP / CURRENT-STATE / memory
三处索引（含并行 `§SC-79` 欠账）。并行脚本 `.git/ailive3-*` 全部为临时臂，不提交。精确 stage，
避 `.next-dev-archives/` / `test-results-mine*` / 真 key（`apps/ai-service/.env`，gitignore）。
