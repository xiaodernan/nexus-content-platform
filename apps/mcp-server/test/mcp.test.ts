import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createNexusMcpServer } from '../src/server';
import type { NexusApiConfig } from '../src/api';

/**
 * §188 MCP 这一片的纪律：server 是**外部 Agent**，所以它对平台做的事必须逐条对账——
 * 打的是哪条 v1 路径、带没带 Bearer、PATCH 的 body 是不是原样透传、平台的 4xx
 * 有没有变成调用方读得懂的错误结果。全部对着一个真的本地 HTTP 后端量，不 mock fetch。
 */

interface Captured {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  body: string;
}

const stub = createServer((req: IncomingMessage, res: ServerResponse) => {
  let raw = '';
  req.on('data', (chunk: Buffer) => {
    raw += chunk.toString('utf8');
  });
  req.on('end', () => {
    const captured: Captured = {
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body: raw,
    };
    last = captured;
    if (captured.authorization !== 'Bearer test-token') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token', message: '凭据不合法或已吊销' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/projects') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ projects: [{ id: 'p1', name: '演示项目', pageCount: 2, nodeCount: 57 }] }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/projects/p1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ project: { id: 'p1', name: '演示项目' }, pageCount: 2, nodeCount: 57 }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/projects/p1/design') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ source: 'database', document: { pages: [{ id: 'page-1', name: '首页' }] } }));
      return;
    }
    if (req.method === 'PATCH' && req.url === '/api/v1/projects/p1/design') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          projectId: 'p1',
          ok: true,
          appliedOps: 1,
          touchedNodeIds: ['n1'],
          pageCount: 2,
          nodeCount: 58,
          snapshotId: 's1',
          historyRecorded: true,
          warnings: [],
          source: 'database',
        }),
      );
      return;
    }
    if (req.method === 'POST' && req.url === '/api/v1/projects/p1/publish') {
      // 仿真 v1 发布端点：body 原样收下，public 这一档连真 v1 都到不了（枚举外），
      // 但 stub 仍按平台的第二道防线照回 400（schema 之外还有策略分流）
      let parsedBody: { visibility?: unknown };
      try {
        parsedBody = JSON.parse(raw || '{}') as { visibility?: unknown };
      } catch {
        parsedBody = {};
      }
      if (parsedBody.visibility === 'public') {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'public_requires_human', message: '公网发布（public）不在 v1 的能力里：回平台界面走完那一趟' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'pub1',
          projectId: 'p1',
          path: '/n/demo/p1',
          visibility: parsedBody.visibility ?? 'unlisted',
          version: 1,
          publishedAt: '2026-10-09T00:00:00.000Z',
        }),
      );
      return;
    }
    if (req.method === 'POST' && req.url === '/api/v1/projects') {
      // 仿真的正是真 v1 的两条拒法：校验失败 400、kind 不认识 400 且带 allowed 清单
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(raw || '{}') as Record<string, unknown>;
      } catch {
        payload = {};
      }
      const allowedKinds = ['website', 'design-system', 'game', 'world', 'storyboard', 'prototype'];
      if (typeof payload.name !== 'string' || !payload.name.trim()) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'validation_failed', message: 'body: 项目名不能为空' }));
        return;
      }
      const kindStr = typeof payload.kind === 'string' ? payload.kind : '';
      if (payload.kind !== undefined && !allowedKinds.includes(kindStr)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'unknown_kind', message: `没有 ${kindStr} 这个项目类型`, allowed: allowedKinds }),
        );
        return;
      }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'p2', name: payload.name, kind: kindStr || 'website', pageCount: 0, nodeCount: 0 }));
      return;
    }
    if (req.method === 'DELETE' && (req.url ?? '').startsWith('/api/v1/projects/p1?confirm=')) {
      // 确认词逐字比对（真 v1 走 softDeleteProject）；查询串里是百分号编码，比对前要解码
      const confirm = decodeURIComponent((req.url ?? '').split('confirm=')[1] ?? '');
      if (confirm !== '演示项目') {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'approval_required', message: '确认词与项目名不一致，没有删除这个项目' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ deleted: true, id: 'p1', name: '演示项目', recoverable: '软删：快照与发布行都还在，公开页从这一刻起 404。v1 没有恢复端点，恢复要回界面。' }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'project_not_found', message: '项目 missing 不在这一枚凭据所属的人名下，或已被删除' }));
  });
});

