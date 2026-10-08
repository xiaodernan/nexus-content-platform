import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  API_TOKEN_RATE_LIMITS_PER_MINUTE,
  API_TOKEN_SCOPES,
  ApiDesignPatchRequestSchema,
  type ApiTokenScope,
  type ApiTokenRecord,
} from '@nexus/schemas';
import {
  API_RATE_LIMIT_PER_MINUTE,
  API_WRITE_RATE_LIMIT_PER_MINUTE,
  LAST_USED_WRITE_INTERVAL_MS,
  TOKEN_PREFIX,
  bearerFrom,
  hasScope,
  hashApiToken,
  isWriteScope,
  newApiToken,
} from '../src/server/domain/api-tokens';

/**
 * §188 的纯单测那一半：凭据的形状、"头怎么写"、公开补丁的报文门。
 *
 * 这一份不碰库，所以它证明的是"代码说的是同一套话"：token 长什么样、什么形状的头算 Bearer、
 * 以及** scope 名单在三个地方（schemas 常量 / 迁移里生效的那条 CHECK / v1 端点的实际执行）是不是同一份**。
 * 那三处各写一遍是这类系统最容易漂开的地方——加了一格 scope 却没有端点执行它，
 * 界面上就多一条谁都用不了的权限（§159）；端点用了名单外的 scope，库里的 CHECK 又拦不住写入。
 * 所以这里比的是集合，而不是"我以为我对过"。
 */

/** 仓库根：从这份测试自己的位置往上走，而不是从 process.cwd() 猜——跑测试的目录不止一个 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const V1_DIR = join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'api', 'v1');
const MIGRATIONS_DIR = join(REPO_ROOT, 'infra', 'migrations');
const SCOPE_CHECK_NAME = 'api_tokens_scopes_known';

/**
 * 迁移里**生效**的那条 scope CHECK：扫所有 .sql，取最后一次 `ADD CONSTRAINT`。
 *
 * 不是第一次：0019 是把 0018 那条约束整个换掉（`<@` 的语义要求先 DROP 再 ADD，两条并存时旧的
 * 会把新值挡死），所以第一条是过期定义，读它等于拿一份库里根本不执行的名单来比常量。
 * "取后者"这件事是下面那个文件循环在做（循环不倒着排、把 `.sort()` 改一下就会红），文件内的
 * `lastIndexOf` 只是同一句话在同一处的写法——今天还没有哪个迁移在一个文件里换两次这条约束。
 * 读不到 ADD 就抛——"没读到"不能绿成"名单一致"。
 */
function scopesInMigration(): { values: string[]; definedIn: string } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  expect(files.length, `${MIGRATIONS_DIR} 下一个 .sql 都没有，那这个比对是在比空集`).toBeGreaterThan(0);
  let statement: string | null = null;
  let definedIn = '';
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/\r\n/g, '\n');
    // 只认 ADD：DROP 那条也含约束名，但它定义不了任何名单
    const at = sql.lastIndexOf(`ADD CONSTRAINT "${SCOPE_CHECK_NAME}"`);
    if (at < 0) continue;
    // 那条 ALTER 在 SQL 里换了两行，所以取"从 ADD 到分号"这一段，而不是取一行
    statement = sql.slice(at).split(';')[0]!;
    definedIn = file;
  }
  if (!statement) throw new Error(`没有任何迁移 ADD CONSTRAINT "${SCOPE_CHECK_NAME}"：这条 CHECK 不存在`);
  const arrayLiteral = statement.match(/ARRAY\[(.*?)\]::text\[\]/s);
  if (!arrayLiteral?.[1]) throw new Error(`${definedIn} 的 CHECK 里没有 ARRAY[...]::text[] 那一段：${statement}`);
  const values = [...arrayLiteral[1].matchAll(/'([^']*)'/g)].map((m) => m[1]!);
  expect(values.length, `${definedIn} 的 CHECK 里一个 scope 都没有，这个比对什么都没看`).toBeGreaterThan(0);
  return { values, definedIn };
}

/** 一个导出的方法：它自己那一段源码里授权了哪些 scope */
interface RouteMethod {
  method: string;
  scopes: ApiTokenScope[];
  /** 这一段身子里 recordApiAccess 用到的端点名。只收字面量，拼出来的那一种由下面那条用例挡 */
  endpoints: string[];
}

