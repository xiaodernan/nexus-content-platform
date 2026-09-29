import { gunzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKEN_PREFIX, newApiToken } from '../src/server/domain/api-tokens';
import { API_GZIP_THRESHOLD_BYTES, acceptsGzip, apiJson } from '../src/server/http';

/**
 * §188 第四片：公网 v1 那三个只读端点加一个写端点的 JSON 出口。
 *
 * 这一片要证的不是"能压"，而是**压了之后说得出话**：调用方收到 `content-encoding: gzip` 时
 * 解开必须是原样那一份 JSON；没声明收 gzip、或报文本来就小的时候必须是 identity，
 * 否则"我们把它压了"这句文档里的话会对着一份客户端读不懂的字节。
 * 边界那两格从导出的常量算，不在测试里重写 1024——常量改成 2048 时这里要跟着动，而不是悄悄错开。
 *
 * 最后一组是结构门：v1 的路由里不许再出现裸的 `NextResponse.json(...)`。
 * 一份 4000 节点的文档是 3.3MB（docs/PERFORMANCE.md 有实测），漏一格就是那一格原样推出去；
 * 而"漏了一格"这种东西在响应码上完全看不出差别，只能从代码形状上钉。
 */

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const V1_DIR = join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'api', 'v1');

function reqWith(acceptEncoding?: string): Request {
  const headers: Record<string, string> = {};
  if (acceptEncoding !== undefined) headers['accept-encoding'] = acceptEncoding;
  return new Request('http://nexus.local/api/v1/projects', { headers });
}

/** 造一份 JSON 长度**正好**为 target 的报文：边界两格靠它，手数补几个 x 是编不出来的 */
function payloadOfJsonLength(target: number): { filler: string } {
  const overhead = JSON.stringify({ filler: '' }).length;
  return { filler: 'x'.repeat(target - overhead) };
}

async function textOf(res: Response): Promise<string> {
  const buf = Buffer.from(await res.arrayBuffer());
  return res.headers.get('content-encoding') === 'gzip' ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}

describe('acceptsGzip：只看调用方有没有说它收', () => {
  const cases: { header: string; want: boolean }[] = [
    { header: 'gzip', want: true },
    { header: 'GZIP', want: true },
    { header: 'br, gzip, deflate', want: true },
    { header: '*', want: true },
    { header: 'gzip;q=1.0', want: true },
    { header: 'gzip;q=0.5', want: true },
    { header: 'gzip;q=0', want: false },
    // 明确拒收 gzip 又带了通配：按 RFC 9110 的"最具体的匹配胜出"，gzip 那一格该压过 `*`
    { header: 'gzip;q=0, *', want: false },
    { header: '*;q=0, gzip', want: true },
    { header: 'br', want: false },
    { header: 'deflate', want: false },
    { header: 'identity', want: false },
    { header: '', want: false },
  ];
  for (const c of cases) {
    it(`accept-encoding="${c.header}" → ${c.want ? '压' : '不压'}`, () => {
      expect(acceptsGzip(reqWith(c.header))).toBe(c.want);
    });
  }

  it('头整个缺席时不收：不能把"没说"读成"都要"', () => {
    expect(acceptsGzip(reqWith())).toBe(false);
  });

  it('`gzipx` / `xgzip` 这种不相干的 token 不算同意（前缀匹配会把它当成 gzip）', () => {
    expect(acceptsGzip(reqWith('gzipx'))).toBe(false);
    expect(acceptsGzip(reqWith('xgzip'))).toBe(false);
  });
});

