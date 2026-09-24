import { desc, eq } from 'drizzle-orm';
import { GameDocumentSchema } from '@nexus/schemas';
import { validateGame, type GameDocument } from '@nexus/game-model';
import { getDb } from '../db/client';
import { games } from '../db/schema';

/**
 * §54 游戏设计文档的读写。与 worlds 同一条纪律：
 * 一个项目一份游戏文档（v1），整份 JSON 存取，进出这道门都要过 zod + validateGame。
 *
 * 为什么整份存：游戏文档是"11 类实体 + 它们之间的引用"，查询都是围绕某一份设计进行的，
 * 没有按实体类型跨项目检索的需求（要检索时走 §69 的索引，而不是把模型拆散）。
 * 拆成规范化行的代价是多一处会不同步的地方——引用的两头分别在两张表里，
 * 删一个实体要记得删两边的行。模型层已经把"两头都清"这件事做掉了（removeEntity），
 * 存储层不该把它重新变成一个大问题。
 */

export type GameResult = { ok: true; document: GameDocument } | { ok: false; reason: string };

async function currentRow(projectId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(games)
    .where(eq(games.projectId, projectId))
    .orderBy(desc(games.updatedAt))
    .limit(1);
  return row;
}

/** 读取；没有游戏时返回 null（"还没有"和"有一份空的"是两件事，GET 不顺手建档） */
export async function loadGame(projectId: string): Promise<GameResult | null> {
  const row = await currentRow(projectId);
  if (!row) return null;
  const parsed = GameDocumentSchema.safeParse(row.document);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `库里的游戏文档不符合契约：${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('；')}`,
    };
  }
  const stored = parsed.data as unknown as GameDocument;
  const structural = validateGame(stored);
  if (structural.length) {
    return { ok: false, reason: `库里的游戏文档结构不完整：${structural[0]!.message}` };
  }
  // 一份游戏只有一个 id：行的 uuid。文档自带的那个字符串只是建档时的临时值
  return { ok: true, document: { ...stored, id: row.id } };
}

/**
 * 整份换掉。projectId 由路径决定；文档自己声明的 projectId 必须与之一致，
 * 否则就是一份从别的项目复制来的文档冒充本地真值。
 */
export async function saveGame(
  projectId: string,
  ownerId: string,
  input: unknown,
): Promise<GameResult> {
  const parsed = GameDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `游戏文档不符合契约：${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .slice(0, 6)
        .join('；')}`,
    };
  }
  const document = parsed.data as unknown as GameDocument;
  const structural = validateGame(document);
  if (structural.length) {
    return { ok: false, reason: `游戏文档不完整：${structural.map((i) => i.message).join('；')}` };
  }
  if (document.projectId !== null && document.projectId !== projectId) {
    return { ok: false, reason: `这份游戏属于别的项目（${document.projectId}），不能写进当前项目。` };
  }

  const db = getDb();
  const stamped: GameDocument = { ...document, projectId };
  const existing = await currentRow(projectId);
  if (existing) {
    const stored = GameDocumentSchema.safeParse(existing.document);
    // 拒绝"更旧的写"：两个 PUT 乱序到达时不能让旧版本赢
    if (stored.success && stored.data.updatedAt > stamped.updatedAt) {
      return {
        ok: false,
        reason: `库里已有一份比这次更新的游戏（${stored.data.updatedAt} > ${stamped.updatedAt}），这次写入被拒。`,
      };
    }
    const [row] = await db
      .update(games)
      .set({ document: stamped, name: stamped.name, summary: stamped.summary, updatedAt: new Date() })
      .where(eq(games.id, existing.id))
      .returning({ id: games.id });
    if (!row) return { ok: false, reason: '保存游戏文档时没写到任何行' };
    return { ok: true, document: { ...stamped, id: row.id } };
  }

  const [inserted] = await db
    .insert(games)
    .values({ projectId, ownerId, name: stamped.name, summary: stamped.summary, document: stamped })
    .returning({ id: games.id });
  if (!inserted) return { ok: false, reason: '新建游戏时没写到任何行' };
  return { ok: true, document: { ...stamped, id: inserted.id } };
}

/** 项目被删时 games 靠外键级联；这里给测试与运维一个明确的断言入口 */
export async function countGames(projectId: string): Promise<number> {
  const db = getDb();
  const rows = await db.select({ id: games.id }).from(games).where(eq(games.projectId, projectId));
  return rows.length;
}
