import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@nexus/schemas';
import { eq } from 'drizzle-orm';
import { createProject } from '../src/server/domain/projects';
import { emit } from '../src/server/domain/notifications';
import { finishTask, startTask } from '../src/server/domain/agent-tasks';
import { channels, setRealtimeBus, type RealtimeBus } from '../src/server/realtime/bus';
import { getDb } from '../src/server/db/client';
import { notifications, projects, users } from '../src/server/db/schema';

/**
 * §163：真实流程有没有真的发出事件。
 *
 * 打真实 Postgres，但总线换成**记账用的假驱动**——要验的不是"事件能不能过网络"（那是 e2e 的事），
 * 而是"该发的时候发了、不该发的时候一条都没有"。所以断言的是 (频道, 事件) 这一对。
 *
 * 通知一律用 `publicationId: null` 的几类（generation / moderation / follow）：
 * `notifications.publication_id` 有外键指向 `published_projects`，随手编一个 uuid 会被库挡下，
 * 而这里要验的是实时推送，不是发布链路（那条在 `publish.integration.test.ts`）。
 */

interface Captured {
  channel: string;
  event: RealtimeEvent;
}

let captured: Captured[] = [];
const bus: RealtimeBus = {
  publish: (channel, event) => captured.push({ channel, event }),
  subscribe: () => () => undefined,
  subscriberCount: () => 0,
};

let owner: string;

/**
 * 每个用例都从"记账总线已装好、账本已清空"开始。
 * 不写成"用例末尾恢复"：某个用例中途换了驱动又断言失败时，末尾那行不会执行，
 * 后面的用例就会莫名其妙地"什么都没收到"——那种红最难查（本轮就踩过一次）。
 */
beforeEach(() => {
  captured = [];
  setRealtimeBus(bus);
});

