import type { ModerationFinding, ModerationScan } from '@nexus/schemas';

/**
 * §MOD-1 · 发布审核的 LLM 上下文二段研判——纯函数层（无 I/O，§112/§159）。
 *
 * 为什么需要第二只眼
 * ------------------
 * `server/domain/moderation.ts` 的两类红线是"两个词靠近才算"的正则，词表只挡最露骨的措辞。
 * 它自己的 limits 就写着"换个说法、写成图片、用别的语言都挡不住"。缺的是**语境理解**：
 * 一段没有脏字、却明显在索要银行凭证的文案，正则看得见每个词、看不懂合起来的意思。
 *
 * 模型只做一件事：在**已经扫过的可见文本**里找词表漏掉的可疑上下文，补一条 review 线索。
 * 三条不可越过的边界：
 *   1. 模型碰不到 `decision:'blocked'`——硬红线仍是确定性正则说了算，模型只补 review；
 *   2. quote 必须是某段可见文本的**逐字子串**——模型编不出原文没有的"证据"（防 hallucinated finding）；
 *   3. 机检永不写 approved——模型线索只把 clear 升到 review（挂人工），不产生"安全"结论。
 */

export const MODERATION_LLM_SYSTEM = [
  '你是 NEXUS 平台发布审核的上下文研判助手。机检词表已经跑过了，只找它漏掉的、靠语境才看得出的可疑内容（例如换措辞的欺骗、索要凭证、跨句拼出的违规含义）。',
  '输出严格 JSON：{"findings":[{"textIndex":0,"quote":"...","why":"..."}]}。',
  'textIndex 是下面文本的编号；quote 必须逐字来自那段文本、原样抄，不许改写也不许编造；why 一句中文说明为什么可疑。',
  '不要下结论（放行/拒绝/封禁），只给需要人工（review）看的线索；没有可疑项就输出 {"findings":[]}；不要 markdown 或多余字段。',
].join('\n');

export function buildModerationPrompt(visibleTexts: readonly string[]): string {
  if (!visibleTexts.length) return '没有可扫的可见文本：不要输出任何 finding，返回 {"findings":[]}。';
  return [
    '以下是这份作品里访客看得见的文本（编号从 0 开始）：',
    ...visibleTexts.map((text, i) => `[${i}] ${text}`),
    '',
    '词表没命中的才算你的线索；每条 quote 必须是上面某一段的逐字子串。',
  ].join('\n');
}

interface RawFinding {
  textIndex?: unknown;
  quote?: unknown;
  why?: unknown;
}

const MAX_LLM_FINDINGS = 4;

/**
 * 解析模型回执。**逐字子串**校验是核心：quote 若不是对应 textIndex 那段原文的子串，整条丢弃。
 * 这保证模型贡献的每一条 finding 都能被复核员在原文里找到，不会凭空造出一条"证据"。
 */
export function parseModerationReply(raw: string, visibleTexts: readonly string[]): ModerationFinding[] {
  const text = raw.trim();
  if (!text) return [];
  const jsonText = text.startsWith('```') ? text.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '') : text;
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const list = (data as Record<string, unknown>).findings;
  if (!Array.isArray(list)) return [];

  const out: ModerationFinding[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const f = entry as RawFinding;
    if (typeof f.textIndex !== 'number' || !Number.isInteger(f.textIndex)) continue;
    if (f.textIndex < 0 || f.textIndex >= visibleTexts.length) continue;
    if (typeof f.quote !== 'string' || !f.quote.trim()) continue;
    if (typeof f.why !== 'string' || !f.why.trim()) continue;
    // 逐字子串：模型必须引用真实可见文本
    if (!visibleTexts[f.textIndex]!.includes(f.quote)) continue;
    const where = `text[${f.textIndex}]`;
    const key = `${where}\u0000${f.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      rule: 'llm.context_review',
      level: 'review', // 模型永远只能挂人工，不能自动挡、不能报安全
      quote: f.quote,
      where,
      why: f.why.trim().slice(0, 240),
    });
    if (out.length >= MAX_LLM_FINDINGS) break;
  }
  return out;
}

/**
 * 把模型线索并进机检结果。三条守恒：
 * - decision 只升不降：clear + 线索 → review；blocked 仍是 blocked；
 * - 空线索时原样返回（连 limits 都不动，便于"模型没帮上忙"时无痕回退）；
 * - 有新线索时在 limits 追加一条诚实说明——模型研判只是线索，不是裁决。
 */
export function augmentScan(scan: ModerationScan, llmFindings: readonly ModerationFinding[]): ModerationScan {
  if (!llmFindings.length) return scan;
  const existing = new Set(scan.findings.map((f) => `${f.where}\u0000${f.quote}`));
  const fresh = llmFindings.filter((f) => {
    const key = `${f.where}\u0000${f.quote}`;
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  if (!fresh.length) return scan;
  const decision = scan.decision === 'blocked' ? 'blocked' : 'review';
  return {
    ...scan,
    decision,
    findings: [...scan.findings, ...fresh],
    limits: [
      ...scan.limits,
      '模型上下文研判只补"需人工看"的线索，不是裁决：每条 quote 都逐字来自可见文本，仍由人工决定放行或撤下。',
    ],
  };
}
