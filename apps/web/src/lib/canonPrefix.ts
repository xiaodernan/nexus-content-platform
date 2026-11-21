/**
 * §CANON-PREFIX · 所有面向用户的 LLM 输出共享的"平台世界前缀"。
 *
 * 为什么需要它：
 *   模型不需要记住 git log——它需要知道**自己是什么平台、在讲什么样的世界**。
 *   字节稳定的 canon SYSTEM_PROMPT（与 /bible/ask 同源，chars 数见 generated.ts）同时兼任：
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

/**
 * §CTX-TIER · 轻量身份前缀——给「复核平台实测数据」这一类调用用。
 *
 * 为什么需要它（2026-11-20 本地实测）：`SYSTEM_PROMPT` 现在是 265,808 chars（≈171K tokens，
 * 13 章 + 205 回响 + 4 附录）。observer/digest、deep-read、discover、editor-note、
 * marketplace、notifications、pulse 这七条路由复核的是**平台自己的数字**，不是正典本身；
 * 它们的 system 里那 171K token 大典正文对判断毫无帮助，却按调用重复占用 KV 前缀容量，
 * 与并行会话互相挤出缓存（用户长期反馈的掉缓存根因之一）。
 *
 * 设计：这里只给「平台身份 + 语气 + 数字纪律 + 语言纪律」，字节稳定（const 字符串），
 * 同一 locale 的所有复核调用共享同一短前缀——KV 命中不降，前缀占用从 171K 降到 ~0.4K token。
 * 真正需要正典的问典链路（/bible/q、insight/chat、ship/digest、canonGraph）继续用 `canonPrelude`。
 */
const IDENTITY_ZH = [
  '你是 NEXUS 平台的复核官。NEXUS 是一个讲述《低语诸王》世界的创作平台（潮汐教团、潮候院、回响）。语气克制、平实。',
  '纪律：',
  '1. 只依据 user 消息里给出的实测数据与指令作答——不引用外部知识，不编造数字；要写比率必须写出算式。',
  '2. 中文问题用中文回答，英文问题用英文回答；同一段不混用两种语言。',
  '3. 没有依据的部分直说「数据不足」，不要猜测。',
].join('\n');
const IDENTITY_EN = [
  'You are the review officer of NEXUS, a creative platform for the world of "The Whispers\' Kings" (the Tide Conclave, the Institute, the echoes). Keep your tone calm and plain.',
  'Rules:',
  '1. Answer only from the measured data and instructions in the user message — no outside knowledge, no invented numbers; write the arithmetic for any ratio.',
  '2. Answer in the language of the question; never mix Chinese and English within one answer.',
  '3. Where evidence is missing, say "insufficient data" instead of guessing.',
].join('\n');

/** 轻量前缀的硬上界（测试门）：超过这个数就说明有人又把大典塞回来了。 */
export const CANON_IDENTITY_MAX_CHARS = 1200;

/** 轻量、字节稳定的身份前缀；变动部分（JSON / rules）仍由调用方放 user。 */
export function canonIdentityPrelude(locale: 'zh' | 'en', payloadLabel: Record<'zh' | 'en', string>): string {
  return [locale === 'zh' ? IDENTITY_ZH : IDENTITY_EN, '', payloadLabel[locale]].join('\n');
}
