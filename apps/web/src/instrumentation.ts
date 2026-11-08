import type { Instrumentation } from 'next';
import { TRACE_HEADER, increment, sanitizeTraceId } from './server/observability';

/**
 * Next 服务器捕获到的未处理错误——`docs/ROADMAP.md` 那格"只能靠审计表 + stderr"里，
 * 这一片补的是 stderr 那一半：**以前那条错误日志不知道自己是哪一次请求**，
 * 现在它带着 `x-nexus-trace`，同一次请求的审计行、限流判定、回执头能对着同一个 id 串起来。
 *
 * 为什么只用 `onRequestError` 这一个钩子：Next 16 的 instrumentation 只给 `register()` 与
 * `onRequestError`（见 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`），
 * 没有"每个请求进来/结束"的回调，而响应码与整请求耗时在中间件里也拿不到（中间件返回的是自己造的那份响应）。
 * 所以按路由状态码计数这件事**今天没有真数据源**，不写一个空的格子假装接上了；
 * 要接的话得先动 101 个路由的形状，那是另一片（ADR-0063 记了这个取舍）。
 */

/**
 * 打到 stderr 的那一行只取 path 的问号前一段。
 * `request.path` 是带查询串的（文档里的例子就是 `/blog?name=foo`），而这个平台的路径里有
 * `/api/search?q=<用户输入>` 这种——把查询串原样落进日志等于把用户输入抄进一个通常更松、
 * 保留期更长、访问面更广的地方。
 */
function pathOnly(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

/** 同理，错误正文可能是驱动或 provider 抛出来的、里面夹着参数的那一句——留一行足够定位，留全文就是另一个存储层 */
function oneLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const first = message.split('\n')[0] ?? '';
  return first.length > 200 ? `${first.slice(0, 200)}…` : first;
}

/** `onRequestError` 给的头是 `NodeJS.Dict<string | string[]>`（不是 Headers 对象），数组时取第一条 */
function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ?? null;
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  increment('nexus_http_errors_total', { routeType: context.routeType });
  // 追踪 id 由中间件签在请求头上；被中间件排除的路径（`api/projects/import`）本来就没有这一头，
  // 于是这一行照打，只是 trace 位置写 `-`——"这一条没有关联 id"也是要看得见的事实，不是可以糊掉的空格
  const trace = sanitizeTraceId(headerValue(request.headers as Record<string, string | string[]>, TRACE_HEADER));
  console.error(
    `[api] 未处理错误 trace=${trace ?? '-'} method=${request.method} path=${pathOnly(request.path)} ` +
      `routeType=${context.routeType} route=${context.routePath}：${oneLine(error)}`,
  );
};
