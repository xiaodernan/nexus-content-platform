import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import { projects, publishedProjects } from '../db/schema';
import { loadDocument } from './projects';
import { assetProvenance, runPublishGate, type Visibility } from './publish';
import { publishSlotRefusalFor } from './credit-ledger';
import { scanPublication } from './moderation';

/**
 * §56 发布预检：把"按下发布会发生什么"的回执提前、只读地算一遍。
 *
 * 这条链只做**读**：不写 publication 行、不推 build.status 事件、不留下机检立案，
 * 与真的 `publishProject` 共用同一批判定函数（slot / 门禁 / 机检），所以"预检绿、发布红"
 * 只可能来自两次调用之间的状态变化，不可能来自两处实现漂移。
 *
 * §159 的口径：预检说什么就是什么 —— 有一项没跑成就说没跑成，绝不因为"95% 类推"就报全绿。
 */
export interface PublishPreflightReport {
  /** 三个检查都真的跑过、且没有一项会挡下这次发布；review 级机检不挡发布，记进 warnings。 */
  ok: boolean;
  visibility: Visibility;
  blockers: string[];
  warnings: string[];
  facts: {
    gatePassed: boolean;
    gateBlockers: string[];
    scanDecision: 'clear' | 'review' | 'blocked' | 'skipped';
    slotRefusal: string | null;
    /** 现有发布行的 moderation 回显（信息而已，§131 只升级不认证——它不是发布的答案）。 */
    existingModeration: string | null;
  };
  ranAt: string;
}

export async function checkPublishPreflight(
  projectId: string,
  visibility: Visibility = 'public',
): Promise<PublishPreflightReport | null> {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) return null;

  const blockers: string[] = [];
  const warnings: string[] = [];
  const outward = visibility !== 'private';

  // 回环/下架方向：拿门禁或机检挡作者下架，等于逼着一个不合格的页面继续挂在公网上。
  // 真的 publishProject 对 private 同样放行，所以预检对 private 直接全绿并说明原因。
  if (!outward) {
    return {
      ok: true,
      visibility,
      blockers,
      warnings: ['切到 private 是收回公开链接，不是"把一个不合格的页面留下来"——门禁与机检对这个方向不拦'],
      facts: {
        gatePassed: true,
        gateBlockers: [],
        scanDecision: 'clear',
        slotRefusal: null,
        existingModeration: null,
      },
      ranAt: new Date().toISOString(),
    };
  }

  const [document, slotRefusal] = await Promise.all([
    loadDocument(projectId),
    publishSlotRefusalFor(project.ownerId, projectId),
  ]);

  // 门禁
  let gate: ReturnType<typeof runPublishGate> | null = null;
  if (document) {
    gate = runPublishGate(document);
    if (!gate.passed) blockers.push(`门禁未通过：${gate.blockers[0] ?? '见检查清单'}`);
  } else {
    blockers.push('文档读不出来——这不是"质量差"，是根本无法证明它合格');
  }

  // 机检
  let scanDecision: PublishPreflightReport['facts']['scanDecision'] = 'skipped';
  if (document) {
    const scan = scanPublication(document, await assetProvenance(projectId));
    scanDecision = scan.decision as PublishPreflightReport['facts']['scanDecision'];
    if (scan.decision === 'blocked') {
      const hit = scan.findings.find((f) => f.level === 'blocked');
      blockers.push(`发布被机检挡下（${hit?.rule ?? 'redline'}）：${hit?.why ?? '命中 §129 硬红线'}`);
    } else if (scan.decision === 'review') {
      warnings.push('机检判定需要人看一眼（review）：发布照常，但会进人工队列——这不是"审核通过"');
    }
  }

  // 档位名额（往外公开才看）
  if (slotRefusal) blockers.push(slotRefusal);

  // 现有发布行的 moderation 回显（信息而已）
  const [existing] = await db
    .select()
    .from(publishedProjects)
    .where(eq(publishedProjects.projectId, projectId))
    .orderBy(desc(publishedProjects.version))
    .limit(1);

  return {
    ok: blockers.length === 0,
    visibility,
    blockers,
    warnings,
    facts: {
      gatePassed: gate === null ? false : gate.passed,
      gateBlockers: gate === null ? ['文档读不出来'] : (gate.blockers ?? []),
      scanDecision,
      slotRefusal: slotRefusal ?? null,
      existingModeration: existing?.moderation ?? null,
    },
    ranAt: new Date().toISOString(),
  };
}
