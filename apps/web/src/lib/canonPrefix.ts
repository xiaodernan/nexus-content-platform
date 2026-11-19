/**
 * §CANON-PREFIX · 所有面向用户的 LLM 输出共享的"平台世界前缀"。
 *
 * 为什么需要它：
 *   模型不需要记住 git log——它需要知道**自己是什么平台、在讲什么样的世界**。
 *   字节稳定的 259K chars canon 前缀（与 /bible/ask 同源）同时兼任：
 *   1. 世界身份：模型知道 NEXUS 是个"潮汐教团 + 潮候院"世界观的平台，
 *      它生成的每一句——观察建议、收件箱摘要、分析叙事——都自带平台语气；
 *   2. 缓存前缀：同一段前缀打进 provider，prompt-cache KV 命中率与
 *      /bible/ask、/ship、潮候步进完全相同的那条轨道显著同源（≥93.9%）；
 *   3. 稳定性：SYSTEM_PROMPT 字节稳定，KV 前缀即时复用，不随请求波动。
 *
 * 纪律：
 *   - 数字纪律不变：所有调用仍必须引用输入里的实测数字；canon 前缀给的是
 *     "身份与口径"，不是"允许编数字"；
 *   - 输入变动只放 user，system 前缀逐字节不变；
 *   - DEMO MODE 守门不变（调用方不变）。
 */
import { SYSTEM_PROMPT } from '@/lib/bibleAsk';

/** 仅注入一次分隔符与正文前缀；变动部分（histo JSON / rules）由调用方拼接 */
export function canonPrelude(locale: 'zh' | 'en', payloadLabel: Record<'zh' | 'en', string>): string {
  return [SYSTEM_PROMPT, '', payloadLabel[locale]].join('\n');
}
