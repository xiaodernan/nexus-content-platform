import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { AgentRosterSchema, type AiRequest } from '@nexus/schemas';
import { assembleAiRequest } from '../src/server/ai/assemble';
import { mockProvider } from '../src/server/ai/mock';
import { addAnnotation } from '../src/server/domain/annotations';
import { loadRoster } from '../src/server/domain/agents';
import { createProject, loadDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §112/§113 的第一片打真库：名册是 `scripts/db-seed.mts` 写进去的 13 行，
 * 而"@qa 看一下这个按钮"要变成 provider 听到的那一句、变成 §73 那道门读到的那一份权限，
 * 中间经过的是装配 + 解析 + 名册三段——桩数据在这里任何一段都能骗过去。
 *
 * 这一组尤其要盯住"提名 vs 自报"那条线：客户端能说的只有 agentKey 和提示词里的 @xxx，
 * 职责与 capabilities 必须是服务端从库里查出来的那一份。
 */

let owner: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const rows = await db
    .insert(users)
    .values([{ displayName: 'Agents Owner', email: `agents+${Date.now()}@nexus.test` }])
    .returning({ id: users.id });
  owner = rows[0]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(owner, { name, kind: 'website' })).id;
}

function aiRequest(projectId: string, prompt: string, extra: Partial<AiRequest> = {}): AiRequest {
  return {
    requestId: 'req_agents_test',
    intent: 'design-edit',
    prompt,
    modelClass: 'balanced',
    variants: 1,
    references: [],
    approvalPolicy: [],
    dryRun: false,
    context: { projectId, selection: [], recentChanges: [] },
    ...extra,
  };
}

describe('§112 名册：读出来的是播种的那一份', () => {
  it('13 个在册 Agent，职责非空，按 key 排序', async () => {
    const roster = await loadRoster();
    expect(roster.map((r) => r.key)).toEqual([...roster.map((r) => r.key)].sort());
    expect(roster.length).toBe(13);
    // §112 那句话要有内容：职责为空的名册等于把"每个 Agent 有自己的职责"发成一个空数组
    for (const entry of roster) {
      expect(entry.responsibilities.length, `${entry.key} 没有职责`).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
    }
    // 报文形状由契约管着：/api/ai/agents 就是 parse 这一份
    expect(AgentRosterSchema.safeParse({ agents: roster }).success).toBe(true);
  });

  it('design 有 design.patch、qa 没有：§73 那一道门读的就是这一栏', async () => {
    const roster = await loadRoster();
    expect(roster.find((r) => r.key === 'design')?.capabilities).toContain('design.patch');
    expect(roster.find((r) => r.key === 'qa')?.capabilities ?? []).not.toContain('design.patch');
  });
});

