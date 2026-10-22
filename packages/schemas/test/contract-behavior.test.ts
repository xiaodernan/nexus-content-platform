import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as S from '../src/index';

/**
 * `packages/schemas` 的**行为**自检：每个导出的 schema 至少要有一份"它接受什么、拒绝什么"的凭证。
 *
 * 之前这里只有 `contract.test.ts`——它保证的是"导出的 `contracts/*.json` 与 zod 定义逐字节一致"，
 * 也就是**文件没漂移**。但没有任何一条用例说"这份契约收到这样的报文会怎样"。
 * 于是下面这些事都没人拦：
 * - 有人把一个枚举值改名了（`cancelled` → `canceled`），两侧文件同步更新了、测试也全绿，
 *   而 Python 侧按旧名字发来的报文会被拒；
 * - 有人给某个字段加了 `.min(1)`，它开始拒掉一批本来能过的报文——**没人知道**；
 * - 有人把一个必填字段改成可选，JSON Schema 的 `required` 少了它，Python 侧开始接受残缺报文。
 *
 * 这一份的判据是三条，**每条对全部导出的 schema 生效**（不是一个一个手写用例）：
 * ① 照着 JSON Schema 的 `required` 与类型自动造一份**最小合法报文** → zod 必须接受它；
 * ② 把 `required` 名单里的字段**逐个**去掉 → zod 必须拒绝它（每一个必填字段都得是真的必填）；
 * ③ 传 `undefined` → zod 必须拒绝它（这份 schema 不该是"可不填"的）。
 *
 * 最小报文是**自动造的**（读 `z.toJSONSchema` 的形状），所以以后新增一个 schema，
 * 这份自检**自动覆盖它**——不用记得来补一条用例。少数几个带 refine 的要手写样例，
 * 写在下面 `OVERRIDES` 里，附一句"为什么自动造不出来"。
 *
 * 纯函数：不读库、不碰时钟、不联网。
 */

type Json = Record<string, unknown>;

/** 照 JSON Schema 的形状造一份最小值：够类型、够 required、够最小长度 */
function build(node: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (node === null || typeof node !== 'object') return null;
  const n = node as Json;
  if (typeof n['const'] === 'string') return n['const'];
  if (Array.isArray(n['enum']) && n['enum'].length > 0) return n['enum'][0];
  if (Array.isArray(n['oneOf']) && n['oneOf'].length > 0) return build(n['oneOf'][0], depth + 1);
  if (Array.isArray(n['anyOf']) && n['anyOf'].length > 0) return build(n['anyOf'][0], depth + 1);
  const type = n['type'];
  if (type === 'string') {
    if (typeof n['format'] === 'string') {
      if (n['format'] === 'date-time') return '2026-01-01T00:00:00.000Z';
      if (n['format'] === 'uri' || n['format'] === 'url') return 'https://example.com/';
    }
    const min = typeof n['minLength'] === 'number' ? n['minLength'] : 1;
    return 'x'.repeat(Math.max(1, min));
  }
  if (type === 'integer' || type === 'number') {
    const min = typeof n['minimum'] === 'number' ? n['minimum'] : 0;
    const max = typeof n['maximum'] === 'number' ? n['maximum'] : Number.MAX_SAFE_INTEGER;
    const v = Math.min(Math.max(1, min), max);
    return type === 'integer' ? Math.round(v) : v;
  }
  if (type === 'boolean') return true;
  if (type === 'array') return [];
  if (type === 'object' || n['properties']) {
    const props = (n['properties'] ?? {}) as Json;
    const required = (n['required'] ?? []) as string[];
    const out: Record<string, unknown> = {};
    for (const key of required) {
      if (key in props) out[key] = build(props[key], depth + 1);
    }
    return out;
  }
  return null;
}

/**
 * 自动造不出来的少数几个（各有各的原因）：
 * - `ops` / `patches` / `scopes`：**最少一条**（数组有 `.min(1)`，自动造的是空数组）；
 * - `body` 有 refine（自定义报错）：自动造的字段组合不满足那条额外约束；
 * - `visitorKey`：有自定义格式约束（不是 uuid 也不是普通串）。
 */