interface RouteFile {
  path: string;
  source: string;
  /** 这个文件里对 authorizeApiRequest 的调用：[scope] */
  scopes: ApiTokenScope[];
  /** 导出的 HTTP 方法名（大写） */
  methods: string[];
  /** 方法 ↔ 它调用的 scope，按源码位置配对：不配对就看不出"GET 拿了写 scope" */
  perMethod: RouteMethod[];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

function scopesAuthorized(text: string): ApiTokenScope[] {
  // 正则给不出字面量联合，这里只做类型层面的桥接：从源码里读出来的 scope 是不是名单内的那一格，
  // 由下面那条"端点用的 scope 都在名单内"在运行时判——类型不能替它背书
  return [...text.matchAll(/authorizeApiRequest\(\s*req\s*,\s*'([^']+)'\s*\)/g)].map((m) => m[1]!) as ApiTokenScope[];
}

function v1Routes(): RouteFile[] {
  const files = walk(V1_DIR);
  expect(files.length, 'v1 目录下一个路由文件都没有，那下面所有比对都是在比空集').toBeGreaterThan(0);
  return files.map((path) => {
    const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    const handlers = [...source.matchAll(/export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g)];
    const perMethod: RouteMethod[] = handlers.map((handler, i) => {
      const bodyStart = handler.index + handler[0].length;
      const next = handlers[i + 1];
      // 到下一个导出函数为止：这一段就是这个方法自己的身子
      const body = source.slice(bodyStart, next ? next.index : source.length);
      return {
        method: handler[1]!.toUpperCase(),
        scopes: scopesAuthorized(body),
        endpoints: [...body.matchAll(/endpoint:\s*'([^']+)'/g)].map((m) => m[1]!),
      };
    });
    return {
      path,
      source,
      scopes: scopesAuthorized(source),
      methods: handlers.map((h) => h[1]!.toUpperCase()),
      perMethod,
    };
  });
}

describe('Bearer 头的形状：只认头，不认内容', () => {
  it('认得带与不带大小写的 Bearer，多余空白也吃得下', () => {
    expect(bearerFrom('Bearer abc123')).toBe('abc123');
    expect(bearerFrom('bearer abc123')).toBe('abc123');
    expect(bearerFrom('BEARER abc123')).toBe('abc123');
    expect(bearerFrom('   Bearer    abc123  ')).toBe('abc123');
    // 一段凭据里出现空白就是两个词，那不是"带空格的 token"，是写坏了的头
    expect(bearerFrom('Bearer abc 123')).toBeNull();
  });

  it('没带、其它 scheme、缺凭据、超长都算"没有凭据"而不是"凭据错"', () => {
    expect(bearerFrom(null)).toBeNull();
    expect(bearerFrom('')).toBeNull();
    expect(bearerFrom('Basic abc123')).toBeNull();
    expect(bearerFrom('Bearer')).toBeNull();
    expect(bearerFrom('Bearer ')).toBeNull();
    expect(bearerFrom('abc123')).toBeNull();
    // 上限是防"一整块文档被塞进头"，不是防正常凭据：正常的是 prefix + 64 hex
    expect(bearerFrom(`Bearer ${'x'.repeat(201)}`)).toBeNull();
    expect(bearerFrom(`Bearer ${'x'.repeat(200)}`)).toBe('x'.repeat(200));
  });
});

describe('凭据明文与哈希', () => {
  it('明文以固定前缀开头，随机段是 64 位小写十六进制', () => {
    const token = newApiToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(token.slice(TOKEN_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toMatch(/[+/=]/); // 不是 base64：贴进 CI 时不必解释"这个 + 是不是被转义过的"
  });

  it('连着发 200 枚没有重复（碰撞在 256 位随机数上不该看见）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(newApiToken());
    expect(seen.size).toBe(200);
  });

  it('哈希是稳定的 64 位十六进制，且不等于明文', () => {
    const token = newApiToken();
    const digest = hashApiToken(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(hashApiToken(token));
    expect(digest).not.toBe(token);
    expect(digest).not.toContain(token.slice(-8));
    // 反向对照：换一个字符就得换一个摘要——否则"按哈希查"可能是按前缀查。
    // 换的那一位必须挑一个真不一样的：明文尾巴是随机十六进制，写死 '0' 就是掷骰子，
    // 原文那一位本来就是 '0' 时（每 16 枚一枚）这一句红的是测试自己，不是代码。
    const neighbour = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
    expect(neighbour).not.toBe(token);
    expect(hashApiToken(neighbour)).not.toBe(digest);
    // 与 node 的 sha256 同一件事，不是另一个自定义摘要（将来运维脚本要能自己算出来）
    expect(digest).toBe(createHash('sha256').update(token).digest('hex'));
  });
});

describe('scope 判定', () => {
  const record = (scopes: ApiTokenRecord['scopes']): ApiTokenRecord => ({
    id: 't1',
    name: 'n',
    hint: 'abcd1234',
    scopes,
    createdAt: new Date(0).toISOString(),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  });

  it('只承认名单里那一格，不承认"差不多"的那一格', () => {
    const token = record(['projects:read']);
    expect(hasScope(token, 'projects:read')).toBe(true);
    expect(hasScope(token, 'design:read')).toBe(false);
    // 反向对照：一条都不给的凭据过不了任何门（库里那条 CHECK 是第一道，这是第二道）
    expect(hasScope(record([]), 'projects:read')).toBe(false);
  });
});

describe('三处 scope 名单是同一份：常量 / 迁移里生效的 CHECK / v1 端点真的执行它', () => {
  it('迁移里生效的那条 CHECK 与 API_TOKEN_SCOPES 一模一样', () => {
    const { values, definedIn } = scopesInMigration();
    expect(
      [...values].sort(),
      `与 ${definedIn} 里那条生效 CHECK 比对（必须是最后一次 ADD CONSTRAINT，前面的都已被换掉）`,
    ).toEqual([...API_TOKEN_SCOPES].sort());
  });

  it('每一格 scope 都有一个真端点在执行它；端点用的 scope 都在名单内', () => {
    const routes = v1Routes();
    const executed = new Set(routes.flatMap((r) => r.scopes));
    // 名单里有、没人执行 = 界面上多一条用不了的权限（§159）
    expect([...executed].sort()).toEqual([...API_TOKEN_SCOPES].sort());
    for (const route of routes) {
      expect(route.scopes.length, `${route.path} 没有调用 authorizeApiRequest：这个端点不设防`).toBeGreaterThan(0);
      for (const scope of route.scopes) {
        expect(API_TOKEN_SCOPES, `${route.path} 用了名单外的 scope ${scope}`).toContain(scope);
      }
    }
  });

  it('读 scope 只挂在 GET 上，写 scope 只挂在写方法上（按源码位置配对，不是整份文件比）', () => {
    const routes = v1Routes();
    const allowed = ['GET', 'HEAD', 'OPTIONS', 'PATCH', 'PUT', 'POST', 'DELETE'];
    for (const route of routes) {
      expect(route.methods.length, `${route.path} 一个方法都没导出`).toBeGreaterThan(0);
      for (const handler of route.perMethod) {
        expect(allowed, `${route.path} 导出了 ${handler.method}：不是 HTTP 方法`).toContain(handler.method);
        // 下一句才是这一片的门：一个 GET 拿 design:write 就等于"读接口能改文档"，
        // 而界面上写的是"补丁要走 PATCH"——所以配对必须按方法看，不能按文件看。
        for (const scope of handler.scopes) {
          if (isWriteScope(scope)) {
            // DELETE 算写方法：`projects:write` 的一半能力就是删项目（§188，2026-10-08），
            // 而"删除不算改文档"这句话在权限语义上说不通
            expect(
              ['PATCH', 'PUT', 'POST', 'DELETE'],
              `${route.path} 的 ${handler.method} 用了写 scope ${scope}：读方法不该有改文档的能力`,
            ).toContain(handler.method);
          } else {
            expect(
              ['GET', 'HEAD', 'OPTIONS'],
              `${route.path} 的 ${handler.method} 用了读 scope ${scope}：写方法不该只靠一格读权限`,
            ).toContain(handler.method);
          }
        }
      }
      // 每一格写 scope 都得真有一个写方法在执行它，否则重新发一枚带 write 的凭据也无处可用
      for (const scope of route.scopes.filter(isWriteScope)) {
        const carrier = route.perMethod.find((h) => h.scopes.includes(scope));
        expect(carrier, `${route.path} 里 ${scope} 不在任何方法的身子里`).toBeDefined();
        expect(
          ['PATCH', 'PUT', 'POST', 'DELETE'],
          `没有写方法执行 ${scope}：这一格名单是空的（§159）`,
        ).toContain(carrier?.method);
      }
    }
  });

  it('v1 的每一个方法都必须在访问账上留得下一行，端点名从文件位置推导（不是手抄的第四份）', () => {
    const routes = v1Routes();
    // 从 apps/web/src/app/api/v1/<...>/route.ts 反推这条路的地址：动态段保留 [param] 原样。
    // 记进账的那一格按（端点, 项目）分，把真实 id 拼进端点名会让同一件事散成一堆行
    const expectedOf = (path: string, method: string) => {
      const rel = path.slice(V1_DIR.length).replaceAll('\\', '/').replace(/\/route\.ts$/, '');
      return `${method} /api/v1${rel}`;
    };
    const seen = new Set<string>();
    for (const route of routes) {
      for (const handler of route.perMethod) {
        const label = expectedOf(route.path, handler.method);
        expect(handler.endpoints, `${route.path} 的 ${handler.method} 一次账都没记：这一次读到了什么没人知道`).toEqual([label]);
        seen.add(label);
      }
    }
    // 下限：v1 至少要有已落的那七个方法，否则上面那两个循环是在比空集
    expect(seen.size, `v1 只推导出 ${seen.size} 个端点名，这一格根本没扫到东西`).toBeGreaterThanOrEqual(7);
    // 名单本身也要说得出是哪几个：漂成拼错的写法（projectz）在这里红，而不是悄悄多出一格
    expect([...seen].sort()).toEqual([
      'DELETE /api/v1/projects/[projectId]',
      'GET /api/v1/projects',
      'GET /api/v1/projects/[projectId]',
      'GET /api/v1/projects/[projectId]/design',
      'PATCH /api/v1/projects/[projectId]/design',
      'POST /api/v1/projects',
      'POST /api/v1/projects/[projectId]/publish',
    ]);
  });

  it('记进账的端点名必须是字面量：拼上项目 id 会让同一件事按项目散成一堆行', () => {
    // 判定只看一件事：那一格的值是不是反引号起的。写成"找 ${"的那种认法会漏——
    // `GET /api/v1/projects/${projectId}/design` 里插在末尾根本没有反引号，第一版就是这么绿过去的
    const detect = (source: string) => source.split('\n').filter((l) => /^\s*endpoint:\s*`/.test(l)).map((l) => l.trim());
    for (const route of v1Routes()) {
      // 不是格式洁癖：端点名里一旦有 ${projectId}，主键那一格就变成每个项目一个新值，
      // 面板上那句「读过哪几份」会碎成几十行，而 calls 看起来还是对的——最难查的那种错
      expect(detect(route.source), `${route.path} 用拼出来的端点名记账：${detect(route.source).join(' / ')}`).toEqual([]);
    }
    // 反向对照：一句"一个都没有"必须先证明这门认得那一种写法。坏样本是从真源码里那一格字面量
    // 改出来的（不是手抄的，手抄的那一份会和判定一起错），并且**插在值中间**——第一版判定只认得
    // 落在末尾的那种，`…/${projectId}/design` 就这么绿过去了。
    // 载体是"任意一条单引号端点名"而不是某个文件里某一整句：某一条被改动或删掉时，这一句不该跟着红。
    const carrier = v1Routes()
      .flatMap((r) => r.source.split('\n'))
      .find((l) => /^\s*endpoint:\s*'[^']*'/.test(l));
    expect(carrier, 'v1 源码里一条单引号端点名都没有：这门找不到可以改坏的载体').toBeDefined();
    const value = carrier!.match(/'([^']*)'/)![1]!;
    const mid = Math.floor(value.length / 2);
    const mutated = carrier!.replace(/'[^']*'/, '`' + `${value.slice(0, mid)}\${projectId}${value.slice(mid)}` + '`');
    expect(mutated, '那句字面量改不动：等于没测').not.toBe(carrier!);
    expect(detect(mutated), `改出来的这一格竟然没被认出来：${mutated}`).toHaveLength(1);
  });
});

describe('公开补丁的报文门：收什么样的 op，拒什么样的 op', () => {
  /** 一个真实形状的单 op 补丁：从这里派生每一条拒法，而不是各写一份字面量 */
  const valid = () => ({
    summary: '加一段文案',
    pageId: 'p1',
    ops: [{ op: 'set' as const, nodeId: 'n1', path: 'text', value: '改过的文案' }],
  });

  it('一份最小可用补丁通过', () => {
    expect(ApiDesignPatchRequestSchema.safeParse(valid()).success).toBe(true);
  });

  it('ops 空数组被拒：一次调用一个事务，零个 op 的事务只会留下一条没有内容改动的历史', () => {
    expect(ApiDesignPatchRequestSchema.safeParse({ ...valid(), ops: [] }).success).toBe(false);
  });

  it('summary 必填且有限长：历史面板要认出是哪一次调用', () => {
    for (const summary of [undefined, '', 'x'.repeat(201)]) {
      expect(
        ApiDesignPatchRequestSchema.safeParse({ ...valid(), summary }).success,
        `summary=${summary === undefined ? '缺' : summary.length === 0 ? '空串' : `${summary.length} 字`}`,
      ).toBe(false);
    }
    expect(ApiDesignPatchRequestSchema.safeParse({ ...valid(), summary: 'x'.repeat(200) }).success).toBe(true);
  });

  it('op 数量上限比 Studio 内部那份低：公网一次别递进来一整份重建', () => {
    const one = valid().ops[0]!;
    const times = (n: number) => Array.from({ length: n }, () => one);
    expect(ApiDesignPatchRequestSchema.safeParse({ ...valid(), ops: times(200) }).success).toBe(true);
    expect(ApiDesignPatchRequestSchema.safeParse({ ...valid(), ops: times(201) }).success).toBe(false);
  });

  it('未知形状的 op 进不来：名单之外的语义在门口就没有，不需要服务端再认一次', () => {
    expect(
      ApiDesignPatchRequestSchema.safeParse({ ...valid(), ops: [{ op: 'deleteEverything', nodeId: 'n1' }] }).success,
    ).toBe(false);
  });
});

describe('限流与节流是代码里的一个数，不是界面上的一句话', () => {
  it('每分钟额度与"最近使用"的节流窗口都是正数，且节流远小于限流窗口', () => {
    expect(LAST_USED_WRITE_INTERVAL_MS).toBeGreaterThan(0);
    expect(API_RATE_LIMIT_PER_MINUTE).toBeGreaterThan(0);
    // 节流比限流窗口还大的话，"最近使用"就永远停在第一次调用那天
    expect(LAST_USED_WRITE_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });

  it('写这一档比读低，且两个数与契约里那两个是同一件事', () => {
    // 一次补丁要读整份文档、算 diff、写库、重切语料，代价不是一次 GET，所以桶更小
    expect(API_WRITE_RATE_LIMIT_PER_MINUTE).toBeLessThan(API_RATE_LIMIT_PER_MINUTE);
    expect(API_RATE_LIMIT_PER_MINUTE).toBe(API_TOKEN_RATE_LIMITS_PER_MINUTE.read);
    expect(API_WRITE_RATE_LIMIT_PER_MINUTE).toBe(API_TOKEN_RATE_LIMITS_PER_MINUTE.write);
  });

  it('scope 自己说得出它是读还是写：名单里每一格的归类不靠第二张表', () => {
    // 这一句挡住的是"加了一格叫 design:delete 的 scope，却因为它不含 :write 走了读的桶"
    expect(API_TOKEN_SCOPES.filter(isWriteScope).sort()).toEqual(
      API_TOKEN_SCOPES.filter((s) => s.endsWith(':write')).sort(),
    );
    expect(isWriteScope('design:write')).toBe(true);
    expect(isWriteScope('design:read')).toBe(false);
  });
});
