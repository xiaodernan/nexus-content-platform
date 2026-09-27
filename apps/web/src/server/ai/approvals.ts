import type { AiRequest, AiResponse, AiError, DesignPatchPayload } from '@nexus/schemas';
import type { DesignDocument } from '@nexus/design-model';

/**
 * §74 的第二格：AI 结果里的高危动作要有人批准才交回编辑区。
 *
 * 起点是两条对不上账的列：`agent_tasks.requires_approval` 与状态 `awaiting_approval`
 * 从 0000 建库起就在那儿，**全库没有一个写入方**——§74 的审批门在 agent 这条路上是死代码。
 * §74 的"删除项目"那一格补上了 projects.deletedAt 的写入方，这一格补的是这两列的。
 *
 * 三条纪律：
 * - **门开在 web，不开在 provider 的自觉上**。provider 报了 `approvals` 才拦，等于让
 *   "忘了自查的那一家"直接放行（§76 说 provider 必须可替换，可替换的一家里出问题的概率不是零）。
 *   所以 web 自己按补丁里的 op 再过一遍，与 provider 报的取并集。
 * - **扣留是"不交回补丁"，不是"删掉补丁"**。被挂起的整份结果原样存在任务行里，
 *   批准之后交回的是用户看过的那一版；重新生成一份就不是他批准的那个决定了。
 * - **策略由服务端定**。客户端在报文里带 `approvalPolicy` 一律丢弃（见 `assemble.ts`），
 *   否则"这次不要审批"就是请求方自己填的一栏。
 */

/** 会带走东西的 op：删节点、删页、删 token、删资产（清单与所有页面引用一起清）、删组件（定义与所有实例引用一起解开）。 */
export const DESTRUCTIVE_OPS = ['remove', 'removePage', 'removeToken', 'removeAsset', 'removeComponent'] as const;

/**
 * §73 的权限作用域里**今天唯一被代码执行**的那一个：名册上的 Agent 有没有它，决定 provider 回来的
 * 设计补丁能不能交回编辑区。其余作用域（code.write / asset.generate / …）在这里不出现，
 * 是因为平台还没有对应的可执行动作——写一份没人执行的权限表，看起来像管控，其实是装饰。
 */
export const DESIGN_PATCH = 'design.patch';

/**
 * 把 id 翻成人读得懂的名字，供审批理由用。三件刻意的事：
 * - 根节点要挡：`remove` 打在 `page.rootId` 上等于清空整页，那是比"删除页脚"重一档的动作，
 *   名字却可能只是"页面"——不挡的话审批卡片上写的就是"删除 页面"，读的人会低估它。
 *   挡住之后仍然算高危（照样进 approvals），只是名字换成"整页根节点"。
 * - 找不到就返回 null，由调用方退回 id；**不猜一个"某个元素"**。
 * - 页名与节点名同名时靠页名前缀分开，两处都查不到才用裸 id。
 */
export function nodeNamer(document: DesignDocument): NodeNamer {
  const byId = new Map<string, string>();
  for (const token of document.tokens) byId.set(token.key, `${token.key}（设计 token）`);
  for (const asset of document.assets) byId.set(asset.id, `${asset.name}（资产，删除会连带清掉引用它的填充）`);
  for (const component of document.components) byId.set(component.id, `${component.name}（组件，删除会连带解开引用它的实例）`);
  for (const page of document.pages) {
    // 先放页，再放节点：`removePage` 带的是 pageId，节点 id 不会与页 id 撞车，
    // 但顺序写反了将来出错时看不出来
    byId.set(page.id, `${page.name}（整页）`);
    for (const node of Object.values(page.nodes)) {
      byId.set(node.id, node.id === page.rootId ? `${page.name} 的根节点（删除等于清空这一页）` : node.name);
    }
  }
  return (id) => (id ? byId.get(id) ?? null : null);
}

