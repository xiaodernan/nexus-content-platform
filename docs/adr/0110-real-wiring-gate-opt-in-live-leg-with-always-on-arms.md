# ADR-0110：把"真大模型真跑通"从人工观察升级成可重复、有牙、CI 安全的门

- 状态：accepted
- 日期：2026-11-12
- 版本片：v677
- 关联：ADR 0094 X4（门不许惩罚正当改动，也不许逼谁造无意义消费者）、ADR 0095（注释/门声称的语义必须有门去读它声称的那件事）、
  ADR 0090（门钉标识符/边界/同源，不钉今天恰好相等的字面值）、§159（不谎称能用）、§76-79（Provider 可替换）、
  `apps/ai-service/tests/test_provider_live.py`、`apps/ai-service/tests/test_provider.py`（既有 MockTransport 门）、
  `docs/CURRENT-STATE.md` cont.42（并行 lane 的人工真线路观察）

## 背景：真线路"能跑"已经证明，但没有任何门看着它

用户提供了真实 OpenAI 兼容网关（`https://wkapi.pro/v1`，模型 `gpt-6-sol` / `gpt-6-astra` /
`gpt-5.6-sol` / `gpt-5.6-terra`）与真实 key。并行 lane 在 `3620770` 已完成接线并落地
（cont.42）：`apps/ai-service/.env` + `apps/web/.env.local` 两个 gitignore 文件持有 key，
ai-service 用项目自身的 `OpenAICompatibleProvider` 打真网关，`/healthz` 报 `capability=real`，
`/v1/ai/chat` 回真答案、`demoMode:false`，web 首页据实时 `/healthz` 摘掉 DEMO MODE 招牌；
该网关**只有 chat 模型**，`text-embedding-3-small` 返回 `503 model_not_found`，故以
`NEXUS_MODEL_EMBEDDING=none` 如实把 embedding 标为 unavailable（lane 加了 3 个纯配置门）。

这一步全部靠**人工 curl + 观察**验证，没有留下可重复的自动化门。而既有的 `test_provider.py`
全用 `httpx.MockTransport` 喂假响应——它能证明"适配器代码路径正确"，却**结构性地看不见**真实
回归：网关悄悄关掉 JSON mode、开始回 `usage=0`、key 失效、embedding 从 unavailable 谎变成 real、
模型名漂移、真线路延迟异常……这些都不是 Mock 能覆盖的。cont.42 自己把缺口写进 honest gaps：
"no Studio agent-path e2e through the web was run this pass"。

## 探针实测：真实网关的形状（非假设）

本片动手前用项目**自身**的 `load_settings` / `OpenAICompatibleProvider` / `Registry`
（`apps/ai-service/.venv`，key 从 gitignore 的 `.env` 读、不打印）打了真网关，实测：

- `GET /v1/models` → 200 / 0.48s，四个模型全部 `supported_endpoint_types: ["openai"]`（**无 embedding**）。
- `POST /v1/chat/completions`（`gpt-6-sol`，带 `response_format:{type:json_object}`）→ 200，
  回 `{"pong":true,"n":42}`，`usage.prompt_tokens=4159` / `completion_tokens=16`，`model=gpt-6-sol`，
  真实延迟约 10.4s（本片另一次经项目 provider 实测）。**JSON mode 真生效、真计费**。
- `POST /v1/embeddings`（`text-embedding-3-small`）→ **503 `model_not_found`**，
  印证 lane 的 `NEXUS_MODEL_EMBEDDING=none` opt-out 是对的，不是保守。
- 经项目真实 app 的 `/v1/ai/chat` 与 `/healthz`：llm=real、`capability=real`、`demoMode=false`，
  embedding=unavailable 且 reason 含"没有 embedding 模型"；`repr(settings)` 不含 key。

一个**观察到但不定门**的边界：`Registry.models()` 把 `DEFAULT_MODELS` 里所有档位的 value 去重列出，
`NEXUS_MODEL_EMBEDDING=none` 会被当成"模型名"上报成 `['gpt-6-sol', 'none']`。这是 chat 档与 embedding
档共用一张 models 表的既有语义问题。**按 ADR 0094 X4 / ADR 0095：语义未定就不钉门、不替 lane 改生产**——
钉"models 必须含/不含 none"会惩罚将来"把两档拆开"或"网关将来真支持 embedding"的正当修复。
记为下一片的语义决策候选，不写进本片的门。

## 决定：一个文件、三类腿、判据单一真值

新增 `apps/ai-service/tests/test_provider_live.py`，**零生产源码改动、零 lane 文件改动**、
纯新增单文件，把上面的真线路观察升级成门。三条纪律同时成立：

