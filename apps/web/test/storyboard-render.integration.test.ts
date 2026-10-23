import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { and, eq, sql } from 'drizzle-orm';
import { emptyStoryboard, type Storyboard } from '@nexus/video-model';
import { listProjectAssets, openAssetFile, uploadImageAsset } from '../src/server/domain/assets';
import { adjustCredits, readCredits } from '../src/server/domain/credit-ledger';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { agentTasks, assets, creditLedger, projects, users } from '../src/server/db/schema';
import { renderStoryboardDemo } from '../src/server/domain/storyboard-render';
import { saveStoryboard } from '../src/server/domain/storyboards';
import { resetStorageForTests } from '../src/server/storage/config';

/**
 * §40 最后一格：分镜**真的渲染出来**，产物走视频摄入链落成资产。
 *
 * 这一组打真 Postgres、跑真 ffmpeg：渲染链的四道顺序纪律（额度门在 startTask 之前、
 * 参考帧按 id 取字节、扣点只在成功收尾、进程有墙上时钟上限）每一条对应一种失败长相，
 * 只有在真库真进程上才看得见。特别地：
 * - 额度门的位置用"三张表行数不变"来钉——门放在 startTask 之后就会留下一行
 *   running→failed 的假账，或者一次"免费"渲染；
 * - ffmpeg 缺失时任务必须落 failed 而不是永远 running（用户看着一个永不停止的转圈）；
 * - 没有字体时 warnings 必须非空：字幕没烧进画面这件事不许静默（§159/§160）。
 */

const run = promisify(execFile);
const FONT = 'C:\\Windows\\Fonts\\msyh.ttc';

let ownerId: string;
let strangerId = '';
const createdProjects: string[] = [];
const dir = mkdtempSync(join(tmpdir(), 'nexus-storyboard-render-'));
const storeDir = join(dir, 'store');

beforeAll(async () => {
  resetStorageForTests({ NEXUS_STORAGE_LOCAL_DIR: storeDir });
  const db = getDb();
  const probe = await db.execute(sql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Renderer', email: `storyboard-render+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  const [stranger] = await db
    .insert(users)
    .values({ displayName: 'Stranger', email: `storyboard-render-stranger+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  strangerId = stranger!.id;
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdProjects) await db.delete(projects).where(eq(projects.id, id));
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, strangerId));
  resetStorageForTests();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 目录可能不存在，忽略 */
  }
});

async function newProject(name: string): Promise<string> {
  const doc = await createProject(ownerId, { name, kind: 'website' });
  createdProjects.push(doc.id);
  return doc.id;
}

/** 用真 ffmpeg 产一颗真 PNG 当参考帧：手搓的字节只能证明解析器认识我 */
async function uploadReference(projectId: string): Promise<string> {
  const png = join(dir, `ref-${Date.now()}.png`);
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x406080:s=64x36:d=1', '-frames:v', '1', png], {
    timeout: 60_000,
  });
  const uploaded = await uploadImageAsset(projectId, {
    data: new Uint8Array(await readFile(png)),
    filename: 'ref.png',
    createdById: ownerId,
  });
  if (!uploaded.ok) throw new Error(`参考帧上传失败：${uploaded.reason}`);
  return uploaded.asset.id;
}

/** 两镜分镜：第一镜挂参考帧（走 openAssetForOwner 那条路），第二镜是色卡 */
function boardWithReference(assetId: string): Storyboard {
  return {
    id: 'sb-render-1',
    title: '渲染链路的分镜',
    source: { arrow: 'text-to-video', prompt: '一只猫跳上窗台，又跳下来' },
    shots: [
      { id: 'shot-ref', prompt: '猫走进画面', durationMs: 1200, camera: 'medium', transition: 'cut', referenceAssetId: assetId },
      { id: 'shot-card', prompt: '猫抬头看灯', durationMs: 1200, camera: 'close', transition: 'fade' },
    ],
    notes: [],
  };
}

/** 直接插一行音频资产：参考帧只能是画面，音频之类别挂（存储里有真文件，读得出字节） */
async function insertAudioAsset(projectId: string): Promise<string> {
  const key = `audio-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  await writeFile(join(storeDir, key), Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 1, 2, 3]));
  const [row] = await getDb()
    .insert(assets)
    .values({ projectId, kind: 'audio', name: 'probe-audio', storageKey: key, mime: 'audio/mpeg', bytes: 7 })
    .returning({ id: assets.id });
  return row!.id;
}

async function countTasks(userId: string): Promise<number> {
  return (await getDb().select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.createdById, userId))).length;
}

async function countLedger(userId: string): Promise<number> {
  return (await getDb().select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.userId, userId))).length;
}

/**
 * 把 video 桶兜到至少 needed 点。免费档每月只发 5 点 video，一次渲染就见底——
 * 后面的用例如果直接开跑，撞上的是额度门而不是自己要测的那道门。
 * （与 image-studio 集成测试同一手法：先补足，再测别的。）
 */
