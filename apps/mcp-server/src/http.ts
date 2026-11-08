import { createMcpHttpServer } from './http-server.js';

/**
 * §188 MCP server 的 Streamable HTTP 入口（远端 Agent 接进来的那一扇门）。
 *
 * 与 stdio 入口（`index.ts`）共用同一层工具（`createNexusMcpServer`），所以：
 * - stdout 这里**不是**协议通道，日志照常打（stdio 那边的日志必须走 stderr）；
 * - 凭据不在环境变量里签：每条请求带 `Authorization: Bearer <token>`，
 *   会话建立时那枚 token 绑定整条会话（换 token 要重新 initialize）；
 * - 平台不在（BASE_URL 配错）时工具照旧回 `NEXUS 平台不可达…`，这一层不缓存不旁路。
 *
 * 连接方式（外部 Agent 把这个 URL 与自己的一枚 token 写进 MCP 配置）：
 *   NEXUS_BASE_URL=http://localhost:3100 MCP_HTTP_PORT=3400 npm run mcp:serve:http
 *   → POST/GET/DELETE http://127.0.0.1:3400/mcp
 */
const baseUrl = process.env.NEXUS_BASE_URL ?? 'http://localhost:3100';
const port = Number(process.env.MCP_HTTP_PORT ?? 3400);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`MCP_HTTP_PORT 不是合法端口（收到 ${process.env.MCP_HTTP_PORT}）。`);
  process.exit(1);
}

const server = createMcpHttpServer(baseUrl);
server.listen(port, () => {
  console.log(`NEXUS MCP（Streamable HTTP）已启动：POST http://127.0.0.1:${port}/mcp`);
  console.log(`挂的是 ${baseUrl}/api/v1/*；每条请求带 Authorization: Bearer <平台「账号 → API 凭据」签发的 token>。`);
});