1. **CI 安全（函数级 skipif，不用模块级）**：`test_live_*` 三条真线路腿各自带
   `@skipif(_LIVE is None)`，`_LIVE` 顶层探测 `NEXUS_LIVE_LLM=1` + `.env` 里的真实 key/base_url；
   无 key 时各自 skip，**不发网络、不假绿**。刻意不用模块级 `pytestmark`——否则离线变异臂会被
   一起 skip，CI 上就没人证明门有牙。真线路腿用项目自己的 `OpenAICompatibleProvider` /
   `create_app` / `Registry`，**不打旁路 curl**，所以门读的就是生产真走的那条代码路径（ADR 0095）。
2. **判据单一真值**：三个纯判据 `_judge_json_mode`（响应能 `json.loads` 成对象且约定字段兑现）、
   `_judge_real_usage`（双向 usage>0 + model/latency 回显）、`_judge_embedding_honest`
   （llm=real 不被牵连 + embedding 如实 unavailable 且 reason 说清）被真线路腿与变异臂**共用**，
   不在臂里内联复刻——这样"改了判据忘改臂"不会假绿（ADR 0095 反面）。判据钉**声称的性质**，
   不钉"内容等于某句"或"延迟小于某值"（ADR 0090/0094 X4）。
3. **离线变异臂恒跑、证明有牙**：`test_*_arm_*` 四条用 `MockTransport` / 纯 dict，**无需真 key**，
   在无 key 的 CI 上也跑。臂1 回纯文本 → JSON mode 判据红；臂2 回 `usage=0` → 真 usage 判据红；
   臂3 把 embedding 谎报 real → 诚实判据红；臂4 回 401 → key 不泄漏。**4/4 红臂对每个判据都验了牙**，
   与既有 `test_provider.py` 的错误路径纪律同构。

**刻意不做**：不钉墙钟延迟阈值（网关 2–40s 抖动，钉了就是 flaky 门，量只归档不裁决）；
不钉模型名等于 `gpt-6-sol`（那是 lane 的 env 选择，判据只读"回显非空"）；不碰 web 的 Studio
agent-path e2e（本机起不了可渲染验证，留 hosted）；不改 `env.example`（lane 刚补过真实网关说明，
碰它即越界）。

## 验证（本机 2026-11-12，两种模式都跑）

- **CI 安全模式**（`env -u NEXUS_LIVE_LLM`）：`test_provider_live.py` **4 passed / 3 skipped**；
  全套 ai-service **83 passed / 4 skipped**（基线 79/1 → +4 离线臂进 passed、+3 真线路腿 skip）。
- **opt-in 真线路模式**（`NEXUS_LIVE_LLM=1`，key 从 gitignore `.env` 读）：`test_provider_live.py`
  **7 passed / 0 skipped**（3 真线路腿真打 `wkapi.pro`，31s）；全套 **86 passed / 1 skipped**
  （那 1 skipped 是既有 jobs 腿，非本片）。
- **变异臂有牙**：4 条红臂在两种模式下都 PASSED（证明它们确实把对应判据逼红，而非恒绿）。
- **`verify:record-encoding` exit 0**：0 chargeable lines over 2242 graded files（2238→2242 正是本片
  新文件入扫，CJK 注释未引入未 pin 的 ISLAND 行）。
- **key 安全**：key 只在两个 gitignore 文件（`.env` / `.env.local`），`git check-ignore` 均命中；
  `repr(Settings)` 脱敏；门断言 key 不进 `Completion` / 不进报错；本 ADR 与日志均不写 key 全文。
- **共享树边界**：`HEAD=3620770`（lane 的真实接线提交，已提交未推送）是本片的父提交；
  `origin/master=origin/main=da8dff4` 是其祖先（ff-safe）。v676 前端 3 文件 + ADR 0109 是 lane 领地
  （cont.41 明示"for the lane"），本片**不碰、不 add、不提交、不替 lane push**；只 `git add` 本片
  的 3 个文件（新门 + 本 ADR + 文档补记）。

## 仍欠（如实记）

1. **真线路腿依赖一个真实 key 才能跑**：CI 默认 skip，所以门在 hosted 上是"配置门 + 离线臂"，
   真线路证据依赖本地 opt-in 或 CI 注入 secret（未配置）。这是 opt-in 真线路腿的固有形状，不谎称
   "CI 每次都真打网关"。
2. **Studio agent-path 经 web 的真 LLM e2e 仍未做**（lane cont.42 honest gap 原样保留）：本片验的是
   ai-service 的 provider / registry / app 三层真线路，不含浏览器点击 Studio 编辑→AI 编辑→落库的
   全链路；本机无渲染验证，留 hosted Review pane。
3. **`Registry.models()` 把 `none` 当模型名上报**（`['gpt-6-sol','none']`）：语义未定，本片按 ADR 0094 X4
   不钉门、不改生产；下一片若统一 chat/embedding 两档，先定语义再落门。
4. **网关只支持 openai 端点**：image/video/speech 无模型，embedding 无模型；这些能力维持
   `unavailable` 如实标注，不因为接了真 key 就假装全模态可用（§159）。
5. hosted Studio CI 对本 push 的 verdict PENDING；mainline 本机两模式绿是快信号。
