/**
 * §ADMIN-LLM-2 · 观察站 AI 深读的「数字出处核对」（纯函数，零 IO）。
 *
 * 为什么需要它：提示词已经写了"数字必须来自上述聚合值，不得编造"，但那只是一句请求，
 * 不是一道门。模型完全可能在 basis/impact 里写出一个快照里从未出现过的数——
 * 读的人无从分辨哪个数是实测、哪个是模型顺口编的（ADR 0262「没报 ≠ 0」同族：
 * 展示出来的东西必须能和它的来源对上）。
 *
 * 做法：不判断"这个数对不对"（那需要业务真值），只判断一个更窄、可机械复核的事实——
 * **这个数字是否逐字出现在喂给模型的快照文本里**。没出现的不删、不改写，只标注
 * "非快照原文（可能是模型推算）"，把判断权交回读者。数字保留原文形态，避免
 * 1,358 与 1358 被当成两个数。
 */

export interface AuditedNumber {
  /** 原文里的数字（已去掉千分位逗号，保留小数与百分号前数值） */
  value: string;
  /** 是否在快照文本里逐字出现过 */
  inSnapshot: boolean;
}

export interface NumberAudit {
  cited: AuditedNumber[];
  /** 不在快照里的数字（去重、保序） */
  unverified: string[];
}

const NUMERIC = /\d[\d,]*(?:\.\d+)?%?/g;

function normalize(token: string): string {
  return token.replace(/,/g, '').replace(/%$/, '');
}

/** 抽出文本里出现过的所有数字（归一化后），用于建"快照允许集"。 */
export function numbersInText(text: string): Set<string> {
  const out = new Set<string>();
  for (const match of text.matchAll(NUMERIC)) out.add(normalize(match[0]));
  return out;
}

/**
 * 核对一段话里的数字出处。
 * - `snapshotText` 必须是**逐字喂给模型的那份快照**（不是重新拼一遍），否则核对会漂。
 * - 百分号不算数：`20%` 与 `20` 视为同一个数——模型常把百分比写成纯数。
 */
export function auditNumbers(claim: string, snapshotText: string): NumberAudit {
  const allowed = numbersInText(snapshotText);
  const cited: AuditedNumber[] = [];
  const seen = new Set<string>();
  for (const match of claim.matchAll(NUMERIC)) {
    const value = normalize(match[0]);
    if (seen.has(value)) continue;
    seen.add(value);
    cited.push({ value, inSnapshot: allowed.has(value) });
  }
  return { cited, unverified: cited.filter((c) => !c.inSnapshot).map((c) => c.value) };
}
