import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql as rawSql, type SQL } from 'drizzle-orm';
import type { AssetRef } from '@nexus/design-model';
import { generateDemoImage, IMAGE_AGENT_KEY, type GenerateImageOutcome } from '../src/server/domain/image-studio';
import { listProjectAssets, openAssetForOwner } from '../src/server/domain/assets';
import { extractVisualDna } from '../src/server/domain/visualDna';
import { createProjectCharacter, updateCharacterProfile } from '../src/server/domain/characters';
import { createProject } from '../src/server/domain/projects';
import { adjustCredits, readCredits } from '../src/server/domain/credit-ledger';
import { GENERATION_COST } from '../src/server/domain/credits';
import { getDb } from '../src/server/db/client';
import { agentTasks, assets, creditLedger, projects, users } from '../src/server/db/schema';

/**
 * §38 Text→Image 落到真库：这一片要证的不是"能生成一张 PNG"（那是 `image-synth.test.ts` 的单字），
 * 而是**这条链上每一环都真的留下了行**——资产行的 source、清单里的 demoMode、任务行的 capability、
 * 账本里那一行 -2，以及额度门**在写任务行之前**这件事。
 *
 * 四条用例各自盯住一个"少了它这格就是假的"的点：
 * 1. 摄取与记账齐全（尤其 `generatedBy.demoMode`：面板上那枚 DEMO 角标读的就是它，
 *    这一格没接上时角标是死代码——界面上永远不显示，谁都不会发现"生成来源"整段是空的）
 * 2. 额度门的位置：余额为 0 时**一行都不许多**（任务行、资产行、账本行都不许多）
 * 3. 同 prompt 同 seed 复用字节但**任务与扣点各算一次**
 * 4. 非法输入不过门、不花额度
 */

let userId: string;
let projectId: string;

/** 把 ok:false 的结构收窄；被拒时把 code/message/issues 全打进断言消息，红的第一眼就能看到为什么 */
function mustOk(out: GenerateImageOutcome, label: string): Extract<GenerateImageOutcome, { ok: true }> {
  if (out.ok) return out;
  expect(false, `${label} 本该成功，实际：${out.code} / ${out.message}${out.issues?.length ? ` / ${out.issues.join('；')}` : ''}`);
  throw new Error('unreachable');
}

async function countAssets(where: SQL): Promise<number> {
  const [row] = await getDb().select({ n: rawSql<number>`count(*)::int` }).from(assets).where(where);
  return row?.n ?? 0;
}

/** 同一份字节在项目里只有 0 或 1 行——"复用"的完整定义，不看名字也不看 id 猜 */
async function rowsWithSameBytes(assetId: string): Promise<number> {
  const [row] = await getDb().select({ checksum: assets.checksum }).from(assets).where(eq(assets.id, assetId)).limit(1);
  expect(row?.checksum, `库里查不到资产 ${assetId}`).toBeDefined();
  return countAssets(and(eq(assets.projectId, projectId), eq(assets.checksum, row!.checksum!))!);
}

async function assetRefOf(id: string): Promise<AssetRef | undefined> {
  return (await listProjectAssets(projectId)).find((ref) => ref.id === id);
}

async function imageTasks(): Promise<number> {
  const [row] = await getDb()
    .select({ n: rawSql<number>`count(*)::int` })
    .from(agentTasks)
    .where(and(eq(agentTasks.createdById, userId), eq(agentTasks.agentKey, IMAGE_AGENT_KEY)));
  return row?.n ?? 0;
}

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  const [user] = await db
    .insert(users)
    .values({ displayName: 'ImageStudio', email: `im-s+${stamp}@nexus.test`, handle: `ims${stamp}` })
    .returning({ id: users.id });
  userId = user!.id;
  const doc = await createProject(userId, { name: '图像工作台用例', kind: 'website' });
  projectId = doc.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [userId]));
  await db.delete(users).where(inArray(users.id, [userId]));
});

