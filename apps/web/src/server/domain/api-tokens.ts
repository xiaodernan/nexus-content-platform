import { createHash } from 'node:crypto';
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { applyPatch, type PatchOp } from '@nexus/design-model';
import type {
  ApiAccessEntry,
  ApiDesignDocument,  ApiDesignPatchRequest,
  ApiDesignPatchResult,
  ApiProject,
  ApiProjectDetail,
  ApiTokenRecord,
  ApiTokenScope,
} from '@nexus/schemas';
import { API_ACCESS_RETENTION_DAYS, API_TOKEN_RATE_LIMITS_PER_MINUTE } from '@nexus/schemas';
import type { DesignDocument } from '@nexus/design-model';
import { getDb } from '../db/client';
import { apiAccessBuckets, apiTokens, projects } from '../db/schema';
import { parseDocument } from '../validation';
import { destructiveActions, nodeNamer, WEB_APPROVAL_POLICY } from '../ai/approvals';
import { loadDocument, lockProjectWrites, projectBelongsTo, writeProjectDocument } from './projects';
import { createSnapshot } from './snapshots';
import { currentBranchId } from './branches';
import { recordAudit } from './audit';
import { syncDesignKnowledge } from './knowledge';
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
 * - **今天只有三格 scope**，因为今天只有四个真端点（列项目 / 读详情 / 读文档 / 打补丁）。
 *   往名单里加一格而没有执行它的端点，就是让界面上多一条谁都用不了的权限（§159）。
 * - **读接口不许变成写接口**：`last_used_at` 有分钟级节流，第三片那本访问账（`api_access_buckets`）
 *   也一样按分钟切桶——一次调用最多让"这一分钟的这个（凭据, 端点, 项目）"多一个计数，
 *   产生不出一行新的。每读一次写一行的话，"读过什么"越准，接口就越容易被当成 DoS 目标；
 *   界面上因此一列写"分钟级"，另一列写"只留 30 天"。
 * - **写与读各有各的桶**：一次补丁要读整份文档、算 diff、写库、重切语料，代价不是一次 GET，
 *   所以写这一档单独限（见 `API_WRITE_RATE_LIMIT_PER_MINUTE`）。
 * - **吊销是留行打时间戳，不是删行**。删了行就分不清"从没存在过"与"存在过、被吊销了"，
 *   而调用方拿着 401 来问的正是后者。
 */

export const TOKEN_PREFIX = 'nexus_pat_';
const RANDOM_HEX_LENGTH = 64;
const HINT_LENGTH = 8;
const MAX_BEARER_LENGTH = 200;
/** `last_used_at` 的写入节流：距上次记录不足这个间隔就不再写库 */
export const LAST_USED_WRITE_INTERVAL_MS = 60_000;
/** 每个凭据的读限流：窗口 60 秒。数值住在契约里（界面上也要说出这个数），这里只是给它一个服务端读得懂的名字 */
export const API_RATE_LIMIT_PER_MINUTE = API_TOKEN_RATE_LIMITS_PER_MINUTE.read;
/**
 * 每个凭据的写限流：一次补丁的代价不是一次 GET（整份文档读回 JS、算 diff、写库、重切语料），
 * 所以这一档比读低。数值本身在 `@nexus/schemas`，执行在这里——多一个写端点就多种口径是同一句老话。
 */
export const API_WRITE_RATE_LIMIT_PER_MINUTE = API_TOKEN_RATE_LIMITS_PER_MINUTE.write;

