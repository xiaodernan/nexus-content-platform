import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { AiResponseSchema, APPROVAL_TTL_MS, type AiRequest, type AiResponse, type DesignPatchPayload, type RealtimeEvent } from '@nexus/schemas';
import { createDocument, type ComponentDefinition, type DesignDocument } from '@nexus/design-model';
import { assembleAiRequest } from '../src/server/ai/assemble';
import { mockProvider } from '../src/server/ai/mock';
import {
  WEB_APPROVAL_POLICY,
  destructiveActions,
  gateResponse,
  heldRecord,
  nodeNamer,
} from '../src/server/ai/approvals';
import {
  APPROVAL_EXPIRED_NOTE,
  approvalExpired,
  decideApproval,
  convergeExpiredApproval,
  finishTask,
  getTask,
  holdForApproval,
  listPendingApprovals,
  readApprovalTask,
  startTask,
} from '../src/server/domain/agent-tasks';
import { createProject } from '../src/server/domain/projects';
import { inbox } from '../src/server/domain/notifications';
import { channels, getRealtimeBus } from '../src/server/realtime/bus';
import { ttlLabel } from '../src/lib/notify-plan';
import { getDb } from '../src/server/db/client';
import { agentTasks, auditEvents, creditLedger, notifications, projects, users } from '../src/server/db/schema';

/**
 * §74 第二格：AI 结果里的高危动作要有人批准才离开服务端。
 *
 * 这片要证的事，全部来自"两列建库以来没人写过"（`requires_approval` 与 `awaiting_approval`）。
 * 所以测试的重点不是 insert 能不能成功，而是四条容易糊过去的口径：
 * 1. **门开在 web**：provider 忘了报 `approvals`，删除 op 照样被拦下；
 * 2. **扣留不是删掉**：挂起时交回浏览器的补丁是空的，存进任务行的还是完整那一版；
 * 3. **批准交回的是看过的那一版**：不是重新生成一份；
 * 4. **拒绝不冒充批准**：`approved_by/approved_at` 留 null，别人的任务与不存在的任务给同一个答案。
 */