describe('§38 Reference → Variation 打真库', () => {
  /** 这一片一次点掉七八张图，别撞在本月额度上（共享余额：约定不算断言，自己补足） */
  async function ensureCredits(floor: number): Promise<void> {
    const balance = (await readCredits(userId)).balances.image;
    if (balance < floor) {
      await adjustCredits({ userId, kind: 'image', delta: floor - balance, reason: '用例：补足变体链路需要的额度' });
    }
  }

  /** 取资产行的 checksum 与 genMeta：变体是否真的"看着参考图生成"只有这两格能证明 */
  async function rowOf(id: string) {
    const [row] = await getDb()
      .select({ checksum: assets.checksum, genMeta: assets.genMeta, name: assets.name })
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);
    expect(row, `库里查不到资产 ${id}`).toBeDefined();
    return row!;
  }

  it('参考图的主色决定画面：同 prompt 同 seed，换参考就是换字节', async () => {
    await ensureCredits(30);
    const refA = mustOk(await generateDemoImage({ projectId, userId, prompt: '参考甲', width: 128, height: 128, seed: 11 }), '参考甲');
    const refB = mustOk(await generateDemoImage({ projectId, userId, prompt: '参考乙', width: 128, height: 128, seed: 12 }), '参考乙');

    const plain = mustOk(await generateDemoImage({ projectId, userId, prompt: '变体底座', width: 128, height: 128, seed: 21 }), '不带参考的那一张');
    const varA = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '变体底座', width: 128, height: 128, seed: 21, referenceAssetId: refA.asset.id }),
      '以甲为参考',
    );
    const varB = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '变体底座', width: 128, height: 128, seed: 21, referenceAssetId: refB.asset.id }),
      '以乙为参考',
    );

    const [plainRow, aRow, bRow] = [await rowOf(plain.asset.id), await rowOf(varA.asset.id), await rowOf(varB.asset.id)];
    // 三条各自堵住一种走偏：锚点没进合成 / 参考 id 只写进元数据没起作用 / 两次拿回同一张
    expect(aRow.checksum, '带了参考图，字节却与不带参考时一模一样——锚点根本没进合成器').not.toBe(plainRow.checksum);
    expect(bRow.checksum, '带了参考图，字节却与不带参考时一模一样——锚点根本没进合成器').not.toBe(plainRow.checksum);
    expect(aRow.checksum, '换了一张参考图却拿回同一份字节——参考只存在于参数里').not.toBe(bRow.checksum);

    const meta = aRow.genMeta as Record<string, unknown>;
    expect(meta.referenceAssetId, '事后查不出这张图是以谁为参考').toBe(refA.asset.id);
    expect(typeof meta.hueAnchor).toBe('number');
    expect(Number(meta.hueAnchor)).toBeGreaterThanOrEqual(0);
    expect(Number(meta.hueAnchor)).toBeLessThan(1);
    expect(String(meta.anchorDominant)).toMatch(/^#[0-9a-f]{6}$/);
    expect(meta.demoMode, '变体就不是 DEMO 生成的了？').toBe(true);
  });

  it('同 prompt 同 seed 同参考复用同一行，任务与扣点仍各算一次', async () => {
    await ensureCredits(20);
    const ref = mustOk(await generateDemoImage({ projectId, userId, prompt: '复用的参考', width: 64, height: 64, seed: 31 }), '参考');
    const first = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '复用的变体', width: 64, height: 64, seed: 32, referenceAssetId: ref.asset.id }),
      '第一次变体',
    );
    const second = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '复用的变体', width: 64, height: 64, seed: 32, referenceAssetId: ref.asset.id }),
      '第二次变体',
    );
    expect(second.reused).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(await rowsWithSameBytes(first.asset.id), '复用之外又多插了一行').toBe(1);
  });

  it('参考图不属于本项目时拒绝，且一行都不许多（门在写任务行之前）', async () => {
    const seen = async () => ({
      assets: await countAssets(eq(assets.projectId, projectId)),
      tasks: await imageTasks(),
      ledger: (
        await getDb()
          .select({ n: rawSql<number>`count(*)::int` })
          .from(creditLedger)
          .where(and(eq(creditLedger.userId, userId), eq(creditLedger.kind, 'image'), eq(creditLedger.source, 'generation')))
      )[0]?.n ?? 0,
    });
    const before = await seen();

    for (const bad of ['cmp-没有这个资产', '00000000-0000-4000-8000-000000000000']) {
      const out = await generateDemoImage({
        projectId,
        userId,
        prompt: '挂在不存在的图上',
        width: 64,
        height: 64,
        referenceAssetId: bad,
      });
      expect(out.ok, `参考图 ${bad} 查不到还放过去了`).toBe(false);
      if (!out.ok) {
        expect(out.code).toBe('invalid_input');
        expect(out.message).toMatch(/不在这个项目|并不拥有/);
      }
      expect(await seen()).toEqual(before);
    }
  });
});

