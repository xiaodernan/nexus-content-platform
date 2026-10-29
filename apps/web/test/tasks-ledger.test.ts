import { describe, expect, it } from 'vitest';
import { TasksLedgerSchema, readTasksLedger, type TasksLedgerPayload } from '../src/lib/tasksLedger';
import { REALTIME_TEXT } from '../src/lib/useRealtime';

/**
 * 账本读侧的纯单测（不碰库）：`readTasksLedger` 每种失败怎么说、契约咬不咬、
 * 实时状态标签的文案单源在哪。这几句 reason 与标签会原样出现在界面上——措辞就是承诺（§73）。
 */

function taskRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'task-1',
    projectId: 'prj-1',
    projectName: '测试项目',
    agentKey: 'design-agent',
    status: 'running',
    capability: 'demo',
    attempt: 1,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-10-09T12:00:00.000Z',
    requiresApproval: false,
    approvedAt: null,
    durationMs: null,
    // 默认这一行"没记用量"：老行就是 null，不是 0 token（§75）
    usage: null,
    ...overrides,
  };
}

function ledgerPayload(tasks: Record<string, unknown>[] = [taskRow()]): unknown {
  return { ok: true, projectName: '测试项目', tasks };
}

function jsonResponse(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

describe('readTasksLedger：读回权威，失败带一句给用户看的原因', () => {
  it('200 且形状合契：ok + 报文原样', async () => {
    const result = await readTasksLedger('prj-1', jsonResponse(ledgerPayload()));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('上面已断言');
    expect(result.payload.tasks).toHaveLength(1);
    expect(result.payload.tasks[0]!.status).toBe('running');
  });

  it('走的是那条读接口，且不许中间层给缓存（账本每次都是现场读）', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    // readTasksLedger 只会拿字符串 URL 来问；测试就按这个形状记账（cast 是给 vitest 的 fetch 签名）
    const fetcher = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify(ledgerPayload()), { status: 200 });
    }) as typeof fetch;
    const result = await readTasksLedger('prj 1', fetcher);
    expect(result.ok).toBe(true);
    // 项目 id 进 URL 前要编码：它可能带空格/斜杠这类路径字符
    expect(seen!.url).toBe('/api/projects/prj%201/tasks');
    expect(seen!.init?.cache).toBe('no-store');
  });

  it('HTTP 404：说状态码，不编一个"没有任务"出来', async () => {
    const result = await readTasksLedger('prj-1', jsonResponse({ error: 'not_found' }, 404));
    expect(result).toEqual({ ok: false, reason: 'HTTP 404' });
  });

  it('200 但报文不合契约：同样是读不到（不把缺字段的对象画成少几列的表）', async () => {
    const missing = ledgerPayload();
    (missing as { tasks: unknown[] }).tasks = [{ id: 'task-1', status: 'running' }];
    const result = await readTasksLedger('prj-1', jsonResponse(missing));
    expect(result).toEqual({ ok: false, reason: '返回的报文不合契约' });
  });

  it('返回的根本不是 JSON：按不合契约说，不抛给界面', async () => {
    const fetcher = (async () => new Response('<html>502</html>', { status: 200 })) as typeof fetch;
    const result = await readTasksLedger('prj-1', fetcher);
    expect(result).toEqual({ ok: false, reason: '返回的报文不合契约' });
  });

  it('网络直接断了：原样带上错误信息（"读不到"要带原因）', async () => {
    const fetcher = (async () => {
      throw new Error('fetch failed');
    }) as typeof fetch;
    const result = await readTasksLedger('prj-1', fetcher);
    expect(result).toEqual({ ok: false, reason: 'fetch failed' });
  });
});