let last: Captured | null = null;
let baseUrl = '';
let config: NexusApiConfig;

beforeAll(async () => {
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const address = stub.address();
  if (!address || typeof address === 'string') throw new Error('stub 没拿到端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
  config = { baseUrl, token: 'test-token' };
});

afterAll(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()));
});

/** 每个用例一对新连接：client ↔ (InMemoryTransport) ↔ server(config) */
async function connect(cfg: NexusApiConfig) {
  const server = createNexusMcpServer(cfg);
  const client = new Client({ name: 'vitest', version: '0.0.0' });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

const textOf = (result: unknown): string => {
  const content = (result as { content?: Array<{ text?: string }> }).content ?? [];
  return content.map((part) => part.text ?? '').join('');
};

describe('MCP 工具面（§188）', () => {
  it('tools/list 恰好七个工具，名字一个不多一个不少（与 v1 七条端点一一对应）', async () => {
    const client = await connect(config);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'nexus_create_project',
      'nexus_delete_project',
      'nexus_get_design',
      'nexus_get_project',
      'nexus_list_projects',
      'nexus_patch_design',
      'nexus_publish',
    ]);
    // 工具描述必须自带限度：写工具的 description 说过删除类 op 会被拒（§159：写在调用方看得见的地方）
    const patch = tools.tools.find((tool) => tool.name === 'nexus_patch_design')!;
    expect(patch.description).toContain('approval_required');
    // 删项目的两条限度也必须在描述里：确认词逐字比对 + 软删且 v1 没有恢复端点
    const del = tools.tools.find((tool) => tool.name === 'nexus_delete_project')!;
    expect(del.description).toContain('逐字');
    expect(del.description).toContain('没有恢复端点');
    // 发布的限度：只能到 unlisted，public 回界面（描述里必须指路，不能只说"不行"）
    const pub = tools.tools.find((tool) => tool.name === 'nexus_publish')!;
    expect(pub.description).toContain('unlisted');
    expect(pub.description).toContain('界面');
    await client.close();
  });

  it('nexus_list_projects 打 GET /api/v1/projects 并带上 Bearer 凭据', async () => {
    const client = await connect(config);
    const result = await client.callTool({ name: 'nexus_list_projects', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(last?.method).toBe('GET');
    expect(last?.url).toBe('/api/v1/projects');
    expect(last?.authorization).toBe('Bearer test-token');
    const payload = JSON.parse(textOf(result)) as { projects: { id: string }[] };
    expect(payload.projects[0]!.id).toBe('p1');
    await client.close();
  });

  it('nexus_get_design 把平台的 JSON 原样带回来（不加工不裁剪）', async () => {
    const client = await connect(config);
    const result = await client.callTool({ name: 'nexus_get_design', arguments: { projectId: 'p1' } });
    expect(result.isError).toBeFalsy();
    expect(last?.url).toBe('/api/v1/projects/p1/design');
    const payload = JSON.parse(textOf(result)) as { source: string };
    expect(payload.source).toBe('database');
    await client.close();
  });

  it('nexus_patch_design 用 PATCH 且 summary/ops 原样透传', async () => {
    const client = await connect(config);
    const ops = [{ op: 'set', nodeId: 'n1', path: 'name', value: '改名' }];
    const result = await client.callTool({
      name: 'nexus_patch_design',
      arguments: { projectId: 'p1', summary: '改个名字', ops },
    });
    expect(result.isError).toBeFalsy();
    expect(last?.method).toBe('PATCH');
    expect(last?.url).toBe('/api/v1/projects/p1/design');
    expect(JSON.parse(last?.body ?? '{}')).toEqual({ summary: '改个名字', ops });
    const payload = JSON.parse(textOf(result)) as { appliedOps: number };
    expect(payload.appliedOps).toBe(1);
    await client.close();
  });

  it('nexus_create_project 用 POST 且 name/kind 原样透传，回 201 的详情原样带回', async () => {
    const client = await connect(config);
    const result = await client.callTool({ name: 'nexus_create_project', arguments: { name: '新项目', kind: 'game' } });
    expect(result.isError).toBeFalsy();
    expect(last?.method).toBe('POST');
    expect(last?.url).toBe('/api/v1/projects');
    expect(last?.authorization).toBe('Bearer test-token');
    expect(JSON.parse(last?.body ?? '{}')).toEqual({ name: '新项目', kind: 'game' });
    const payload = JSON.parse(textOf(result)) as { id: string; kind: string };
    expect(payload.id).toBe('p2');
    expect(payload.kind).toBe('game');
    await client.close();
  });

  it('kind 不认识：平台的 400 + allowed 清单变成 isError，错误码留在文本里', async () => {
    const client = await connect(config);
    const result = await client.callTool({ name: 'nexus_create_project', arguments: { name: '新项目', kind: 'roguelike' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('400');
    expect(textOf(result)).toContain('unknown_kind');
    await client.close();
  });

  it('nexus_delete_project 用 DELETE，confirm 走查询串且中文名百分号编码后仍能逐字对上', async () => {
    const client = await connect(config);
    const result = await client.callTool({ name: 'nexus_delete_project', arguments: { projectId: 'p1', confirm: '演示项目' } });
    expect(result.isError).toBeFalsy();
    expect(last?.method).toBe('DELETE');
    expect(last?.url).toBe('/api/v1/projects/p1?confirm=%E6%BC%94%E7%A4%BA%E9%A1%B9%E7%9B%AE');
    const payload = JSON.parse(textOf(result)) as { deleted: boolean };
    expect(payload.deleted).toBe(true);
    await client.close();
  });

  it('确认词不对：平台的 400 approval_required 变成 isError，一个字节都没删', async () => {
    const client = await connect(config);
    const result = await client.callTool({ name: 'nexus_delete_project', arguments: { projectId: 'p1', confirm: '别的名字' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('400');
    expect(textOf(result)).toContain('approval_required');
    await client.close();
  });

  it('nexus_publish 用 POST 且 visibility 原样透传，回执（path/版本）原样带回', async () => {
    const client = await connect(config);
    const result = await client.callTool({ name: 'nexus_publish', arguments: { projectId: 'p1', visibility: 'unlisted' } });
    expect(result.isError).toBeFalsy();
    expect(last?.method).toBe('POST');
    expect(last?.url).toBe('/api/v1/projects/p1/publish');
    expect(JSON.parse(last?.body ?? '{}')).toEqual({ visibility: 'unlisted' });
    const payload = JSON.parse(textOf(result)) as { path: string; visibility: string };
    expect(payload.path).toBe('/n/demo/p1');
    expect(payload.visibility).toBe('unlisted');
    await client.close();
  });

  it('public 这一档在工具层就被拒：inputSchema 放行范围只有 unlisted / private（不进平台）', async () => {
    const client = await connect(config);
    const before = last;
    const result = await client.callTool({ name: 'nexus_publish', arguments: { projectId: 'p1', visibility: 'public' } });
    expect(result.isError).toBe(true);
    // 连请求都没发出去：放行范围收在 schema 里，不是发到平台再被拒一次
    expect(last?.url).toBe(before?.url);
    await client.close();
  });

  it('平台的 404 变成 isError 结果，状态码与错误码都留在文本里', async () => {
    const client = await connect(config);
    const result = await client.callTool({ name: 'nexus_get_project', arguments: { projectId: 'missing' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('404');
    expect(textOf(result)).toContain('project_not_found');
    await client.close();
  });

  it('凭据不对：401 原样说成错误结果，不吞也不重试', async () => {
    const client = await connect({ baseUrl, token: 'wrong' });
    const result = await client.callTool({ name: 'nexus_list_projects', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('401');
    expect(textOf(result)).toContain('invalid_token');
    await client.close();
  });

  it('平台不可达（连接被拒）说得出是传输问题，不是平台的拒绝', async () => {
    // 端口 1 上没有服务：这一格量的是"连不上"与"平台拒了"走两条不同的错误路径
    const dead = await connect({ baseUrl: 'http://127.0.0.1:1', token: 'test-token' });
    const result = await dead.callTool({ name: 'nexus_list_projects', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('NEXUS 平台不可达');
    await dead.close();
  });
});
