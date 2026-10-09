import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHttpServer } from '../src/http-server';

/**
 * §188 Streamable HTTP 这一半的纪律：工具层与 stdio 完全同一份（七个工具 = v1 七条端点），
 * 这里量的是**传输与门**——Bearer 每条请求都要有、会话建立时那枚 token 绑定整条会话、
 * 未知会话/缺会话/坏 body 各自的拒法，以及真 MCP 客户端走完整握手后工具面与 stdio 一致。
 * 后端是对真的本地 HTTP（stub）量，不 mock fetch。
 */

interface Captured {
  url: string | undefined;
  authorization: string | undefined;
}

let last: Captured | null = null;

const stub = createServer((req: IncomingMessage, res: ServerResponse) => {
  last = { url: req.url, authorization: req.headers.authorization };
  if (req.headers.authorization !== 'Bearer test-token') {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_token', message: '凭据不合法或已吊销' }));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/v1/projects') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ projects: [{ id: 'p1', name: '演示项目', pageCount: 2, nodeCount: 57 }] }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'project_not_found', message: '不在这一枚凭据所属的人名下' }));
});

let mcp: ReturnType<typeof createMcpHttpServer>;
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const stubAddress = stub.address();
  if (!stubAddress || typeof stubAddress === 'string') throw new Error('stub 没拿到端口');
  mcp = createMcpHttpServer(`http://127.0.0.1:${stubAddress.port}`);
  await new Promise<void>((resolve) => mcp.listen(0, '127.0.0.1', resolve));
  const mcpAddress = mcp.address();
  if (!mcpAddress || typeof mcpAddress === 'string') throw new Error('mcp 没拿到端口');
  base = `http://127.0.0.1:${mcpAddress.port}`;
});

afterAll(async () => {
  mcp.closeAllConnections?.();
  await new Promise<void>((resolve) => mcp.close(() => resolve()));
  stub.closeAllConnections?.();
  await new Promise<void>((resolve) => stub.close(() => resolve()));
});

const INIT_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe', version: '0.0.0' },
  },
};

interface RawOptions {
  method?: string;
  token?: string;
  sessionId?: string;
  body?: unknown;
  path?: string;
}

async function rawMcp(options: RawOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json, text/event-stream' };
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  if (options.sessionId !== undefined) headers['mcp-session-id'] = options.sessionId;
  const hasBody = options.body !== undefined;
  if (hasBody) headers['content-type'] = 'application/json';
  return fetch(`${base}${options.path ?? '/mcp'}`, {
    method: options.method ?? 'POST',
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
}

/** 真 MCP 客户端走完整握手（initialize → initialized → 之后的请求都带会话 id） */
async function connectClient(token: string) {
  const client = new Client({ name: 'vitest-http', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, transport };
}

/** 握手拿到会话 id（raw 走一遍 initialize，只取状态与会话头） */
async function initSession(token: string): Promise<string> {
  const res = await rawMcp({ token, body: INIT_BODY });
  expect(res.status).toBe(200);
  await res.body?.cancel().catch(() => undefined);
  const sessionId = res.headers.get('mcp-session-id');
  expect(sessionId, 'initialize 响应必须发 mcp-session-id').toBeTruthy();
  return sessionId!;
}

describe('MCP Streamable HTTP 入口（§188）', () => {
  it('每条请求都要 Bearer：缺了 401 并带 WWW-Authenticate；路径错 404', async () => {
    const noAuth = await rawMcp({ body: INIT_BODY });
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get('www-authenticate')).toContain('Bearer');
    const noAuthBody = (await noAuth.json()) as { error: string };
    expect(noAuthBody.error).toBe('unauthorized');

    const wrongPath = await rawMcp({ path: '/', token: 'test-token', body: INIT_BODY });
    expect(wrongPath.status).toBe(404);
  });

  it('会话绑定建立时那枚凭据：同会话换 token 401，原 token 才能 DELETE，删完就 404', async () => {
    const sessionId = await initSession('test-token');

    const otherToken = await rawMcp({ token: 'other-token', sessionId, body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} } });
    expect(otherToken.status).toBe(401);
    expect(((await otherToken.json()) as { error: string }).error).toBe('session_token_mismatch');

    const terminate = await rawMcp({ method: 'DELETE', token: 'test-token', sessionId });
    expect(terminate.status).toBe(200);

    const after = await rawMcp({ token: 'test-token', sessionId, body: { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} } });
    expect(after.status).toBe(404);
    expect(((await after.json()) as { error: string }).error).toBe('unknown_session');
  });

  it('缺会话 id 的非 initialize 请求被拒（400），GET/DELETE 缺会话 id 也是 400，未知会话 GET 是 404', async () => {
    const noSession = await rawMcp({ token: 'test-token', body: { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} } });
    expect(noSession.status).toBe(400);

    const getNoSession = await rawMcp({ method: 'GET', token: 'test-token' });
    expect(getNoSession.status).toBe(400);
    await getNoSession.body?.cancel().catch(() => undefined);

    const getUnknown = await rawMcp({ method: 'GET', token: 'test-token', sessionId: 'never-existed' });
    expect(getUnknown.status).toBe(404);
    await getUnknown.body?.cancel().catch(() => undefined);

    const deleteNoSession = await rawMcp({ method: 'DELETE', token: 'test-token' });
    expect(deleteNoSession.status).toBe(400);
  });

  it('坏 JSON body → 400 invalid_json（进不了传输层）', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_json');
  });

  it('真客户端完整握手：tools/list 恰好七个工具（与 v1 端点一一对应），限度话还在描述里', async () => {
    const { client } = await connectClient('test-token');
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
    const patch = tools.tools.find((tool) => tool.name === 'nexus_patch_design')!;
    expect(patch.description).toContain('approval_required');
    const pub = tools.tools.find((tool) => tool.name === 'nexus_publish')!;
    expect(pub.description).toContain('unlisted');
    await client.close();
  });

  it('真客户端调工具：会话绑定的 token 逐字出现在 v1 的 Authorization 里（stdio 与 HTTP 同一条通道）', async () => {
    const { client } = await connectClient('test-token');
    const result = await client.callTool({ name: 'nexus_list_projects', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(last?.url).toBe('/api/v1/projects');
    expect(last?.authorization).toBe('Bearer test-token');
    const content = (result as { content?: Array<{ text?: string }> }).content ?? [];
    const payload = JSON.parse(content.map((part) => part.text ?? '').join('')) as { projects: { id: string }[] };
    expect(payload.projects[0]!.id).toBe('p1');
    await client.close();
  });

  it('凭据本身不对（格式对、值错）：工具回 isError 且 401 原文在文本里——真伪仍只有 v1 说了算', async () => {
    const { client } = await connectClient('definitely-wrong');
    const result = await client.callTool({ name: 'nexus_list_projects', arguments: {} });
    expect(result.isError).toBe(true);
    const content = (result as { content?: Array<{ text?: string }> }).content ?? [];
    const text = content.map((part) => part.text ?? '').join('');
    expect(text).toContain('401');
    expect(text).toContain('invalid_token');
    await client.close();
  });
});