const OVERRIDES: Record<string, unknown> = {
  ApiTokenCreateRequestSchema: {
    name: '给 CI 用的一把',
    scopes: ['projects:read'],
  },
  ApiDesignPatchRequestSchema: {
    summary: '改个名',
    ops: [{ op: 'set', nodeId: 'n1', path: 'name', value: 'x' }],
  },
  ProjectDesignPatchRequestSchema: {
    patches: [{ ops: [] }],
  },
  NotificationsReadRequestSchema: {
    ids: ['00000000-0000-4000-8000-000000000000'],
  },
  ProjectPatchRequestSchema: {
    description: '改个描述',
  },
  PublishedVisitRequestSchema: {
    path: '/n/handle/slug',
    visitorKey: '0123456789abcdef0123456789abcdef',
    open: true,
    visibleMs: 1000,
    completionPct: 50,
  },
  // §168 通关那份与访客现场**同一把** key（同源同格式），所以最小报文也长一样。
  // 漏了它 ⇒ 自动造的那份 visitorKey 不满足 32 位十六进制，于是这一格在报"自己的契约不认自己的报文"，
  // 而真问题只是**自检表少了一项**（不是 schema 写错了）。
  PublishedGameCompleteRequestSchema: {
    path: '/n/handle/slug',
    visitorKey: '0123456789abcdef0123456789abcdef',
  },
};

/** 导出的 schema（名字以 Schema 结尾、且确实是 zod schema 的） */
const SCHEMAS: { name: string; schema: z.ZodType }[] = Object.entries(
  S as unknown as Record<string, unknown>,
)
  .filter(([name, value]) => {
    if (!name.endsWith('Schema')) return false;
    if (typeof value !== 'object' || value === null) return false;
    return typeof (value as { safeParse?: unknown }).safeParse === 'function';
  })
  .map(([name, value]) => ({ name, schema: value as z.ZodType }));

function jsonOf(schema: z.ZodType): Json {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json;
}

function requiredOf(json: Json): string[] {
  return Array.isArray(json['required']) ? (json['required'] as string[]) : [];
}

describe('schemas 行为自检 · 全量', () => {
  it('导出的 schema 至少有一个（自检表不是空的）', () => {
    expect(SCHEMAS.length).toBeGreaterThan(50);
  });

  for (const { name, schema } of SCHEMAS) {
    describe(name, () => {
      it('接受一份最小合法报文', () => {
        const sample = name in OVERRIDES ? OVERRIDES[name] : build(jsonOf(schema));
        const parsed = schema.safeParse(sample);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.') || 'body'}:${i.code}`)
            .join(' | ');
          throw new Error(`${name} 不接受它自己的最小报文：${issues}`);
        }
      });

      it('少一个必填字段就该被拒（每个必填字段都得是真的必填）', () => {
        const json = jsonOf(schema);
        const required = requiredOf(json);
        if (required.length === 0) return; // 没有必填字段的 schema（例如全 optional 的）不适用这条
        const base = name in OVERRIDES ? OVERRIDES[name] : build(json);
        if (typeof base !== 'object' || base === null) return;
        for (const key of required) {
          if (!(key in (base as Record<string, unknown>))) continue;
          const broken: Record<string, unknown> = { ...(base as Record<string, unknown>) };
          delete broken[key];
          const parsed = schema.safeParse(broken);
          expect(
            parsed.success,
            `${name} 少了「${key}」居然还过了——这个字段不是真的必填（或者 refine 没管住）`,
          ).toBe(false);
        }
      });

      it('传 undefined 会被拒（这份 schema 不是"可不填"的）', () => {
        const parsed = schema.safeParse(undefined);
        expect(parsed.success, `${name} 接受了 undefined`).toBe(false);
      });
    });
  }
});

