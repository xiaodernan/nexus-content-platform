import { createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ApiDesignDocument, ApiProject, ApiProjectDetail, ApiTokenRecord, ApiTokenScope } from '@nexus/schemas';
import type { DesignDocument } from '@nexus/design-model';
import { getDb } from '../db/client';
import { apiTokens, projects } from '../db/schema';
import { loadDocument, projectBelongsTo } from './projects';
import { clientIp, getRateLimiter, rateKey } from '../security/rateLimit';

/**
 * §188 M8（MCP / 外部 Agent / 公开 API）的第一块：一枚外部调用方自己能管住的凭据。
 *
 * 五条规矩，都是这一片自己必须守住的：
 *
 * - **库里只存哈希**（与 `sessions` 同一口径，§80）。明文只在签发那一次随响应出去，
 *   服务端此后连自己都算不出来——所以这一页只有"重发一枚"，没有"再看一眼"。
 * - **scope 默认拒绝，且鉴权与 scope 与限流在同一处判**。多一个端点就多一种口径是这类系统
 *   最常见的腐化方式（§74 那条教训的同一个形状）：`authorizeApiRequest` 是唯一入口，
 *   路由里不许自己写一遍 bearer 解析。
 * - **今天只有两格 scope**，因为今天只有两个真端点（列自己的项目 / 读设计文档）。
 *   往名单里加一格而没有执行它的端点，就是让界面上多一条谁都用不了的权限（§159）。
 * - **读接口不许变成写接口**：`last_used_at` 有分钟级节流。一次调用写一行库的话，
 *   "最近使用"越准，接口就越容易被当成 DoS 目标——界面上因此写的是"分钟级"。
 * - **吊销是留行打时间戳，不是删行**。删了行就分不清"从没存在过"与"存在过、被吊销了"，
 *   而调用方拿着 401 来问的正是后者。
 */

export const TOKEN_PREFIX = 'nexus_pat_';
const RANDOM_HEX_LENGTH = 64;
const HINT_LENGTH = 8;
const MAX_BEARER_LENGTH = 200;
/** `last_used_at` 的写入节流：距上次记录不足这个间隔就不再写库 */
export const LAST_USED_WRITE_INTERVAL_MS = 60_000;
/** 每个凭据的读限流：窗口 60 秒 */
export const API_RATE_LIMIT_PER_MINUTE = 120;