async function ensureVideoCredits(userId: string, needed: number): Promise<void> {
  const balance = (await readCredits(userId)).balances.video;
  if (balance < needed) {
    await adjustCredits({ userId, kind: 'video', delta: needed - balance, reason: '用例：补足渲染链路需要的额度' });
  }
}

describe('renderStoryboardDemo —— §40 最后一格：分镜真的渲出来，走视频摄入链落库', () => {
  it('快乐路径：真 ffmpeg 渲出的 mp4 落成 kind=video 资产，任务 succeeded，video 桶扣 5 点，demoMode 记在 genMeta 里', async () => {
    const projectId = await newProject('Render Happy');
    const refAssetId = await uploadReference(projectId);
    const saved = await saveStoryboard(projectId, ownerId, { document: boardWithReference(refAssetId) });
    if (!saved.ok) throw new Error(saved.reason);

    await ensureVideoCredits(ownerId, 10);
    const before = (await readCredits(ownerId)).balances.video;
    const result = await renderStoryboardDemo({ projectId, userId: ownerId, fontFile: FONT });
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;

    // 资产行：kind 与 mime 都由摄入门定，不是调用方说了算
    expect(result.asset.kind).toBe('video');
    expect(result.asset.mimeType).toBe('video/mp4');
    expect(result.asset.sizeBytes).toBeGreaterThan(1000);

    // 任务收尾：succeeded，且只有成功才扣点
    const taskRows = await getDb().select().from(agentTasks).where(eq(agentTasks.id, result.taskId));
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0]!.status).toBe('succeeded');
    expect((await readCredits(ownerId)).balances.video).toBe(before - 5);
    // 按 taskId 数这一笔：账本是跨用例累积的，数"-5 共几行"会在第二轮开始谎报
    const charges = await getDb()
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, ownerId), eq(creditLedger.taskId, result.taskId)));
    expect(charges).toHaveLength(1);
    expect(charges[0]!.kind).toBe('video');
    expect(charges[0]!.delta).toBe(-5);

    // genMeta 把"这是 DEMO"和每一句交代原样留下：界面上必须原样显示（§159/§160）
    const [row] = await getDb().select().from(assets).where(eq(assets.id, result.asset.id));
    const genMeta = row!.genMeta as Record<string, unknown>;
    expect(genMeta.demoMode).toBe(true);
    expect(genMeta.provider).toBe('local-ffmpeg');
    expect(genMeta.storyboardId).toBe(saved.document.id);
    expect(genMeta.taskId).toBe(result.taskId);
    expect(Array.isArray(genMeta.warnings)).toBe(true);
    expect(Array.isArray(genMeta.notes)).toBe(true);

    // 成片从存储里原样读得回来，且时长就是两镜之和（2.4s）——真渲染过的字节才做得到
    const stored = await openAssetFile(result.asset.id);
    expect(stored).not.toBeNull();
    const probe = join(dir, `probe-${Date.now()}.mp4`);
    await writeFile(probe, stored!.bytes);
    const { stdout } = await run('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', probe], {
      timeout: 30_000,
    });
    const duration = Number(stdout.trim());
    expect(duration).toBeGreaterThan(2.0);
    expect(duration).toBeLessThan(2.8);

    const listed = await listProjectAssets(projectId);
    expect(listed.some((a) => a.id === result.asset.id)).toBe(true);
  });

  it('额度门在 startTask 之前：video 桶扣到 0 时，任务表、账本、资产表一行都不多', async () => {
    const projectId = await newProject('Render No Credits');
    const saved = await saveStoryboard(projectId, ownerId, {
      document: {
        id: 'sb-no-credit',
        title: '没有额度的分镜',
        source: { arrow: 'text-to-video', prompt: '黑胶唱片转起来' },
        shots: [{ id: 'shot-card', prompt: '唱片转起来', durationMs: 1000, camera: 'wide', transition: 'cut' }],
        notes: [],
      },
    });
    if (!saved.ok) throw new Error(saved.reason);

    const balance = (await readCredits(ownerId)).balances.video;
    // 库里 credit_ledger_delta_nonzero 挡着 delta=0：本来就是 0 就没什么可扣的
    if (balance > 0) {
      await adjustCredits({ userId: ownerId, kind: 'video', delta: -balance, reason: '用例：把 video 桶扣到 0' });
    }
    expect((await readCredits(ownerId)).balances.video).toBe(0);

    const tasksBefore = await countTasks(ownerId);
    const ledgerBefore = await countLedger(ownerId);
    const assetsBefore = (await listProjectAssets(projectId)).length;

    const result = await renderStoryboardDemo({ projectId, userId: ownerId, fontFile: FONT });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('credits_exhausted');
    expect(result.message).toMatch(/Video credits 不够：这一次需要 5 点/);

    expect(await countTasks(ownerId), '被拒的请求不该落任务行').toBe(tasksBefore);
    expect(await countLedger(ownerId), '被拒的请求不该动账本').toBe(ledgerBefore);
    expect((await listProjectAssets(projectId)).length, '被拒的请求不该产资产').toBe(assetsBefore);

    // 还回去：后面的用例还要渲染（断言都做完了，此刻补额不掩盖任何东西）
    await ensureVideoCredits(ownerId, 10);
  });

  it('没有分镜：no_storyboard，读取不顺手建档', async () => {
    const projectId = await newProject('Render No Board');
    const result = await renderStoryboardDemo({ projectId, userId: ownerId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('no_storyboard');
  });

  it('空分镜：not_renderable，并把计划说的原因带出来', async () => {
    const projectId = await newProject('Render Empty Board');
    const saved = await saveStoryboard(projectId, ownerId, { document: emptyStoryboard('sb-empty') });
    if (!saved.ok) throw new Error(saved.reason);
    const result = await renderStoryboardDemo({ projectId, userId: ownerId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('not_renderable');
    expect(result.issues?.join()).toContain('镜头');
  });

  it('ffmpeg 不存在：ffmpeg_missing，任务落 failed 而不是永远 running，也不扣点', async () => {
    const projectId = await newProject('Render No Ffmpeg');
    const refAssetId = await uploadReference(projectId);
    const saved = await saveStoryboard(projectId, ownerId, { document: boardWithReference(refAssetId) });
    if (!saved.ok) throw new Error(saved.reason);

    await ensureVideoCredits(ownerId, 10);
    const before = (await readCredits(ownerId)).balances.video;
    const result = await renderStoryboardDemo({
      projectId,
      userId: ownerId,
      ffmpegPath: 'nexus-no-such-ffmpeg',
      fontFile: FONT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ffmpeg_missing');

    // 按 projectId 找：账本和任务表跨用例累积，"最后一行"没有顺序保证
    const taskRows = await getDb().select().from(agentTasks).where(eq(agentTasks.projectId, projectId));
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0]!.status, '起不来 ffmpeg 也必须收尾，不能留一行永远 running 的假账').toBe('failed');
    expect((await readCredits(ownerId)).balances.video).toBe(before);
    expect((await listProjectAssets(projectId)).some((a) => a.kind === 'video')).toBe(false);
  });

  it('渲染超时：进程被掐断，任务落 failed，不产资产也不扣点', async () => {
    const projectId = await newProject('Render Timeout');
    const refAssetId = await uploadReference(projectId);
    const saved = await saveStoryboard(projectId, ownerId, { document: boardWithReference(refAssetId) });
    if (!saved.ok) throw new Error(saved.reason);

    await ensureVideoCredits(ownerId, 10);
    const before = (await readCredits(ownerId)).balances.video;
    // 1 毫秒上限：ffmpeg 还没写出第一帧就会被掐断。真死循环挂住请求时，
    // 用户等的就是这条出口——机器慢不该由请求陪着等（§render 层的墙上时钟）
    const result = await renderStoryboardDemo({ projectId, userId: ownerId, fontFile: FONT, timeoutMs: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('render_timeout');

    const taskRows = await getDb().select().from(agentTasks).where(eq(agentTasks.projectId, projectId));
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0]!.status).toBe('failed');
    expect((await readCredits(ownerId)).balances.video).toBe(before);
    expect((await listProjectAssets(projectId)).some((a) => a.kind === 'video')).toBe(false);
  });

  it('没有字体：warnings 说清字幕没烧进画面，但渲染照成', async () => {
    const projectId = await newProject('Render No Font');
    const refAssetId = await uploadReference(projectId);
    const saved = await saveStoryboard(projectId, ownerId, { document: boardWithReference(refAssetId) });
    if (!saved.ok) throw new Error(saved.reason);

    await ensureVideoCredits(ownerId, 10);
    const result = await renderStoryboardDemo({ projectId, userId: ownerId, fontFile: null });
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join()).toMatch(/字体|字幕/);
  });

  it('参考帧挂在音频上：reference_not_visual，在跑 ffmpeg 之前就说清', async () => {
    const projectId = await newProject('Render Audio Ref');
    const audioId = await insertAudioAsset(projectId);
    const saved = await saveStoryboard(projectId, ownerId, { document: boardWithReference(audioId) });
    if (!saved.ok) throw new Error(saved.reason);

    const result = await renderStoryboardDemo({ projectId, userId: ownerId, fontFile: FONT });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('reference_not_visual');
    expect(result.message).toContain('audio/mpeg');
  });

  it('参考帧是别人的资产：换个人来渲同一份分镜，reference_unreadable', async () => {
    const projectId = await newProject('Render Foreign Ref');
    const refAssetId = await uploadReference(projectId);
    const saved = await saveStoryboard(projectId, ownerId, { document: boardWithReference(refAssetId) });
    if (!saved.ok) throw new Error(saved.reason);

    const result = await renderStoryboardDemo({ projectId, userId: strangerId, fontFile: FONT });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('reference_unreadable');
    expect(await countTasks(strangerId), '读不到参考帧就不该落任务行').toBe(0);
  });
});
