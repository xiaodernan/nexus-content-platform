import { nodeAssetIds, walkDocument, type DesignDocument } from '@nexus/design-model';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { ModerationScan } from '@nexus/schemas';
import { getDb } from '../db/client';
import { abuseReports, moderationCases, projects, publishedProjects, users } from '../db/schema';

/**
 * §131 发布审核：upload → 机检 → 风险分级 → 发布或人工复核。
 *
 * 机检是**确定性词表 + 资产出处**两道，产出三档：
 * - `blocked`：命中 §129 的硬红线（未成年人性化、非自愿亲密影像），这次发布直接挡下；
 * - `review`：不能自动定性的（上传/导入的图像视频、疑似冒充官方身份），放出去但进人工队列；
 * - `clear`：两道都没说话。
 *
 * `clear` 不等于"合规"，这条必须写在结构里而不是注释里，所以扫描结果自带 `limits`：
 * 词表挡不住换个措辞、挡不住画里画出来、挡不住别的语言；没有图像内容模型；没有版权库比对。
 * 因此**机检永远不把 published_projects.moderation 写成 approved** —— 那个值只能由人（role='admin'）裁决。
 */

export const MODERATION_RULES_VERSION = 'rules-2026-09-24.1';

// 形状只在 @nexus/schemas 定义一次：发布面板、复核队列与这里读的都是同一份契约，
// 两边各写一遍的话，"几项待人工复核"迟早变成一个对不上的数
export type ModerationDecision = ModerationScan['decision'];
export type ModerationFinding = ModerationScan['findings'][number];
/** 转发一份：调用方（publish.ts）要标注扫描结果的类型，不该为此再记一遍 schemas 的路径 */
export type { ModerationScan } from '@nexus/schemas';

/** 公开的资产出处（§130：真人照片我们无从判断，只能知道它是外部进来的） */
export interface AssetProvenance {
  id: string;
  name: string;
  kind: string;
  source: 'upload' | 'generated' | 'import';
}

/**
 * 硬红线词表。刻意写成"两类词靠近才算"而不是一串孤立的脏字：
 * 单个词在正常设计稿里太常见（"kid-friendly 教育页"不是内容违规），
 * 孤立词表会把人淹在误报里，而真正的漏报要靠人工与模型审核补——这一点写在 limits 里。
 */
const REDLINES: { rule: string; why: string; test: (text: string) => boolean }[] = [
  {
    rule: 'redline.minor_safety',
    why: '疑似把未成年人与性内容放在一起（§129 绝对禁止）',
    test: (t) =>
      /\b(child|children|minor|underage|teen(age)?|kid|loli|shota|prepubescent)\b[\s\S]{0,40}\b(nude|naked|porn|sexual|sex|erotic|nsfw)\b/i.test(t) ||
      /\b(nude|naked|porn|sexual|sex|erotic|nsfw)\b[\s\S]{0,40}\b(child|children|minor|underage|teen(age)?|kid|loli|shota)\b/i.test(t) ||
      /(未成年|儿童|小孩|萝莉|正太|幼女|幼童)[^\n]{0,24}(裸|色情|性|淫)/.test(t) ||
      /(裸|色情|性|淫)[^\n]{0,24}(未成年|儿童|小孩|萝莉|正太|幼女|幼童)/.test(t),
  },
  {
    rule: 'redline.intimate_nonconsensual',
    why: '疑似非自愿亲密影像（§129 绝对禁止、§130 consent 相关）',
    test: (t) =>
      /\b(revenge porn|leaked (nude|sex|intimate)|non-?consensual (nude|sex|intimate|image)|secret(ly)? (nude|upskirt))\b/i.test(t) ||
      /(偷拍|泄露|未经同意|报复)[^\n]{0,16}(裸照|性爱视频|亲密照|床照)/.test(t) ||
      /(裸照|性爱视频|亲密照|床照)[^\n]{0,16](偷拍|泄露|未经同意|报复)/.test(t),
  },
];