export function hashApiToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** 新凭据的明文：`nexus_pat_` + 32 字节随机数的十六进制。只在这一处生成，也只在这一刻是明文 */
export function newApiToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_HEX_LENGTH / 2));
  return `${TOKEN_PREFIX}${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function hintOf(plaintext: string): string {
  return plaintext.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + HINT_LENGTH);
}

/**
 * `Authorization: Bearer <token>` → 凭据字符串；形状不对就是 null。
 * 这里只认头，不认内容——内容对不对由 `authenticateApiToken` 说，两件事分开才报得出准确的原因。
 */
export function bearerFrom(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const parts = headerValue.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]!.toLowerCase() !== 'bearer') return null;
  const value = parts[1]!;
  return value.length > 0 && value.length <= MAX_BEARER_LENGTH ? value : null;
}

type TokenRow = typeof apiTokens.$inferSelect;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function recordOf(row: TokenRow): ApiTokenRecord {
  return {
    id: row.id,
    name: row.name,
    hint: row.hint,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: iso(row.lastUsedAt),
    expiresAt: iso(row.expiresAt),
    revokedAt: iso(row.revokedAt),
  };
}

export interface IssuedToken {
  /** 明文，只在这里出现一次 */
  token: string;
  record: ApiTokenRecord;
}

export async function issueApiToken(input: {
  userId: string;
  name: string;
  scopes: ApiTokenScope[];
  expiresInDays?: number;
}): Promise<IssuedToken> {
  const trimmed = input.name.trim();
  // 空 scope 的凭据能过鉴权却什么都读不到——那种凭据只会让人以为"已经配好了"
  if (!trimmed || trimmed.length > 60) throw new Error('凭据名称要 1 到 60 个字');
  if (input.scopes.length === 0) throw new Error('至少要给一格 scope，否则这枚凭据什么都读不到');
  const plaintext = newApiToken();
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0 ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
  const [row] = await getDb()
    .insert(apiTokens)
    .values({
      userId: input.userId,
      name: trimmed,
      tokenHash: hashApiToken(plaintext),
      hint: hintOf(plaintext),
      scopes: input.scopes,
      expiresAt,
    })
    .returning();
  const created = row!;
  return { token: plaintext, record: recordOf(created) };
}

export async function listApiTokens(userId: string): Promise<ApiTokenRecord[]> {
  const rows = await getDb()
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map(recordOf);
}

export type RevokeResult = { ok: true; record: ApiTokenRecord; note?: string } | { ok: false; reason: 'not-found' };

/** 吊销。幂等：第二次同样返回"已吊销"，但带一句为什么没有变化——界面上那行本来就是吊销状态 */
export async function revokeApiToken(tokenId: string, userId: string): Promise<RevokeResult> {
  const db = getDb();
  const [row] = await db.select().from(apiTokens).where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId))).limit(1);
  if (!row) return { ok: false, reason: 'not-found' };
  if (row.revokedAt) return { ok: true, record: recordOf(row), note: '这枚凭据先前已经吊销了，这一次没有改变什么' };
  const [updated] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(eq(apiTokens.id, tokenId))
    .returning();
  return { ok: true, record: recordOf(updated!) };
}

export type ApiAuthResult =
  | { ok: true; token: ApiTokenRecord; /** 这枚凭据是谁发的：读取路径按它划边界，不写进对外报文 */ userId: string }
  | { ok: false; status: 401 | 403 | 429; error: string; message: string };

/**
 * 明文 → 这枚凭据是谁的、能读什么。四种失败各有其话：
 * 没带、格式不对、库里没有（含已吊销、已过期）、scope 不够。
 * 把它们混成一句"鉴权失败"，调用方就只能靠猜来配凭据。
 */
export async function authenticateApiToken(plaintext: string | null): Promise<ApiAuthResult> {
  if (!plaintext) {
    return {
      ok: false,
      status: 401,
      error: 'no_token',
      message: `缺少 Authorization: Bearer <token> 头`,
    };
  }
  if (!plaintext.startsWith(TOKEN_PREFIX)) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
      message: `凭据形状不对：这个平台发的 token 以 ${TOKEN_PREFIX} 开头（会话 cookie 不能当 API 凭据用）`,
    };
  }
  const [row] = await getDb().select().from(apiTokens).where(eq(apiTokens.tokenHash, hashApiToken(plaintext))).limit(1);
  if (!row) return { ok: false, status: 401, error: 'invalid_token', message: '库里没有这枚凭据：可能已被删除，或它来自另一套环境' };
  if (row.revokedAt) {
    return { ok: false, status: 401, error: 'revoked_token', message: `这枚凭据已在 ${row.revokedAt.toISOString()} 吊销` };
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 401, error: 'expired_token', message: `这枚凭据已于 ${row.expiresAt.toISOString()} 到期` };
  }

  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS) {
    await getDb().update(apiTokens).set({ lastUsedAt: new Date(now) }).where(eq(apiTokens.id, row.id));
  }
  return { ok: true, token: recordOf(row), userId: row.userId };
}

export function hasScope(token: ApiTokenRecord, scope: ApiTokenScope): boolean {
  return token.scopes.includes(scope);
}

/**
 * 每个 v1 端点唯一的入口：Bearer → 鉴权 → scope → 限流。
 * 路由里不许自己重复这几步；加了第二个端点还各写一遍，就是 §74 那条教训在这里重演。
 */
export async function authorizeApiRequest(req: Request, scope: ApiTokenScope): Promise<ApiAuthResult> {
  const authed = await authenticateApiToken(bearerFrom(req.headers.get('authorization')));
  if (!authed.ok) return authed;
  if (!hasScope(authed.token, scope)) {
    return {
      ok: false,
      status: 403,
      error: 'insufficient_scope',
      message: `这枚凭据的 scope 是 ${authed.token.scopes.join(' / ')}，没有 ${scope}：要读这一格得重新发一枚带上它的凭据`,
    };
  }
  const rl = getRateLimiter().hit(rateKey(`api/v1:${scope}`, clientIp(req), authed.token.id), API_RATE_LIMIT_PER_MINUTE, 60_000);
  if (!rl.allowed) {
    return {
      ok: false,
      status: 429,
      error: 'rate_limited',
      message: `读得太快（每分钟 ${API_RATE_LIMIT_PER_MINUTE} 次），请 ${Math.ceil((rl.retryAfterMs ?? 1_000) / 1000)} 秒后再试`,
    };
  }
  return authed;
}

function digestOf(document: DesignDocument): { pageCount: number; nodeCount: number } {
  let nodes = 0;
  for (const page of document.pages) nodes += Object.keys(page.nodes).length;
  return { pageCount: document.pages.length, nodeCount: nodes };
}

/** 只列这个人名下、没被软删的项目：别人的项目在这里连条数都不给（与站内其它归属判定同一口径） */
export async function apiProjectList(ownerId: string): Promise<ApiProject[]> {
  const rows = await getDb()
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      kind: projects.kind,
      visibility: projects.visibility,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.updatedAt));
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

/**
 * 单个项目的详情 + 文档规模。
 *
 * 规模是现场读文档算出来的（`pages` / `nodes` 两列），库里没有"节点数"这一列——
 * 与其在写入路径上维护一个会漂的计数，不如每次算：这一格是给 API 调用方看"这份文档有多大，
 * 要不要再拉整份"，一次读档换它一个准确数，值得。
 */
export async function apiProjectDetail(ownerId: string, projectId: string): Promise<ApiProjectDetail | null> {
  if (!(await projectBelongsTo(projectId, ownerId))) return null;
  const db = getDb();
  const [row] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      kind: projects.kind,
      visibility: projects.visibility,
      updatedAt: projects.updatedAt,
      createdAt: projects.createdAt,
      description: projects.description,
      forkOf: projects.forkOf,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!row) return null;
  const document = await loadDocument(projectId);
  const digest = document ? digestOf(document) : { pageCount: 0, nodeCount: 0 };
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    visibility: row.visibility,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    forkOf: row.forkOf,
    ...digest,
  };
}

/**
 * 设计文档本体（§16：这是唯一真值，所以外部 Agent 要读的就是它，而不是渲染出来的 HTML）。
 * 读的是库里那一份，不是调用方递进来的；`source: 'database'` 把这一句写进报文里。
 */
export async function apiDesignDocument(ownerId: string, projectId: string): Promise<ApiDesignDocument | null> {
  if (!(await projectBelongsTo(projectId, ownerId))) return null;
  const document = await loadDocument(projectId);
  if (!document) return null;
  return { projectId, document, ...digestOf(document), source: 'database' };
}
