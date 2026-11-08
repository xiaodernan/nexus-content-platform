import { gzipSync } from 'node:zlib';
import { NextResponse } from 'next/server';

/** API 层的统一出口：错误响应不带堆栈，避免泄露内部结构（§26 / SECURITY.md） */

/** 解析请求体；不是合法 JSON 时返回 null（注意合法的字面量 `null` 与失败无法区分，调用方都当失败处理） */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function jsonError(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

export function badRequest(issues: string[]): NextResponse {
  return jsonError(400, 'validation_failed', { issues });
}

export function notFound(): NextResponse {
  return jsonError(404, 'not_found');
}

export function failure(error: unknown, context: string): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[api] ${context}: ${message}`);
  return jsonError(500, 'internal', { message: '服务器处理失败，请稍后重试' });
}

/**
 * 回一段用户上传的字节（§80）。
 *
 * 这些字节来自不可信输入，而 URL 挂在本应用同源下，所以响应头必须假设
 * "有人会把脚本伪装成图片传上来"：
 * - `nosniff`：不让浏览器按内容猜类型（猜成 HTML 就变成同源脚本执行）
 * - `default-src 'none'`：即便被渲染，也拿不到任何执行/外联能力
 * - 类型只由服务端决定（magic bytes 判定结果），从不回显客户端的 Content-Type
 */
export function bytesResponse(bytes: Uint8Array, mime: string, cache: string): NextResponse {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'content-type': mime,
      'content-length': String(bytes.length),
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'accept-ranges': 'none',
    },
  });
}

/**
 * 小于这一档的报文不压。数字取自 `next start` 自带 compress 中间件的默认 threshold（1KB），
 * 同一句话在两处成立：小于 1KB 时 gzip 的头与字典就抵掉了省下的字节，还多一次 zlib 调用。
 * 导出是给测试拿它算边界用的——测试自己写死 1024 的话，这里改成 2048 时那一格会跟着错。
 */
export const API_GZIP_THRESHOLD_BYTES = 1024;

/**
 * 调用方声明收不收 gzip。按 RFC 9110 的**最具体的匹配胜出**：显式的 `gzip` 压过 `*`。
 *
 * 为什么不写成"扫一遍，看见 gzip 或 `*` 就算收"：那样会在 `gzip;q=0, *` 上判错——
 * 那一条的意思是"别的都行，就是不要 gzip"，而通配会把它盖过去，于是我们给一个明确拒收的
 * 客户端回 gzip，它可能根本解不开。`gzip;q=0` 单独出现时两条写法都对，所以这个 bug
 * 只在两者同时出现时才露头（测试表里原先只有前一种）。
 *
 * 质量值（q）只区分"0 = 拒收"与"非 0 = 收"，不参与排序：我们只会这一种编码，
 * 没有可排序的第二候选。
 */
export function acceptsGzip(req: Request): boolean {
  const header = req.headers.get('accept-encoding');
  if (!header) return false;
  let wildcard: boolean | null = null;
  for (const entry of header.split(',')) {
    const [token, ...params] = entry.trim().split(';');
    const name = token?.toLowerCase();
    if (name !== 'gzip' && name !== '*') continue;
    const q = params.find((p) => p.trim().toLowerCase().startsWith('q='));
    const accepted = !(q && Number(q.trim().slice(2)) === 0);
    // 显式 gzip 是最具体的匹配，见到就定案，后面的通配不再参与
    if (name === 'gzip') return accepted;
    wildcard = accepted;
  }
  return wildcard ?? false;
}

/**
 * 公网 v1 的 JSON 出口：够大且对方收得住就原样压一份 gzip。
 *
 * 为什么要在这里压：`next start` 自带的 compress 中间件**认得** `application/json`
 * （进程内拿它喂一份 5000B 的假响应，压到 40B），但 Route Handler 的写路径它没接住——
 * 同一台生产服务器上 `/` 的 HTML 回 `Content-Encoding: gzip`，而 `/api/v1/.../design`
 * 那份 3.2MB 的文档回 `identity`（两份头部都记在 docs/PERFORMANCE.md §188 那一节）。
 * 这一格没有分页也没有字段裁剪，所以报文体积就是调用方付的全部代价：3293KB → 103KB。
 *
 * `content-length` 两条路都自己写：值与体同源算出（gzip 那一路写的是**压过的**字节数），
 * 而不是指望框架补——这一格要是把原体的长度挂到压过的体上，客户端读到的是截断的 JSON。
 */
export function apiJson(data: unknown, req: Request, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  const plain = JSON.stringify(data);
  headers.set('content-type', 'application/json');
  if (!acceptsGzip(req) || Buffer.byteLength(plain, 'utf8') < API_GZIP_THRESHOLD_BYTES) {
    headers.set('content-length', String(Buffer.byteLength(plain, 'utf8')));
    return new NextResponse(plain, { ...init, headers });
  }
  const gzipped = gzipSync(Buffer.from(plain, 'utf8'));
  headers.set('content-encoding', 'gzip');
  headers.set('content-length', String(gzipped.length));
  // 同一 URL 会因为这一回头给不同的编码，缓存必须知道这件事；这一格虽然写着 no-store，
  // 但把 vary 漏掉等于"现在就没事、以后加缓存就出事"那种欠账
  const vary = headers.get('vary');
  headers.set('vary', vary && !/accept-encoding/i.test(vary) ? `${vary}, Accept-Encoding` : vary ?? 'Accept-Encoding');
  return new NextResponse(Buffer.from(gzipped), { ...init, headers });
}