beforeAll(async () => {
  const [row] = await getDb()
    .insert(users)
    .values({ displayName: 'Realtime', email: `rt+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = row!.id;
});

afterAll(async () => {
  setRealtimeBus(undefined);
  await getDb().delete(projects).where(eq(projects.ownerId, owner));
  await getDb().delete(users).where(eq(users.id, owner));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(owner, { name, kind: 'website' })).id;
}

/** 一次生成任务完成的通知：这一类不挂 publication，所以不碰发布链路的外键 */
function generationEvent(projectId: string, taskId: string) {
  return {
    kind: 'generation' as const,
    recipientId: owner,
    projectId,
    projectName: '实时通知',
    taskId,
    agentKey: 'design-agent',
    capability: 'demo' as const,
    ok: true,
    durationMs: 1200,
    detail: null,
  };
}

describe('通知 → 实时事件（§163/§164）', () => {
  it('新写一条通知才推事件，推到收件人自己的用户频道', async () => {
    const projectId = await newProject('实时通知');
    const result = await emit(generationEvent(projectId, crypto.randomUUID()));
    expect(result).toBe('created');

    const hit = captured.filter((c) => c.event.type === 'notification');
    expect(hit).toHaveLength(1);
    // 只走用户频道：notification 的收件人未必是这个项目的所有者，
    // 推到项目频道就会把一条写给 A 的通知送进 B 的连接里
    expect(hit[0]!.channel).toBe(channels.user(owner));
    expect(hit[0]!.channel.startsWith('project:')).toBe(false);

    const event = hit[0]!.event;
    if (event.type !== 'notification') throw new Error('上面已断言类型');
    expect(event.level).toBe('success');
    expect(event.title).toContain('实时通知');
    expect(event.projectId).toBe(projectId);
  });

  it('同一条事件重复写被去重时不推第二次（收件箱不该被反复点亮）', async () => {
    const projectId = await newProject('实时去重');
    const taskId = crypto.randomUUID();
    expect(await emit(generationEvent(projectId, taskId))).toBe('created');
    expect(captured).toHaveLength(1);

    // 同一个任务行只会有一个终态：写库被 dedupe 挡住，实时也不该再推
    captured = [];
    expect(await emit(generationEvent(projectId, taskId))).toBe('duplicate');
    expect(captured).toHaveLength(0);
  });

  it('被规则挡住的通知（自己给自己的社区动作）既不写行也不推事件', async () => {
    // 社区类事件里 actor === recipient 时 planNotification 直接返回 null
    const result = await emit({
      kind: 'follow',
      recipientId: owner,
      actorId: owner,
      actorName: 'Realtime',
      actorHandle: null,
    });
    expect(result).toBe('suppressed');
    expect(captured).toEqual([]);
  });

  it('审核类通知的级别比 info 重（撤下内容不是一条普通消息）', async () => {
    const projectId = await newProject('实时审核');
    const result = await emit({
      kind: 'moderation',
      recipientId: owner,
      adminId: owner,
      projectId,
      projectName: '实时审核',
      publicationId: null,
      caseId: crypto.randomUUID(),
      version: 1,
      resolution: 'rejected',
      note: null,
    });
    expect(result).toBe('created');
    const event = captured.find((c) => c.event.type === 'notification')?.event;
    if (!event || event.type !== 'notification') throw new Error('没有收到通知事件');
    expect(event.level).toBe('warning');
  });

  it('写通知的那次调用不因为实时通道而改变结果', async () => {
    // 总线上没有任何订阅者时，emit 仍然要如实返回 created（实时是加速器，不是前提）
    setRealtimeBus({ publish: () => undefined, subscribe: () => () => undefined, subscriberCount: () => 0 });
    const projectId = await newProject('实时无人听');
    const result = await emit(generationEvent(projectId, crypto.randomUUID()));
    expect(result).toBe('created');
  });

  it('通知行仍然真的落库（实时不是"只发事件不写库"）', async () => {
    const projectId = await newProject('实时落库');
    const taskId = crypto.randomUUID();
    await emit(generationEvent(projectId, taskId));
    const rows = await getDb()
      .select({ id: notifications.id, dedupeKey: notifications.dedupeKey })
      .from(notifications)
      .where(eq(notifications.userId, owner));
    expect(rows.some((r) => r.dedupeKey === `generation:${taskId}`)).toBe(true);
  });
});

describe('生成任务 → 实时进度（§163）', () => {
  it('开始与结束各推一条，推在项目频道上', async () => {
    const projectId = await newProject('实时生成');
    const started = await startTask({
      projectId,
      agentKey: 'design-agent',
      createdById: owner,
      capability: 'demo',
      input: { note: 'probe' },
    });
    const atStart = captured.filter((c) => c.event.type === 'generation.progress');
    expect(atStart).toHaveLength(1);
    expect(atStart[0]!.channel).toBe(channels.project(projectId));
    if (atStart[0]!.event.type !== 'generation.progress') throw new Error('类型已断言');
    expect(atStart[0]!.event.progress).toBe(0);

    const finished = await finishTask(started.id, { ok: true, result: { ok: true } });
    expect(finished).toEqual({ status: 'succeeded', updated: true });
    const atEnd = captured.filter((c) => c.event.type === 'generation.progress');
    expect(atEnd).toHaveLength(2);
    const last = atEnd[1]!.event;
    if (last.type !== 'generation.progress') throw new Error('类型已断言');
    expect(last.progress).toBe(1);
    expect(last.message).toBe('完成');
  });

  it('失败也推一条：界面上的"正在生成"要能自己停下来', async () => {
    const projectId = await newProject('实时失败');
    const started = await startTask({
      projectId,
      agentKey: 'design-agent',
      createdById: owner,
      capability: 'demo',
      input: {},
    });
    captured = [];
    await finishTask(started.id, { ok: false, error: 'provider 不可用' });
    expect(captured).toHaveLength(1);
    const event = captured[0]!.event;
    if (event.type !== 'generation.progress') throw new Error('类型已断言');
    expect(event.progress).toBe(1);
    expect(event.message).toContain('provider 不可用');
  });

  it('没有项目的任务不推（没有频道可发，就不编一个）', async () => {
    const started = await startTask({
      projectId: null,
      agentKey: 'design-agent',
      createdById: owner,
      capability: 'demo',
      input: {},
    });
    expect(captured).toEqual([]);
    await finishTask(started.id, { ok: true, result: {} });
    expect(captured).toEqual([]);
  });

  it('收尾一个不存在的任务：如实 updated=false，也不推事件', async () => {
    const result = await finishTask('00000000-0000-4000-8000-000000000000', { ok: true });
    expect(result.updated).toBe(false);
    expect(captured).toEqual([]);
  });
});