describe('schemas 行为自检 · 判别联合要认得自己的每一档', () => {
  it('RealtimeEvent 只认那七种 type，未知的要被拒（跨进程收到陌生帧不能当现场）', () => {
    const samples: Record<string, unknown> = {
      'agent.plan': { type: 'agent.plan', projectId: 'p1', taskId: 't1', plan: { goal: '改个名' } },
      'agent.step': { type: 'agent.step', projectId: 'p1', taskId: 't1', stepId: 's1', status: 'running', summary: '在改' },
      'agent.activity': {
        type: 'agent.activity',
        projectId: 'p1',
        taskId: 't1',
        activity: { stage: 'generate', status: 'running', summary: '正在生成' },
      },
      'generation.progress': { type: 'generation.progress', projectId: 'p1', taskId: 't1', kind: 'image', progress: 0.5 },
      'build.status': { type: 'build.status', projectId: 'p1', status: 'building' },
      'preview.status': { type: 'preview.status', projectId: 'p1', status: 'ready' },
      notification: { type: 'notification', level: 'info', title: '好了' },
    };
    for (const [type, sample] of Object.entries(samples)) {
      expect(S.RealtimeEventSchema.safeParse(sample).success, `RealtimeEvent 不认「${type}」`).toBe(true);
    }
    expect(S.RealtimeEventSchema.safeParse({ type: 'agent.unknown', projectId: 'p1' }).success).toBe(false);
  });

  it('RealtimeWireFrame 只认 event 与 close 两档', () => {
    expect(
      S.RealtimeWireFrameSchema.safeParse({
        kind: 'event',
        origin: 'bus-1',
        channel: 'project:p1',
        event: { type: 'build.status', projectId: 'p1', status: 'ok' },
      }).success,
    ).toBe(true);
    expect(S.RealtimeWireFrameSchema.safeParse({ kind: 'close', origin: 'bus-1', channel: 'project:p1' }).success).toBe(true);
    expect(S.RealtimeWireFrameSchema.safeParse({ kind: 'other', origin: 'bus-1', channel: 'c' }).success).toBe(false);
  });

  it('build.status 的四档与 generation.progress 的 0..1 都要守住', () => {
    for (const status of ['idle', 'building', 'ok', 'failed']) {
      expect(S.RealtimeEventSchema.safeParse({ type: 'build.status', projectId: 'p1', status }).success).toBe(true);
    }
    expect(S.RealtimeEventSchema.safeParse({ type: 'build.status', projectId: 'p1', status: 'done' }).success).toBe(false);
    expect(
      S.RealtimeEventSchema.safeParse({ type: 'generation.progress', projectId: 'p1', taskId: 't1', kind: 'image', progress: 1.2 }).success,
    ).toBe(false);
  });
});

describe('schemas 行为自检 · §162 作业状态与 §74 审批那几档', () => {
  it('作业状态是五档（cancelled 与 failed 分开：一个是"做砸了"，一个是"有人不要了"）', () => {
    for (const status of ['queued', 'running', 'completed', 'failed', 'cancelled']) {
      expect(S.AiJobStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(S.AiJobStatusSchema.safeParse('paused').success).toBe(false);
    expect(S.AiJobStatusSchema.safeParse('canceled').success).toBe(false); // 拼写不同的一档不认
  });

  it('审批请求只有 decision：自报归属与 confirm 都不收（zod 会剥掉，剥完就当没有过）', () => {
    const parsed = S.AiTaskApprovalRequestSchema.parse({ decision: 'approve', taskId: '别人的任务', confirm: 'x' });
    expect(parsed).toEqual({ decision: 'approve' });
    expect('taskId' in parsed).toBe(false);
    expect('confirm' in parsed).toBe(false);
    expect(S.AiTaskApprovalRequestSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });

  it('审批回执的 status 只有三档（awaiting_approval = 这次决定没被接受）', () => {
    for (const status of ['succeeded', 'cancelled', 'awaiting_approval']) {
      const parsed = S.AiTaskApprovalResultSchema.safeParse({
        taskId: 't1',
        decision: 'approve',
        status,
        applied: false,
        held: null,
      });
      expect(parsed.success, `回执不认「${status}」`).toBe(true);
    }
    expect(
      S.AiTaskApprovalResultSchema.safeParse({ taskId: 't1', decision: 'approve', status: 'pending', applied: false, held: null }).success,
    ).toBe(false);
  });
});
