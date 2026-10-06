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
  it('tools/list 恰好四个工具，名字一个不多一个不少', async () => {
    const client = await connect(config);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'nexus_get_design',
      'nexus_get_project',
      'nexus_list_projects',
      'nexus_patch_design',
    ]);
    // 工具描述必须自带限度：写工具的 description 说过删除类 op 会被拒（§159：写在调用方看得见的地方）
    const patch = tools.tools.find((tool) => tool.name === 'nexus_patch_design')!;
    expect(patch.description).toContain('approval_required');
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
