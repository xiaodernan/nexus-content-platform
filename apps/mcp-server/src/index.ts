import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createNexusMcpServer } from './server.js';

/**
 * §188 MCP server 的 stdio 入口。
 *
 * stdout 是 MCP 协议通道，**任何日志都只能走 stderr**——往 stdout 打一行日志
 * 就是在协议流里塞脏字节，客户端会当作坏帧。
 *
 * 连接方式（外部 Agent 把这一行加进自己的 MCP 配置）：
 *   NEXUS_BASE_URL=http://localhost:3100 NEXUS_API_TOKEN=<在平台「账号 → API 凭据」签发的 token> \
 *     npx tsx apps/mcp-server/src/index.ts
 */
const baseUrl = process.env.NEXUS_BASE_URL ?? 'http://localhost:3100';
const token = process.env.NEXUS_API_TOKEN;
if (!token) {
  console.error('缺少 NEXUS_API_TOKEN 环境变量：先在平台的「账号 → API 凭据」签发一枚（需要 design:read / design:write scope）。');
  process.exit(1);
}

const server = createNexusMcpServer({ baseUrl, token });
await server.connect(new StdioServerTransport());
// stdio 传输靠进程存活维持会话；连接断开时由传输层自己退出
