import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { emptyStoryboard, planStoryboard } from '@nexus/video-model';
import { loadStoryboard, saveStoryboard } from '../src/server/domain/storyboards';
import { createProject } from '../src/server/domain/projects';
import { createProjectCharacter } from '../src/server/domain/characters';
import { getDb } from '../src/server/db/client';
import { projects, storyboards, users } from '../src/server/db/schema';

/**
 * §40-42 分镜的存储。打真实 Postgres：文档是 JSONB，而"写得进读得出、契约外的进不来、
 * 越界的引用挂不上"只有在真库上才算验证过（与 world / games 同一条理由）。
 *
 * 这里最要紧的一条不是往返，而是**归属核对**：镜头能挂 characterId 与资产 id，
 * 不核对的话，从别的项目复制来的一份分镜就成了一条读取别人资产的通道。
 */

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Storyboarder', email: `storyboard+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function newProject(name: string): Promise<string> {
  // 项目类型里没有 video 这一档（§40 那条链要挂在任何类型的项目上），用 website 建档就够了：
  // 这里测的是分镜的存储，不是项目类型的分类法。
  return (await createProject(ownerId, { name, kind: 'website' })).id;
}

async function rowCount(projectId: string): Promise<number> {
  return (await getDb().select({ id: storyboards.id }).from(storyboards).where(eq(storyboards.projectId, projectId))).length;
}