describe('提名可以，自报职责不行（§112 与 §68 是同一条边界）', () => {
  it('客户端上传 agent：400 agent_not_allowed，而不是被覆盖后收下', async () => {
    const id = await newProject('Agents Client Self-Report');
    const result = await assembleAiRequest(
      aiRequest(id, '换个标题', { agent: { key: 'design', name: '我自己封的', responsibilities: ['想改什么就改什么'], capabilities: ['design.patch'] } }),
      owner,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('不该通过');
    expect(result.status).toBe(400);
    expect(result.code).toBe('agent_not_allowed');
    expect(result.message).toContain('§112');
  });

  it('提示词里的 @qa 解析出名册里的那一份：职责与权限来自库，不是来自请求', async () => {
    const id = await newProject('Agents Mention Qa');
    const result = await assembleAiRequest(aiRequest(id, '@qa 看一下这个按钮的点击区域'), owner);
    if (!result.ok) throw new Error(`装配失败：${result.message}`);
    // 这一条同时是 mentionsIn 那个捕获组下标的回归：下标错了这里 agent 就是 undefined，
    // 而 TS 不会红（noUncheckedIndexedAccess 让 match[1] 和 match[2] 长得一样）
    expect(result.wire.agent?.key).toBe('qa');
    expect(result.wire.agent?.name).toBe('QA Agent');
    expect(result.agent).toMatchObject({ agent: { key: 'qa' }, unknown: [], ignored: [], rosterEmpty: false });
    // 发出去的职责就是库里那几条原文
    const roster = await loadRoster();
    expect(result.wire.agent?.responsibilities).toEqual(roster.find((r) => r.key === 'qa')!.responsibilities);
    expect(result.wire.agent?.capabilities).toEqual(['browser.read', 'test.run']);
  });

  it('agentKey 提名同样落到报文，且与提示词里的 @xxx 只算一个人', async () => {
    const id = await newProject('Agents AgentKey');
    const result = await assembleAiRequest(aiRequest(id, '@content 顺手改下文案', { agentKey: 'design' }), owner);
    if (!result.ok) throw new Error(`装配失败：${result.message}`);
    // 显式那一栏排在提示词之前：用户在下拉框里选的人，不该被提示词里另一个 @ 抢走
    expect(result.wire.agent?.key).toBe('design');
    // 但被抢的那个不能静默消失：ignored 里有它，界面上要说一句
    expect(result.agent.ignored).toEqual(['content']);
    expect(result.agent.unknown).toEqual([]);
  });

  it('名册里没有的提名：原样报回 @fy，不猜一个人顶上，也不发 agent', async () => {
    const id = await newProject('Agents Unknown Mention');
    const result = await assembleAiRequest(aiRequest(id, '@fy 帮我看看'), owner);
    if (!result.ok) throw new Error(`装配失败：${result.message}`);
    expect(result.wire.agent).toBeUndefined();
    expect(result.agent.agent).toBeNull();
    expect(result.agent.unknown).toEqual(['@fy']);
    // 反面：这不是"名册没播种"。两句要是长成一句，用户就分不清自己拼错了还是环境没准备好
    expect(result.agent.rosterEmpty).toBe(false);
    expect((await loadRoster()).length).toBeGreaterThan(0);
  });

  it('批注正文里的 @xxx 也算点名（§111 → §112 接上）', async () => {
    const id = await newProject('Agents Annotation Mention');
    const document = (await loadDocument(id))!;
    const page = document.pages.find((p) => p.id === document.activePageId) ?? document.pages[0]!;
    const target = Object.values(page.nodes)[0]!;
    const added = await addAnnotation(owner, id, target.id, '@research 这条结论要带来源');
    expect(added.ok).toBe(true);

    const result = await assembleAiRequest(aiRequest(id, '按批注改一下'), owner);
    if (!result.ok) throw new Error(`装配失败：${result.message}`);
    // 提示词里一个 @ 都没有，人是从批注里点出来的
    expect(result.agent.agent?.key).toBe('research');
    expect(result.wire.agent?.name).toBe('Research Agent');
  });
});

describe('解析出来的人要一路走到 DEMO 报文（不是只在服务端口头说说）', () => {
  it('点了 @qa：计划那一行写 QA Agent，活动里带上它的职责', async () => {
    const id = await newProject('Agents Mock Named');
    const assembled = await assembleAiRequest(aiRequest(id, '@qa 检查一下这个按钮'), owner);
    if (!assembled.ok) throw new Error(`装配失败：${assembled.message}`);

    const response = await mockProvider.run(assembled.wire, { document: assembled.toolDocument });
    expect(response.plans[0]?.tasks[0]?.agent).toBe('QA Agent');
    const agentLine = response.activities.find((a) => a.stage === 'agent');
    expect(agentLine?.summary).toContain('QA Agent');
    expect(agentLine?.summary).toContain('检查结果是否满足验收');
  });

  it('没点名：这一轮没有 Agent 的权限约束，界面要看得见这一句', async () => {
    const id = await newProject('Agents Mock Unnamed');
    const assembled = await assembleAiRequest(aiRequest(id, '把主标题加高 30%'), owner);
    if (!assembled.ok) throw new Error(`装配失败：${assembled.message}`);
    expect(assembled.wire.agent).toBeUndefined();

    const response = await mockProvider.run(assembled.wire, { document: assembled.toolDocument });
    const agentLine = response.activities.find((a) => a.stage === 'agent');
    expect(agentLine?.summary).toContain('没有人被点名');
    // 没点名时干活的是设计改动，所以计划行仍写 Design Agent——但要和"点了 @qa 却写成 DesignAgent"分得开
    expect(response.plans[0]?.tasks[0]?.agent).toBe('Design Agent');
  });
});
