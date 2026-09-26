import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { agents } from '../db/schema';

/**
 * §112「每个 Agent 有自己的职责」+ §73「越权调用直接失败」在 web 这一侧的落地。
 *
 * 名册的写入方是 `scripts/db-seed.mts`（13 个 Agent，§24 那一份清单），这里只做两件事：
 * 1. **读**：`loadRoster()` 取在册（enabled）的那几个，按 key 排序——排序是为了同一份库给出同一份列表，
 *    界面与测试都不该看到随机顺序。
 * 2. **解析提及**（§111）：`@qa 看一下这个按钮` 里的 `qa` 决定这一轮交给谁。
 *    请求方只能**提名**：不在册的就是"名册里没有 @xxx"，不是"随便挑一个顶上"，也不是静默丢掉。
 *
 * 解析出来的那份（含 `capabilities`）交给 `server/ai/approvals.ts` 的门去执行——
 * 今天名册里只有一个作用域有执行方：`design.patch`（§73）。它和审批门在同一处判，
 * 因为两条 provider 路（同步 / 异步）都过那一个函数；判在这里，异步那一路才绕不过去。
 *
 * 为什么名册读库而不是写死在代码里：§112 的职责要随请求发给 provider（进了提示词就是模型听到的话），
 * 而"谁能改画布"是权限判断——两样都该是一处现场、多处读，而不是 TS 里一份、Python 里一份。
 */

export interface AgentRosterEntry {
  key: string;
  name: string;
  responsibilities: string[];
  capabilities: string[];
}

export async function loadRoster(): Promise<AgentRosterEntry[]> {
  const rows = await getDb()
    .select({
      key: agents.key,
      name: agents.name,
      responsibilities: agents.responsibilities,
      capabilities: agents.capabilities,
    })
    .from(agents)
    .where(eq(agents.enabled, true))
    .orderBy(asc(agents.key));
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    responsibilities: r.responsibilities ?? [],
    capabilities: r.capabilities ?? [],
  }));
}

/** `@Design Agent`、`@design`、`design` 是同一个：去掉 @、去掉尾部的 "agent"、小写 */
function normalizeMention(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^@/, '').replace(/\s+agent$/i, '');
  return trimmed ? trimmed.toLowerCase() : null;
}

/** 一个提名是不是在册的 Agent */
export function findAgent(roster: readonly AgentRosterEntry[], mention: string | null | undefined): AgentRosterEntry | null {
  const wanted = normalizeMention(mention);
  if (!wanted) return null;
  return roster.find((entry) => entry.key === wanted) ?? null;
}

