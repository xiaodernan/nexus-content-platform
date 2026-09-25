/**
 * 实时连接计数（§163）。
 *
 * 每条 SSE 连接都握着一个订阅与一个心跳定时器，而**开多少条由客户端说了算**——
 * 不设上限的话，一个登录用户写个循环就能把服务端的定时器堆满。
 * 与审计写入路径加限流是同一个理由：新开的放大面要顺手收口。
 *
 * 只做计数，不做限流（限流是"多快"，这里是"同时几条"）。
 * 进程内计数，与总线驱动同一个限度：多实例下每个实例各算各的，够用。
 */

/** 同时连接上限。浏览器对同源 HTTP/1.1 只有约 6 条连接，给到 8 已经宽松 */
export const MAX_CONNECTIONS_PER_USER = 8;

const active = new Map<string, number>();

/** 尝试占一个名额；满了返回 false（调用方负责回 429 而不是硬开一条） */
export function acquireConnection(userId: string): boolean {
  const current = active.get(userId) ?? 0;
  if (current >= MAX_CONNECTIONS_PER_USER) return false;
  active.set(userId, current + 1);
  return true;
}

/** 释放名额。必须与 acquire 一一对应，否则会把用户永久挡在门外 */
export function releaseConnection(userId: string): void {
  const current = active.get(userId) ?? 0;
  if (current <= 1) active.delete(userId);
  else active.set(userId, current - 1);
}

export function activeConnections(userId: string): number {
  return active.get(userId) ?? 0;
}