/** 疑似冒充真实机构身份：只挂人工，不自动挡（"联系客服"这类正常文案不该被拦下） */
const IMPERSONATION: { rule: string; why: string; test: (text: string) => boolean }[] = [
  {
    rule: 'risk.impersonation',
    why: '文案像是自称官方 / 金融机构 / 政务身份，需要人确认它是不是本人所有（§129 欺骗性冒充）',
    test: (t) =>
      /\b(official (support|bank|government|police|tax|payment)|customer ?service (hotline|verification)|verify your (bank|card|account) (details|password))\b/i.test(
        t,
      ) ||
      /(官方客服|政务中心|银行客服|公安备案|税务通知|身份核验中心)/.test(t),
  },
];

export const MODERATION_LIMITS: string[] = [
  '词表只挡最露骨的措辞：换个说法、写成图片、用别的语言都挡不住。没命中不等于内容合规。',
  '没有图像 / 视频内容模型：上传的真人照片只能挂人工，扫描看不出画面里是什么（§130）。',
  '没有版权库或指纹比对：无法判断文字或图是不是抄来的（§129 copyright safeguards 未落地）。',
  '不打开资产字节，也不访问任何外部链接：设计模型里没有任意外链出口，所以也没有热链可查。',
  '机检从不写 approved：published_projects.moderation 只能由人工裁决改变。',
];

function clip(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

/**
 * 扫一份即将公开的文档。`assets` 只该包含**这份文档真的引用到**的资产，
 * 所以调用方要按 nodeAssetIds 的口径去取（同一套算法，别两处各说各话）。
 */
export function scanPublication(document: DesignDocument, assets: AssetProvenance[]): ModerationScan {
  const findings: ModerationFinding[] = [];
  let textNodes = 0;
  const referenced = new Set<string>();

  // 只有访客看得见的东西参与判定：节点文字与 alt。
  // 图层名是作者内部命名，不该按公开内容算，也不该因为名字里一个词被挡下发布。
  walkDocument(document, (node) => {
    const visible = [node.text, node.alt].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (visible.length) textNodes += 1;
    const where = `${node.id}`;
    for (const value of visible) {
      const haystack = clip(value);
      for (const redline of REDLINES) {
        if (redline.test(value)) {
          findings.push({ rule: redline.rule, level: 'blocked', quote: haystack, where, why: redline.why });
        }
      }
      for (const risk of IMPERSONATION) {
        if (risk.test(value)) {
          findings.push({ rule: risk.rule, level: 'review', quote: haystack, where, why: risk.why });
        }
      }
    }
    for (const id of nodeAssetIds(node)) referenced.add(id);
  });

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const id of referenced) {
    const asset = byId.get(id);
    if (!asset) continue;
    if (asset.source === 'generated') continue;
    if (asset.kind !== 'image' && asset.kind !== 'video') continue;
    findings.push({
      rule: 'risk.external_media_consent',
      level: 'review',
      quote: `${asset.name}（${asset.source === 'upload' ? '上传' : '导入'}）`,
      where: `asset:${asset.id}`,
      why: '公开页引用了外部进来的图像/视频：是否含真人肖像、有没有授权，机检无从判断，只能挂人工（§130）',
    });
  }

  const blocked = findings.some((f) => f.level === 'blocked');
  const review = findings.some((f) => f.level === 'review');
  return {
    rulesVersion: MODERATION_RULES_VERSION,
    decision: blocked ? 'blocked' : review ? 'review' : 'clear',
    findings,
    limits: [...MODERATION_LIMITS],
    scanned: { pages: document.pages.length, textNodes, assetRefs: referenced.size },
  };
}

export interface RecordedCase {
  id: string;
  decision: ModerationDecision;
  reviewRequired: boolean;
}