/**
 * web 这一侧的审批策略。今天只有 `delete` 一项：§74 清单上的消耗 credits / 对外发消息 /
 * 生产部署 / 支付在 web 里还**没有对应的动作**（M7/M8 未开工），给不存在的动作设门是装饰，
 * 不是审批。
 */
export const WEB_APPROVAL_POLICY: readonly ApprovalPolicy[] = ['delete'];

/** 契约上那一栏的成员类型：从这里取，不在 web 里再抄一份枚举（改枚举时这里会红） */
export type ApprovalPolicy = AiRequest['approvalPolicy'][number];

export type ApprovalAction = { action: string; reason: string };

type PatchOpLike = { op?: string; nodeId?: string; key?: string; assetId?: string; componentId?: string; pageId?: string };

/** 节点名让人读得懂（"删除「页脚」"），读不到就退回 id，绝不编一个"某个元素" */
export type NodeNamer = (nodeId: string | undefined) => string | null;

function describe(op: PatchOpLike, patch: DesignPatchPayload, nameOf: NodeNamer): string {
  // pageId 也要能报名字：`removePage` 带的是页 id，漏掉它这条理由就成了裸 uuid
  const target = nameOf(op.nodeId ?? op.key ?? op.assetId ?? op.componentId ?? op.pageId) ?? op.nodeId ?? op.key ?? op.assetId ?? op.componentId ?? op.pageId ?? patch.pageId ?? '这一处';
  return `${op.op ?? 'destructive'} → ${target}`;
}

/**
 * 从补丁里扫出需要审批的动作。`policy` 不含 `delete` 时返回空——
 * 但 web 的调用方永远传 `WEB_APPROVAL_POLICY`，这个参数是给测试留的反向对照。
 */
export function destructiveActions(
  patches: readonly DesignPatchPayload[],
  policy: readonly string[],
  nameOf: NodeNamer,
): ApprovalAction[] {
  if (!policy.includes('delete')) return [];
  const out: ApprovalAction[] = [];
  for (const patch of patches) {
    for (const raw of (patch.ops ?? []) as unknown as PatchOpLike[]) {
      if (!raw || typeof raw !== 'object') continue;
      if (!DESTRUCTIVE_OPS.includes(raw.op as (typeof DESTRUCTIVE_OPS)[number])) continue;
      out.push({ action: 'delete', reason: describe(raw, patch, nameOf) });
    }
  }
  return out;
}