describe('§38 Text→Image 打真库', () => {
  it('一次生成把资产行、清单里的 demoMode、任务行与账本各留一行', async () => {
    const db = getDb();
    const before = (await readCredits(userId)).balances.image;
    const cost = GENERATION_COST.image;

    const out = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '一只在月球上的猫', width: 256, height: 256, seed: 7 }),
      '第一次生成',
    );

    const [row] = await db.select().from(assets).where(eq(assets.id, out.asset.id)).limit(1);
    expect(row, '资产清单说有这一行，库里却没有').toBeDefined();
    expect(row!.source, '生成物却记成 upload，事后查不到哪张是模型给的').toBe('generated');
    expect(row!.mime).toBe('image/png');
    expect(row!.width).toBe(256);
    expect(row!.height).toBe(256);
    expect(row!.storageKey, '对象键必须按项目 + id 生成，不能带客户端文件名').toBe(
      `projects/${projectId}/${out.asset.id}.png`,
    );
    expect(row!.bytes).toBeGreaterThan(0);

    // 面板那枚角标读的是这里：`generatedBy.demoMode`
    const ref = await assetRefOf(out.asset.id);
    expect(ref?.generatedBy, '生成来源整段没水合，界面上看不出这张图从哪来').toBeDefined();
    expect(ref!.generatedBy!.prompt).toBe('一只在月球上的猫');
    expect(ref!.generatedBy!.provider).toBe('demo');
    expect(ref!.generatedBy!.demoMode, 'DEMO 与真模型的来源必须可区分（§160）').toBe(true);
    expect(ref!.generatedBy!.taskId, '生成来源要能回指那一次任务').toBe(out.taskId);

    const [task] = await db.select().from(agentTasks).where(eq(agentTasks.id, out.taskId)).limit(1);
    expect(task?.status).toBe('succeeded');
    expect(task?.capability).toBe('demo');
    expect(task?.agentKey).toBe(IMAGE_AGENT_KEY);

    const charges = await db
      .select({ id: creditLedger.id, kind: creditLedger.kind, delta: creditLedger.delta })
      .from(creditLedger)
      .where(eq(creditLedger.taskId, out.taskId));
    expect(charges, '一次成功的生成没有扣点，等于宣布它是免费的').toHaveLength(1);
    expect(charges[0]!.kind).toBe('image');
    expect(charges[0]!.delta).toBe(-cost);
    expect((await readCredits(userId)).balances.image).toBe(before - cost);
  });

  it('额度门在写任务行之前：余额为 0 时一行都不许多', async () => {
    const balance = (await readCredits(userId)).balances.image;
    expect(balance, '前置用例没留下余额，这一条要盯的"扣光之后"根本没发生').toBeGreaterThan(0);
    await adjustCredits({ userId, kind: 'image', delta: -balance, reason: '用例：把 image 桶扣到 0' });
    expect((await readCredits(userId)).balances.image).toBe(0);

    const seen = async () => ({
      assets: await countAssets(eq(assets.projectId, projectId)),
      tasks: await imageTasks(),
      ledger: (
        await getDb()
          .select({ n: rawSql<number>`count(*)::int` })
          .from(creditLedger)
          .where(and(eq(creditLedger.userId, userId), eq(creditLedger.kind, 'image'), eq(creditLedger.source, 'generation')))
      )[0]?.n ?? 0,
    });
    const before = await seen();

    const res = await generateDemoImage({ projectId, userId, prompt: '扣光之后再要一张', width: 128, height: 128 });
    expect(res.ok, '余额 0 还放过去了').toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('credits_exhausted');
      // 拒绝的理由直接抄自 `refusalFor`：这一句是给用户看的，不是测试自己编的
      expect(res.message).toMatch(/Image credits 不够：这一次需要 2 点，现在只有 0 点/);
    }
    const after = await seen();
    // 门挪到 startTask 之后的话，这里会多出一条 running→failed 的假账；门挪到摄取之后的话，
    // 会多出一行资产和一个免费的成功生成。两种走偏都被这三行数抓住。
    expect(after).toEqual(before);

    // 把余额还回去：下面两条要还能生成，而"扣到 0"这一步不该偷偷影响别的用例
    await adjustCredits({ userId, kind: 'image', delta: balance, reason: '用例：把 image 桶还回去' });
  });

  it('同 prompt 同 seed 复用同一份字节，但任务与扣点各算一次', async () => {
    // 自己补足余额，不等上一条还回去：上一条如果在中途红掉，它的 `adjustCredits(+balance)` 那行就不会执行，
    // 那时这一条会跟着红成"额度不够"——2026-09-28 那次变异探针就是这样多红了 1 条（连带不是证据，是依赖）
    const needed = GENERATION_COST.image * 3;
    const balance = (await readCredits(userId)).balances.image;
    if (balance < needed) await adjustCredits({ userId, kind: 'image', delta: needed - balance, reason: '用例：补足三次生成的额度' });

    const first = mustOk(await generateDemoImage({ projectId, userId, prompt: '重复的猫', width: 64, height: 64, seed: 123 }), '第一次');
    const second = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '重复的猫', width: 64, height: 64, seed: 123 }),
      '第二次（同 prompt 同 seed）',
    );
    expect(second.reused, '同样的字节该复用同一行，否则会攒出一堆内容相同的资产').toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(await rowsWithSameBytes(first.asset.id), '复用之外又插了一行同样的字节').toBe(1);

    // 但两次是两次请求：两行任务、两笔扣点。复用省下的是存储，不是消费记录。
    const taskIds = [first.taskId, second.taskId];
    expect(taskIds[0]).not.toBe(taskIds[1]);
    const charges = await getDb()
      .select({ id: creditLedger.id, taskId: creditLedger.taskId })
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.source, 'generation'), inArray(creditLedger.taskId, taskIds)));
    expect(charges).toHaveLength(2);

    // 反向对照：只换 seed 就不是同一份字节，也不该被复用逻辑吃掉
    const other = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '重复的猫', width: 64, height: 64, seed: 456 }),
      '换 seed 的那一次',
    );
    expect(other.reused, '换了 seed 却拿回旧图，等于第二次点击什么都没生成').toBe(false);
    expect(other.asset.id).not.toBe(first.asset.id);
  });

  it('非法输入不过门，也不花额度、不留任务行', async () => {
    const tasksBefore = await imageTasks();
    const assetsBefore = await countAssets(eq(assets.projectId, projectId));

    const tooBig = await generateDemoImage({ projectId, userId, prompt: '超出上限的', width: 2048, height: 64 });
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) {
      expect(tooBig.code).toBe('invalid_input');
      expect(tooBig.issues?.join('；')).toMatch(/1024/);
    }
    const emptyPrompt = await generateDemoImage({ projectId, userId, prompt: '   ', width: 64, height: 64 });
    expect(emptyPrompt.ok, '空 prompt 也去合成了一张').toBe(false);
    if (!emptyPrompt.ok) expect(emptyPrompt.code).toBe('invalid_input');

    expect(await countAssets(eq(assets.projectId, projectId))).toBe(assetsBefore);
    // 被拒的请求不该在任务列表里留下一条"从没跑起来"的账（§113 那条口径的同一面）
    expect(await imageTasks()).toBe(tasksBefore);
  });
});

