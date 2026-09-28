import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { API_TOKEN_SCOPES, type ApiTokenRecord } from '@nexus/schemas';
import {
  API_RATE_LIMIT_PER_MINUTE,
  LAST_USED_WRITE_INTERVAL_MS,
  TOKEN_PREFIX,
  bearerFrom,
  hasScope,
  hashApiToken,
  newApiToken,
} from '../src/server/domain/api-tokens';

/**
 * §188 的纯单测那一半：凭据的形状与"头怎么写"。
 *
 * 这一份不碰库，所以它证明的是"代码说的是同一套话"：token 长什么样、什么形状的头算 Bearer、
 * 以及** scope 名单在三个地方（schemas 常量 / 迁移里的 CHECK / v1 端点的实际执行）是不是同一份**。
 * 那三处各写一遍是这类系统最容易漂开的地方——加了一格 scope 却没有端点执行它，
 * 界面上就多一条谁都用不了的权限（§159）；端点用了名单外的 scope，库里的 CHECK 又拦不住写入。
 * 所以这里比的是集合，而不是"我以为我对过"。
 */

/** 仓库根：从这份测试自己的位置往上走，而不是从 process.cwd() 猜——跑测试的目录不止一个 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const V1_DIR = join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'api', 'v1');
const MIGRATION = join(REPO_ROOT, 'infra', 'migrations', '0018_api_tokens.sql');

/** 迁移里的 scope 名单：读那条 CHECK 的字面量，不复制粘贴第二份名单 */
function scopesInMigration(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n');
  // 那条 ALTER 语句在 SQL 里换了两行，所以取"从约束名到分号"这一段，而不是取一行
  const at = sql.indexOf('api_tokens_scopes_known');
  if (at < 0) throw new Error(`迁移里没有 api_tokens_scopes_known 那条 CHECK：${MIGRATION}`);
  const statement = sql.slice(at).split(';')[0]!;
  const arrayLiteral = statement.match(/ARRAY\[(.*?)\]::text\[\]/s);
  if (!arrayLiteral?.[1]) throw new Error(`CHECK 里没有 ARRAY[...]::text[] 那一段：${statement}`);
  const values = [...arrayLiteral[1].matchAll(/'([^']*)'/g)].map((m) => m[1]!);
  expect(values.length, 'CHECK 里的 scope 不能是空的，否则这个比对什么都没看').toBeGreaterThan(0);
  return values;
}

interface RouteFile {
  path: string;
  source: string;
  /** 这个文件里对 authorizeApiRequest 的调用：[scope] */
  scopes: string[];
  /** 导出的 HTTP 方法名（大写） */
  methods: string[];
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

function v1Routes(): RouteFile[] {
  const files = walk(V1_DIR);
  expect(files.length, 'v1 目录下一个路由文件都没有，那下面所有比对都是在比空集').toBeGreaterThan(0);
  return files.map((path) => {
    const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    return {
      path,
      source,
      scopes: [...source.matchAll(/authorizeApiRequest\(\s*req\s*,\s*'([^']+)'\s*\)/g)].map((m) => m[1]!),
      methods: [...source.matchAll(/export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!.toUpperCase()),
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
    // 反向对照：换一个字符就得换一个摘要——否则"按哈希查"可能是按前缀查
    expect(hashApiToken(`${token.slice(0, -1)}0`)).not.toBe(digest);
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

describe('三处 scope 名单是同一份：常量 / 迁移 CHECK / v1 端点真的执行它', () => {
  it('迁移里的 CHECK 与 API_TOKEN_SCOPES 一模一样', () => {
    expect([...scopesInMigration()].sort()).toEqual([...API_TOKEN_SCOPES].sort());
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

  it('v1 只有读：每个端点导出的方法都是 GET（界面上"没有写端点"那句说的是真话）', () => {
    for (const route of v1Routes()) {
      expect(route.methods.length, `${route.path} 一个方法都没导出`).toBeGreaterThan(0);
      expect(route.methods, `${route.path} 出现了写方法，而 /api-tokens 页面上写着"v1 没有写端点"`).toEqual(
        route.methods.map(() => 'GET'),
      );
    }
  });
});

describe('限流与节流是代码里的一个数，不是界面上的一句话', () => {
  it('每分钟额度与"最近使用"的节流窗口都是正数，且节流远小于限流窗口', () => {
    expect(LAST_USED_WRITE_INTERVAL_MS).toBeGreaterThan(0);
    expect(API_RATE_LIMIT_PER_MINUTE).toBeGreaterThan(0);
    // 节流比限流窗口还大的话，"最近使用"就永远停在第一次调用那天
    expect(LAST_USED_WRITE_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });
});