export async function recordScan(input: {
  projectId: string;
  publicationId: string | null;
  publicationVersion: number;
  visibility: 'private' | 'unlisted' | 'public';
  scan: ModerationScan;
}): Promise<RecordedCase> {
  const db = getDb();
  const reviewRequired = input.scan.decision !== 'clear';
  const [row] = await db
    .insert(moderationCases)
    .values({
      projectId: input.projectId,
      publicationId: input.publicationId,
      publicationVersion: input.publicationVersion,
      visibility: input.visibility,
      decision: input.scan.decision,
      reviewRequired,
      findings: input.scan.findings,
      rulesVersion: input.scan.rulesVersion,
    })
    .returning({ id: moderationCases.id, decision: moderationCases.decision, reviewRequired: moderationCases.reviewRequired });
  return row!;
}

export interface QueueEntry {
  caseId: string;
  projectId: string;
  projectName: string;
  ownerName: string;
  publicationId: string | null;
  /** 那一版的公开路径；被挡下的发布没有路径可给 */
  path: string | null;
  publicationVersion: number;
  visibility: string;
  decision: ModerationDecision;
  findings: ModerationFinding[];
  rulesVersion: string;
  reportCount: number;
  createdAt: string;
}

/** 人工队列：待看且还没裁决完的案子，新的在前 */
export async function listReviewQueue(limit = 50): Promise<QueueEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      caseId: moderationCases.id,
      projectId: moderationCases.projectId,
      projectName: projects.name,
      ownerName: users.displayName,
      publicationId: moderationCases.publicationId,
      path: publishedProjects.path,
      publicationVersion: moderationCases.publicationVersion,
      visibility: moderationCases.visibility,
      decision: moderationCases.decision,
      findings: moderationCases.findings,
      rulesVersion: moderationCases.rulesVersion,
      createdAt: moderationCases.createdAt,
      reports: abuseReports.id,
    })
    .from(moderationCases)
    .innerJoin(projects, eq(projects.id, moderationCases.projectId))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .leftJoin(abuseReports, eq(abuseReports.publicationId, moderationCases.publicationId))
    .leftJoin(publishedProjects, eq(publishedProjects.id, moderationCases.publicationId))
    .where(and(eq(moderationCases.reviewRequired, true), isNull(moderationCases.resolvedAt)))
    .orderBy(desc(moderationCases.createdAt))
    .limit(limit * 4);
  // 一个案子可能挂着多份举报：JOIN 出来的行数不是案数，按案子去重并把举报数算出来
  const byCase = new Map<string, QueueEntry & { seen: Set<string> }>();
  for (const row of rows) {
    const entry = byCase.get(row.caseId) ?? {
      caseId: row.caseId,
      projectId: row.projectId,
      projectName: row.projectName,
      ownerName: row.ownerName,
      publicationId: row.publicationId,
      path: row.path ?? null,
      publicationVersion: row.publicationVersion,
      visibility: row.visibility,
      decision: row.decision as ModerationDecision,
      findings: Array.isArray(row.findings) ? (row.findings as ModerationFinding[]) : [],
      rulesVersion: row.rulesVersion,
      reportCount: 0,
      createdAt: row.createdAt.toISOString(),
      seen: new Set<string>(),
    };
    if (row.reports && !entry.seen.has(row.reports)) {
      entry.seen.add(row.reports);
      entry.reportCount += 1;
    }
    byCase.set(row.caseId, entry);
  }
  return [...byCase.values()]
    .slice(0, limit)
    .map(({ seen: _seen, ...entry }) => entry);
}

export type ResolveOutcome =
  | { ok: true; caseId: string; resolution: 'approved' | 'rejected'; hidden: boolean }
  | { ok: false; reason: string };

/**
 * 人工裁决。这是唯一能把 published_projects.moderation 写成 approved / rejected 的入口，
 * 所以调用方必须先确认操作者 role='admin'。rejected 会把那一行的 moderation 落下去，
 * 公开路径解析（resolvePublishedPath）据此立刻 404 —— 裁决要真的能撤下内容。
 */