let ownerId: string;
let otherId: string;
let projectId: string;
const taskIds: string[] = [];

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Approve Owner', email: `ap-a+${Date.now()}@nexus.test`, handle: `apa${stamp}` },
      { displayName: 'Approve Other', email: `ap-b+${Date.now()}@nexus.test`, handle: `apb${stamp}` },
    ])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  otherId = rows[1]!.id;
  projectId = (await createProject(ownerId, { name: '审批门测试', kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  if (taskIds.length) {
    await db.delete(auditEvents).where(and(eq(auditEvents.action, 'ai.approval.decide'), inArray(auditEvents.targetId, taskIds)));
  }
  await db.delete(agentTasks).where(inArray(agentTasks.createdById, [ownerId, otherId]));
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

/** 一份能过契约的响应，只填门真正会读的那几栏（其余走 schema 默认值） */
function resp(over: Record<string, unknown> = {}): AiResponse {
  return AiResponseSchema.parse({
    requestId: 'req_gate',
    capability: 'demo',
    provider: 'mock',
    model: 'mock-rule-v1',
    usage: { provider: 'mock', model: 'mock-rule-v1', modelClass: 'balanced', demoMode: true },
    explanation: '把这一块的圆角改大一点。',
    ...over,
  });
}

const patch = (ops: unknown[]) => ({ pageId: 'p_home', summary: '一处改动', ops });

/** 一份带这些 op 的响应：走 AiResponseSchema，所以 op 形状与生产一致 */
function respWith(ops: unknown[], over: Record<string, unknown> = {}): AiResponse {
  return resp({ patches: [patch(ops)], ...over });
}

async function rawTask(id: string) {
  const [row] = await getDb().select().from(agentTasks).where(eq(agentTasks.id, id)).limit(1);
  if (!row) throw new Error(`任务行 ${id} 不见了`);
  return row;
}

function namingDoc(): { document: DesignDocument; heroId: string; pageId: string; rootId: string; tokenKey: string; assetId: string; componentId: string } {
  const document = createDocument('命名', 'website');
  const page = document.pages[0]!;
  const hero = Object.values(page.nodes).find((node) => node.name === 'Hero') ?? page.nodes[page.rootId]!;
  document.assets.push({
    id: 'a_logo',
    name: '品牌标志',
    kind: 'image',
    storageKey: 'assets/a_logo.png',
    mimeType: 'image/png',
    createdAt: document.metadata.createdAt,
  });
  const component: ComponentDefinition = {
    id: 'c_pricing',
    name: '定价卡片',
    rootId: hero.id,
    props: [],
    variants: [],
    slots: [],
  };
  document.components.push(component);
  return {
    document,
    heroId: hero.id,
    pageId: page.id,
    rootId: page.rootId,
    tokenKey: document.tokens[0]!.key,
    assetId: 'a_logo',
    componentId: component.id,
  };
}

describe('门开在 web：provider 的自觉不算数', () => {
  it('五类带走东西的 op 全被拦下；非删除的 op 不冒充高危', () => {
    const { document, heroId, pageId, tokenKey, assetId, componentId } = namingDoc();
    const nameOf = nodeNamer(document);
    const response = respWith([
      { op: 'remove', nodeId: heroId },
      { op: 'removePage', pageId },
      { op: 'removeToken', key: tokenKey },
      { op: 'removeAsset', assetId },
      { op: 'removeComponent', componentId },
      { op: 'set', path: 'size.height', nodeId: heroId, value: 480 },
    ]);
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nameOf);
    // 5 条删除类，set 那条不许混进来
    expect(gate.approvals).toHaveLength(5);
    expect(gate.approvals.every((a) => a.action === 'delete')).toBe(true);
    expect(gate.approvals.some((a) => a.reason.startsWith('set'))).toBe(false);
    // heldOpCount 是"扣下了多少个 op"，含那条不触发审批的：UI 上要能说清整份结果都没交回
    expect(gate.heldOpCount).toBe(6);
    // 每条都指向得清是哪一处：理由里带名字，不是裸 id 也不是"某个元素"
    expect(gate.approvals.some((a) => a.reason.includes('Hero'))).toBe(true);
    expect(gate.approvals.some((a) => a.reason.includes(tokenKey))).toBe(true);
    expect(gate.approvals.some((a) => a.reason.includes('品牌标志'))).toBe(true);
    // removeComponent 的 id 不在 nodeId/assetId 那一串里，漏掉就只剩一个裸 uuid 或者含糊的"这一处"
    expect(gate.approvals.some((a) => a.reason.startsWith('removeComponent') && a.reason.includes('定价卡片'))).toBe(true);
    expect(gate.approvals.some((a) => a.reason.includes(componentId))).toBe(false);
    // removePage 带的是页 id：理由里要写成"整页"，不是裸 uuid，也不是含糊的"这一处"
    expect(gate.approvals.some((a) => a.reason.startsWith('removePage') && a.reason.includes('整页'))).toBe(true);
    expect(gate.approvals.some((a) => a.reason.includes(pageId))).toBe(false);
    // 这一份是"provider 一条 approvals 都没报"的情形——web 自己扫出来的，门照样在
    expect(response.approvals).toEqual([]);
  });

  it('脏 op（null / 未知 op 名）不崩也不被说成高危', () => {
    const { document, heroId } = namingDoc();
    const nameOf = nodeNamer(document);
    // 过契约的那条路不会有 null（PatchOpSchema 挡着），所以这里直接喂纯函数：
    // 门读的是库里的 jsonb，那一份可能来自改格式之前
    const dirty = [
      { pageId: 'p_home', ops: [{ op: 'remove', nodeId: heroId }, null, { op: 'frobnicate' }, { op: 'remove' }] },
    ] as unknown as DesignPatchPayload[];
    const out = destructiveActions(dirty, WEB_APPROVAL_POLICY, nameOf);
    // 只有那条真有 nodeId 的 remove 正常报名字；缺 nodeId 的那条仍然拦（它确实要删东西），
    // 理由退回这一份补丁所属的页——是"哪一处的删除"，不是"某个元素"
    expect(out.map((a) => a.reason)).toEqual(['remove → Hero', 'remove → p_home']);
  });

  it('provider 报了的那条并进来、重复的只留一条', () => {
    const { document, heroId } = namingDoc();
    const nameOf = nodeNamer(document);
    const response = respWith([{ op: 'remove', nodeId: heroId }], {
      approvals: [
        { action: 'delete', reason: 'provider 说的那一条' },
        { action: 'delete', reason: 'provider 说的那一条' },
      ],
    });
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nameOf);
    expect(gate.approvals.filter((a) => a.reason === 'provider 说的那一条')).toHaveLength(1);
    expect(gate.approvals).toHaveLength(2); // 1 条 provider + 1 条 web 自己扫的
  });

  it('反向对照：策略里没有 delete 时什么都不拦，交回的是原对象', () => {
    const { document, heroId } = namingDoc();
    const nameOf = nodeNamer(document);
    const response = respWith([{ op: 'remove', nodeId: heroId }]);
    expect(destructiveActions(response.patches, [], nameOf)).toEqual([]);
    const gate = gateResponse(response, [], nameOf);
    expect(gate.approvals).toEqual([]);
    expect(gate.delivered).toBe(response);
    expect(gate.delivered.patches).toHaveLength(1);
    expect(gate.delivered.error).toBeUndefined();
  });

  it('挂起时抽走补丁，但存下的还是完整那一版（扣留不是删掉）', () => {
    const { document, heroId } = namingDoc();
    const response = respWith([{ op: 'remove', nodeId: heroId }]);
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nodeNamer(document));
    expect(gate.delivered.patches).toEqual([]);
    expect(gate.delivered.error?.code).toBe('approval-required');
    expect(gate.delivered.explanation).toContain('已挂起 1 个 op');
    expect(gate.held.patches[0]!.ops[0]!.op).toBe('remove');
    expect(heldRecord(gate, WEB_APPROVAL_POLICY).held.patches).toHaveLength(1);
  });

  it('挂起时交回的那一份不许说"已落地"，而存下的那一版一个字不改', () => {
    // 界面上同一屏会同时出现"画布还没有被改动"和 provider 活动流里那句"1 个 op 已落地"——
    // 自相矛盾的说法就是 §159 要挡的东西，所以门改的是**说法**，扣下的补丁本身仍然原样存着
    const { document, heroId } = namingDoc();
    const response = respWith([{ op: 'remove', nodeId: heroId }], {
      plans: [
        {
          goal: '删掉 Hero',
          tasks: [
            { id: 't1', title: '删除 Hero（含 6 个子节点）', agent: 'DesignAgent', status: 'done' },
            { id: 't2', title: '检查引用', agent: 'DesignAgent', status: 'pending' },
          ],
        },
      ],
      activities: [
        { stage: 'plan', status: 'completed', summary: '识别目标节点' },
        { stage: 'apply', status: 'completed', summary: '1 个补丁、1 个 op 已落地' },
      ],
    });
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nodeNamer(document));
    const apply = gate.delivered.activities.filter((a) => a.stage === 'apply');
    expect(apply).toHaveLength(1);
    expect(apply[0]!.summary).toContain('批准之前不会落地');
    expect(JSON.stringify(gate.delivered.activities)).not.toContain('已落地');
    // 别的阶段不动：那是真做过的事
    expect(gate.delivered.activities.some((a) => a.summary === '识别目标节点')).toBe(true);
    expect(gate.delivered.plans[0]!.tasks[0]!.status).toBe('skipped');
    expect(gate.delivered.plans[0]!.tasks[1]!.status).toBe('pending');
    // 反向对照：存的那一版仍然是 provider 原样交回来的那一份，批准之后交回的就是它
    expect(gate.held.activities.some((a) => a.summary === '1 个补丁、1 个 op 已落地')).toBe(true);
    expect(gate.held.plans[0]!.tasks[0]!.status).toBe('done');
    // 没被拦下的那些结果，门不碰它的任何一句话（连对象都是同一个）
    const cleanResp = respWith([{ op: 'set', nodeId: heroId, path: 'name', value: 'X' }], { activities: response.activities });
    expect(gateResponse(cleanResp, WEB_APPROVAL_POLICY, nodeNamer(document)).delivered).toBe(cleanResp);
  });

  it('审批理由读得懂：token / 资产 / 组件 / 整页 / 根节点各有说法，认不出就退回 id', () => {
    const { document, heroId, pageId, rootId, tokenKey, assetId, componentId } = namingDoc();
    const nameOf = nodeNamer(document);
    expect(nameOf(heroId)).toContain('Hero');
    expect(nameOf(tokenKey)).toContain('设计 token');
    expect(nameOf(assetId)).toContain('资产');
    expect(nameOf(componentId)).toContain('组件');
    expect(nameOf(pageId)).toContain('整页');
    // 根节点要说清"删除等于清空整页"，否则卡片上那句"删除 页面"会让人觉得它和删页脚同量级
    expect(nameOf(rootId)).toContain('清空这一页');
    // 认不出就 null，由调用方退回 id：不编一个"某个元素"
    expect(nameOf('n_不存在')).toBe(null);
    expect(nameOf(undefined)).toBe(null);
  });
});