describe('apiJson：够大且对方收得住才压', () => {
  const plain = { projects: [{ id: 'p1', name: '一份小清单' }] };

  it('声明 gzip 且过阈值：回 gzip，解开是原样那一份 JSON，且线上真的比原体短', async () => {
    const body = payloadOfJsonLength(API_GZIP_THRESHOLD_BYTES);
    const res = apiJson(body, reqWith('gzip, br'));
    const raw = Buffer.from(await res.arrayBuffer());
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(gunzipSync(raw).toString('utf8')).toBe(JSON.stringify(body));
    // 只挂头不压等于骗人：这一条要求线上的字节确实比原体短
    expect(raw.length).toBeLessThan(Buffer.byteLength(JSON.stringify(body), 'utf8'));
  });

  it('两条路的 content-length 说的都是这一次真正发出去的字节', async () => {
    const body = payloadOfJsonLength(API_GZIP_THRESHOLD_BYTES * 3);
    const expectedPlain = Buffer.byteLength(JSON.stringify(body), 'utf8');
    const gz = apiJson(body, reqWith('gzip'));
    const gzBytes = Buffer.from(await gz.arrayBuffer());
    // 挂原体的长度是最坏的一种错：客户端按头读，读回来的是截断的 JSON
    expect(Number(gz.headers.get('content-length'))).toBe(gzBytes.length);
    expect(gzBytes.length).toBeLessThan(expectedPlain);
    const plain = apiJson(body, reqWith('identity'));
    const plainBytes = Buffer.from(await plain.arrayBuffer());
    expect(plain.headers.get('content-encoding')).toBeNull();
    expect(Number(plain.headers.get('content-length'))).toBe(plainBytes.length);
    expect(plainBytes.length).toBe(expectedPlain);
  });

  it('没声明 gzip：同样的大报文走 identity，一个字节都不压', async () => {
    const body = payloadOfJsonLength(API_GZIP_THRESHOLD_BYTES * 4);
    const res = apiJson(body, reqWith('br'));
    expect(res.headers.get('content-encoding')).toBeNull();
    expect(await textOf(res)).toBe(JSON.stringify(body));
  });

  it('阈值以下不压（压了加上头反而更长），阈值那一格本身压', async () => {
    const below = payloadOfJsonLength(API_GZIP_THRESHOLD_BYTES - 1);
    const at = payloadOfJsonLength(API_GZIP_THRESHOLD_BYTES);
    expect(Buffer.byteLength(JSON.stringify(below), 'utf8')).toBe(API_GZIP_THRESHOLD_BYTES - 1);
    expect(Buffer.byteLength(JSON.stringify(at), 'utf8')).toBe(API_GZIP_THRESHOLD_BYTES);
    const r1 = apiJson(below, reqWith('gzip'));
    const r2 = apiJson(at, reqWith('gzip'));
    expect(r1.headers.get('content-encoding')).toBeNull();
    expect(r2.headers.get('content-encoding')).toBe('gzip');
    expect(await textOf(r2)).toBe(JSON.stringify(at));
  });

  it('CJK 按字节算不按字符算：字符数不到阈值、字节数过阈值的报文必须压', async () => {
    // '中' 在 utf8 里是 3 字节，取刚好越过阈值的那个字符数
    const chars = Math.ceil((API_GZIP_THRESHOLD_BYTES + 1) / 3);
    const body = { text: '中'.repeat(chars) };
    expect(JSON.stringify(body).length).toBeLessThan(API_GZIP_THRESHOLD_BYTES);
    expect(Buffer.byteLength(JSON.stringify(body), 'utf8')).toBeGreaterThan(API_GZIP_THRESHOLD_BYTES);
    const res = apiJson(body, reqWith('gzip'));
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(await textOf(res)).toBe(JSON.stringify(body));
    // 同一份 CJK 报文走 identity 那一路也得有见证：头里的长度必须是 utf8 字节数。
    // 上面那条"两条路的 content-length"用的是 ASCII 报文，字符数==字节数，看不见"把 utf16
    // 字符数当长度挂上去"那种错——变异探针 A2 就是这么露出来的（改 production 的那一行，26 条全绿）。
    const unpressed = apiJson(body, reqWith('identity'));
    const unpressedBytes = Buffer.from(await unpressed.arrayBuffer());
    expect(unpressed.headers.get('content-encoding')).toBeNull();
    expect(Number(unpressed.headers.get('content-length'))).toBe(unpressedBytes.length);
    // 这一格是靶子本身：字符数与字节数在这里必须不相等，相等这条用例就什么都没量
    expect(JSON.stringify(body).length).not.toBe(unpressedBytes.length);
  });

  it('两条路都带着 no-store，除非调用方自己写了别的', async () => {
    expect(apiJson(plain, reqWith()).headers.get('cache-control')).toBe('no-store');
    const big = apiJson(payloadOfJsonLength(API_GZIP_THRESHOLD_BYTES * 3), reqWith('gzip'));
    expect(big.headers.get('cache-control')).toBe('no-store');
    expect(await textOf(big)).toBe(JSON.stringify(payloadOfJsonLength(API_GZIP_THRESHOLD_BYTES * 3)));
    const explicit = apiJson(plain, reqWith(), { headers: { 'cache-control': 'private' } });
    expect(explicit.headers.get('cache-control')).toBe('private');
  });

  it('vary 里补上 Accept-Encoding，但不吃掉调用方已有的那一串', () => {
    const gzip = apiJson(payloadOfJsonLength(API_GZIP_THRESHOLD_BYTES * 2), reqWith('gzip'));
    expect(String(gzip.headers.get('vary'))).toMatch(/accept-encoding/i);
    const withVary = apiJson(payloadOfJsonLength(API_GZIP_THRESHOLD_BYTES * 2), reqWith('gzip'), {
      headers: { vary: 'X-Custom' },
    });
    expect(String(withVary.headers.get('vary'))).toMatch(/X-Custom/i);
    expect(String(withVary.headers.get('vary'))).toMatch(/accept-encoding/i);
  });

  it('状态码与自定义头透传（清单那一格靠 x-nexus-token-hint 回一句凭据提示）', async () => {
    // 头值从生产那一枚真凭据的形状取，不自己编：HTTP 头只收 Latin1，随手写的省略号会让这一格红在
    // 一个生产根本不会出现的值上（第一遍跑就是 `'abcd…9'`，红的是 Headers，不是 apiJson）
    const hint = newApiToken().slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 8);
    const res = apiJson(plain, reqWith(), { status: 201, headers: { 'x-nexus-token-hint': hint } });
    expect(res.status).toBe(201);
    expect(res.headers.get('x-nexus-token-hint')).toBe(hint);
    expect(await textOf(res)).toBe(JSON.stringify(plain));
  });
});

