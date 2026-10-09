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
