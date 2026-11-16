import type { ApprovalTaskView } from '@/server/domain/agent-tasks';

/**
 * §73-AI · 审批挂起时的「大模型读一眼」：把一次 awaiting approval 的挂起动作列表
 * 整成一句有用得多的人话——让审批人先看到模型怎么说，再点批准/拒绝。
 *
 * 纪律：
 * - 模型只看得到 **结构性事实**：agentKey / heldOpCount / 操作 kind / 样例目标名——不出现文档正文、坐标、文件名字符串内容；
 * - 模型只被要求做一件事：用 1–2 句话说清楚「这一次要改什么」，以及「为什么需要人批」。不劝批准、不劝拒绝、不评分；
 * - provider 不可用 → 503 原样回真（§159/§160）；决定权在服务端，不属于模型；
 * - 这是解释性文本，不改变 approval 裁决的任何代码路径。
 */
export interface AgentExplainDigest {
  /** 整段送给 provider 的原文（聚合）——可直入日志便于怀疑时回放 */
  readonly user: string;
}

/** 审批动作的（action， reason）骨架。不打开 carried op 方向，只给模型读结构。 */
interface ApprovalItem {
  action: string;
  reason?: string;
}

export const AGENT_EXPLAIN_SYSTEM_PROMPT = [
  'You explain why a pending approval exists and what kind of change is being proposed.',
  'You NEVER tell the user to approve or refuse — the human owns that call.',
  'Facts:',
  '- A held result consists of op-kinds enumerated in the digest; small targets are listed with their name or id only.',
  '- No payload bodies, file contents, image bytes or documents are shown to you.',
  '- If the digest lacks a fact, say "不够看 / not enough here to see it" — never invent.',
  'Rules:',
  '1. Answer in at most two sentences: ① what these ops would do ② why a person should decide (what would become unrecoverable).',
  '2. Answer in the locale asked (asked locale comes in the user text; Chinese asked → Chinese answered; English asked → English answered).',
  '3. Never prescribe the human decision ("approve"/"reject"/"yes"/"no"). Describe, do not direct.',
  '4. Mention heldOpCount exactly as shown (your audience here personally runs the canvas).',
].join('\n');

/** `op#${n} action=${it.action}${reason ? ` reason="${reason}"` : ''}` — reason 总是被截到 120 字 */
function safeItems(task: ApprovalTaskView): ApprovalItem[] {
  const raw = task.approvals;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .map((item) => {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        return {
          action: typeof rec.action === 'string' ? rec.action : 'unknown',
          reason: typeof rec.reason === 'string' ? rec.reason : undefined,
        };
      }
      return { action: 'unknown' };
    })
    .slice(0, 12);
}

function kindTally(items: readonly ApprovalItem[]): string {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.action, (counts.get(it.action) ?? 0) + 1);
  return [...counts.entries()].map(([k, v]) => `${k}:${v}`).join(' ');
}

export function buildApprovalDigest(task: ApprovalTaskView, locale: 'zh' | 'en'): AgentExplainDigest {
  const items = safeItems(task);
  const tally = kindTally(items);
  const head = [
    `agentKey=${task.agentKey ?? '?'} heldOpCount=${task.heldOpCount ?? '?'} approvals=${items.length}`,
    `locale=${locale}`,
    `kinds=${tally}`,
  ];
  const examples = items.slice(0, 4).map((it, i) => {
    const reason = (it.reason ?? '').slice(0, 120).replace(/\.\.\.$/, '…');
    return `op#${i + 1} action=${it.action}${reason ? ` reason="${reason}"` : ''}`;
  });
  return {
    user: [...head, ...examples, 'END OF DIGEST'].join('\n'),
  };
}