/** v1 目录下的路由文件：与 api-tokens.test.ts 同一套走法，非 .ts 的一律跳过 */
function routeSources(): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!full.endsWith('.ts')) continue;
      out.push({ path: full, source: readFileSync(full, 'utf8').replace(/\r\n/g, '\n') });
    }
  };
  walk(V1_DIR);
  return out;
}

describe('结构门：v1 的 JSON 出口只能是 apiJson', () => {
  it('扫到的路由文件里确实有东西（空集不能绿成"一致"）', () => {
    const files = routeSources();
    expect(files.length, `${V1_DIR} 下一个 .ts 都没有，下面两条是在比空集`).toBeGreaterThanOrEqual(3);
  });

  it('没有一处裸的 NextResponse.json：大报文不许绕过阈值与编码协商', () => {
    const offenders = routeSources()
      .filter((r) => /NextResponse\.json\s*\(/.test(r.source))
      .map((r) => r.path.slice(V1_DIR.length).replaceAll('\\', '/'));
    expect(offenders, `这些 v1 路由还在直接回 NextResponse.json（不压、也不看 accept-encoding）：${offenders.join(' ')}`).toEqual(
      [],
    );
  });

  it('四个已落的方法各自都走 apiJson，且把请求本身传了进去', () => {
    const sites = routeSources()
      .flatMap((r) => [...r.source.matchAll(/apiJson\s*\(([^,]+),\s*req\b/g)])
      .map((m) => m[1]!.trim());
    expect(sites.length, 'v1 路由里一个 apiJson 调用都没扫到：没扫到东西不算通过').toBeGreaterThanOrEqual(4);
    expect(sites, `apiJson 的第一份参数该是报文，不是 req：${sites.join(' ')}`).not.toContain('req');
  });
});
