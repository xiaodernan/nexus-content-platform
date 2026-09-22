import { and, desc, eq } from 'drizzle-orm';
import { CharacterProfileSchema, CharacterSchema } from '@nexus/schemas';
import {
  createCharacter,
  validateCharacter,
  type Character,
  type CharacterProfile,
} from '@nexus/world-model';
import { getDb } from '../db/client';
import { characters, worlds } from '../db/schema';

/**
 * §46 角色档案的读写。角色挂在世界上（`worldId`），也记着所属项目（`projectId`），
 * 所有查询都按 projectId 过滤——拿着别人的角色 id 来是查不到的（默认拒绝，§SECURITY）。
 *
 * 档案整份存 JSONB（`characters.profile`），名字单列一份是为了列表和搜索不用解析 JSON。
 * 进出这道门都过 zod + `validateCharacter`：库里躺着读不出来的档案是不可接受的（§159）。
 */

export type CharacterResult = { ok: true; character: Character } | { ok: false; reason: string };

function parseRow(row: typeof characters.$inferSelect): CharacterResult {
  const parsed = CharacterSchema.safeParse({
    id: row.id,
    projectId: row.projectId,
    worldId: row.worldId,
    profile: row.profile,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
  if (!parsed.success) {
    return {
      ok: false,
      reason: `角色「${row.name}」的档案不符合契约：${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .slice(0, 4)
        .join('；')}`,
    };
  }
  return { ok: true, character: parsed.data as Character };
}

export async function listCharacters(projectId: string): Promise<{
  items: Character[];
  unreadable: string[];
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId))
    .orderBy(desc(characters.updatedAt));
  const items: Character[] = [];
  const unreadable: string[] = [];
  for (const row of rows) {
    const parsed = parseRow(row);
    if (parsed.ok) items.push(parsed.character);
    else unreadable.push(parsed.reason);
  }
  return { items, unreadable };
}

/** 当前项目的世界 id；没有世界时返回 null（角色可以先不属于任何世界） */
async function currentWorldId(projectId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: worlds.id })
    .from(worlds)
    .where(eq(worlds.projectId, projectId))
    .orderBy(desc(worlds.updatedAt))
    .limit(1);
  return row?.id ?? null;
}

export async function createProjectCharacter(
  projectId: string,
  ownerId: string,
  input: { name: string; worldId?: string | null },
): Promise<CharacterResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: '角色要有名字。' };
  const worldId = input.worldId === undefined ? await currentWorldId(projectId) : input.worldId;
  const character = createCharacter({ name, projectId, worldId });
  const db = getDb();
  // id 由库生成（uuid）：一个角色只该有一个说法的 id，模型里那个临时 id 不外传
  const [row] = await db
    .insert(characters)
    .values({
      projectId,
      worldId: character.worldId,
      ownerId,
      name: character.profile.name,
      profile: character.profile,
      createdAt: new Date(character.createdAt),
      updatedAt: new Date(character.updatedAt),
    })
    .returning();
  if (!row) return { ok: false, reason: '建档时没写到任何行。' };
  return {
    ok: true,
    character: { ...character, id: row.id, worldId: row.worldId, projectId: row.projectId },
  };
}

export async function updateCharacterProfile(
  characterId: string,
  projectId: string,
  profile: CharacterProfile,
): Promise<CharacterResult> {
  const parsedProfile = CharacterProfileSchema.safeParse(profile);
  if (!parsedProfile.success) {
    return {
      ok: false,
      reason: `档案不符合契约：${parsedProfile.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .slice(0, 4)
        .join('；')}`,
    };
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.projectId, projectId)))
    .limit(1);
  if (!row) return { ok: false, reason: '这个项目里没有这个角色。' };
  const existing = parseRow(row);
  if (!existing.ok) return existing;

  const next: Character = {
    ...existing.character,
    profile: parsedProfile.data as CharacterProfile,
    updatedAt: new Date().toISOString(),
  };
  const issues = validateCharacter(next);
  if (issues.length) {
    // 断链那类要连着世界才能判，这里只挡结构性问题（空名字、空关系、坏色值）
    return { ok: false, reason: `档案不完整：${issues.map((i) => i.message).join('；')}` };
  }
  const [updated] = await db
    .update(characters)
    .set({ profile: next.profile, name: next.profile.name, updatedAt: new Date(next.updatedAt) })
    .where(and(eq(characters.id, characterId), eq(characters.projectId, projectId)))
    .returning();
  if (!updated) return { ok: false, reason: '保存档案时没写到任何行。' };
  return { ok: true, character: next };
}

export async function deleteCharacter(characterId: string, projectId: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(characters)
    .where(and(eq(characters.id, characterId), eq(characters.projectId, projectId)))
    .returning({ id: characters.id });
  return deleted.length > 0;
}
