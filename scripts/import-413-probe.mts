/**
 * 413 那一格的真请求验证。
 *
 * 用法：先起服务（`npm run dev`），再 `npx tsx scripts/import-413-probe.mts`。
 *
 * 为什么是一条脚本而不是 vitest 用例：这一格要的是**真 HTTP**——真 middleware 签的会话与 CSRF、
 * 真路由、真状态码。而 Playwright 那条 e2e（`e2e/import.spec.ts` 里同名那一条）在本机跑不起来：
 * 沙箱的批量删除守卫不让 Playwright 清 `test-results/`（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。
 * 本仓已有 `realtime-two-process.mts` / `two-instance-roundtrip.mts` 两个同类先例，
 * 需要真进程/真 HTTP 的验证就走脚本这一路。
 *
 * 它量到的两件事（2026-10-07）：
 *  1. 413 那条路是真的：声明 2GB → `413 {"error":"too_large","reason":"整包 2048MB 超过导入上限 128MB"}`。
 *  2. **"早拒就省下正文"不成立**：服务端把 2GB 正文全读掉了（10.8 秒），响应在正文排完之后才到。
 *     路由里"读正文之前就比 content-length"只说明**判定**早，不说明**字节**没被收下。
 *     也不是攒在内存里——2GB 流式排掉，空闲约 2.5GB 的机器没有 OOM。
 */
import { request as httpRequest, type IncomingMessage } from 'node:http';

const BASE = { hostname: 'localhost', port: Number(process.env.NEXUS_WEB_PORT ?? 3100) };
const jar = new Map<string, string>();

function absorb(res: IncomingMessage): void {
  for (const raw of res.headers['set-cookie'] ?? []) {
    const [pair] = raw.split(';');
    const eq = pair?.indexOf('=') ?? -1;
    if (pair && eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

const cookieHeader = (): string => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

function send(
  path: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body?: Buffer,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ ...BASE, path, method, headers: { cookie: cookieHeader(), ...headers } }, (res) => {
      absorb(res);
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => {
        raw += c;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: raw }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** 声明一个远超上限的包，正文按块推（不把 2GB 攒在内存里） */
function oversizedImport(declared: number): Promise<{ status: number; body: string; sent: number }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let sent = 0;
    const req = httpRequest(
      {
        ...BASE,
        path: '/api/projects/import',
        method: 'POST',
        headers: {
          cookie: cookieHeader(),
          'x-csrf-token': jar.get('nexus_csrf') ?? '',
          'content-type': 'multipart/form-data; boundary=nexus413probe',
          'content-length': String(declared),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          raw += c;
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({ status: res.statusCode ?? 0, body: raw, sent });
        });
      },
    );
    const chunk = Buffer.alloc(1024 * 1024);
    const pump = async (): Promise<void> => {
      while (!settled && sent < declared) {
        sent += chunk.length;
        // 让出事件循环，否则同步写会饿死响应回调
        if (req.write(chunk)) await new Promise<void>((r) => setImmediate(r));
        else await new Promise<void>((r) => req.once('drain', () => r()));
      }
      if (!settled && sent >= declared) req.end();
    };
    req.on('error', (e) => {
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
    void pump().catch(() => {
      /* 连接被服务端收了是预期的 */
    });
  });
}

const home = await send('/', 'GET', {});
console.log('GET / →', home.status, '| cookies:', [...jar.keys()].join(', ') || '(无)');

const reg = await send(
  '/api/auth/register',
  'POST',
  { 'x-csrf-token': jar.get('nexus_csrf') ?? '', 'content-type': 'application/json' },
  Buffer.from(
    JSON.stringify({
      email: `probe413+${Date.now().toString(36)}@nexus.test`,
      password: 'probe-413-pass',
      displayName: 'Probe 413',
    }),
  ),
);
console.log('POST /api/auth/register →', reg.status);

const declared = 2 * 1024 * 1024 * 1024;
const started = Date.now();
const result = await oversizedImport(declared);
const elapsed = Date.now() - started;
console.log('POST /api/projects/import（声明 2GB）→', result.status);
console.log(`  正文写了 ${result.sent} 字节（声明 ${declared}），耗时 ${elapsed}ms`);
console.log('  响应：', result.body.slice(0, 200));
console.log('判定：', result.status === 413 ? 'PASS（413 是真的）' : 'FAIL');
console.log(
  result.sent >= declared
    ? '  附注：正文被全部读掉——"早拒就省下正文"不成立'
    : '  附注：正文没有读完就收到了响应',
);
process.exit(0);