/** scope 自己说得出它是读还是写：`design:read` / `design:write`，加一格时不需要改这里以外的地方 */
export function isWriteScope(scope: ApiTokenScope): boolean {
  return scope.endsWith(':write');
}

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
      message: `这枚凭据的 scope 是 ${authed.token.scopes.join(' / ')}，没有 ${scope}：要用这一格得重新发一枚带上 ${scope} 的凭据`,
    };
  }
  // 桶按 scope 分开：同一枚凭据读满 120 次不该把它写的那一格饿死，反之也一样
  const limit = isWriteScope(scope) ? API_WRITE_RATE_LIMIT_PER_MINUTE : API_RATE_LIMIT_PER_MINUTE;
  const rl = getRateLimiter().hit(rateKey(`api/v1:${scope}`, clientIp(req), authed.token.id), limit, 60_000);
  if (!rl.allowed) {
    return {
      ok: false,
      status: 429,
      error: 'rate_limited',
      message: `${isWriteScope(scope) ? '写' : '读'}得太快（每分钟 ${limit} 次），请 ${Math.ceil((rl.retryAfterMs ?? 1_000) / 1000)} 秒后再试`,
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

/**
 * §188 第二片：外部调用方**改得动**这一份文档。
 *
 * 四条不是顺手加的，是这条路一旦开放就必须自己成立的：
 *
 * - **读—改—写在同一个事务里**（ADR-0016 的那把 advisory lock 现在从读之前就拿）。
 *   Studio 那条路是"客户端发整份文档"，覆盖是它自己负责；公开 API 发的是**补丁**，
 *   补丁必须落在服务端此刻那一版文档上，否则同一枚凭据并发两次 PATCH 会后一次悄悄吃掉前一次。
 * - **`applyPatch` 报 skip 就一条都不写**（§159）。模型层的 skip 是"这一条 op 打不到存在的东西"，
 *   写一半留一半是最难查的那种状态：调用方看到 200 会以为整份补丁生效了。
 * - **过同一道规模门**（`parseDocument` / ADR-0015）。写端点要是绕开它，公网这条路径就成了
 *   "想存多大就存多大"的后门，而那道门当初就是为了挡住这个才挪到整份文档上的。
 * - **带走东西的 op 一律拒**（§74 / ADR-0012、0013 的形状）。审批门的语义是"有人看过那一版才交回"，
 *   而 API 这一侧没有人可点批准，所以这里是**拒**而不是**挂起**：报 `approval_required`，
 *   让调用方把人拉进来（或者走 Studio），而不是替人做一个不可撤销的删除。
 */
export type ApiPatchOutcome =
  | { ok: true; result: ApiDesignPatchResult }
  | { ok: false; status: 400 | 404 | 409; error: string; message: string };

export async function apiPatchDesign(
  owner: { userId: string; tokenId: string; tokenHint: string },
  projectId: string,
  patch: ApiDesignPatchRequest,
): Promise<ApiPatchOutcome> {
  // 归属判定与读端点同一口径：别人的项目与不存在的项目回同一句话
  if (!(await projectBelongsTo(projectId, owner.userId))) {
    // 越权尝试要留行（§80 建 `audit_events` 就是为了"谁试过做什么"）。写端点一开，
    // "有人拿别人的项目 id 递过补丁"就是这张表要回答的第一件事，而响应里那句故意什么都没说。
    await recordAudit({
      actorId: owner.userId,
      action: 'api.design.patch',
      targetType: 'project',
      targetId: projectId,
      allowed: false,
      detail: {
        tokenId: owner.tokenId,
        tokenHint: owner.tokenHint,
        reason: 'not_owner',
        summary: patch.summary,
        attemptedOps: patch.ops.length,
      },
    });
    return {
      ok: false,
      status: 404,
      error: 'project_not_found',
      message: `项目 ${projectId} 不在这一枚凭据所属的人名下、已被删除，或库里还没有文档`,
    };
  }

  const written = await getDb().transaction(async (tx) => {
    await lockProjectWrites(tx, projectId);
    const current = await loadDocument(projectId, tx);
    if (!current) return { kind: 'not_found' } as const;

    const held = destructiveActions([patch], WEB_APPROVAL_POLICY, nodeNamer(current));
    if (held.length) return { kind: 'approval_required', reasons: held.map((h) => h.reason) } as const;

    // wire 上的 ops 在 schemas 只能是 record（schemas 不依赖 design-model），这里只桥接类型
    const applied = applyPatch(current, { ...patch, ops: patch.ops as unknown as PatchOp[] });
    if (applied.skipped.length) return { kind: 'ops_skipped', skipped: applied.skipped } as const;

    const gate = parseDocument(applied.document);
    if (!gate.ok) return { kind: 'rejected_by_gate', issues: gate.issues } as const;

    await writeProjectDocument(tx, projectId, gate.document);
    return { kind: 'ok', document: gate.document, touched: applied.touchedNodeIds } as const;
  });

  if (written.kind === 'not_found') {
    return { ok: false, status: 404, error: 'project_not_found', message: `库里没有项目 ${projectId} 的文档` };
  }
  if (written.kind === 'approval_required') {
    // §74 的决定要留行：公开 API 拒掉的每一次删除都是"有人想删、门挡了"，响应是瞬时的，账不是
    await recordAudit({
      actorId: owner.userId,
      action: 'api.design.patch',
      targetType: 'project',
      targetId: projectId,
      allowed: false,
      detail: {
        tokenId: owner.tokenId,
        tokenHint: owner.tokenHint,
        reason: 'approval_required',
        summary: patch.summary,
        refusedOps: written.reasons,
      },
    });
    return {
      ok: false,
      status: 409,
      error: 'approval_required',
      message: `这一份补丁里有 ${written.reasons.length} 个会带走东西的动作（${written.reasons.slice(0, 3).join('；')}${
        written.reasons.length > 3 ? ' …' : ''
      }），公开 API 这一侧没有人可以批准它，所以一条都没写。请在 Studio 里做这一步，或发一份不含删除的补丁`,
    };
  }
  if (written.kind === 'ops_skipped') {
    return {
      ok: false,
      status: 409,
      error: 'ops_skipped',
      message: `有 ${written.skipped.length} 条 op 打不到这一版文档里存在的东西（第 ${written.skipped
        .map((s) => `${s.index}:${s.reason}`)
        .join('、')}），整份补丁一条都没写`,
    };
  }
  if (written.kind === 'rejected_by_gate') {
    return {
      ok: false,
      status: 400,
      error: 'document_rejected',
      message: `打完补丁之后的文档过不了与 Studio 保存同一道门：${written.issues.slice(0, 3).join('；')}`,
    };
  }

  const digest = digestOf(written.document);
  const warnings: string[] = [];
  let snapshotId: string | null = null;
  // 历史在事务外面：写已经提交了，这一步失败只能报出来，不能把请求变成 500 让调用方重发一遍补丁
  try {
    const snapshot = await createSnapshot(projectId, {
      document: written.document,
      // 与 Studio 里 AI 事务同一个来源：这一条本来就是"机器给的补丁落在文档上"，
      // 历史面板里它带 patch 清单，因此展示的是 diff 而不是又一次全量存盘（§151）
      source: 'ai',
      label: `公开 API 补丁（凭据 ${owner.tokenHint}）`.slice(0, 120),
      summary: patch.summary,
      patch,
      createdById: owner.userId,
      branchId: await currentBranchId(projectId),
    });
    snapshotId = snapshot.id;
  } catch (error) {
    warnings.push(`历史没落上：${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await syncDesignKnowledge(projectId, written.document);
  } catch (error) {
    warnings.push(`§49 语料没同步（检索里暂时读不到这次改动）：${error instanceof Error ? error.message : String(error)}`);
  }
  // 按凭据计的写审计：这是 §188 里"谁在什么时候改了哪一份文档"那一句的真答案，
  // 读的审计仍然只有 last_used_at 那个分钟级信号（那一格还欠着，写在 ROADMAP 上）
  const audited = await recordAudit({
    actorId: owner.userId,
    action: 'api.design.patch',
    targetType: 'project',
    targetId: projectId,
    allowed: true,
    detail: {
      tokenId: owner.tokenId,
      tokenHint: owner.tokenHint,
      summary: patch.summary,
      appliedOps: patch.ops.length,
      touchedNodes: written.touched.length,
      nodeCount: digest.nodeCount,
      snapshotId,
      warnings,
    },
  });
  if (!audited) warnings.push('审计没写上');

  return {
    ok: true,
    result: {
      projectId,
      ok: true,
      appliedOps: patch.ops.length,
      touchedNodeIds: written.touched,
      ...digest,
      snapshotId,
      historyRecorded: snapshotId !== null,
      warnings,
      source: 'database',
    },
  };
}

/**
 * 一分钟一个桶。这条节流的理由与文件开头第四条规矩（"读接口不许变成写接口"）是同一个：
 * 一次调用最多让"这一分钟的这个（凭据, 端点, 项目）"多一个计数，产生不出一行新的——
 * 新增行的速率因此由读限流封顶，而不是由调用方说了算。
 */
export const API_ACCESS_BUCKET_MS = 60_000;
/** 面板那一格最多扫多少条聚合行（见 `listApiAccessSummary` 里那句"为什么是全局截断"） */
export const API_ACCESS_SCAN_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 把任意时刻落到它所属的那个分钟桶。"桶必须是整分钟"这一条库里有 CHECK 挡着（迁移 0020） */
export function apiAccessBucketOf(at: Date): Date {
  return new Date(Math.floor(at.getTime() / API_ACCESS_BUCKET_MS) * API_ACCESS_BUCKET_MS);
}

/**
 * 记一笔"这枚凭据读过这份东西"（§188 M8 第三片）。三条纪律与 `recordAudit` 同口径：
 *
 * - **只有读成功才记**。一次 401 / 403 不是"读到了什么"的证明，那是一次裁决，裁决住在
 *   `audit_events`（§80）。两本账分开的理由写在迁移 0020 开头：混一张表，两边都会变成没人读的那种。
 * - **账写不上不把一次成功的读变成 500**。旁证不是业务前提；但不能静默——那一行 stderr
 *   就是"这次的证据没留下"这件事本身的证据。
 * - **只留 `API_ACCESS_RETENTION_DAYS` 天**。清理挂在"新建了一个桶"那一刻，所以它的频率上界
 *   就是新增行的频率上界，同样被读限流封顶。
 *
 * 返回的是"这一笔有没有新建一行"，测试用它来证明一分钟 40 次调用只买得起一行。
 */
export async function recordApiAccess(input: {
  tokenId: string;
  endpoint: string;
  projectId?: string;
  at?: Date;
}): Promise<boolean> {
  const at = input.at ?? new Date();
  const bucket = apiAccessBucketOf(at);
  try {
    const [row] = await getDb()
      .insert(apiAccessBuckets)
      .values({
        tokenId: input.tokenId,
        endpoint: input.endpoint,
        // 集合类端点不落在这个项目上：空串而不是 null，因为这一列要进主键，而 null 之间不比相等
        projectId: input.projectId ?? '',
        bucket,
        lastSeen: at,
        calls: 1,
      })
      .onConflictDoUpdate({
        target: [apiAccessBuckets.tokenId, apiAccessBuckets.endpoint, apiAccessBuckets.projectId, apiAccessBuckets.bucket],
        set: { calls: sql`${apiAccessBuckets.calls} + 1`, lastSeen: at },
      })
      .returning({ calls: apiAccessBuckets.calls });
    // ON CONFLICT DO UPDATE 回来的是更新后的那一行：calls 还是 1 就说明这次是这一分钟的第一笔
    const created = (row?.calls ?? 0) <= 1;
    if (created) {
      const cutoff = new Date(at.getTime() - API_ACCESS_RETENTION_DAYS * DAY_MS);
      await getDb()
        .delete(apiAccessBuckets)
        .where(and(eq(apiAccessBuckets.tokenId, input.tokenId), lt(apiAccessBuckets.lastSeen, cutoff)));
    }
    return created;
  } catch (error) {
    console.error('[api-access] 账没写上', input.endpoint, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * 每一枚凭据"最近读过什么"，给 `/api-tokens` 那一格用。库里的行是一个分钟桶，
 * 这里按（凭据, 端点, 项目）聚成一条：`calls` 是保留窗口里的总次数，`lastSeen` 是最后一次。
 *
 * 为什么截断是全局的：一次读全部再在内存里分组，比给每枚凭据发一条查询少得多来回；
 * 排序按"最后一次访问"从新到旧，所以只要一个人名下的 (端点, 项目) 组合数不超过
 * `API_ACCESS_SCAN_LIMIT`，每枚凭据取到的前几条就是真的前几条。超出去的那部分只会出现在
 * 面板少列几条，不会列错。
 */
export async function listApiAccessSummary(userId: string, perToken = 3): Promise<ApiAccessEntry[]> {
  const take = Math.min(Math.max(Math.trunc(perToken) || 1, 1), 10);
  const cutoff = new Date(Date.now() - API_ACCESS_RETENTION_DAYS * DAY_MS);
  const rows = await getDb()
    .select({
      tokenId: apiAccessBuckets.tokenId,
      endpoint: apiAccessBuckets.endpoint,
      projectId: apiAccessBuckets.projectId,
      projectName: projects.name,
      calls: sql<number>`sum(${apiAccessBuckets.calls})::int`,
      lastSeen: sql<Date>`max(${apiAccessBuckets.lastSeen})`,
    })
    .from(apiAccessBuckets)
    .innerJoin(apiTokens, eq(apiTokens.id, apiAccessBuckets.tokenId))
    // cast 在 uuid 这一侧，不在 text 那一侧：账里合法存在着的空串（集合类端点那一格）
    //  一旦参与 `''::uuid` 就是整条查询报错，而 `projects.id::text` 谁都能比。
    .leftJoin(projects, sql`${projects.id}::text = ${apiAccessBuckets.projectId}`)
    .where(and(eq(apiTokens.userId, userId), gte(apiAccessBuckets.lastSeen, cutoff)))
    .groupBy(apiAccessBuckets.tokenId, apiAccessBuckets.endpoint, apiAccessBuckets.projectId, projects.name)
    .orderBy(desc(sql`max(${apiAccessBuckets.lastSeen})`))
    .limit(API_ACCESS_SCAN_LIMIT);

  const counted = new Map<string, number>();
  const out: ApiAccessEntry[] = [];
  for (const row of rows) {
    const soFar = counted.get(row.tokenId) ?? 0;
    if (soFar >= take) continue;
    counted.set(row.tokenId, soFar + 1);
    const seen = row.lastSeen instanceof Date ? row.lastSeen : new Date(String(row.lastSeen));
    out.push({
      tokenId: row.tokenId,
      endpoint: row.endpoint,
      projectId: row.projectId,
      // 项目已经不在了：账还在，名字读不出来。留给界面去说"已删除"，不在这里编一个名字
      projectName: row.projectName ?? null,
      calls: Number(row.calls),
      lastSeen: seen.toISOString(),
    });
  }
  return out;
}