/** 并集去重：provider 报了同一个理由两次，界面上只列一条 */
function union(...lists: ApprovalAction[][]): ApprovalAction[] {
  const seen = new Map<string, ApprovalAction>();
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.action}\u0000${item.reason}`;
      if (!seen.has(key)) seen.set(key, item);
    }
  }
  return [...seen.values()].sort((a, b) => `${a.action}:${a.reason}`.localeCompare(`${b.action}:${b.reason}`, 'zh-CN'));
}

export interface GateResult {
  /** 需要审批的动作；空数组表示这一份结果可以原样交回 */
  approvals: ApprovalAction[];
  /** 交回浏览器的那一份：挂起时补丁已被抽走 */
  delivered: AiResponse;
  /** 挂起时保留的完整结果（含补丁）；未挂起时与 delivered 同一对象 */
  held: AiResponse;
  /** 这次是第几个 op 被扣下，给 UI 一句准数 */
  heldOpCount: number;
  /**
   * §73：这一份被**拒**了（不是挂起）。名字与被点名的 Agent 一起给，路由要把它记进账本——
   * 拒掉的补丁没有 held 记录可查，不留这一行就只剩"画布什么都没变"这一个现象。
   */
  refused?: { agent: string; opCount: number };
}

/** 把补丁抽走，并把"已经落地"的说法改成实际发生的那一句。挂起与拒收共用这一处 */
function withoutPatches(response: AiResponse, opCount: number, error: AiError, summary: string): AiResponse {
  return {
    ...response,
    patches: [],
    error,
    explanation: `（${summary}）${response.explanation}`.slice(0, 2000),
    // 活动流与计划步骤是 provider 按"补丁已经应用"写的。原样交回，界面上就是同一屏里
    // 一句"1 个 op 已落地"配一句"画布还没有被改动"——那是 §159 禁止的那种自相矛盾的谎。
    activities: [
      ...(response.activities ?? []).filter((a) => a.stage !== 'apply'),
      { stage: 'apply', status: 'info' as const, summary },
    ],
    plans: (response.plans ?? []).map((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => (task.status === 'done' ? { ...task, status: 'skipped' as const } : task)),
    })),
  };
}

/**
 * 这一次结果过不过门。挂起时：`patches` 抽走、`approvals` 填全、`error` 给出 approval-required，
 * 与 ai-service 那一侧同形——两条路的报文必须一样，否则接上第 N 家 provider 就只看得到第 N 种说法。
 *
 * `agent` 是 §112 解析出来的那一位（没点名就传 null / 不传）。它改变的是**能不能落地**，不是要不要审批：
 * §73 说越权调用直接失败，所以被点了 @qa 之后 provider 再回补丁，也是拒收而不是"弹个卡片问一句"——
 * 问的那一句默认了"批准之后 QA 就能改画布"，而名册说的不是这件事。
 */
export function gateResponse(
  response: AiResponse,
  policy: readonly string[],
  nameOf: NodeNamer,
  agent?: { name: string; capabilities: readonly string[] } | null,
): GateResult {
  const opCount = (response.patches ?? []).reduce((sum, p) => sum + (p.ops ?? []).length, 0);
  if (agent && opCount > 0 && !agent.capabilities.includes(DESIGN_PATCH)) {
    const summary = `${agent.name} 的职责里没有"改设计文档"这一条，${opCount} 个 op 未交回`;
    return {
      approvals: [],
      delivered: withoutPatches(
        response,
        opCount,
        {
          code: 'permission-denied',
          message: summary,
          hint: '换一个名册里有 design.patch 的 Agent（例如 @design）再来一次；这一位只能提意见。',
          retryable: false,
        },
        summary,
      ),
      held: response,
      heldOpCount: 0,
      refused: { agent: agent.name, opCount },
    };
  }
  const fromWeb = destructiveActions(response.patches ?? [], policy, nameOf);
  const approvals = union(fromWeb, response.approvals ?? []);
  if (approvals.length === 0) {
    return { approvals: [], delivered: response, held: response, heldOpCount: 0 };
  }
  const summary = `已挂起 ${opCount} 个 op，批准之前不会落地`;
  return {
    approvals,
    delivered: {
      ...withoutPatches(
        response,
        opCount,
        {
          code: 'approval-required',
          message: `这份结果含 ${approvals.length} 处需要人工审批的动作，补丁已挂起`,
          hint: '在下方选择"批准并交回"才会把补丁送回编辑区；批准之前工作区不会被改动（§74）。',
          retryable: false,
        },
        summary,
      ),
      approvals,
    },
    held: response,
    heldOpCount: opCount,
  };
}

/** 任务行里存的那一份：批准的凭据是"看过这一版"，所以存的是完整结果而不是摘要 */
export interface HeldRecord {
  held: AiResponse;
  /**
   * 交回客户端的那一份（补丁已抽走、approvals 已填全）。同步路径当场就把它发出去了，
   * 异步路径没有"当场"——轮询的人隔几秒才来问，那时要给的还是同一份说法，
   * 而不是拿 `held` 重新过一遍门：文档可能已经变了，重算出来的理由名字会变。
   */
  delivered: AiResponse;
  approvals: ApprovalAction[];
  /** 当时生效的策略，事后看得清"是谁家的规矩挡的" */
  policy: readonly string[];
  heldOpCount: number;
}

export function heldRecord(gate: GateResult, policy: readonly string[]): HeldRecord {
  return { held: gate.held, delivered: gate.delivered, approvals: gate.approvals, policy, heldOpCount: gate.heldOpCount };
}