describe('§73 的越权拒收：被点名的人没有 design.patch', () => {
  const QA = { name: 'QA Agent', capabilities: ['browser.read', 'test.run'] };
  const DESIGN = { name: 'Design Agent', capabilities: ['design.read', 'design.patch'] };
  const removeHero = () => namingDoc();

  it('QA 给出删除 op：拒收（permission-denied），而且不是一条 approvals', () => {
    const { document, heroId } = removeHero();
    const response = respWith([{ op: 'remove', nodeId: heroId }]);
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nodeNamer(document), QA);
    expect(gate.refused).toEqual({ agent: 'QA Agent', opCount: 1 });
    // 这一条是 §73 与 §74 的分界：挂起问的是"要不要让它落地"，而名册说的是"这一位不能落地"。
    // 若这里给出 approvals，界面上就出现一句"批准 QA 去改画布"——那是名册没有的承诺
    expect(gate.approvals).toEqual([]);
    expect(gate.delivered.error?.code).toBe('permission-denied');
    expect(gate.delivered.error?.message).toContain('QA Agent');
    expect(gate.heldOpCount).toBe(0);
    expect(gate.delivered.patches).toEqual([]);
    // 拒收不销毁证据：held 还是 provider 原样交回的那一份
    expect(gate.held).toBe(response);
  });

  it('非删除的 op 同样要权限：改名字也是改设计文档', () => {
    const { document, heroId } = removeHero();
    const gate = gateResponse(respWith([{ op: 'set', nodeId: heroId, path: 'name', value: 'X' }]), WEB_APPROVAL_POLICY, nodeNamer(document), QA);
    // 只看删除 op 的那一版实现会在这里放行：一条 set 就绕过了 §73
    expect(gate.refused?.opCount).toBe(1);
    expect(gate.delivered.patches).toEqual([]);
  });

  it('QA 只提意见（一个 op 都没有）：不拒，也不假装拦过什么', () => {
    const { document } = removeHero();
    const response = resp({ explanation: '这一处对比度不够。' });
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nodeNamer(document), QA);
    // 这是 §73 的反面：没权限 = 不能改画布，不是不能说话。拒一条空结果会把 QA 的检查报告也吞掉
    expect(gate.refused).toBeUndefined();
    expect(gate.approvals).toEqual([]);
    expect(gate.delivered).toBe(response);
  });

  it('Design 给出删除 op：§73 放行，随后仍被 §74 挂起（两道门不互相顶掉）', () => {
    const { document, heroId } = removeHero();
    const gate = gateResponse(respWith([{ op: 'remove', nodeId: heroId }]), WEB_APPROVAL_POLICY, nodeNamer(document), DESIGN);
    expect(gate.refused).toBeUndefined();
    expect(gate.delivered.error?.code).toBe('approval-required');
    expect(gate.approvals.map((a) => a.action)).toEqual(['delete']);
    expect(gate.heldOpCount).toBe(1);
  });

  it('没点名：门照旧只问审批，不会因为名册读不到就把请求当成越权', () => {
    const { document, heroId } = removeHero();
    const response = respWith([{ op: 'remove', nodeId: heroId }]);
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nodeNamer(document), null);
    expect(gate.refused).toBeUndefined();
    expect(gate.delivered.error?.code).toBe('approval-required');
    // 与"没有 agent 参数"的旧调用同形：同步路径没点名时走的就是这一条
    expect(gateResponse(response, WEB_APPROVAL_POLICY, nodeNamer(document)).approvals).toEqual(gate.approvals);
  });

  it('拒收交回的那一份不许说"已落地"（与挂起共用同一处措辞改写）', () => {
    const { document, heroId } = removeHero();
    const response = respWith([{ op: 'remove', nodeId: heroId }], {
      plans: [{ goal: '删掉 Hero', tasks: [{ id: 't1', title: '删除 Hero', agent: 'QA Agent', status: 'done' }] }],
      activities: [
        { stage: 'agent', status: 'completed', summary: 'QA Agent（检查结果是否满足验收）' },
        { stage: 'apply', status: 'completed', summary: '1 个补丁、1 个 op 已落地' },
      ],
    });
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nodeNamer(document), QA);
    const apply = gate.delivered.activities.filter((a) => a.stage === 'apply');
    expect(apply).toHaveLength(1);
    expect(apply[0]!.summary).toContain('未交回');
    expect(JSON.stringify(gate.delivered.activities)).not.toContain('已落地');
    // agent 那一行留着：谁被点了名，界面上要看得到
    expect(gate.delivered.activities.some((a) => a.stage === 'agent' && a.summary.includes('QA Agent'))).toBe(true);
    expect(gate.delivered.plans[0]!.tasks[0]!.status).toBe('skipped');
    expect(gate.delivered.explanation).toContain('QA Agent 的职责里没有');
    // 存的那一版一个字没改
    expect(gate.held.activities.some((a) => a.summary === '1 个补丁、1 个 op 已落地')).toBe(true);
  });

  it('真路径：@qa 的删除指令被门拒掉，账本落 failed 而不是"等人决定"', async () => {
    const assembled = await assembleAiRequest(
      { requestId: 'req_refuse', intent: 'design-edit', prompt: '@qa 删除 Hero 区块', modelClass: 'balanced', variants: 1, references: [], approvalPolicy: [], dryRun: false, context: { projectId, selection: [], recentChanges: [] } },
      ownerId,
    );
    if (!assembled.ok) throw new Error(`装配失败：${assembled.message}`);
    expect(assembled.wire.agent?.key).toBe('qa');

    const response = await mockProvider.run(assembled.wire, { document: assembled.toolDocument });
    expect(response.patches.flatMap((p) => p.ops).some((op) => op.op === 'remove')).toBe(true);
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nodeNamer(assembled.toolDocument), assembled.agent.agent);
    expect(gate.refused?.agent).toBe('QA Agent');
    expect(gate.approvals).toEqual([]);
    // 拒收的那一份不构成立得住的挂起现场：approvals 空、heldOpCount 0。
    // 所以路由必须写 failed——挂上去只会得到一条"有 0 件事要批准、永远等不到裁决"的行
    expect(gate.heldOpCount).toBe(0);

    const started = await startTask({ projectId, agentKey: 'qa', createdById: ownerId, capability: 'demo', input: { prompt: '@qa 删除 Hero 区块' } });
    taskIds.push(started.id);
    await finishTask(started.id, { ok: false, error: `${gate.refused?.agent} 没有 design.patch：${gate.refused?.opCount} 个 op 未交回` });
    const view = await getTask(started.id);
    expect(view?.status).toBe('failed');
    expect(view?.requiresApproval).toBe(false);
    expect(view?.error).toContain('design.patch');
    expect(await listPendingApprovals(projectId, ownerId)).toEqual([]);
  });
});