export async function resolveCase(
  caseId: string,
  actor: { adminId: string; resolution: 'approved' | 'rejected'; note?: string },
): Promise<ResolveOutcome> {
  const db = getDb();
  const [existing] = await db.select().from(moderationCases).where(eq(moderationCases.id, caseId)).limit(1);
  if (!existing) return { ok: false, reason: '没有这个案号' };
  if (existing.resolvedAt) return { ok: false, reason: '这案已经有人裁决过了' };

  await db
    .update(moderationCases)
    .set({
      resolvedBy: actor.adminId,
      resolution: actor.resolution,
      resolutionNote: actor.note ?? null,
      resolvedAt: new Date(),
    })
    .where(eq(moderationCases.id, caseId));

  let hidden = false;
  if (existing.publicationId) {
    await db
      .update(publishedProjects)
      .set({ moderation: actor.resolution })
      .where(eq(publishedProjects.id, existing.publicationId));
    hidden = actor.resolution === 'rejected';
  }
  if (actor.resolution === 'rejected') {
    await db.update(abuseReports).set({ status: 'closed' }).where(eq(abuseReports.publicationId, existing.publicationId ?? ''));
  }
  return { ok: true, caseId, resolution: actor.resolution, hidden };
}

/** 举报是从公开 URL 进来的，所以要能按 path 找到那一行（private 的不算可举报对象） */
export async function findPublicPath(path: string): Promise<{ id: string; projectId: string; moderation: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: publishedProjects.id, projectId: publishedProjects.projectId, moderation: publishedProjects.moderation })
    .from(publishedProjects)
    .where(and(eq(publishedProjects.path, path), sql`${publishedProjects.visibility} <> 'private'`))
    .limit(1);
  return row ?? null;
}

export interface ReportInput {
  publicationId: string;
  path: string;
  reason: 'minor_safety' | 'intimate_nonconsensual' | 'impersonation' | 'illegal' | 'ip' | 'spam' | 'other';
  detail?: string;
  reporterId: string | null;
}

export interface FiledReport {
  id: string;
  /** 举报是否顺手把这项目挂进了人工队列（举报不会自动撤下内容） */
  escalated: boolean;
}

/**
 * §132 举报。落库只是第一步：三条硬红线类别的举报会顺手补一条待复核案，
 * 否则"能举报"只是把消息丢进黑洞。举报本身不撤下内容——那是人裁决的事。
 */
export async function fileReport(input: ReportInput): Promise<FiledReport> {
  const db = getDb();
  const [row] = await db
    .insert(abuseReports)
    .values({
      publicationId: input.publicationId,
      path: input.path,
      reason: input.reason,
      detail: input.detail ?? null,
      reporterId: input.reporterId,
    })
    .returning({ id: abuseReports.id });

  const escalatedReasons = new Set(['minor_safety', 'intimate_nonconsensual', 'impersonation']);
  const [publication] = await db.select().from(publishedProjects).where(eq(publishedProjects.id, input.publicationId)).limit(1);
  let escalated = false;
  if (publication && escalatedReasons.has(input.reason)) {
    const open = await db
      .select({ id: moderationCases.id })
      .from(moderationCases)
      .where(and(eq(moderationCases.publicationId, publication.id), isNull(moderationCases.resolvedAt), eq(moderationCases.reviewRequired, true)))
      .limit(1);
    if (!open.length) {
      await recordScan({
        projectId: publication.projectId,
        publicationId: publication.id,
        publicationVersion: publication.version,
        visibility: publication.visibility as 'private' | 'unlisted' | 'public',
        scan: {
          rulesVersion: `report:${input.reason}`,
          decision: 'review',
          findings: [
            {
              rule: 'report.intake',
              level: 'review',
              quote: `举报类别：${input.reason}`,
              where: `publication:${publication.id}`,
              why: '社区举报命中三条硬红线之一，自动挂人工复核（§131/§132）',
            },
          ],
          limits: ['这条案来自举报，不是机检扫描的结果：扫描本身可能根本没跑过这个版本。'],
          scanned: { pages: 0, textNodes: 0, assetRefs: 0 },
        },
      });
      escalated = true;
    }
  }
  return { id: row!.id, escalated };
}