describe('分镜读写（真实数据库）', () => {
  it('没有分镜时返回 null，读取不顺手建档', async () => {
    const id = await newProject('SB Empty');
    expect(await loadStoryboard(id)).toBeNull();
    expect(await rowCount(id)).toBe(0);
  });

  it('保存后读回同一份；document.id 换成行 uuid；再保存换的还是同一行', async () => {
    const id = await newProject('SB Roundtrip');
    const sb = planStoryboard('夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳');
    const first = await saveStoryboard(id, ownerId, { document: sb });
    expect(first.ok, first.ok ? '' : first.reason).toBe(true);
    if (!first.ok) throw new Error(first.reason);
    expect(first.document.id).not.toBe('storyboard-1');

    const loaded = await loadStoryboard(id);
    expect(loaded?.ok).toBe(true);
    if (!loaded?.ok) throw new Error(loaded && !loaded.ok ? loaded.reason : '读不出来');
    expect(loaded.document.id).toBe(first.document.id);
    expect(loaded.document.shots.map((s) => s.prompt)).toEqual(sb.shots.map((s) => s.prompt));
    expect(loaded.document.shots).toHaveLength(3);
    // notes 是投影的解释，不是可有可无的装饰：存进去必须还在，界面上才有话可说
    expect(loaded.document.notes.join('\n')).toContain('不是模型给的镜头语言');
    expect(loaded.updatedAt).toBe(first.updatedAt);

    const second = await saveStoryboard(id, ownerId, { document: { ...sb, title: '改了标题' }, baseUpdatedAt: loaded.updatedAt });
    expect(second.ok, second.ok ? '' : second.reason).toBe(true);
    expect(await rowCount(id), '一个项目该只有一份分镜，第二次保存不该多出一行').toBe(1);
    const afterSecond = await loadStoryboard(id);
    if (!afterSecond?.ok) throw new Error(afterSecond && !afterSecond.ok ? afterSecond.reason : '读不出来');
    expect(afterSecond.document.title, '第二次保存没换掉标题，那一格等于没写进去').toBe('改了标题');
  });

  it('契约外的文档进不来，而且库里不留痕（拒绝要发生在写之前）', async () => {
    const id = await newProject('SB Rejected');
    const sb = planStoryboard('一，二');
    const bad = [
      { ...sb, shots: sb.shots.map((s) => ({ ...s, camera: 'dutch-angle' })) },
      { ...sb, shots: sb.shots.map((s) => ({ ...s, durationMs: 0 })) },
      { ...sb, title: '   ' },
      { ...sb, shots: [] , id: '' },
    ];
    for (const doc of bad) {
      const result = await saveStoryboard(id, ownerId, { document: doc });
      expect(result.ok, `这一份本该进不来：${JSON.stringify(doc).slice(0, 120)}`).toBe(false);
    }
    expect(await rowCount(id)).toBe(0);
    expect(await loadStoryboard(id)).toBeNull();
  });

  it('镜头挂别的项目的角色：拒绝并点名；挂本项目的角色：接受（反向对照）', async () => {
    const mine = await newProject('SB Mine');
    const theirs = await newProject('SB Theirs');
    const foreign = await createProjectCharacter(theirs, ownerId, { name: '别人家的角色' });
    if (!foreign.ok) throw new Error(foreign.reason);
    const own = await createProjectCharacter(mine, ownerId, { name: '我的角色' });
    if (!own.ok) throw new Error(own.reason);

    const sb = planStoryboard('角色在雪地里回头', { characterId: foreign.character.id });
    const rejected = await saveStoryboard(mine, ownerId, { document: sb });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reason).toContain(foreign.character.id);
      expect(rejected.reason, '报错要指得出是哪一镜挂错了，否则用户只能猜').toContain('第 1 镜');
    }

    const local = await saveStoryboard(mine, ownerId, { document: planStoryboard('角色在雪地里回头', { characterId: own.character.id }) });
    expect(local.ok, local.ok ? '' : local.reason).toBe(true);
    expect(await rowCount(mine)).toBe(1);
  });

  it('镜头挂不存在／别处的资产 id：同样拒绝（source 那一格也一起查）', async () => {
    const id = await newProject('SB Foreign Asset');
    const shotLevel = await saveStoryboard(id, ownerId, {
      document: { ...planStoryboard('一镜'), shots: [{ ...planStoryboard('一镜').shots[0]!, referenceAssetId: '00000000-0000-4000-8000-000000000001' }] },
    });
    expect(shotLevel.ok).toBe(false);
    if (!shotLevel.ok) expect(shotLevel.reason).toContain('不是这个项目的资产');

    const sourceLevel = await saveStoryboard(id, ownerId, {
      document: { ...emptyStoryboard(), source: { arrow: 'image-to-video', prompt: '', referenceAssetId: '00000000-0000-4000-8000-000000000002' } },
    });
    expect(sourceLevel.ok).toBe(false);
    if (!sourceLevel.ok) expect(sourceLevel.reason).toContain('来源（source）');
    expect(await rowCount(id)).toBe(0);
  });

  it('§40 箭头要的来源没挂上：拒收并点名箭头与字段；挂上之后同一份就进得来（反向对照）', async () => {
    const id = await newProject('SB Arrow Source');
    const base = planStoryboard('角色在雪地里回头');

    // image-to-video 要从一张参考图出发：没挂图就拒，报错里说得出是箭头与哪个字段
    const imageNoRef = await saveStoryboard(id, ownerId, {
      document: { ...base, source: { arrow: 'image-to-video', prompt: base.source.prompt } },
    });
    expect(imageNoRef.ok).toBe(false);
    if (!imageNoRef.ok) {
      expect(imageNoRef.reason).toContain('image-to-video');
      expect(imageNoRef.reason, '报错要指出缺的是哪个字段，否则读者只能猜').toContain('source.referenceAssetId');
    }

    // character-to-scene 要从一位角色出发：同样拒
    const characterNoId = await saveStoryboard(id, ownerId, {
      document: { ...base, source: { arrow: 'character-to-scene', prompt: base.source.prompt } },
    });
    expect(characterNoId.ok).toBe(false);
    if (!characterNoId.ok) {
      expect(characterNoId.reason).toContain('character-to-scene');
      expect(characterNoId.reason).toContain('source.characterId');
    }
    expect(await rowCount(id), '被拒的文档不该落库').toBe(0);

    // 反向对照：挂上本项目真有的角色，同一条箭头就能存——规则不是"这两条箭头一律不许用"
    const own = await createProjectCharacter(id, ownerId, { name: '雪地里的角色' });
    if (!own.ok) throw new Error(own.reason);
    const saved = await saveStoryboard(id, ownerId, {
      document: planStoryboard('角色在雪地里回头', { arrow: 'character-to-scene', characterId: own.character.id }),
    });
    expect(saved.ok, saved.ok ? '' : saved.reason).toBe(true);
    expect(await rowCount(id)).toBe(1);
  });

  it('并发基准：带着更旧的 baseUpdatedAt 写会被拒，不带基准就是最后写入者赢', async () => {
    const id = await newProject('SB Stale');
    const sb = planStoryboard('一，二');
    const first = await saveStoryboard(id, ownerId, { document: sb });
    if (!first.ok) throw new Error(first.reason);
    const stale = await saveStoryboard(id, ownerId, {
      document: { ...sb, title: '更旧的那一版' },
      baseUpdatedAt: '2000-01-01T00:00:00.000Z',
    });
    expect(stale.ok, '更旧的写被接受了，两个标签页就会互相盖').toBe(false);
    if (!stale.ok) expect(stale.reason).toContain('这次写入被拒');
    const kept = await loadStoryboard(id);
    if (!kept?.ok) throw new Error(kept && !kept.ok ? kept.reason : '读不出来');
    expect(kept.document.title).toBe(sb.title);

    const blind = await saveStoryboard(id, ownerId, { document: { ...sb, title: '不带基准的覆盖' } });
    expect(blind.ok, blind.ok ? '' : blind.reason).toBe(true);
    const blindLoaded = await loadStoryboard(id);
    if (!blindLoaded?.ok) throw new Error(blindLoaded && !blindLoaded.ok ? blindLoaded.reason : '读不出来');
    expect(blindLoaded.document.title).toBe('不带基准的覆盖');
  });

  it('唯一索引在库里，不只是读法里：同项目插第二行直接被数据库拒', async () => {
    const id = await newProject('SB Unique');
    const sb = planStoryboard('一镜');
    const saved = await saveStoryboard(id, ownerId, { document: sb });
    if (!saved.ok) throw new Error(saved.reason);
    const db = getDb();
    // drizzle 会把驱动的错误包进 "Failed query: …"，原始 code 在 cause 里；
    // 这里要的是「数据库自己拒的」这一句证据，而不是任何一次抛错——
    // 顺手抓下来再比，别让 toThrow 的模糊匹配把"连接断了"也算成约束生效。
    const error = await db
      .insert(storyboards)
      .values({ projectId: id, ownerId, title: '影子分镜', document: sb })
      .then(() => null)
      .catch((e: unknown) => e as { message?: string; cause?: { code?: string; message?: string } });
    expect(error, '同项目插第二行没被拒：那两行都算数，界面上只看得见一份，另一份成了没人知道的影子').toBeTruthy();
    const evidence = `${error?.cause?.code ?? ''} ${error?.cause?.message ?? ''} ${error?.message ?? ''}`;
    expect(evidence).toMatch(/23505/);
    expect(evidence, '撞的不是那条唯一约束，说明索引名字漂了').toMatch(/storyboards_project_id_key/);
    expect(await rowCount(id)).toBe(1);
  });

  it('删项目跟着级联，不留下没人认领的行', async () => {
    const id = await newProject('SB Cascade');
    const saved = await saveStoryboard(id, ownerId, { document: planStoryboard('一镜') });
    if (!saved.ok) throw new Error(saved.reason);
    const db = getDb();
    await db.delete(projects).where(eq(projects.id, id));
    expect(await rowCount(id)).toBe(0);
  });
});
