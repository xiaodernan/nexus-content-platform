import { headers } from 'next/headers';

/**
 * 对外 origin（§166 SEO 的绝对 URL 来源）。
 *
 * 为什么需要它：`og:url` / `canonical` / `sitemap.xml` 的 `<loc>` 只认绝对地址，
 * 而本站一切页面都是相对路径渲染的（§56 分享链接 `/n/<handle>/<slug>`）。
 *
 * 三条规则，按可信度排序：
 * 1. `NEXUS_PUBLIC_ORIGIN` 显式配置——部署时唯一值得信任的说法，忽略请求头，
 *    否则任何人都能用 `Host:` 把爬虫引到自己的域名上（`og:url` 会被索引）。
 * 2. 没配置时从**当前请求**推导：本地开发（`localhost:3100`）与反向代理未透传时也能拿到。
 *    `x-forwarded-host` 只在代理同时给了 `x-forwarded-proto` 时才采信——成对出现是
 *    "前面有一层会改写协议的代理"的记号；只有一个的更可能是客户端自己塞的头。
 * 3. 两条都给不出（没有请求上下文）时返回 `null`——调用方**省略**绝对 URL，
 *    而不是编一个 `localhost` 进生产页面的 head（§159）。
 */
let warnedBadOrigin = false;

function configured(): string | null {
  const raw = process.env.NEXUS_PUBLIC_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    // 配错了不该让每个公开页 500；但也别静默——退化到请求头推导，并把这条说一次
    if (!warnedBadOrigin) {
      warnedBadOrigin = true;
      console.warn(`[origin] NEXUS_PUBLIC_ORIGIN=${raw} 不是合法 URL，改用请求头推导绝对地址`);
    }
    return null;
  }
}

export interface RequestOrigin {
  /** `https://host` 形式；没有任何可用来源时为 null */
  origin: string | null;
  /** origin 从哪来：配置 / 请求头 / 拿不到。UI 与日志据此说明，不猜 */
  source: 'config' | 'request' | 'none';
}

export async function requestOrigin(): Promise<RequestOrigin> {
  const config = configured();
  if (config) return { origin: config, source: 'config' };
  try {
    const h = await headers();
    const forwardedProto = h.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = h.get('x-forwarded-host');
    const host = (forwardedProto && forwardedHost ? forwardedHost : null) ?? h.get('host');
    if (!host) return { origin: null, source: 'none' };
    const proto = forwardedProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return { origin: `${proto}://${host}`, source: 'request' };
  } catch {
    // headers() 在没有请求上下文时（构建期静态渲染、脚本直调）会抛：如实回落到"没有 origin"
    return { origin: null, source: 'none' };
  }
}

/** 拼绝对地址；origin 为 null 时返回 null，让调用方走"省略这条标签"的分支 */
export function absoluteUrl(origin: string | null, path: string): string | null {
  if (!origin) return null;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}
