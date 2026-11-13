# ADR-0111：Provider 模型清单的职责边界——`none` 哨兵不再冒充模型名

- 状态：accepted
- 日期：2026-11-12
- 版本片：v678
- 关联：ADR 0110（本片承接其「观察到但语义未定、不钉门」的 `Registry.models()` 泄漏 `none` 一条，
  现已把语义定清并落门）、ADR 0090（门钉标识符/边界/同源，不钉今天恰好相等的字面值）、
  ADR 0094 X4（门不许惩罚正当改动，也不许逼谁造无意义消费者）、ADR 0095（门读它声称的那件事）、
  §159（不谎称能用）、`apps/ai-service/tests/test_provider_model_inventory.py`、
  `apps/web/src/app/page.tsx`（就绪块把 `p.models.join(' / ')` 渲染给用户）

## 背景：ADR 0110 留的语义未定，现在有真实危害证据、可以定了

ADR 0110 在接真网关时观察到：`NEXUS_MODEL_EMBEDDING=none` 这个 **opt-out 哨兵**被
`OpenAICompatibleProvider.models()`（`sorted(set(self._models.values()))`）当成模型名，
`/healthz` 于是在 llm provider 的 `models` 里上报 `['gpt-6-sol', 'none']`。当时**语义未定**
（chat 与 embedding 共用一张 `DEFAULT_MODELS` 表；也许该拆两档，也许网关将来真支持 embedding），
按 ADR 0094 X4 不钉门、不改生产，只记为下一片候选。

本片把语义定清，因为它已从"洁癖"升级为**用户可见的诚实缺陷**：
`apps/web/src/app/page.tsx:239` 把每个 provider 的 `p.models.join(' / ')` 直接渲染进
"Provider readiness" 就绪块，于是真网关下用户会看到 `llm · openai-compatible · gpt-6-sol / none`
——把一个**根本不存在的模型**谎列为可用（§159 精神）。而且危害是**双向**的：同一张表无差别塞给
两个 provider，embedding provider 也把全部 chat 档模型（`gpt-6-sol` + 内置 `gpt-4o/-mini`）列进自己的清单。

## 探针实测（动手前，纯只读）

- `.models()` 的消费者：`Registry.providers()` 第 74/83 行 → `app.py:/healthz` 第 114 行 →
  `packages/schemas` 的 `HealthResponseSchema.models = z.array(z.string())`（只验字符串数组、**不验内容**，
  所以 `none` 能一路混到 UI）→ `page.tsx:239` 渲染。
- capability 判定 `apps/web/src/lib/env.ts` **不读 models 数组**（只读 `status` / `capability`），
  所以功能链路不受影响——这是**展示层诚实**问题，不是"功能坏了"，修复不需要动 capability 语义。
- `execution.py:26` 的 `LLM_MODEL_CLASSES = {fast, balanced, reasoning, vision}` 限定
  `registry.llm.model_for()` 只会被文本四档调用，**从不会用 embedding 档**；embedding 走独立 provider
  且当前无 `embed()` 调用者（M2/M5 未实现）。⇒ llm provider 根本不需要 embedding 档的模型名，
  职责分层安全、零功能回归。
- 现有测试**零断言覆盖任何 `models()` 内容**（`grep models` 只命中 conftest 的 FakeProvider 与
  `test_provider.py` 的入参）——这正是哨兵泄漏能长期无人发现的原因，也意味着修复零回归、新门填补真实空白。

## 决定：单一真值的职责分档 + 钉边界不钉字面的门

### 生产（三处小改，零跨模块耦合）

1. `config.py` 定义两个档位集合常量（唯一真值）：`LLM_MODEL_CLASSES = (fast, balanced, reasoning, vision)`、
   `EMBEDDING_MODEL_CLASSES = (embedding,)`。
2. `Settings` 加两个只读视图：`llm_models`（只取文本四档）、`embedding_models`（只取 embedding 档）。
3. `Registry` 构造时 llm provider 传 `settings.llm_models`、embedding provider 传 `settings.embedding_models`
   ——两个 provider 各拿自己那一档的表，不再把整张 `models` 无差别塞给对方。

**为什么不改 `models()` 里过滤字符串**：那会钉"排除 `none`/`skip`"字面，是把今天的哨兵值写死进门；
将来 opt-out 换一个词、或网关真支持 embedding（那时 embedding 档是真模型、根本不该被过滤）都会误伤。
按职责分档则**结构性正确**：provider 只知道自己负责的档位，哨兵自然进不来，换模型/加档/真支持都自动适配。
**为什么不动 `execution.py` 的 `LLM_MODEL_CLASSES`**：那是 API 输入校验（哪些 `modelClass` 允许进
`/v1/ai/run`），与本片的"provider 上报哪些模型"是**不同语义**，强行合并反而耦合；本片只用 config 常量
描述 provider 职责，保持两者独立。

