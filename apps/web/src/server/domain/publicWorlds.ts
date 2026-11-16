import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { projects, publishedProjects, users, worlds } from '@/server/db/schema';

/**
 * §WORLD-INDEX `/world`：所有已公开发布的 world 的入口页。
 *
 * 为什么放 public：world 是公开（published_projects.visibility='public'）时存在；
 * 私有的、未发布的 visible hand 不会出现在这一行。
 *
 * 给的是两件事：
 * 1. 一张公开作品 tiles（封面、名、简介裁剪版、打开 /preview/[projectId] 的链接）
 * 2. 给"还不是作者的人"一个明确的下一步 CTA——跳 /studio
 */

export interface PublicWorldRow {
  worldId: string;
  projectId: string;
  projectName: string;
  ownerHandle: string | null;
  summary: string | null;
  /** publishedProjects.path（/n/<handle>/<path>） */
  slug: string;
  publishedAt: Date;
}

const SUMMARY_MAX = 96;

function trim(value: string | null | undefined): string | null {
  if (!value) return null;
  const collapsed = value.trim().replace(/\s+/g, ' ');
  if (collapsed.length <= SUMMARY_MAX) return collapsed;
  return collapsed.slice(0, SUMMARY_MAX - 1) + '…';
}

export async function publicWorlds(limit = 24): Promise<PublicWorldRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      worldId: worlds.id,
      projectId: projects.id,
      projectName: projects.name,
      ownerId: users.id,
      ownerHandle: users.handle,
      summary: projects.description,
      slug: publishedProjects.path,
      publishedAt: publishedProjects.publishedAt,
    })
    .from(worlds)
    .innerJoin(projects, eq(projects.id, worlds.projectId))
    .innerJoin(publishedProjects, eq(publishedProjects.projectId, projects.id))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(
      and(
        isNull(projects.deletedAt),
        sql`${publishedProjects.visibility} = 'public'`,
      ),
    )
    .orderBy(desc(publishedProjects.publishedAt))
    .limit(limit);
  // 同一个项目可能多版本 → 每个项目只保留最新一条
  const seen = new Set<string>();
  const out: PublicWorldRow[] = [];
  for (const row of rows) {
    if (seen.has(row.projectId)) continue;
    seen.add(row.projectId);
    out.push({
      worldId: row.worldId,
      projectId: row.projectId,
      projectName: row.projectName,
      ownerHandle: row.ownerHandle,
      summary: trim(row.summary),
      slug: row.slug,
      publishedAt: row.publishedAt,
    });
  }
  return out;
}
