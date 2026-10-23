import { desc, eq } from 'drizzle-orm';
import { WorldDocumentSchema } from '@nexus/schemas';
import { validateWorld, type WorldDocument } from '@nexus/world-model';
import { syncProjectKnowledge } from './knowledge';
import { getDb } from '../db/client';
import { worlds } from '../db/schema';

/**
 * §44 世界文档的读写。一个项目一份世界（v1）：面板、图视图（§45）、角色对话（§47）
 * 都从这一份出发，所以这里不提供"多份世界"的列表——真需要那天再加，别提前造概念。
 *
 * 存的是整份 JSON 序列化（和设计文档拆成规范化行不同）：世界文档是文字为主的小文档，
 * 没有按节点查询的需求，拆开只会多出一处会不同步的地方。权威结构在 @nexus/world-model，
 * 进出这道门都要过 zod + validateWorld——库里躺着读不出来的东西是不可接受的（§159）。
 */

export type WorldResult = { ok: true; document: WorldDocument } | { ok: false; reason: string };

async function currentRow(projectId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(worlds)
    .where(eq(worlds.projectId, projectId))
    .orderBy(desc(worlds.updatedAt))
    .limit(1);
  return row;
}

/** 读取；没有世界时返回 null（不是空文档——"还没有"和"有一份空的"是两件事） */
export async function loadWorld(projectId: string): Promise<WorldResult | null> {
  const row = await currentRow(projectId);
  if (!row) return null;
  const parsed = WorldDocumentSchema.safeParse(row.document);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `库里的世界文档不符合契约：${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('；')}`,
    };
  }
  const stored = parsed.data as WorldDocument;
  const structural = validateWorld(stored);
  if (structural.length) {
    return { ok: false, reason: `库里的世界文档结构不完整：${structural[0]!.message}` };
  }
  // 一份世界只有一个 id：行的 uuid。文档自带的那个字符串只是建档时的临时值，
  // 读出来就换掉，否则角色挂的 worldId 与世界文档的 id 会变成两个说法。
  return { ok: true, document: { ...stored, id: row.id } };
}

/**
 * 整份换掉。projectId 由路径决定，不接受客户端传来的"我要写进别的项目"；
 * 文档自己的 projectId 字段必须与之一致，否则就是一份从别处复制来的文档冒充本地真值。
 */
export async function saveWorld(
  projectId: string,
  ownerId: string,
  input: unknown,
): Promise<WorldResult> {
  const parsed = WorldDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `世界文档不符合契约：${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .slice(0, 6)
        .join('；')}`,
    };
  }
  const document = parsed.data as WorldDocument;
  const structural = validateWorld(document);
  if (structural.length) {
    return { ok: false, reason: `世界文档不完整：${structural.map((i) => i.message).join('；')}` };
  }
  if (document.projectId !== null && document.projectId !== projectId) {
    return { ok: false, reason: `这份世界属于别的项目（${document.projectId}），不能写进当前项目。` };
  }

  const stamped: WorldDocument = { ...document, projectId };
  const existing = await currentRow(projectId);
  if (existing) return await applyWorldUpdate(projectId, existing, stamped);

  const [inserted] = await getDb()
    .insert(worlds)
    .values({
      projectId,
      ownerId,
      name: stamped.name,
      summary: stamped.summary,
      document: stamped,
    })
    // #168：并发创建（两个标签页各存一次）都查不到已有行 → 都 insert。
    // 迁移 0037 给 project_id 加了唯一约束，后到的那条在这里被挡下，回头走更新路径——
    // "一个项目一份"由库守着，不靠两个请求谁跑得快。
    .onConflictDoNothing()
    .returning({ id: worlds.id });
  if (inserted) {
    await syncProjectKnowledge(projectId);
    return { ok: true, document: { ...stamped, id: inserted.id } };
  }
  // 撞了唯一约束：另一个请求刚插了同一项目的那一行。重新读出来走更新路径
  // （"拒绝更旧的写"那道判断在助手里面，照旧生效）。
  const raced = await currentRow(projectId);
  if (!raced) {
    return { ok: false, reason: '保存世界文档时并发写入丢失（唯一约束挡下第二次插入后重读不到行）' };
  }
  return await applyWorldUpdate(projectId, raced, stamped);
}

/** 已有那一行的写入口：旧写拒绝 / 否则整份换新 */
async function applyWorldUpdate(
  projectId: string,
  existing: NonNullable<Awaited<ReturnType<typeof currentRow>>>,
  stamped: WorldDocument,
): Promise<WorldResult> {
  const stored = WorldDocumentSchema.safeParse(existing.document);
  // 拒绝"更旧的写"：卸载时可能同时有两个 PUT 在飞，乱序到达不能让旧版本赢
  if (stored.success && stored.data.updatedAt > stamped.updatedAt) {
    return {
      ok: false,
      reason: `库里已有一份比这次更新的世界（${stored.data.updatedAt} > ${stamped.updatedAt}），这次写入被拒。`,
    };
  }
  const [row] = await getDb()
    .update(worlds)
    .set({
      document: stamped,
      name: stamped.name,
      summary: stamped.summary,
      updatedAt: new Date(),
    })
    .where(eq(worlds.id, existing.id))
    .returning({ id: worlds.id });
  if (!row) return { ok: false, reason: '保存世界文档时没写到任何行' };
  await syncProjectKnowledge(projectId);
  return { ok: true, document: { ...stamped, id: row.id } };
}

/** 项目被删时 worlds 靠外键级联；这里只给测试与运维一个明确的断言入口 */
export async function countWorlds(projectId: string): Promise<number> {
  const db = getDb();
  const rows = await db.select({ id: worlds.id }).from(worlds).where(eq(worlds.projectId, projectId));
  return rows.length;
}
