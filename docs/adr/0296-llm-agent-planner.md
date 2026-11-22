# ADR-0296 · 多步 Agent 规划器接入真 LLM（受约束挑选，不照单全收）（2026-11-21）

## 状态
已接受（2026-11-21 · cont.472 · 真机 gpt-6.2-sol 验证通过）

## 背景

`server/agent/runtime.ts` 的 `PLANNER` 长期写死 `'demo'`：九步编排计划由 `READINESS_STEPS`
确定性配方生成，`goal` 只改标题。代码注释自己写着"从目标文本里理解类型是假 AI"——
这句话对，但结论走反了：它把"不能让模型猜游戏类型"扩大成了"完全不用模型规划"。

用户反复强调的核心期望是把大模型能力**深度**嵌进状态流转。规划（一句话目标 → 任务拆分/顺序/风险）
正是状态流转的入口，也是目前最大的一块"写着编排、其实是配方"的缺口。

## 选项

A. 维持确定性配方，planner 永远 demo —— 用户点名的"假 AI"缺口不补。
B. 让模型直接吐一整份 `AgentPlan` —— 它会编步骤、编 Agent、编依赖、把 id 写错；
   整份过 `validatePlan` 会被拒，用户只看到一次失败。照单全收是把不确定性放进执行链。
C. **模型只决定三件不危险的事**（挑子集 / 排序 / 改标题+补风险），
   agent / artifact / dependsOn / requires 全部从配方重建，整份再过 `validatePlan`；
   失败回退确定性配方、planner 诚实标 demo —— 采用。

## 决定

C。新增纯函数层 `lib/llm-planner.ts`（无 I/O）：

- `PLANNER_SYSTEM` 短且字节稳定，明说"只能从清单挑、不能造步骤、输出纯 JSON"；
  游戏类型是显式入参、不猜（保留 §159 那条纪律）。
- `parsePlannerReply` 只认 `{order, titles?, risks?}`：非法 id、重复 id、空 order 一律整份拒收；
  `titles` 只认被挑中的步骤；`risks` 至多 3 条。
- `planFromReply` 用 `stepSpec(kind)` 重建每一步的 agent/artifact/dependsOn/status——
  模型给的同类字段根本进不来；依赖箭头只保留两端都在子集里的，缺前置交给 `validatePlan` 判。
- 过不了校验 → 返回 `null` → 调用方回退 `buildReadinessPlan`。

接线层（`server/agent/runtime.ts`）：

- 新增 `tryLlmPlan(goal, gameKind, chat?)`，chat 可注入（测试用假 chat 钉四条分支）；
  任何异常/不可用/坏形状都返回 `null`，不让一次规划失败拖垮整条编排。
- `planner` 由本次实际规划器决定：模型成功 `real`，回退 `demo`；
  随任务行 `capability`、`input.planner`、通知标题（"模型规划"/"DEMO 规划"）一起落账。
- 开关 `NEXUS_AGENT_LLM_PLANNER`：`1` 强制开、`0` 强制关；未设置时**生产开、测试关**。
  测试默认关是有意的——现有编排集成判据断言 `capability='demo'`，测试机又可能连着真
  ai-service，不隔离就会被一次真规划打红。
- 保留 `PLANNER_FALLBACK='demo'` 导出常量供旧语境引用。

## 真机验证（gpt-6.2-sol，经 3200 ai-service）

目标"上架前体检，重点元信息与发布门禁，不必编游戏草稿"：

```
模型回执 order = [context, seo-audit, qa-audit, report]   ← 真按目标砍掉了 5 步游戏草稿链
titles = 盘点项目现状 / 核对上架元信息 / 检查发布门禁 / 汇总结论与待办
validatePlan = []   RISKS = 模型规划的两条诚实注记
首次 tokensIn=18928 / 134 out / cached=0 / 6595ms
二次 tokensIn=18928 / 134 out / cached=18928 (100%) / 185ms   ← 前缀缓存命中，约 36×
```

真机抓到并修掉一个真 bug：模型没给 `risks` 时，原实现回退到确定性配方的旧风险文案
"本机没有真 provider：计划由确定性配方生成（§160）"——这次明明用了真模型，那句话是谎。
改为给一条中性的模型规划风险。这与 ADR 0262「没报 ≠ 报了 0」同族：
**状态文案必须与实际发生的事一致**。

## 后果

- 生产环境每次编排多一次 provider 调用（一次约 19K in / 134 out，因 system 字节稳定，
  稳态走前缀缓存近乎免费）；可用 `NEXUS_AGENT_LLM_PLANNER=0` 关掉。
- 计划的可执行性不再依赖模型守规矩：模型碰不到执行方与依赖真值，`validatePlan` 是最后一道门。
- 模型"少挑步骤"是特性：目标只要体检时它砍掉游戏草稿链，省下 5 步执行与 token；
  代价是用户若想全跑要在目标里说清（或关开关）。

## 判据

- `llm-planner.test.ts` 21 条（提示词/清单、坏形状、造步骤、缺依赖回退、风险不说谎）
- `llm-planner-wiring.test.ts` 8 条（开关分流、real/demo、失败回退、注入 chat）
- 变异臂：放开"造步骤 id"约束 → 对应判据变红（判据有牙）
