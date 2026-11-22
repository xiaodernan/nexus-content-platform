# ADR-0297 · 发布审核的 LLM 上下文二段研判（只补线索，不裁决）（2026-11-21）

## 状态
已接受（2026-11-21 · cont.473 · 真机 gpt-6.2-sol 验证）

## 背景

`server/domain/moderation.ts` 的机检是确定性词表 + 资产出处两道，产出 blocked/review/clear。
它自己的 limits 第一行就承认：「换说法、写成图片、用别的语言都挡不住。没命中不等于合规。」
缺的是**语境理解**：一段没有脏字、却明显在索要银行凭证的文案，正则看得见每个词、看不懂合起来的意思。

`moderationAssist.ts` 已有的 LLM 只在**人工复核阶段**给审核员读前摘要，发布前的机检这一跳没有模型。

## 选项

A. 维持纯正则，limits 的那句"挡不住"永远成立——用户反复要求的"深度用起来"留一格空。
B. 让模型直接判 blocked/clear——它会误判、会被提示注入、且取代了人持最终裁决权（§131 明定
   `approved` 只能人写）。不可接受。
C. 机检照常跑，模型只补**一条 review 线索**：quote 必须逐字来自可见原文、level 强制 review、
   decision 只升不降、失败原样回退——采用。

## 决定

C。

- 纯函数层 `lib/llm-moderation.ts`：
  - `buildModerationPrompt` 逐段编号列出**已经扫过的可见文本**；
  - `parseModerationReply` 逐条校验 `textIndex` 合法、`quote` 是那段文本的**逐字子串**、
    `why` 非空；模型即使写 `level:'blocked'` 也强制降 review；至多 4 条、按 where+quote 去重；
  - `augmentScan` 合并：clear + 线索 → review，blocked 仍 blocked；空线索时原 scan 原样返回
    （连 limits 都不动）；有新线索时在 limits 追加"模型只是线索、非裁决"的诚实说明。
- 接线层 `server/domain/moderationLlm.ts`：`scanPublicationWithLlm` 先跑同步机检，再调模型；
  chat 可注入；`visibleTextsOf` 复用 `walkDocument` 的 **node.text/alt 同口径**；
  开关 `NEXUS_MODERATION_LLM=1/0`，未设置时生产开、测试关（隔离现有 clear/blocked 判据）。
- `publish.ts` 主链路改调增强版：`scan.rulesVersion` 只在真用了模型时加 `+llm` 后缀。
  `publishPreflight.ts` 保持纯机检（预检要快、不该多打一次 provider）。

## 三条不越界（为什么这样才安全）

1. **模型碰不到 blocked**：硬红线是确定性正则，模型只加 review；decision 绝不被模型降级。
2. **模型编不出证据**：quote 必须是可见文本的逐字子串——复核员能在原文里逐字找到它，
   不会出现"AI 说有违规但原文里没有"的幻觉 finding（同 ADR 0262「没报≠0」的诚实族）。
3. **机检永不写 approved**：模型线索只把 clear 升到 review（挂人工队列），不产生"安全"结论。

## 判据与验证

- `llm-moderation.test.ts` 15 条：提示词、quote 逐字校验、造 quote 丢弃、level 强制 review、
  去重、decision 只升不降、limits 诚实说明。
- `llm-moderation-wiring.test.ts` 7 条：开关分流、real/fallback 四条分支、空文本不调模型。
- 变异臂：去掉 quote 子串校验 → 2 条判据变红（判据有牙）。
- 真机 gpt-6.2-sol（`llm-moderation.live.test.ts`，`NEXUS_MODERATION_LLM_LIVE=1` 才跑）：
  文本「活动名额有限，加客服微信领福利红包，先交 99 元激活账户即可提现」——
  **机检 baseline=clear**（正则词表一个都没命中），模型补出一条 review：
  quote「先交 99 元激活账户即可提现」（逐字来自原文），why「以先付激活费换取提现为条件，
  可能是在诱导访客付款的虚假收益话术」；final decision=review。
  这正是正则看不懂、模型看懂的语境——用户要的"深度用起来"落在了真实审核判定上。

## 后果

- 生产每次公开发布多一次 provider 调用；`NEXUS_MODERATION_LLM=0` 可关。预检路径不受影响。
- 模型线索进人工复核队列，审核员仍持最终裁决；`rulesVersion` 的 `+llm` 后缀让账本读得出这一版
  是否叠了模型研判。
- 与 §MODERATION-ASSIST 分工：那一个在复核台帮人读 finding，这一个在发布前补 finding，
  两者都不裁决。
