import { afterEach, describe, expect, it, vi } from 'vitest';
import { planStoryboard } from '@nexus/video-model';
import { storyboardStore } from '../src/studio/storyboardStore';

/**
 * §40 分镜 store 的客户端门禁（不碰数据库，只钉"发出去的那串字节"）。
 *
 * store 里有两个只有在这里才证得明的东西：
 * ① `baseUpdatedAt` 的来路——它是**服务端给的那一份**，不是客户端编的。
 *    建档时手里没有基准，就不该带上这一格（带了就是伪造并发检查）；
 *    每次写成功后要换成服务端回的新基准，否则下一次写会被自己的旧基准拒掉。
 * ② 撤销是一次真的写：栈里那份逆补丁应用到本地之后要 PUT 出去，
 *    光把界面擦回原样不算撤销——库里还是错的。
 *
 * fetch 的桩按 route.ts 的真实响应形状写（GET `{ok,storyboard,updatedAt}`、
 * 失败 `{error,message}`），不是按"测试想要什么"写的：桩比路由多给一格，
 * 界面就能显示一句服务端从来没说过的话。
 */

const PROJECT = '11111111-1111-4111-8111-111111111111';
const SERVED_AT = '2026-09-28T03:00:00.000Z';

interface Sent {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: { document?: unknown; baseUpdatedAt?: string } | null;
}