describe('§39 / §40 Character → Scene 打真库', () => {
  /** 与上面那格同一个道理：共享余额的用例自己补足，别指望前一条会还回来 */
  async function ensureCredits(floor: number): Promise<void> {
    const balance = (await readCredits(userId)).balances.image;
    if (balance < floor) {
      await adjustCredits({ userId, kind: 'image', delta: floor - balance, reason: '用例：补足角色场景链路需要的额度' });
    }
  }

  async function rowOf(id: string) {
    const [row] = await getDb()
      .select({ checksum: assets.checksum, genMeta: assets.genMeta, characterId: assets.characterId })
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);
    expect(row, `库里查不到资产 ${id}`).toBeDefined();
    return row!;
  }

  async function counts() {
    const db = getDb();
    return {
      assets: await countAssets(eq(assets.projectId, projectId)),
      tasks: await imageTasks(),
      ledger: (
        await db
          .select({ n: rawSql<number>`count(*)::int` })
          .from(creditLedger)
          .where(and(eq(creditLedger.userId, userId), eq(creditLedger.kind, 'image'), eq(creditLedger.source, 'generation')))
      )[0]?.n ?? 0,
    };
  }

  /** 建一个角色并给它视觉标识；palette 不给就是空的（§39 那一栏还没填） */
  async function makeCharacter(name: string, palette?: string[]) {
    const created = await createProjectCharacter(projectId, userId, { name });
    if (!created.ok) throw new Error(`建角色失败：${created.reason}`);
    if (!palette) return created.character;
    const updated = await updateCharacterProfile(created.character.id, projectId, {
      ...created.character.profile,
      visualIdentity: { ...created.character.profile.visualIdentity, palette },
    });
    if (!updated.ok) throw new Error(`补视觉标识失败：${updated.reason}`);
    return updated.character;
  }

  it('角色没有视觉标识时拒绝，一行都不许多（不拿"随便一张"冒充它的场景）', async () => {
    await ensureCredits(20);
    const character = await makeCharacter('没有配色的角色');
    const before = await counts();
    const out = await generateDemoImage({
      projectId, userId, prompt: '在海边', width: 64, height: 64, characterId: character.id,
    });
    expect(out.ok, '视觉标识是空的却还生成了一张').toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('invalid_input');
      expect(out.message).toMatch(/视觉标识|palette/);
    }
    expect(await counts()).toEqual(before);
  });

  it('同一角色的不同场景共享同一个色相锚点，且资产行真的记着它属于谁', async () => {
    await ensureCredits(20);
    const character = await makeCharacter('阿蓝', ['#2e7d32']);
    const sceneA = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '在雪地里', width: 128, height: 128, seed: 41, characterId: character.id }),
      '雪地那一张',
    );
    const sceneB = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '在夜市里', width: 128, height: 128, seed: 41, characterId: character.id }),
      '夜市那一张',
    );
    const rowA = await rowOf(sceneA.asset.id);
    const rowB = await rowOf(sceneB.asset.id);
    const metaA = rowA.genMeta as Record<string, unknown>;
    const metaB = rowB.genMeta as Record<string, unknown>;

    // 一致性的**可测定义**：同一角色 → 同一个由视觉标识导出的锚点；不同场景 → 不同字节
    expect(metaA.hueAnchor).toBe(metaB.hueAnchor);
    expect(rowA.checksum, '两个场景拿回同一份字节，等于第二个场景根本没生成').not.toBe(rowB.checksum);
    expect(rowA.characterId, 'assets.character_id 这一列从建库起就有，但一直没有写入方').toBe(character.id);
    expect(metaA.characterId).toBe(character.id);
    expect(metaA.anchorDominant).toBe('#2e7d32');
    const ref = await assetRefOf(sceneA.asset.id);
    expect(ref?.characterId, '库里写入了归属角色，清单投影却没读出来——一列只写不读等于没有').toBe(character.id);
  });

  it('换一个角色就是换一个锚点；两个来源同时给则拒绝', async () => {
    await ensureCredits(20);
    const green = await makeCharacter('绿衣人', ['#2e7d32']);
    const amber = await makeCharacter('琥珀', ['#ff8f00']);
    const a = mustOk(await generateDemoImage({ projectId, userId, prompt: '在屋顶', width: 64, height: 64, seed: 43, characterId: green.id }), '绿衣人');
    const b = mustOk(await generateDemoImage({ projectId, userId, prompt: '在屋顶', width: 64, height: 64, seed: 43, characterId: amber.id }), '琥珀');
    const metaA = (await rowOf(a.asset.id)).genMeta as Record<string, unknown>;
    const metaB = (await rowOf(b.asset.id)).genMeta as Record<string, unknown>;
    expect(metaA.hueAnchor).not.toBe(metaB.hueAnchor);

    const before = await counts();
    const both = await generateDemoImage({
      projectId, userId, prompt: '两个来源', width: 64, height: 64, characterId: green.id, referenceAssetId: a.asset.id,
    });
    // 这一张参考图是普通生成物、不是这个角色的肖像：仍然拒绝，但理由换成了"必须是自己的肖像"
    expect(both.ok, '不是这个角色肖像的图被当成角色参考放过去了').toBe(false);
    if (!both.ok) expect(both.message).toMatch(/必须是这个角色自己的肖像/);
    expect(await counts()).toEqual(before);
  });

  it('角色不在这个项目里时拒绝，一行都不许多', async () => {
    await ensureCredits(10);
    const before = await counts();
    const out = await generateDemoImage({
      projectId, userId, prompt: '挂在别人角色上', width: 64, height: 64,
      characterId: '00000000-0000-4000-8000-000000000000',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toMatch(/不在这个项目/);
    expect(await counts()).toEqual(before);
  });
});