describe('真路径：DEMO 生成 → 装配 → 门 → 挂起（打真实 Postgres）', () => {

  async function runDeletePrompt(prompt = '删除 Hero 区块') {
    // 请求方自己填 approvalPolicy: [] —— 这一栏必须被服务端改写，否则"这次不要审批"就是客户端勾的
    const request: AiRequest = {
      requestId: 'req_approval_gate',
      intent: 'design-edit',
      prompt,
      modelClass: 'balanced',
      variants: 1,
      references: [],
      approvalPolicy: [],
      dryRun: false,
      context: { projectId, selection: [], recentChanges: [] },
    };
    const assembled = await assembleAiRequest(request, ownerId);
    if (!assembled.ok) throw new Error(`装配失败：${assembled.message}`);
    expect(assembled.wire.approvalPolicy).toEqual([...WEB_APPROVAL_POLICY]);

    const response = await mockProvider.run(assembled.wire, { document: assembled.toolDocument });
    const gate = gateResponse(response, WEB_APPROVAL_POLICY, nodeNamer(assembled.toolDocument));
    const started = await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: ownerId,
      capability: 'demo',
      input: { prompt, approvalPolicy: WEB_APPROVAL_POLICY },
    });
    taskIds.push(started.id);
    const held = await holdForApproval(started.id, heldRecord(gate, WEB_APPROVAL_POLICY));
    return { started, gate, held, response };
  }

  it('DEMO 的删除指令确实产出删除 op，而且被门拦下', async () => {
    const { gate, held, response } = await runDeletePrompt();
    // 先证明门有的可拦：mock 真的给出了 remove op
    expect(response.patches.flatMap((p) => p.ops).some((op) => op.op === 'remove')).toBe(true);
    expect(gate.approvals.length).toBeGreaterThan(0);
    expect(gate.approvals[0]!.reason).toContain('Hero');
    expect(held).toBe(true);
  });

  it('挂起不是终态：行有 requiresApproval，但没有 finishedAt 也没有时长', async () => {
    const { started } = await runDeletePrompt();
    const view = await getTask(started.id);
    expect(view?.status).toBe('awaiting_approval');
    expect(view?.requiresApproval).toBe(true);
    expect(view?.finishedAt).toBe(null);
    expect(view?.durationMs).toBe(null);
    const row = await rawTask(started.id);
    expect(row.approvedBy).toBe(null);
    expect(row.approvedAt).toBe(null);
    // §164 的 Generation complete 要有真终态才发得出来；这行现在既没 succeeded 也没 failed
    expect(row.status).toBe('awaiting_approval');
  });

  it('读侧不泄露被扣下的补丁：卡片只说"有几处要决定"', async () => {
    const { started, gate } = await runDeletePrompt();
    const card = await readApprovalTask(started.id, ownerId);
    expect(card?.approvals).toHaveLength(gate.approvals.length);
    expect(card?.heldOpCount).toBe(gate.heldOpCount);
    expect(card?.status).toBe('awaiting_approval');
    // 现场里有"要决定什么"（approvals 的措辞），但没有能落地的正文：
    // op 列表、补丁数组、被删节点的 id 一样都不出现在读侧
    const heldNodeId = (gate.held.patches[0]?.ops[0] as { nodeId?: string } | undefined)?.nodeId;
    expect(heldNodeId).toBeTruthy();
    const json = JSON.stringify(card);
    expect(json).not.toContain('"ops"');
    expect(json).not.toContain('"patches"');
    expect(json).not.toContain(heldNodeId as string);
    const list = await listPendingApprovals(projectId, ownerId);
    expect(list.some((item) => item.taskId === started.id)).toBe(true);
    // 别人的项目、同一个项目里的别人：一条都不给
    expect(await listPendingApprovals(projectId, otherId)).toEqual([]);
    expect(await readApprovalTask(started.id, otherId)).toBe(null);
  });

  it('批准交回的是被扣下的那一版，第二次决定不算数', async () => {
    const { started, gate } = await runDeletePrompt();
    const first = await decideApproval(started.id, ownerId, 'approve', '203.0.113.7');
    if (!first.ok) throw new Error(`批准失败：${first.message}`);
    expect(first.status).toBe('succeeded');
    // 批准的凭据是"看过这一版"：交回的必须是当初那份完整结果，逐字相等
    expect(first.held).toEqual(gate.held);
    expect((first.held as AiResponse).patches.flatMap((p) => p.ops).some((op) => op.op === 'remove')).toBe(true);
    expect((await getTask(started.id))?.status).toBe('succeeded');
    const row = await rawTask(started.id);
    expect(row.approvedBy).toBe(ownerId);
    expect(row.approvedAt).not.toBeNull();
    expect((row.result as { decision?: { decision?: string } }).decision?.decision).toBe('approve');

    // 两个标签页都点了批准：第二次既不改动也不刷时间
    const approvedAt = row.approvedAt!.getTime();
    const second = await decideApproval(started.id, ownerId, 'reject');
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('第二次决定不该算数');
    expect(second.code).toBe('not_pending');
    const after = await rawTask(started.id);
    expect(after.approvedAt!.getTime()).toBe(approvedAt);
    expect(after.status).toBe('succeeded');

    const audits = await getDb()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'ai.approval.decide'), eq(auditEvents.targetId, started.id)));
    expect(audits.filter((item) => item.allowed)).toHaveLength(1);
    // 被拒绝的那一次尝试连审计都不该写：它连"这是你的任务"都没通过判断
    expect(audits.length).toBe(1);
  });

  it('两个标签页同时点批准：只有一次真的写下去', async () => {
    const { started } = await runDeletePrompt();
    const outcomes = await Promise.all([
      decideApproval(started.id, ownerId, 'approve'),
      decideApproval(started.id, ownerId, 'approve'),
    ]);
    // 这一条测的是并发那一档：两次读取可能都还看到 awaiting_approval，
    // 所以"只认等待态"必须写在 WHERE 里，而不只是写在读之后的 if 里
    expect(outcomes.filter((out) => out.ok)).toHaveLength(1);
    const row = await rawTask(started.id);
    expect(row.status).toBe('succeeded');
    const audits = await getDb()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'ai.approval.decide'), eq(auditEvents.targetId, started.id)));
    expect(audits.filter((item) => item.allowed)).toHaveLength(1);
  });

  it('放弃：任务取消、补丁不交回，也不往"谁批准了"那两列里写东西', async () => {
    const { started } = await runDeletePrompt();
    const out = await decideApproval(started.id, ownerId, 'reject');
    if (!out.ok) throw new Error(`放弃失败：${out.message}`);
    expect(out.status).toBe('cancelled');
    expect(out.held).toBe(null);
    expect((out.approvals as unknown[]).length).toBeGreaterThan(0);
    const row = await rawTask(started.id);
    expect(row.status).toBe('cancelled');
    // 拒绝填上 approved_by 就是往审计里塞一条反的
    expect(row.approvedBy).toBe(null);
    expect(row.approvedAt).toBe(null);
    expect((row.result as { decision?: { decision?: string } }).decision?.decision).toBe('reject');
    // 已经取消的行不再出现在等待裁决的列表里
    expect((await listPendingApprovals(projectId, ownerId)).some((item) => item.taskId === started.id)).toBe(false);
  });

  it('替别人批准：与"没这条任务"同一个答案，并且留一条 allowed:false 的现场', async () => {
    const { started } = await runDeletePrompt();
    const out = await decideApproval(started.id, otherId, 'approve', '203.0.113.9');
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('别人的任务不该被批准');
    expect(out.code).toBe('not_found');
    // 任务本身没被动过：还是等待态，还是没批准人
    const row = await rawTask(started.id);
    expect(row.status).toBe('awaiting_approval');
    expect(row.approvedBy).toBe(null);
    const audits = await getDb()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'ai.approval.decide'), eq(auditEvents.targetId, started.id)));
    expect(audits.filter((item) => !item.allowed)).toHaveLength(1);

    // 真正的主人接着批准它：别人的失败尝试没有把这条任务弄坏
    const mine = await decideApproval(started.id, ownerId, 'approve');
    expect(mine.ok).toBe(true);
  });

  it('任务号乱填与不存在的 uuid：都是"没这条任务"，不去打库也不 500', async () => {
    const out = await decideApproval('not-a-uuid', ownerId, 'approve');
    expect(out).toMatchObject({ ok: false, code: 'not_found' });
    expect(await listPendingApprovals('not-a-uuid', ownerId)).toEqual([]);
    expect(await readApprovalTask('not-a-uuid', ownerId)).toBe(null);
  });

  it('终态行不许被回溯成"等审批"，也没人裁决一条没挂起的任务', async () => {
    const started = await startTask({ projectId, agentKey: 'design-edit', createdById: ownerId, capability: 'demo', input: {} });
    taskIds.push(started.id);
    await finishTask(started.id, { ok: true, result: { detail: '这次没有高危动作' } });
    const held = await holdForApproval(started.id, { held: resp(), approvals: [], policy: ['delete'], heldOpCount: 0 });
    expect(held).toBe(false);
    const view = await getTask(started.id);
    expect(view?.status).toBe('succeeded');
    expect(view?.requiresApproval).toBe(false);

    const out = await decideApproval(started.id, ownerId, 'approve');
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('没挂起过的任务不该能被"批准"');
    expect(out.code).toBe('not_pending');
  });
});