/** 文本里出现的 `@xxx`，按出现顺序、去重 */
function mentionsIn(text: string): string[] {
  const out: string[] = [];
  // 只有一个捕获组，所以是 match[1]；写成 match[2] 时 TS 不红（noUncheckedIndexedAccess
  // 让两边都成了 `string | undefined`），但每一次 @提及都会被静默当成没说
  for (const match of text.matchAll(/(?:^|\s)@([a-z0-9][a-z0-9-]{0,39})/gi)) {
    const key = normalizeMention(match[1]);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

export interface ResolvedAgent {
  /** 解析出的 Agent；null = 这一轮没人被点名，按请求的 intent 走 */
  agent: AgentRosterEntry | null;
  /** 点了名但名册里没有的（原样报回，不猜） */
  unknown: string[];
  /** 点了不止一个：第一个负责这一轮，其余在这里交代——它们没有静默消失 */
  ignored: string[];
  /** 名册整张表是空的：这不是"谁都不认识"，而是"还没播种"，两句不一样 */
  rosterEmpty: boolean;
}

/**
 * 这一轮交给谁：请求里显式提名的优先，其次提示词里的 `@xxx`，最后才是批注里的
 * （批注是"某个人在某个元素上留的话"，它点名的是那件事该谁做）。
 * 三处都没有 → null：交给原来的 intent 路径，而不是硬塞一个 Design Agent 当默认值。
 */
export function resolveAgent(
  roster: readonly AgentRosterEntry[],
  ask: { agentKey?: string | undefined; prompt: string; annotations?: readonly string[] },
): ResolvedAgent {
  const unknown: string[] = [];
  const candidates: string[] = [];
  if (ask.agentKey) candidates.push(normalizeMention(ask.agentKey) ?? ask.agentKey);
  candidates.push(...mentionsIn(ask.prompt), ...(ask.annotations ?? []).flatMap(mentionsIn));
  const unique = [...new Set(candidates)];

  for (const candidate of unique) {
    const entry = findAgent(roster, candidate);
    if (entry) {
      // 其余被点到、且在册的 Agent 也一并交代：它们不是没被看见，只是这一轮不由它们做
      const ignored = [...new Set(unique.map((c) => findAgent(roster, c)).filter((e): e is AgentRosterEntry => Boolean(e)).map((e) => e.key))]
        .filter((key) => key !== entry.key);
      return { agent: entry, unknown, ignored, rosterEmpty: roster.length === 0 };
    }
    if (!unknown.includes(`@${candidate}`)) unknown.push(`@${candidate}`);
  }
  return { agent: null, unknown, ignored: [], rosterEmpty: roster.length === 0 };
}

/**
 * 这一轮的提及要说给界面的一句话。三件事都得说：点名点错了（`@fy`）、点了不止一个（其余这一轮不做）、
 * 名册还没播种。不说的话，用户看到的就只有"画布什么都没变"，分不清是自己拼错了还是系统没加载名册。
 *
 * 句子由服务端拼一处：同步路径的响应头、异步观察的 notes、账本里的同一份字段，说的是同一句话。
 * 没问题时返回 null——没话找话的提示会被读的人当成噪音，然后所有提示都不被读。
 */
export function mentionNote(fields: {
  agent: { key: string; name: string } | null;
  unknownMentions: string[];
  ignoredMentions: string[];
  rosterEmpty: boolean;
}): string | null {
  const parts: string[] = [];
  if (fields.rosterEmpty) parts.push('名册里一个 Agent 都没有（还没跑 `npm run db:seed`），这一轮没有人被点名');
  if (fields.unknownMentions.length) {
    parts.push(`名册里没有 ${fields.unknownMentions.join('、')}${fields.agent ? '' : '，这一轮也没有别人被点名'}`);
  }
  if (fields.ignoredMentions.length) {
    parts.push(`${fields.ignoredMentions.map((k) => `@${k}`).join('、')} 也被点到，但这一轮由${fields.agent ? ` ${fields.agent.name} ` : '没人'}负责`);
  }
  return parts.length ? parts.join('；') : null;
}

/**
 * 账本里"这一轮归谁"那几栏。同步 `/api/ai/run` 与异步 `/api/ai/jobs` 共用一份，
 * 因为两条路写的是同一张 `agent_tasks`——字段形状一旦分叉，看账的人就得先按路径猜字段名。
 *
 * `unknownMentions` / `ignoredMentions` 必须留痕：只记"成功的那一个"的话，
 * 一次把 `@design` 拼成 `@deisgn` 的请求事后看起来就跟"没人点过"一模一样。
 */
export function agentLedgerFields(
  resolved: ResolvedAgent,
  ask: { askedAgentKey?: string | undefined; fallbackKey: string },
): {
  agentKey: string;
  agent: { key: string; name: string } | null;
  askedAgentKey: string | null;
  unknownMentions: string[];
  ignoredMentions: string[];
  /** 整张名册是空的：那一句"名册里没有 @design"就不成立，两句要分得开 */
  rosterEmpty: boolean;
} {
  return {
    agentKey: resolved.agent?.key ?? ask.fallbackKey,
    agent: resolved.agent ? { key: resolved.agent.key, name: resolved.agent.name } : null,
    askedAgentKey: ask.askedAgentKey ?? null,
    unknownMentions: resolved.unknown,
    ignoredMentions: resolved.ignored,
    rosterEmpty: resolved.rosterEmpty,
  };
}
