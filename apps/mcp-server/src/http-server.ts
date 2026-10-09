import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createNexusMcpServer } from './server.js';

/**
 * §188 MCP server 的 Streamable HTTP 入口（ADR-0031 的后续：**仍然是外部客户端**）。
 *
 * 与 stdio 入口的关系：工具层一个字都不改（`createNexusMcpServer` 原样复用，七个工具
 * 还是 v1 七条端点的镜像），换的只是传输——远端 Agent 不能拉起本机进程，就给它一个
 * URL。挂的仍是 `{NEXUS_BASE_URL}/api/v1/*`，三道门（token 鉴权 / scope / 凭据级访问账）
 * 一跳不少。
 *
 * 鉴权形状与 stdio 不同，这是托管形态决定的：
 * - **没有环境变量里的共享凭据**。stdio 的那枚 token 是本机配置文件里的；HTTP 这边
 *   每条请求都要带 `Authorization: Bearer <token>`，一枚凭据跟着一条会话走；
 * - **会话绑定建立时那枚凭据**：同一条会话后面换 token → 401（不然"会话 A 建立、
 *   token B 调用"就成了提权缝）；
 * - HTTP 层只查"有没有、对不对得上会话"，**token 真假仍然只有 v1 说了算**（这一层
 *   不做第二套凭据库；假 token 走出去照样是 v1 的 401，进 isError 文本）。
 *
 * 会话模型：一个会话 = 一个 `McpServer` 实例 + 一枚 token（`StreamableHTTPServerTransport`
 * 状态模式）。initialize 建会话，DELETE 结束（传输层自答 200 并回调 `onsessionclosed`）。
 * 没带会话 id 又不是 initialize 的请求照样先建对再让传输层拒（400 从传输层来，一个
 * 口径）；建不出会话的当场关掉，不留悬空实例。
 */

interface Session {
  token: string;
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

/** MCP 报文（patch 动手一次 200 条 ops 也可能几 MB）；上限之外直接 413，不无界攒内存 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('body 太大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(payload));
}

export function createMcpHttpServer(baseUrl: string): HttpServer {
  const sessions = new Map<string, Session>();

  async function createSession(token: string): Promise<Session> {
    const server = createNexusMcpServer({ baseUrl, token });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, session);
      },
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
        // 传输层随后还要 close 自己（handleDeleteRequest 的 finally），这里延后一步再关
        // server，避免两层 close 撞在同一拍上互相抛错
        setImmediate(() => void server.close().catch(() => undefined));
      },
    });
    const session: Session = { token, server, transport };
    await server.connect(transport);
    return session;
  }

  return createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      const status = (error as { status?: number }).status ?? 500;
      sendJson(res, status, {
        error: status === 413 ? 'payload_too_large' : 'internal_error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/mcp') {
      sendJson(res, 404, { error: 'not_found', message: 'MCP 入口在 POST/GET/DELETE /mcp' });
      return;
    }

    // 凭据跟着每条请求走（会话不携带权限，见文件头）
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!token) {
      sendJson(
        res,
        401,
        { error: 'unauthorized', message: '需要 Authorization: Bearer <API token>（平台「账号 → API 凭据」签发）' },
        { 'www-authenticate': 'Bearer realm="mcp"' },
      );
      return;
    }

    const rawSessionId = req.headers['mcp-session-id'];
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId : undefined;

    if (req.method === 'POST') {
      const raw = await readBody(req);
      let parsedBody: unknown;
      if (raw) {
        try {
          parsedBody = JSON.parse(raw) as unknown;
        } catch {
          sendJson(res, 400, { error: 'invalid_json', message: 'POST body 必须是 JSON-RPC 报文' });
          return;
        }
      }
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (!session) {
          sendJson(res, 404, { error: 'unknown_session', message: '会话不存在或已结束：重新 initialize' });
          return;
        }
        if (session.token !== token) {
          sendJson(res, 401, {
            error: 'session_token_mismatch',
            message: '这条会话是用另一枚凭据建立的：要换凭据就重新 initialize 一条会话',
          });
          return;
        }
        await session.transport.handleRequest(req, res, parsedBody);
        return;
      }
      // 没带会话 id：只可能是 initialize。传输层负责拒掉不该建会话的请求，
      // 拒掉的那对（sessionId 没生成、也没进 sessions）当场关掉，不留悬空实例
      const session = await createSession(token);
      await session.transport.handleRequest(req, res, parsedBody);
      if (!session.transport.sessionId) {
        await session.server.close().catch(() => undefined);
      }
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!sessionId) {
        sendJson(res, 400, { error: 'missing_session', message: `${req.method} 必须带 mcp-session-id` });
        return;
      }
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { error: 'unknown_session', message: '会话不存在或已结束：重新 initialize' });
        return;
      }
      if (session.token !== token) {
        sendJson(res, 401, {
          error: 'session_token_mismatch',
          message: '这条会话是用另一枚凭据建立的：要换凭据就重新 initialize 一条会话',
        });
        return;
      }
      // DELETE 的 200 与会话清理（onsessionclosed）都在传输层里完成
      await session.transport.handleRequest(req, res);
      return;
    }

    sendJson(res, 405, { error: 'method_not_allowed', message: '只收 POST / GET / DELETE' });
  }
}