describe('§39 角色一致性生成（Character Portrait）打真库', () => {
  async function ensureCredits(floor: number): Promise<void> {
    const balance = (await readCredits(userId)).balances.image;
    if (balance < floor) {
      await adjustCredits({ userId, kind: 'image', delta: floor - balance, reason: '用例：补足角色肖像链路需要的额度' });
    }
  }

  async function counts() {
    const db = getDb();
    return {
      assets: await countAssets(eq(assets.projectId, projectId)),
      tasks: await imageTasks(),
      ledger: (
        await db
          .select({ n: rawSql<number>`count(*)::int` })
          .from(creditLedger)
          .where(and(eq(creditLedger.userId, userId), eq(creditLedger.kind, 'image'), eq(creditLedger.source, 'generation')))
      )[0]?.n ?? 0,
    };
  }

  async function taskInputOf(taskId: string): Promise<Record<string, unknown>> {
    const [row] = await getDb()
      .select({ input: agentTasks.input })
      .from(agentTasks)
      .where(eq(agentTasks.id, taskId))
      .limit(1);
    expect(row, `库里查不到任务行 ${taskId}`).toBeDefined();
    return (row!.input ?? {}) as Record<string, unknown>;
  }

  async function metaOf(assetId: string): Promise<Record<string, unknown>> {
    const [row] = await getDb()
      .select({ genMeta: assets.genMeta })
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);
    expect(row, `库里查不到资产 ${assetId}`).toBeDefined();
    return (row!.genMeta ?? {}) as Record<string, unknown>;
  }

  /** 字节指纹要从库里读：`generateDemoImage` 的成功返回里只有资产 id，没有 checksum */
  async function checksumOf(assetId: string): Promise<string | null> {
    const [row] = await getDb()
      .select({ checksum: assets.checksum })
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);
    expect(row, `库里查不到资产 ${assetId}`).toBeDefined();
    return row!.checksum;
  }

  /** 建档并把四栏 + 视觉标识都填上：肖像要读的就是这份档案 */
  async function makeDetailedCharacter(name: string) {
    const created = await createProjectCharacter(projectId, userId, { name });
    if (!created.ok) throw new Error(`建角色失败：${created.reason}`);
    const updated = await updateCharacterProfile(created.character.id, projectId, {
      ...created.character.profile,
      identity: '守夜人',
      clothing: '靛蓝斗篷，袖口卷起',
      style: '厚涂、暖光',
      traits: ['认路很快'],
      visualIdentity: {
        ...created.character.profile.visualIdentity,
        palette: ['#2e7d32'],
        silhouette: '高瘦，斗篷下摆很长',
        motifs: ['钟', '灯'],
      },
    });
    if (!updated.ok) throw new Error(`补档案失败：${updated.reason}`);
    return updated.character;
  }

  /**
   * 这条盯的是一个**曾经写成死代码的判定**：早前那行是
   * `characterId && generateCharacterPortrait && !characterId`——前后自相矛盾、永远为假，
   * 于是"只给 generateCharacterPortrait 不给 characterId"会**静默地按普通 Text→Image 生成一张图**
   * （进不了角色分支，档案读不到，用户以为拿到了角色肖像）。typecheck 与 eslint 都看不出这种写法。
   */
  it('只给 generateCharacterPortrait 不给 characterId：拒绝，且一行都不许多', async () => {
    await ensureCredits(10);
    const before = await counts();
    const out = await generateDemoImage({
      projectId, userId, prompt: '一张没有角色的肖像', width: 64, height: 64, generateCharacterPortrait: true,
    });
    expect(out.ok, '没有角色却按普通文生图放过去了——用户会以为这是角色肖像').toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('invalid_input');
      expect(out.message).toMatch(/characterId/);
    }
    expect(await counts()).toEqual(before);
  });

  it('肖像由档案驱动：忽略用户 prompt，任务行里带的是身份/穿着/画风/特征', async () => {
    await ensureCredits(10);
    const character = await makeDetailedCharacter('守夜人阿蓝');
    const out = mustOk(
      await generateDemoImage({
        projectId, userId, prompt: '这句应当被忽略', width: 64, height: 64, seed: 7,
        characterId: character.id, generateCharacterPortrait: true,
      }),
      '角色肖像',
    );
    const input = await taskInputOf(out.taskId);
    // 类型收窄而不是 String(...)：input 是 unknown 值的袋子，直接 String() 会把对象变成 "[object Object]"，
    // 那种"看起来有值"的假绿正是这组用例要避免的（eslint 的 no-base-to-string 当场指出了这一点）
    const sent = typeof input.prompt === 'string' ? input.prompt : '';
    expect(sent, 'prompt 不是字符串，说明任务行里那一格不是我们写的那份').not.toBe('');
    expect(sent, '肖像没带上身份').toContain('守夜人');
    expect(sent).toContain('靛蓝斗篷');
    expect(sent).toContain('厚涂、暖光');
    expect(sent).toContain('认路很快');
    // 视觉标识也该进来：轮廓与标志是"同一个角色在不同场景里认得出"的依据
    expect(sent).toContain('高瘦，斗篷下摆很长');
    expect(sent).toContain('钟');
    // 关键的一条：用户 prompt 被忽略，而不是被拼在后面
    expect(sent, '用户 prompt 没被忽略——那这就不叫"由档案驱动"').not.toContain('这句应当被忽略');
    expect(input.generateCharacterPortrait).toBe(true);
  });

  it('肖像打上 characterPortrait 标记，且资产行仍记着属于谁（供后续场景复用）', async () => {
    await ensureCredits(10);
    const character = await makeDetailedCharacter('带标记的角色');
    const out = mustOk(
      await generateDemoImage({
        projectId, userId, prompt: 'ignored', width: 64, height: 64, seed: 11,
        characterId: character.id, generateCharacterPortrait: true,
      }),
      '带标记的肖像',
    );
    const meta = await metaOf(out.asset.id);
    expect(meta.characterPortrait, 'genMeta 里没有 characterPortrait，后续 Character→Scene 就认不出它是肖像').toBe(true);
    expect(meta.characterId).toBe(character.id);
    expect(meta.hueAnchor, '肖像也该有由视觉标识导出的锚点，否则同一角色的场景与肖像会各画一套颜色').toBeDefined();
    // 清单投影读得出来，界面上才看得到归属
    const ref = await assetRefOf(out.asset.id);
    expect(ref?.characterId).toBe(character.id);
    expect(ref?.characterPortrait, '清单投影里没有 characterPortrait：卡片会把肖像一律说成"角色场景"').toBe(true);
    // 反向也要钉住：只断言"肖像为真"的话，一个永远写 true 的映射照样过——
    // 同一角色的场景必须**没有**这一格，界面上才会一个说肖像、一个说场景
    const sceneOut = mustOk(
      await generateDemoImage({
        projectId, userId, prompt: '同一个角色的场景', width: 64, height: 64, seed: 12, characterId: character.id,
      }),
      '同角色的场景',
    );
    const sceneRef = await assetRefOf(sceneOut.asset.id);
    expect(sceneRef?.characterId, '场景也该记着归属角色').toBe(character.id);
    expect(sceneRef?.characterPortrait, '场景被标成了肖像——这一格不能靠默认值蒙过去').toBeFalsy();
  });

  it('肖像与参考图互斥：两个来源同时给就拒绝，不花额度', async () => {
    await ensureCredits(10);
    const character = await makeDetailedCharacter('互斥用例');
    const scene = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '先来一张场景', width: 64, height: 64, seed: 13, characterId: character.id }),
      '先垫一张场景当参考图',
    );
    const before = await counts();
    const both = await generateDemoImage({
      projectId, userId, prompt: 'ignored', width: 64, height: 64,
      characterId: character.id, generateCharacterPortrait: true, referenceAssetId: scene.asset.id,
    });
    expect(both.ok, '参考图与角色肖像同时给也放过去了').toBe(false);
    if (!both.ok) expect(both.message, '拒绝的理由要说清肖像不吃参考图').toMatch(/不接受参考图/);
    expect(await counts()).toEqual(before);
  });

  it('同一个角色的肖像与场景：同一锚点、不同字节（"一致性"的可测定义）', async () => {
    await ensureCredits(10);
    const character = await makeDetailedCharacter('肖像与场景同锚点');
    const portrait = mustOk(
      await generateDemoImage({
        projectId, userId, prompt: 'ignored', width: 64, height: 64, seed: 17,
        characterId: character.id, generateCharacterPortrait: true,
      }),
      '肖像',
    );
    const scene = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '在雪地里', width: 64, height: 64, seed: 17, characterId: character.id }),
      '场景',
    );
    const portraitMeta = await metaOf(portrait.asset.id);
    const sceneMeta = await metaOf(scene.asset.id);
    expect(portraitMeta.hueAnchor).toBe(sceneMeta.hueAnchor);
    const portraitBytes = await checksumOf(portrait.asset.id);
    const sceneBytes = await checksumOf(scene.asset.id);
    // 先确认两个指纹都真的存在：两个 null 也会"不相等"失败，但那样红得看不出原因
    expect(portraitBytes).toBeTruthy();
    expect(sceneBytes).toBeTruthy();
    expect(portraitBytes, '肖像与场景拿回同一份字节，等于其中一个根本没生成').not.toBe(sceneBytes);
  });

  it('肖像可以当同角色场景的参考：锚点量自那张图，不是档案里声明的那份', async () => {
    await ensureCredits(20);
    const character = await makeDetailedCharacter('复用肖像的角色');
    const portrait = mustOk(
      await generateDemoImage({
        projectId, userId, prompt: 'ignored', width: 64, height: 64, seed: 21,
        characterId: character.id, generateCharacterPortrait: true,
      }),
      '先要一张肖像',
    );
    const scene = mustOk(
      await generateDemoImage({
        projectId, userId, prompt: '在雨夜的码头', width: 64, height: 64, seed: 22,
        characterId: character.id, referenceAssetId: portrait.asset.id,
      }),
      '拿这个角色自己的肖像当参考生成场景',
    );
    const meta = await metaOf(scene.asset.id);
    expect(meta.referenceAssetId, '场景没记下参考的是哪张肖像，这条链事后追不回来').toBe(portrait.asset.id);
    expect(meta.characterId).toBe(character.id);
    expect(meta.characterPortrait, '延伸出来的场景被标成肖像，卡片就会说错话').not.toBe(true);
    // 独立量一遍那张肖像的像素：带参考图时锚点必须来自**这次测量**，而不是档案里那份色板——
    // 否则"照这张图画"是句空话：界面上点了复用，拿回的还是声明色
    const file = await openAssetForOwner(portrait.asset.id, userId);
    expect(file, '刚生成的肖像读不回来，后面的比较没有意义').toBeTruthy();
    const dna = extractVisualDna(file!.bytes, { assetId: portrait.asset.id });
    expect(dna.ok, `肖像自己量不出颜色：${dna.ok ? '' : dna.reason}`).toBe(true);
    const measured = dna.ok ? dna.stats.palette[0]?.color : undefined;
    expect(measured, '量不出主色，这条断言就成了空转').toBeTruthy();
    expect(meta.anchorDominant, '带参考图时锚点没走测量：照这张图画变成了照档案画').toBe(measured);
    // 清单投影也要认得它是场景：卡片上「角色场景」那枚角标的依据
    const ref = await assetRefOf(scene.asset.id);
    expect(ref?.characterId).toBe(character.id);
    expect(ref?.characterPortrait, '场景在清单里被标成肖像').toBeFalsy();
  });

  it('参考图必须是这个角色自己的肖像：同角色的场景与别人的肖像都不放行，且不花额度', async () => {
    await ensureCredits(20);
    const mine = await makeDetailedCharacter('我的角色');
    const other = await makeDetailedCharacter('别人的角色');
    const myPortrait = mustOk(
      await generateDemoImage({ projectId, userId, prompt: 'x', width: 64, height: 64, seed: 23, characterId: mine.id, generateCharacterPortrait: true }),
      '我的肖像',
    );
    const myScene = mustOk(
      await generateDemoImage({ projectId, userId, prompt: '在雪地里', width: 64, height: 64, seed: 24, characterId: mine.id }),
      '我的场景',
    );
    const otherPortrait = mustOk(
      await generateDemoImage({ projectId, userId, prompt: 'x', width: 64, height: 64, seed: 25, characterId: other.id, generateCharacterPortrait: true }),
      '别人的肖像',
    );

    for (const [label, refId] of [
      ['同角色的一张场景', myScene.asset.id],
      ['另一个角色的肖像', otherPortrait.asset.id],
    ] as const) {
      const before = await counts();
      const bad = await generateDemoImage({
        projectId, userId, prompt: '在雨夜的码头', width: 64, height: 64, seed: 26,
        characterId: mine.id, referenceAssetId: refId,
      });
      expect(bad.ok, `${label}被当成角色参考图放过去了`).toBe(false);
      if (!bad.ok) expect(bad.message).toMatch(/必须是这个角色自己的肖像/);
      expect(await counts(), `${label}那次拒绝留下了行`).toEqual(before);
    }

    // 反向对照：同一张"我的肖像"当参考就该放行——否则上面两次红只是因为"谁都拒绝"
    const ok = await generateDemoImage({
      projectId, userId, prompt: '在雨夜的码头', width: 64, height: 64, seed: 27,
      characterId: mine.id, referenceAssetId: myPortrait.asset.id,
    });
    expect(ok.ok, '这个角色自己的肖像当参考也被拒了——上面那两次红就不是守卫起作用').toBe(true);
  });
});