### 门（`apps/ai-service/tests/test_provider_model_inventory.py`，7 条）

判据钉**职责不变量**，不钉"等于 gpt-6-sol"或"恰好 N 个"（ADR 0090/0094 X4）：
- `_judge_no_opt_out_sentinel`：real provider 上报清单里不得有任何 opt-out 哨兵（`none` / `skip`，
  大小写不敏感）——钉**语义类**，不钉单个字面。
- `_judge_llm_scope`：llm 上报的每个模型名都必须来自「文本四档的实际配置集合」（集合从 `Settings`
  现取，不是门里硬编）——职责串台就红。
- `_judge_embedding_scope`：embedding 上报的每个模型名都必须来自 embedding 档。

真值门走项目真实 `/healthz`（`create_app` + `Registry` + `TestClient`），覆盖三种配置：
`NEXUS_MODEL_EMBEDDING=none`、`=skip`、以及默认全开（有真 embedding 模型）——门不假设网关形态。
另有一条 embedding 清单门（默认全开时 embedding 只报自己的档）。
**3 条恒跑变异臂**用假清单注入：混入 `none` 哨兵 → 哨兵判据红；llm 混入 embedding 档模型 →
职责判据红；**正向对照臂**换一个全新合法 chat 模型名 → 职责判据仍绿（证明门不惩罚正当改名，
不钉字面）。判据单一真值（`_judge_*` 被真值门与臂共用），杜绝"改判据忘改臂"假绿（ADR 0095 反面）。

## 验证（本机 2026-11-12，先红后绿）

- **先红（门有牙）**：改生产前跑门，**4 条真值门全红**——`opt-out 哨兵被当成模型名上报：['none']`、
  `['skip']`、`llm provider 上报了非文本档模型：['embedding-model-y']`、
  `embedding provider 上报了非 embedding 档模型：['chat-model-x','gpt-4o','gpt-4o-mini']`；3 臂绿。
  双向串台 + 哨兵外泄全部坐实。
- **后绿**：改生产后 `test_provider_model_inventory.py` **7/7**；全套 ai-service CI 模式
  **96 passed / 4 skipped**（基线 89/4 → +7 新门，零回归）。
- **opt-in 真线路模式**（`NEXUS_LIVE_LLM=1`）：全套 **99 passed / 1 skipped**（v677 真线路门 + 本片
  全绿，零回归）。经项目真实 `Registry` 探针：`llm status=real models=['gpt-6-sol']`、
  `embedding status=unavailable models=[]`、`capability=real` —— `none` 消失、embedding 不再反向串台、
  功能面不变。
- **`verify:record-encoding` exit 0**：0 chargeable lines over 2245 graded files（新门文件 CJK 注释
  未引入未 pin 的 ISLAND 行）。
- **共享树边界**：本片动手时 `HEAD=1e9b4ed`（lane 的 parser 修复，三 ref 对齐、已推）；v676 前端
  （globals.css / tokens.css / style-tokens.test.ts）、ADR 0109、以及 `CURRENT-STATE.md` 里的 lane
  cont.46 均为**lane 在飞未提交字节**，本片**不碰、不 add、不提交**；本片只 `git add` 自己的 5 个文件
  （config.py / registry.py 两处生产 + 新门 + 本 ADR + ROADMAP v678）。状态补记**不写 CURRENT-STATE**
  （该文件混有 lane 未提交字节，append 会卷入），改为自包含在本 ADR + ROADMAP v678。

## 仍欠（如实记）

1. **UI 渲染级确认未做**：本片证的是 `/healthz` 的 models 清单已干净（项目真实 `Registry` 探针 +
   真值门），但 `page.tsx` 就绪块的实际观感（"gpt-6-sol / none" 是否真的不再显示）留给 hosted
   Review pane；本机无渲染验证。
2. **hosted CI 无真 key 时只跑离线门 + 全部配置门**（本片的 7 条全离线恒跑，不受影响）；v677 真线路腿
   仍靠 opt-in 或注入 secret。
3. **`embedding_models` 目前无真实消费者**（embedding provider 未启用、无 `embed()` 调用者）：本片给
   它正确分档是为将来真支持 embedding 时结构就绪，不是现在就有 embedding 功能（§159 不谎称）。
4. hosted Studio CI verdict for this push PENDING；mainline 两模式绿是快信号。