/**
 * §74 的最后一格：等待要有到期。
 *
 * 造"已经等了很久"的方式是**直接写 `awaiting_since`**，而不是把 TTL 改小、也不是注入一个假时钟：
 * 这一片要证的正是"到期判定读的就是那一列"，所以最省事的作假路径恰好是要防的那一条——
 * 改 TTL 会让"服务端与卡片上说的是同一个数"这句话没被测到，假时钟会让 0021 那条 CHECK 没被测到。
 * 直接写列意味着：如果哪一天判定改去看别的列，这些用例会全红而不是静默通过。
 */
describe('§74 的到期：没人裁决的挂起不会永远等下去（打真实 Postgres）', () => {
  /** 挂起一条真任务，然后把它的时间戳按 `agedMs` 拨旧 */
  async function holdAged(agedMs: number): Promise<string> {
    const started = await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: ownerId,
      capability: 'demo',
      input: { prompt: '删除 Hero 区块' },
    });
    taskIds.push(started.id);
    const approvals = [{ action: 'delete', reason: 'remove → Hero' }];
    const ok = await holdForApproval(started.id, {
      held: respWith([{ op: 'remove', nodeId: 'n_hero' }]),
      delivered: resp({ approvals, patches: [] }),
      approvals,
      policy: WEB_APPROVAL_POLICY,
      heldOpCount: 1,
    });
    if (!ok) throw new Error('挂起没写下去');
    if (agedMs) {
      await getDb()
        .update(agentTasks)
        .set({ awaitingSince: new Date(Date.now() - agedMs) })
        .where(eq(agentTasks.id, started.id));
    }
    return started.id;
  }

  /** 差一分钟就到期 / 已过一分钟。两边都留足余量，免得跑测试的机器把自己跑成边界 */
  const ALMOST = APPROVAL_TTL_MS - 60_000;
  const OVERDUE = APPROVAL_TTL_MS + 60_000;

  it('挂起那一刻被记下：awaiting_since 有值，卡片上的截止时间等于它加 TTL', async () => {
    const id = await holdAged(0);
    const row = await rawTask(id);
    expect(row.awaitingSince).toBeInstanceOf(Date);
    const card = await readApprovalTask(id, ownerId);
    // 服务端算的那一栏与库里那一列对得上（客户端不再自己算一遍，也就不各算各的）
    expect(card?.expiresAt).toBe(new Date(row.awaitingSince!.getTime() + APPROVAL_TTL_MS).toISOString());
    expect(card?.awaitingSince).toBe(row.awaitingSince!.toISOString());
    expect(card?.status).toBe('awaiting_approval');
  });

  it('边界由那一列与 APPROVAL_TTL_MS 说了算：差 1 毫秒不算过期，正好等于就算', () => {
    // 时效本身是对外承诺的一句话（卡片上写的就是这个数），所以把它钉在这里：
    // 有人悄悄改常量又不改文档，这条会红，而不是让界面上的"24 小时"变成一句旧话
    expect(APPROVAL_TTL_MS).toBe(24 * 60 * 60 * 1000);
    const since = new Date('2026-06-01T00:00:00.000Z');
    const at = (deltaMs: number) => approvalExpired({ status: 'awaiting_approval', awaitingSince: since }, new Date(since.getTime() + deltaMs));
    expect(at(APPROVAL_TTL_MS - 1)).toBe(false);
    expect(at(APPROVAL_TTL_MS)).toBe(true);
    expect(at(APPROVAL_TTL_MS + 1)).toBe(true);
    // 反向对照：不是等待态、或者没有时间戳，都不该被这一片改动
    expect(approvalExpired({ status: 'running', awaitingSince: since }, new Date(since.getTime() + APPROVAL_TTL_MS * 10))).toBe(false);
    expect(approvalExpired({ status: 'awaiting_approval', awaitingSince: null }, new Date(since.getTime() + APPROVAL_TTL_MS * 10))).toBe(false);
  });

  it('还没到期：列表里还在，批准照样生效', async () => {
    const id = await holdAged(ALMOST);
    expect((await listPendingApprovals(projectId, ownerId)).some((item) => item.taskId === id)).toBe(true);
    const out = await decideApproval(id, ownerId, 'approve');
    if (!out.ok) throw new Error(`差一分钟到期就不该拒：${out.message}`);
    expect(out.status).toBe('succeeded');
    // 批准交回的还是当初那份补丁（到期这一格不能顺手把内容换成重新生成）
    expect((out.held as AiResponse | null)?.patches?.[0]?.ops).toEqual([{ op: 'remove', nodeId: 'n_hero' }]);
  });

  it('过期之后读列表就不出现了，行自己变成 cancelled，且没有批准人', async () => {
    const id = await holdAged(OVERDUE);
    const list = await listPendingApprovals(projectId, ownerId);
    expect(list.some((item) => item.taskId === id)).toBe(false);
    const row = await rawTask(id);
    expect(row.status).toBe('cancelled');
    expect(row.error).toContain(APPROVAL_EXPIRED_NOTE);
    // 那句理由里的时长与卡片上那句出自同一个函数（两处各写一遍就会漂移）
    expect(row.error).toContain(`${ttlLabel(APPROVAL_TTL_MS)}无人裁决`);
    // 过期不等于有人点了放弃：那两列必须还是空的，否则审计里就多出一个不存在的人
    expect(row.approvedBy).toBe(null);
    expect(row.approvedAt).toBe(null);
    // requires_approval 留真：这一行确实是走过审批门挂起来的，作废的是"还能被批准"，不是它的来历
    expect(row.requiresApproval).toBe(true);
    expect(row.finishedAt).toBeInstanceOf(Date);
    // 读单条也要说同一句话：状态是 cancelled，截止时间不再给（没有还要等多久这回事）
    const card = await readApprovalTask(id, ownerId);
    expect(card?.status).toBe('cancelled');
    expect(card?.expiresAt).toBe(null);
  });

  it('过期之后点批准：补丁不交回、不扣点，留一条 allowed:false 的现场', async () => {
    const id = await holdAged(OVERDUE);
    const out = await decideApproval(id, ownerId, 'approve', '203.0.113.11');
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('已过期的挂起结果被批准了——那正是 §74 到期这一格要挡的事');
    expect(out.code).toBe('not_pending');
    expect(out.message).toContain('已作废');
    expect(out.message).toContain('没有生效');
    const row = await rawTask(id);
    expect(row.status).toBe('cancelled');
    expect(row.approvedBy).toBe(null);
    const audits = await getDb()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'ai.approval.decide'), eq(auditEvents.targetId, id)));
    expect(audits.filter((item) => !item.allowed)).toHaveLength(1);
    expect((audits.find((item) => !item.allowed)?.detail as { reason?: string }).reason).toBe('expired');
    // §134：批准才扣点，过期没扣——一条"到期还在扣点"的账是白收钱
    expect(await getDb().select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.taskId, id))).toHaveLength(0);
  });

  it('只走单条读那一路也会收敛：没有人读过列表，过期的一行同样不会永远挂着', async () => {
    // 这一条是专门为"每个入口都要收敛一次"那句注释写的：如果收敛只挂在列表那一路，
    // 这一条会绿不下去——而任务页/重开的工作台读的正是单条那一路。
    const id = await holdAged(OVERDUE);
    const card = await readApprovalTask(id, ownerId);
    expect(card?.status).toBe('cancelled');
    expect(card?.expiresAt).toBe(null);
    expect((await rawTask(id)).status).toBe('cancelled');
  });

  it('收敛是幂等的：第二次读不再动那一行，也不写第二个 finishedAt', async () => {
    const id = await holdAged(OVERDUE);
    expect(await convergeExpiredApproval(id)).toBe(true);
    const first = await rawTask(id);
    expect(await convergeExpiredApproval(id)).toBe(false);
    expect(await listPendingApprovals(projectId, ownerId)).not.toEqual(expect.arrayContaining([expect.objectContaining({ taskId: id })]));
    const second = await rawTask(id);
    expect(second.finishedAt?.getTime()).toBe(first.finishedAt?.getTime());
    expect(second.status).toBe('cancelled');
  });

  it('已决定的行没有"到期"这回事：截止时间那一栏是空的，拨旧也不会被收敛改动', async () => {
    const id = await holdAged(ALMOST);
    const out = await decideApproval(id, ownerId, 'reject');
    if (!out.ok) throw new Error(`放弃失败：${out.message}`);
    const card = await readApprovalTask(id, ownerId);
    expect(card?.status).toBe('cancelled');
    expect(card?.expiresAt).toBe(null);

    // 批准之后再把挂起时刻拨到过期之后：一条已经成功的行不能被回溯成 cancelled
    const okId = await holdAged(ALMOST);
    const approved = await decideApproval(okId, ownerId, 'approve');
    if (!approved.ok) throw new Error(`批准失败：${approved.message}`);
    await getDb()
      .update(agentTasks)
      .set({ awaitingSince: new Date(Date.now() - OVERDUE) })
      .where(eq(agentTasks.id, okId));
    expect(await convergeExpiredApproval(okId)).toBe(false);
    const after = await rawTask(okId);
    expect(after.status).toBe('succeeded');
    expect(after.error).toBe(null);
    expect((await readApprovalTask(okId, ownerId))?.expiresAt).toBe(null);
  });

  /** 这一条挂起在收件箱里留下了几条"过期作废"（写侧的键就挂在这里） */
  async function approvalNotices(taskId: string) {
    return getDb()
      .select({
        id: notifications.id,
        kind: notifications.kind,
        title: notifications.title,
        body: notifications.body,
        link: notifications.link,
        userId: notifications.userId,
      })
      .from(notifications)
      .where(eq(notifications.dedupeKey, `approval:${taskId}`));
  }

  /**
   * 取"这一次挂起在收件箱里留下的那一条"。条数不对就在这里抛，而不是让下面八行去读一个
   * `rows[0]` 可能不存在的字段——vitest 的 `expect(rows.length).toBe(1)` 不向 tsc 收窄（同一批用例里
   * TS2532 红过十处），而"应当只有一条"本身就是这些用例在问的那句话。
   */
  async function approvalNotice(taskId: string) {
    const rows = await approvalNotices(taskId);
    const [row] = rows;
    if (!row || rows.length !== 1)
      throw new Error(
        `键 approval:${taskId} 在收件箱里应当且只应当留下一条，实际 ${rows.length} 条${rows.length === 0 ? '（一条都没写进去）' : ''}`,
      );
    return row;
  }

  it('过期这件事会进收件箱：恰好一条，说的是"作废"而不是"被放弃"', async () => {
    const id = await holdAged(OVERDUE);
    const seen: RealtimeEvent[] = [];
    const off = getRealtimeBus().subscribe(channels.user(ownerId), (event) => seen.push(event));
    await listPendingApprovals(projectId, ownerId);
    off();

    const notice = await approvalNotice(id);
    expect(notice.kind).toBe('approval');
    // 收件人是发起请求的人，不是"当时碰巧打开面板的人"
    expect(notice.userId).toBe(ownerId);
    expect(notice.title).toContain('过期作废');
    expect(notice.title).toContain(`${ttlLabel(APPROVAL_TTL_MS)}未裁决`);
    expect(notice.title).toContain('扣下 1 处');
    expect(notice.body).toBe(APPROVAL_EXPIRED_NOTE);
    expect(notice.link).toBe(`/studio/${projectId}`);
    // 实时那一路也出声：真的写进库的那一条才推，而且推给收件人自己的频道
    expect(seen.filter((e) => e.type === 'notification' && (e.title ?? '').includes('过期作废')).length).toBe(1);
    // 读回来是"审批作废"这一类而不是"未分类"——读写两侧共用同一份名单
    expect((await inbox(ownerId, 30)).items.find((i) => i.title.includes('过期作废'))?.kind).toBe('approval');
  });

  it('四条读路径都问过一次，收件箱里仍然只有一条：出声的是 CAS 赢家', async () => {
    const id = await holdAged(OVERDUE);
    await listPendingApprovals(projectId, ownerId);
    await readApprovalTask(id, ownerId);
    const out = await decideApproval(id, ownerId, 'approve');
    expect(out.ok).toBe(false);
    expect(await convergeExpiredApproval(id)).toBe(false);
    expect((await approvalNotices(id)).length).toBe(1);
  });

  it('三种不出声的情形：还没到期、人自己放弃了、创建者查不到（但状态照样收敛）', async () => {
    const almost = await holdAged(ALMOST);
    await readApprovalTask(almost, ownerId);
    expect((await approvalNotices(almost)).length).toBe(0);

    const givenUp = await holdAged(0);
    const out = await decideApproval(givenUp, ownerId, 'reject');
    expect(out.ok).toBe(true);
    expect((await approvalNotices(givenUp)).length).toBe(0);

    const orphan = await holdAged(OVERDUE);
    await getDb().update(agentTasks).set({ createdById: null }).where(eq(agentTasks.id, orphan));
    expect(await convergeExpiredApproval(orphan)).toBe(true);
    expect((await rawTask(orphan)).status).toBe('cancelled');
    expect((await approvalNotices(orphan)).length).toBe(0);

    // 正面对照：同一个计数读得到真写过的那一条——否则上面三个 0 只是"根本没在数"
    const rang = await holdAged(OVERDUE);
    expect(await convergeExpiredApproval(rang)).toBe(true);
    expect((await approvalNotices(rang)).length).toBe(1);
  });

  /**
   * 这一条与单元里那句"读不出来就不说个数"是**同一句话的两个半边**：
   * 单元那侧只搭了一个 `approvalCount: null` 的事件给规则，毁掉服务端"什么时候给 null"
   * 那一条臂真的跑过之后仍然全绿（第一遍就是这个结果），因为生产端与消费端没在同一个用例里见过面。
   * 所以这里走真路径：把挂起那一版的结果换成没有 `approvals` 数组的形状——
   * 那正是"另一个写入方/更早的数据形态"会留下的行。
   */
  it('挂起那一版读不出扣下的处数时，服务端就喂 null 而不是 0（界面上"扣下 0 处"是假话）', async () => {
    const id = await holdAged(OVERDUE);
    await getDb().update(agentTasks).set({ result: { note: '这一版里没有 approvals 数组' } }).where(eq(agentTasks.id, id));
    expect(await convergeExpiredApproval(id)).toBe(true);

    const notice = await approvalNotice(id);
    expect(notice.title).toContain('过期作废');
    expect(notice.title).not.toContain('扣下');

    // 反向对照：同一套代码、同一张表，数读得出的那一行必须说出"扣下 1 处"。
    // 少了这一半，上面那句 not.toContain 只是"根本没写数字"，不是"读不出来所以不说"。
    const counted = await holdAged(OVERDUE);
    expect(await convergeExpiredApproval(counted)).toBe(true);
    expect((await approvalNotice(counted)).title).toContain('扣下 1 处');
  });

  it('库里那一把锁：绕过 holdForApproval 直接写等待态会被 CHECK 打回', async () => {
    const started = await startTask({ projectId, agentKey: 'design-edit', createdById: ownerId, capability: 'demo', input: {} });
    taskIds.push(started.id);
    // 正面：带挂起时刻的写法能过（否则下面那条拒绝只是"约束把整张表写死了"）
    await getDb()
      .update(agentTasks)
      .set({ status: 'awaiting_approval', requiresApproval: true, awaitingSince: new Date() })
      .where(eq(agentTasks.id, started.id));
    expect((await rawTask(started.id)).status).toBe('awaiting_approval');
    // 反面：同一行、同一状态、只把挂起抹成不带时间——正是"将来多出一个绕过 holdForApproval 的写入方"的形态
    const other = await startTask({ projectId, agentKey: 'design-edit', createdById: ownerId, capability: 'demo', input: {} });
    taskIds.push(other.id);
    let failure: { code?: string; message?: string; cause?: { code?: string; message?: string } } | null = null;
    try {
      await getDb().update(agentTasks).set({ status: 'awaiting_approval', requiresApproval: true }).where(eq(agentTasks.id, other.id));
    } catch (error) {
      // postgres-js 会把驱动报的那条错包一层：外层只有"Failed query + 参数"，
      // 约束名与 SQLSTATE 在 cause 上。只看 message 会测到包装，而不是挡下这一笔的那一道约束。
      failure = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    }
    // 先证明"确实拒了"再读它的内容：写成 expect(...).not.toBeNull() 时 tsc 不认识这层收窄，
    // 而这一条若没抛异常，下面的 code/约束名断言读的是一个根本不存在对象。
    if (!failure) throw new Error('绕过 holdForApproval 直接写等待态必须被库挡下来，但这一笔 update 成功了');
    const code = failure.code ?? failure.cause?.code;
    const text = `${failure.message ?? ''} ${failure.cause?.message ?? ''}`;
    expect(code).toBe('23514'); // check_violation
    expect(text).toContain('agent_tasks_awaiting_has_since');
    expect((await rawTask(other.id)).status).toBe('running');
  });
});