describe('TasksLedger 契约本身', () => {
  it('mine 可缺：服务端不带它时按钮不挂，而不是整份报文判死', () => {
    const withoutMine = taskRow();
    delete withoutMine.mine;
    const parsed = TasksLedgerSchema.safeParse(ledgerPayload([withoutMine]));
    expect(parsed.success).toBe(true);
  });

  it('状态刻意是自由串：库里将来多一档，界面收到的是那一档本身', () => {
    const parsed = TasksLedgerSchema.safeParse(ledgerPayload([taskRow({ status: '某天新增的一档' })]));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tasks[0]!.status).toBe('某天新增的一档');
  });

  it('多出来的字段被契约挡在外面（出口解析过一遍，不整包透传）', () => {
    const parsed = TasksLedgerSchema.safeParse(ledgerPayload([taskRow({ mystery: 'x' })]));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect('mystery' in parsed.data.tasks[0]!).toBe(false);
  });

  it('ok 不是 true 的报文过不了（这不是账本接口的回话）', () => {
    const parsed = TasksLedgerSchema.safeParse({ ok: false, projectName: 'x', tasks: [] });
    expect(parsed.success).toBe(false);
  });
});

describe('§75 用量那一格：0 与"没记"是两件事', () => {
  const realUsage = {
    provider: 'openai-compatible',
    model: 'gpt-x',
    modelClass: 'balanced',
    tokensIn: 1234,
    tokensOut: 567,
    latencyMs: 2345,
    costUsd: 0,
    toolCalls: 2,
    demoMode: false,
  };

  it('没记就是 null：过得了契约，不会被当成一份"0 token 的用量"', () => {
    const parsed = TasksLedgerSchema.safeParse(ledgerPayload([taskRow({ usage: null })]));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tasks[0]!.usage).toBeNull();
  });

  it('真模型的一行：各字段原样读出（cost 为 0 也是真报的 0）', () => {
    const parsed = TasksLedgerSchema.safeParse(ledgerPayload([taskRow({ usage: realUsage })]));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tasks[0]!.usage).toEqual(realUsage);
  });

  it('DEMO 的一行：demoMode 与 0 token 是被记录下来的事实，不是缺字段', () => {
    const demoUsage = { ...realUsage, provider: 'mock', model: 'nexus-deterministic-v1', tokensIn: 0, tokensOut: 0, demoMode: true };
    const parsed = TasksLedgerSchema.safeParse(ledgerPayload([taskRow({ usage: demoUsage })]));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tasks[0]!.usage).toMatchObject({ demoMode: true, tokensIn: 0, tokensOut: 0 });
  });

  it('少一个字段的用量过不了契约：不把缺腿的用量画成一格数字', () => {
    const partial: Record<string, unknown> = { ...realUsage };
    delete partial.costUsd;
    const parsed = TasksLedgerSchema.safeParse(ledgerPayload([taskRow({ usage: partial })]));
    expect(parsed.success).toBe(false);
  });

  it('整格缺 usage 也过不了：服务端每行都得显式说"记了没有"', () => {
    const withoutUsage = taskRow();
    delete withoutUsage.usage;
    const parsed = TasksLedgerSchema.safeParse(ledgerPayload([withoutUsage]));
    expect(parsed.success).toBe(false);
  });

  it('modelClass 是自由串：库里多一档时照实显示，不让整份账本读不到', () => {
    const parsed = TasksLedgerSchema.safeParse(ledgerPayload([taskRow({ usage: { ...realUsage, modelClass: '某天新增的一档' } })]));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tasks[0]!.usage!.modelClass).toBe('某天新增的一档');
  });
});

describe('实时状态标签（三个订阅方共用的单源）', () => {
  it('四档各一句，closed 必须自己带着"以刷新后的数据为准"', () => {
    expect(REALTIME_TEXT).toEqual({
      idle: '未开',
      connecting: '连接中',
      open: '已连接',
      closed: '已断开，以刷新后的数据为准',
    });
  });
});

// 类型兜底：payload 的形状就是契约的形状（编译期一眼，运行期上面各条钉着）
const _typeCheck: TasksLedgerPayload = { ok: true, projectName: 'x', tasks: [] };
void _typeCheck;
