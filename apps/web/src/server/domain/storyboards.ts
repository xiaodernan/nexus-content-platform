import { eq } from 'drizzle-orm';
import { StoryboardSaveRequestSchema } from '@nexus/schemas';
import { missingArrowSource, type Storyboard } from '@nexus/video-model';
import { getDb } from '../db/client';
import { storyboards } from '../db/schema';
import { listCharacters } from './characters';
import { listProjectAssets } from './assets';
import { syncProjectKnowledge } from './knowledge';

/**
 * §40-42 分镜的读写。一个项目一份（v1，与 worlds / games 同一口径）。
 *
 * 两道门各管一件事，都不省：
 * - **报文**：`StoryboardSaveRequestSchema`（`@nexus/schemas`）管字节形状；结构权威在
 *   `@nexus/video-model`，那个包是纯函数、不碰库（AI Service 不写业务库那条纪律的同一分法）。
 * - **归属**：镜头能带 `characterId` / `referenceAssetId` / `videoAssetId`。不校验的话，
 *   从别的项目复制来的一份分镜就是条读取别人资产的通道（§80 那条摄取链的反面：
 *   存进去的指针也得只指得回本项目）。所以这里逐个核对，报错要点名是哪一个 id、哪一镜。
 *
 * 时间戳放在列上而不是文档里：文档要能被同一份输入重复投影出逐字节相同的结果（§16 可重放），
 * "存过几次"不是内容。并发比较用的是 ISO 字符串，读的时候一起带出去给客户端当基准。
 */

export type StoryboardResult = { ok: true; document: Storyboard; updatedAt: string } | { ok: false; reason: string };

async function currentRow(projectId: string) {
  const db = getDb();
  const [row] = await db.select().from(storyboards).where(eq(storyboards.projectId, projectId)).limit(1);
  return row;
}

/** 读取；没有分镜时返回 null（"还没有"与"有一份空的"是两件事，界面上要分得开） */
export async function loadStoryboard(projectId: string): Promise<StoryboardResult | null> {
  const row = await currentRow(projectId);
  if (!row) return null;
  const parsed = StoryboardSaveRequestSchema.safeParse({ document: row.document });
  if (!parsed.success) {
    return {
      ok: false,
      reason: `库里的分镜文档不符合契约：${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .slice(0, 6)
        .join('；')}`,
    };
  }
  // 一份分镜只有一个 id：行的 uuid。文档自带的那个字符串只是建档时的临时值（'storyboard-1'），
  // 读出来就换掉，否则时间线的 storyboardId 与库里的行会变成两个说法。
  return { ok: true, document: { ...parsed.data.document, id: row.id }, updatedAt: row.updatedAt.toISOString() };
}

/** 镜头里的引用必须指得回本项目；返回第一条越界问题的说法，全都合法时返回 null */
async function firstForeignRef(projectId: string, document: Storyboard): Promise<string | null> {
  const refs = [
    ...document.shots.map((shot, index) => ({
      where: `第 ${index + 1} 镜（${shot.id}）`,
      characterId: shot.characterId,
      assetIds: [shot.referenceAssetId, shot.videoAssetId].filter((v): v is string => Boolean(v)),
    })),
    {
      where: '来源（source）',
      characterId: document.source.characterId,
      assetIds: [document.source.referenceAssetId].filter((v): v is string => Boolean(v)),
    },
  ];
  const needed = refs.filter((r) => r.characterId || r.assetIds.length);
  if (!needed.length) return null;
  const [{ items: charactersInProject }, assetsInProject] = await Promise.all([
    listCharacters(projectId),
    listProjectAssets(projectId),
  ]);
  const knownCharacters = new Set(charactersInProject.map((c) => c.id));
  const knownAssets = new Set(assetsInProject.map((a) => a.id));
  for (const ref of needed) {
    if (ref.characterId && !knownCharacters.has(ref.characterId)) {
      return `${ref.where} 挂的角色 ${ref.characterId} 不是这个项目的角色`;
    }
    for (const assetId of ref.assetIds) {
      if (!knownAssets.has(assetId)) {
        return `${ref.where} 挂的资产 ${assetId} 不是这个项目的资产`;
      }
    }
  }
  return null;
}

/**
 * 整份换掉。projectId 由路径决定，不接受客户端传来的"我要写进别的项目"。
 * `baseUpdatedAt` 是可选基准：带上来就拒绝比它更旧的写（两个 PUT 乱序到达时旧版本不能赢），
 * 不带上就是最后写入者赢——第一次建档手里没有基准，逼它编一个等于让它伪造并发检查。
 */
export async function saveStoryboard(projectId: string, ownerId: string, input: unknown): Promise<StoryboardResult> {
  const parsed = StoryboardSaveRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `分镜文档不符合契约：${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .slice(0, 6)
        .join('；')}`,
    };
  }
  const { document, baseUpdatedAt } = parsed.data;
  /**
   * §40 箭头与来源的一致性：`image-to-video` 要从一张参考图出发、`character-to-scene`
   * 要从一位角色出发。缺了这条片子就出不来，而不校验的话库里会存下一份"声称走 image-to-video、
   * 却没有任何图"的分镜——界面上写着来源，实际上什么也没挂（§159 那种假可用）。
   *
   * 规则本体在 `@nexus/video-model`（与界面禁用按钮读同一句），这里只负责拒收时把它原样说出来。
   * 放在归属核对之前：缺来源是文档自身的矛盾，与库里有哪些资产无关，不用先走一次查询。
   */
  const sourceGaps = missingArrowSource(document.source);
  if (sourceGaps.length) return { ok: false, reason: sourceGaps.join(' ') };
  const foreign = await firstForeignRef(projectId, document as Storyboard);
  if (foreign) return { ok: false, reason: `这份分镜引用了不属于本项目的东西：${foreign}。` };

  const db = getDb();
  const existing = await currentRow(projectId);
  if (existing) {
    const storedAt = existing.updatedAt.toISOString();
    if (baseUpdatedAt && baseUpdatedAt < storedAt) {
      return {
        ok: false,
        reason: `库里已有一份比这次更新的分镜（${storedAt} > ${baseUpdatedAt}），这次写入被拒。`,
      };
    }
    const [row] = await db
      .update(storyboards)
      .set({ document, title: document.title, updatedAt: new Date() })
      .where(eq(storyboards.id, existing.id))
      .returning({ id: storyboards.id, updatedAt: storyboards.updatedAt });
    if (!row) return { ok: false, reason: '保存分镜时没写到任何行' };
    // 存了但检索不到 = 对 AI 不存在（§49）。与角色/世界同一口径：写成功后重建这一份语料
    await syncProjectKnowledge(projectId);
    return { ok: true, document: { ...document, id: row.id }, updatedAt: row.updatedAt.toISOString() };
  }

  const [inserted] = await db
    .insert(storyboards)
    .values({ projectId, ownerId, title: document.title, document })
    .returning({ id: storyboards.id, updatedAt: storyboards.updatedAt });
  if (!inserted) return { ok: false, reason: '新建分镜时没写到任何行' };
  await syncProjectKnowledge(projectId);
  return { ok: true, document: { ...document, id: inserted.id }, updatedAt: inserted.updatedAt.toISOString() };
}
