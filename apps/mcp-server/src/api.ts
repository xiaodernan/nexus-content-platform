/**
 * §188 MCP server 对平台的唯一通道：公开 API v1。
 *
 * 这个进程**就是外部 Agent**——它没有业务库连接、没有内部 import，
 * 平台能给它的全部来自 `{NEXUS_BASE_URL}/api/v1/*` + Bearer 凭据。
 * 这样 MCP 这一格自动继承 v1 已有的三道门（token 鉴权、scope、凭据级访问账），
 * 不需要在旁边再养一套特权通道。
 */
export interface NexusApiConfig {
  baseUrl: string;
  token: string;
}

export interface V1CallResult {
  status: number;
  body: unknown;
}

/** 连不上平台（DNS/拒绝连接/超时）与平台回了 4xx/5xx 是两种错：前者抛出，后者照常返回 */
export class V1TransportError extends Error {}

export async function callV1(
  config: NexusApiConfig,
  method: 'GET' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<V1CallResult> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error: unknown) {
    throw new V1TransportError(
      `NEXUS 平台不可达（${config.baseUrl}）：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}