function installStub(options: { initial?: unknown; rejectWith?: { status: number; error: string; message: string } } = {}) {
  const sent: Sent[] = [];
  let served = { storyboard: options.initial ?? null, updatedAt: null as string | null };
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    let body: Sent['body'] = null;
    if (init?.body) {
      const parsed = JSON.parse(init.body) as Sent['body'];
      body = parsed ?? null;
    }
    sent.push({ method, url, headers: init?.headers ?? {}, body });
    if (method === 'PUT' && options.rejectWith) {
      return new Response(JSON.stringify({ error: options.rejectWith.error, message: options.rejectWith.message }), {
        status: options.rejectWith.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (method === 'PUT' && body?.document) {
      const doc = body.document as { id: string };
      served = { storyboard: { ...doc, id: 'row-uuid-1' }, updatedAt: SERVED_AT };
      return new Response(JSON.stringify({ ok: true, ...served }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, ...served }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return {
    sent,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** 把 cookie 架在整段异步流程上：头要在**发请求那一刻**还读得到 */
async function withCookieAsync(cookie: string, run: () => Promise<void>): Promise<void> {
  const g = globalThis as { document?: { cookie: string } };
  const prev = g.document;
  g.document = { cookie };
  try {
    await run();
  } finally {
    if (prev) g.document = prev;
    else delete g.document;
  }
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe('§40 分镜 store：写出去的那串字节', () => {
  it('建档不带基准，服务端给的基准原样带回去，成功后换成新的', async () => {
    const stub = installStub();
    try {
      await storyboardStore.load(PROJECT);
      expect(storyboardStore.getSnapshot().missing).toBe(true);

      await storyboardStore.planFrom('夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳');
      const put = stub.sent.find((s) => s.method === 'PUT');
      expect(put?.body?.baseUpdatedAt, '第一次建档手里没有基准，编一个等于伪造并发检查').toBeUndefined();
      const doc = put?.body?.document as { shots: unknown[] };
      expect(doc.shots).toHaveLength(3);

      // 服务端那一份的 id 换成了行 uuid：本地真值要跟它一致，否则时间线指着一个不存在的 id
      expect(storyboardStore.getSnapshot().storyboard?.id).toBe('row-uuid-1');

      storyboardStore.applyOps([
        {
          op: 'updateShot',
          id: storyboardStore.getSnapshot().storyboard!.shots[0]!.id,
          before: { camera: 'wide' },
          after: { camera: 'aerial' },
        },
      ]);
      // 等这次写落地：基准要换成服务端回的那一个，第二次 PUT 才会带上它
      await vi.waitFor(() => expect(storyboardStore.getSnapshot().saveState).toBe('saved'));
      const second = stub.sent.filter((s) => s.method === 'PUT')[1];
      expect(second?.body?.baseUpdatedAt, '基准必须是 GET/PUT 回来那一个，不能是 Date.now() 也不是空').toBe(SERVED_AT);
    } finally {
      stub.restore();
    }
  });

  it('撤销是一次真的写：发出去的文档回到改动前那一份', async () => {
    const stub = installStub({ initial: planStoryboard('夜色里的港口，一台旧起重机慢慢转身') });
    try {
      await storyboardStore.load(PROJECT);
      const firstId = storyboardStore.getSnapshot().storyboard!.shots[0]!.id;
      const beforeCamera = storyboardStore.getSnapshot().storyboard!.shots[0]!.camera;
      const beforeJson = JSON.stringify(storyboardStore.getSnapshot().storyboard);

      storyboardStore.applyOps([
        { op: 'updateShot', id: firstId, before: { camera: beforeCamera }, after: { camera: 'detail' } },
      ]);
      expect(storyboardStore.getSnapshot().canUndo).toBe(true);
      const edited = JSON.stringify(storyboardStore.getSnapshot().storyboard);
      expect(edited).not.toBe(beforeJson);

      storyboardStore.undo();
      // 撤销那次写排在改动那次之后（第一次还在飞，所以记了"还欠一次"）：等两次写都落地
      await vi.waitFor(() => expect(stub.sent.filter((s) => s.method === 'PUT')).toHaveLength(2));
      await vi.waitFor(() => expect(storyboardStore.getSnapshot().saveState).toBe('saved'));
      expect(storyboardStore.getSnapshot().canRedo).toBe(true);
      const last = stub.sent.filter((s) => s.method === 'PUT').at(-1);
      expect(JSON.stringify(last?.body?.document)).toBe(beforeJson);
      expect(storyboardStore.getSnapshot().storyboard?.shots[0]?.camera).toBe(beforeCamera);
    } finally {
      stub.restore();
    }
  });

  it('服务端拒绝时把那句话原样显示，不退回"HTTP 400"，也不动并发基准', async () => {
    const stub = installStub({
      initial: planStoryboard('夜色里的港口'),
      rejectWith: { status: 400, error: 'storyboard_rejected', message: '这份分镜引用了不属于本项目的东西：第 1 镜 挂的角色 nope 不是这个项目的角色。' },
    });
    try {
      await storyboardStore.load(PROJECT);
      const firstId = storyboardStore.getSnapshot().storyboard!.shots[0]!.id;
      storyboardStore.applyOps([
        { op: 'updateShot', id: firstId, before: { characterId: undefined }, after: { characterId: 'nope' } },
      ]);
      // applyOps 是"改本地 + 发一次写"，写本身不等：这里等的是那次写的结果落地
      await vi.waitFor(() => expect(storyboardStore.getSnapshot().saveState).toBe('error'));
      const snapshot = storyboardStore.getSnapshot();
      expect(snapshot.error, '界面上要读得出服务端真正说的那句话').toContain('不是这个项目的角色');
      expect(snapshot.error).not.toMatch(/HTTP 400/);
      expect(stub.sent.filter((s) => s.method === 'PUT')).toHaveLength(1);
    } finally {
      stub.restore();
    }
  });

  it('状态变更请求带着 CSRF 双提交头（这一条路由是新加的，别让它漏在覆盖外面）', async () => {
    const stub = installStub();
    // 头是在**发请求那一刻**从 cookie 读的：store 模块早在 cookie 出现之前就 import 完了，
    // 所以这里只要把 cookie 架在整次写入上面，拿到的值就证明它没被缓存在模块加载时
    try {
      await withCookieAsync('nexus_csrf=abc123def', async () => {
        await storyboardStore.load(PROJECT);
        await storyboardStore.planFrom('一个人走进雨里');
      });
      const put = stub.sent.find((s) => s.method === 'PUT');
      expect(put?.headers['content-type']).toBe('application/json');
      expect(put?.headers['x-csrf-token'], 'PUT 没带双提交头，服务端 csrfOk 会把这次写入拒掉').toBe('abc123def');
    } finally {
      stub.restore();
    }
  });

  it('切不出镜头就不写库：没有输入句子时一次 PUT 都不发', async () => {
    const stub = installStub();
    try {
      await storyboardStore.load(PROJECT);
      await storyboardStore.planFrom('   。  ， ');
      expect(stub.sent.filter((s) => s.method === 'PUT')).toHaveLength(0);
      expect(storyboardStore.getSnapshot().notice).toContain('没有输入句子');
      expect(storyboardStore.getSnapshot().storyboard).toBeNull();
    } finally {
      stub.restore();
    }
  });

  it('§40 建分镜时把来源箭头与引用写进文档（不传就还是默认的 text-to-video）', async () => {
    const stub = installStub();
    try {
      await storyboardStore.load(PROJECT);
      await storyboardStore.planFrom('一个人走进雨里', { arrow: 'character-to-scene', characterId: 'char-1' });
      const put = stub.sent.find((s) => s.method === 'PUT');
      const doc = put?.body?.document as { source?: { arrow?: string; characterId?: string } };
      expect(doc.source?.arrow, '箭头没写进文档，界面上就永远显示 text-to-video').toBe('character-to-scene');
      expect(doc.source?.characterId).toBe('char-1');

      // 不传来源：默认那条只要一句话的箭头，别偷偷带上别的引用
      await storyboardStore.load(PROJECT);
      await storyboardStore.planFrom('一个人走进雨里');
      const plain = stub.sent.filter((s) => s.method === 'PUT').at(-1);
      const plainDoc = plain?.body?.document as { source?: { arrow?: string; characterId?: string; referenceAssetId?: string } };
      expect(plainDoc.source).toEqual({ arrow: 'text-to-video', prompt: '一个人走进雨里' });
    } finally {
      stub.restore();
    }
  });

  it('缺来源的箭头不切也不写库，并把"为什么"原样留在 notice 里（与服务端拒收同一句规则）', async () => {
    const stub = installStub();
    try {
      await storyboardStore.load(PROJECT);
      await storyboardStore.planFrom('一个人走进雨里', { arrow: 'image-to-video' });
      expect(stub.sent.filter((s) => s.method === 'PUT'), '缺参考图还写库，库里就会留下一份"说走 reference 却没有图"的分镜').toHaveLength(0);
      expect(storyboardStore.getSnapshot().storyboard).toBeNull();
      const notice = storyboardStore.getSnapshot().notice ?? '';
      expect(notice).toContain('image-to-video');
      expect(notice).toContain('source.referenceAssetId');
    } finally {
      stub.restore();
    }
  });

  it('§40 改来源：一条补丁进撤销栈，撤销一步回到原箭头，两次都真的写出去', async () => {
    const initial = planStoryboard('夜色里的港口，一台旧起重机慢慢转身');
    const stub = installStub({ initial });
    try {
      await storyboardStore.load(PROJECT);
      const original = storyboardStore.getSnapshot().storyboard!.source;
      expect(original.arrow).toBe('text-to-video');

      expect(storyboardStore.changeSource({ arrow: 'character-to-scene', characterId: 'char-1' })).toBe(true);
      expect(storyboardStore.getSnapshot().storyboard!.source).toMatchObject({
        arrow: 'character-to-scene',
        characterId: 'char-1',
      });
      expect(storyboardStore.getSnapshot().canUndo).toBe(true);
      // 换来源不重切：镜头 id 与长度一个都没变
      expect(JSON.stringify(storyboardStore.getSnapshot().storyboard!.shots)).toBe(JSON.stringify(initial.shots));
      await vi.waitFor(() => expect(storyboardStore.getSnapshot().saveState).toBe('saved'));
      const put = stub.sent.filter((s) => s.method === 'PUT').at(-1);
      const doc = put?.body?.document as { source?: { arrow?: string; characterId?: string } } | null;
      expect(doc?.source?.arrow, '改来源没写进库，界面上那句"来源"就只是投影').toBe('character-to-scene');

      storyboardStore.undo();
      expect(storyboardStore.getSnapshot().storyboard!.source).toEqual(original);
      await vi.waitFor(() => expect(stub.sent.filter((s) => s.method === 'PUT')).toHaveLength(2));
      await vi.waitFor(() => expect(storyboardStore.getSnapshot().saveState).toBe('saved'));
      const last = stub.sent.filter((s) => s.method === 'PUT').at(-1);
      expect(JSON.stringify(last?.body?.document)).toContain(`"arrow":"text-to-video"`);
      expect(JSON.stringify(last?.body?.document)).not.toContain('"characterId"');
    } finally {
      stub.restore();
    }
  });

  it('改来源时与箭头无关的引用被抹掉；一个字都没改时不进撤销栈、不发 PUT', async () => {
    const initial = planStoryboard('夜色里的港口', { arrow: 'character-to-scene', characterId: 'char-1' });
    const stub = installStub({ initial });
    try {
      await storyboardStore.load(PROJECT);
      // 同一个来源：一次补丁都不该进（撤销键不能因为"什么都没改"的点击亮起来）
      expect(storyboardStore.changeSource({ arrow: 'character-to-scene', characterId: 'char-1' })).toBe(false);
      expect(stub.sent.filter((s) => s.method === 'PUT')).toHaveLength(0);
      expect(storyboardStore.getSnapshot().canUndo).toBe(false);

      // 换成只要一句话那条：角色那一格与箭头无关了，必须抹掉——否则头部会说"角色 X｜文字 → 视频"
      expect(storyboardStore.changeSource({ arrow: 'text-to-video', characterId: 'char-1' })).toBe(true);
      expect('characterId' in storyboardStore.getSnapshot().storyboard!.source).toBe(false);
      const put = stub.sent.filter((s) => s.method === 'PUT').at(-1);
      const source = (put?.body?.document as { source: Record<string, unknown> }).source;
      expect(Object.keys(source)).not.toContain('characterId');
      expect(source.arrow).toBe('text-to-video');
    } finally {
      stub.restore();
    }
  });

  it('缺来源的改来源被拒：notice 点名缺什么，撤销栈与库都不动', async () => {
    const stub = installStub({ initial: planStoryboard('夜色里的港口') });
    try {
      await storyboardStore.load(PROJECT);
      expect(storyboardStore.changeSource({ arrow: 'image-to-video' })).toBe(false);
      expect(stub.sent.filter((s) => s.method === 'PUT'), '缺参考图还发 PUT，服务端会拒、界面却已经换掉了').toHaveLength(0);
      expect(storyboardStore.getSnapshot().canUndo).toBe(false);
      expect(storyboardStore.getSnapshot().storyboard!.source.arrow).toBe('text-to-video');
      expect(storyboardStore.getSnapshot().notice).toContain('source.referenceAssetId');
    } finally {
      stub.restore();
    }
  });
});
