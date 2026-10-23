import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { eq, sql } from 'drizzle-orm';
import { buildFfmpegArgs, planVideoRender, type Storyboard, type StoryboardShot } from '@nexus/video-model';
import { MAX_VIDEO_BYTES, sniffVideoMime, videoMetadataViolations } from '../src/server/storage/videos';
import { listProjectAssets, openAssetFile, uploadVideoAsset } from '../src/server/domain/assets';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { assets, projects, users } from '../src/server/db/schema';
import { resetStorageForTests } from '../src/server/storage/config';
import { storageLimitBytes } from '../src/server/domain/credits';
import { storageUsageBytes } from '../src/server/domain/credit-ledger';

/**
 * 视频字节进资产库（§80 / 已知技术债第 2 条的另一半）。
 *
 * 这一组**用真 ffmpeg 渲出真字节**再喂给摄入门，而不是手搓"看起来像 mp4 的数组"：
 * 手搓的字节只能证明解析器认识我，真 muxer 写的字节才能证明它认识 ffmpeg。
 * 两个方向都测：
 * - 带 `-map_metadata -1 -map_chapters -1 -bitexact` 的成片必须过得去（否则自家产物被自家门拒）；
 * - 摘掉这三个旗的真成片必须被拒（ffmpeg 默认会往 moov/udta/meta/ilst 写 ©too=Lavf…，
 *   这正是这道门存在的理由——不用真渲染，这个"默认行为"只能靠猜）。
 */

const run = promisify(execFile);
const FONT = 'C:\\Windows\\Fonts\\msyh.ttc';

let ownerId: string;
let quotaOwnerId = '';
const createdProjects: string[] = [];
const quotaProjects: string[] = [];
const dir = mkdtempSync(join(tmpdir(), 'nexus-video-asset-'));

const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

function mp4Box(type: string, data: number[]): number[] {
  return [...be32(data.length + 8), ...enc(type), ...data];
}
const FTYP = mp4Box('ftyp', [...enc('isom'), 0, 0, 2, 0, ...enc('isom'), ...enc('mp42')]);

/** 顶层 meta 盒（FullBox：4 字节版本/标志 + 子盒）——顶层出现它即违规 */
function mp4TopLevelMeta(): Uint8Array {
  return Uint8Array.from([...FTYP, ...mp4Box('meta', [0, 0, 0, 0, ...mp4Box('hdlr', enc('mdir'))])]);
}

/** moov > udta > meta > ilst：ffmpeg 默认写 ©too=Lavf… 的那条链 */
function mp4NestedIlst(): Uint8Array {
  const ilst = mp4Box('ilst', mp4Box('\u00a9too', [...enc('data'), 0, 0, 0, 1, 0, 0, 0, 0, ...enc('Lavf62.12.101')]));
  return Uint8Array.from([...FTYP, ...mp4Box('moov', mp4Box('udta', mp4Box('meta', [0, 0, 0, 0, ...ilst])))]);
}

/**
 * moov > udta > meta > hdlr + **空** ilst：bitexact 真产物的形状（实测 ffmpeg 会留一个
 * 8 字节无子项的 ilst，那是容器形状不是内容）——必须放行
 */
function mp4Clean(): Uint8Array {
  return Uint8Array.from([
    ...FTYP,
    ...mp4Box('moov', mp4Box('udta', mp4Box('meta', [0, 0, 0, 0, ...mp4Box('hdlr', enc('mdir')), ...mp4Box('ilst', [])]))),
    ...mp4Box('mdat', [1, 2, 3]),
  ]);
}

/** EBML 元素：ID + 变长长度 + 数据 */
function sizeVint(value: number): number[] {
  if (value < 0x7f) return [0x80 | value];
  if (value < 0x3fff) return [0x40 | (value >> 8), value & 0xff];
  return [0x20 | (value >> 16), (value >> 8) & 0xff, value & 0xff];
}
function ebml(id: number[], data: number[]): number[] {
  return [...id, ...sizeVint(data.length), ...data];
}
const EBML_HEADER = (docType: string) => ebml([0x1a, 0x45, 0xdf, 0xa3], ebml([0x42, 0x82], enc(docType)));
const INFO = ebml([0x15, 0x49, 0xa9, 0x66], [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]);
const TAGS_ID = [0x12, 0x54, 0xc3, 0x67];
const TAG_ID = [0x73, 0x73];
const SIMPLE_TAG_ID = [0x67, 0xc8];
const TAG_NAME_ID = [0x45, 0xa3];
const TAG_STRING_ID = [0x44, 0x87];
const simpleTag = (name: string, value: string) =>
  ebml(SIMPLE_TAG_ID, [...ebml(TAG_NAME_ID, enc(name)), ...ebml(TAG_STRING_ID, enc(value))]);
const tagsOf = (...tags: number[][]) => ebml(TAGS_ID, ebml(TAG_ID, tags.flat()));

/** webm + Tags 里只有 muxer 自己的两个名字：bitexact 真产物的形状，必须放行 */
function webmBenignTags(): Uint8Array {
  return Uint8Array.from([
    ...EBML_HEADER('webm'),
    ...ebml([0x18, 0x53, 0x80, 0x67], [...INFO, ...tagsOf(simpleTag('ENCODER', 'Lavc libvpx-vp9'), simpleTag('DURATION', '00:00:01.000000000'))]),
  ]);
}

/** webm + Tags 里多了一个 TITLE：上传者的信息，必须拒 */
function webmTitleTag(): Uint8Array {
  return Uint8Array.from([
    ...EBML_HEADER('webm'),
    ...ebml([0x18, 0x53, 0x80, 0x67], [...INFO, ...tagsOf(simpleTag('TITLE', '私藏镜头'))]),
  ]);
}

/** EBML 魔数相同但 DocType 是 matroska：不许改姓成 webm 收进来 */
function mkvBytes(): Uint8Array {
  return Uint8Array.from([...EBML_HEADER('matroska'), ...ebml([0x18, 0x53, 0x80, 0x67], INFO)]);
}

function shot(over: Partial<StoryboardShot> = {}): StoryboardShot {
  return { id: 'shot-1-abc', prompt: '一只猫跳上窗台', durationMs: 1000, camera: 'medium', transition: 'cut', ...over };
}
function board(shots: StoryboardShot[]): Storyboard {
  return { id: 'sb-1', title: 't', source: { arrow: 'text-to-video', prompt: 'x' }, shots, notes: [] };
}

/** 只摘 -map_metadata -1（连它的值），隔离出这一个旗的作用 */
function withoutMapMetadata(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '-map_metadata') {
      i += 1;
      continue;
    }
    out.push(args[i]!);
  }
  return out;
}

/** 把渲染命令里那三个"不写元数据"的旗摘掉，复现"忘了配"的现场 */
function stripMetadataFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '-map_metadata' || arg === '-map_chapters') {
      i += 1; // 连它的值 -1 一起摘
      continue;
    }
    if (arg === '-bitexact') continue;
    out.push(arg);
  }
  return out;
}

async function renderMp4(withMetadataFlags: boolean): Promise<Uint8Array> {
  const plan = planVideoRender(board([shot({ id: 'a', prompt: '猫在窗台上看雪' })]));
  const built = buildFfmpegArgs(plan, [], {
    output: join(dir, `real-${withMetadataFlags ? 'clean' : 'dirty'}.mp4`),
    ...(existsSync(FONT) ? { fontFile: FONT } : {}),
  });
  const args = withMetadataFlags ? built.args : stripMetadataFlags(built.args);
  if (!withMetadataFlags && args.join(' ').includes('-map_metadata')) {
    throw new Error('探针自身失效：三个旗没摘干净，这一组测的就不是"忘了配"的现场');
  }
  await run('ffmpeg', ['-y', ...args], { timeout: 120_000 });
  return new Uint8Array(await readFile(join(dir, `real-${withMetadataFlags ? 'clean' : 'dirty'}.mp4`)));
}

beforeAll(async () => {
  resetStorageForTests({ NEXUS_STORAGE_LOCAL_DIR: join(dir, 'store') });
  const db = getDb();
  const probe = await db.execute(sql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Video Asset Owner', email: `video-asset+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  const [quota] = await db
    .insert(users)
    .values({ displayName: 'Video Quota Probe', email: `video-quota+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  quotaOwnerId = quota!.id;
});

afterAll(async () => {
  const db = getDb();
  for (const id of [...createdProjects, ...quotaProjects]) await db.delete(projects).where(eq(projects.id, id));
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, quotaOwnerId));
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

describe('sniffVideoMime —— 按 magic bytes 判容器', () => {
  it('mp4 认第 4 字节起的 ftyp 盒；webm 认 EBML 魔数加 DocType', () => {
    expect(sniffVideoMime(mp4Clean())).toBe('video/mp4');
    expect(sniffVideoMime(webmBenignTags())).toBe('video/webm');
  });

  it('EBML 魔数相同但 DocType 是 matroska：返回 null，不给字节改姓', () => {
    expect(sniffVideoMime(mkvBytes())).toBeNull();
  });

  it('音频（RIFF/WAVE）与纯文本都不是视频：音频不许混进视频资产', () => {
    expect(sniffVideoMime(Uint8Array.from(enc('RIFF$\x00\x00\x00WAVEfmt ')))).toBeNull();
    expect(sniffVideoMime(Uint8Array.from(enc('这不是视频')))).toBeNull();
  });
});

describe('videoMetadataViolations —— 容器里还挂着元数据吗', () => {
  it('bitexact 形状的 mp4（moov>udta>meta>hdlr，没有 ilst）是干净的', () => {
    expect(videoMetadataViolations(mp4Clean())).toEqual([]);
  });

  it('嵌套 ilst 与顶层 meta 盒都报出来，且指出在哪一层', () => {
    expect(videoMetadataViolations(mp4NestedIlst())).toEqual(['moov/udta/meta/ilst']);
    expect(videoMetadataViolations(mp4TopLevelMeta())).toEqual(['meta']);
  });

  it('webm：Tags 里只有 ENCODER/DURATION 放行（那是 muxer 自己的笔记），多一个 TITLE 就拒', () => {
    expect(videoMetadataViolations(webmBenignTags())).toEqual([]);
    expect(videoMetadataViolations(webmTitleTag())).toEqual(['Tags/TITLE']);
  });

  it('结构坏了说"读不懂"，不返回空数组假装干净', () => {
    // moov 盒声称 9999 字节，文件没那么长
    const truncated = Uint8Array.from([...FTYP, ...be32(9999), ...enc('moov'), 1, 2, 3]);
    expect(videoMetadataViolations(truncated).join('')).toContain('超出容器长度');
  });
});

describe('uploadVideoAsset —— 真 ffmpeg 产物进资产库', () => {
  it('带三个旗的真成片过得去：kind=video、key 带 .mp4、字节原样取回、genMeta 记下怎么剥的', async () => {
    const projectId = await newProject('Video Ingest Happy');
    const bytes = await renderMp4(true);
    // 先钉住前提：这一颗真的是渲染链产出的干净 mp4
    expect(sniffVideoMime(bytes)).toBe('video/mp4');
    expect(videoMetadataViolations(bytes)).toEqual([]);

    const result = await uploadVideoAsset(projectId, {
      data: bytes,
      filename: ' storyboard.mp4 ',
      createdById: ownerId,
      genMeta: { storyboardId: 'sb-1', demoMode: true },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.reused).toBe(false);
    expect(result.asset.kind).toBe('video');
    expect(result.asset.mimeType).toBe('video/mp4');
    expect(result.asset.storageKey).toBe(`projects/${projectId}/${result.asset.id}.mp4`);
    expect(result.asset.name).toBe('storyboard.mp4');

    const file = await openAssetFile(result.asset.id);
    expect(file?.mime).toBe('video/mp4');
    expect(Buffer.from(file!.bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it('同一份字节第二次进：复用同一行（reused），不新增记录', async () => {
    const projectId = await newProject('Video Dedupe');
    const bytes = await renderMp4(true);
    const first = await uploadVideoAsset(projectId, { data: bytes });
    const second = await uploadVideoAsset(projectId, { data: bytes.slice() });
    if (!first.ok || !second.ok) throw new Error('两次入库都应成功');
    expect(second.reused).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(await listProjectAssets(projectId)).toHaveLength(1);
  });

  it('摘掉三个旗的真成片被拒：容器里还带着 ilst（真 ffmpeg 复现，不是手搓的）', async () => {
    const projectId = await newProject('Video Missing Flags');
    const bytes = await renderMp4(false);
    // 先钉住现场：摘了旗的真渲染确实带上了 ilst——这正是这道门存在的理由
    expect(videoMetadataViolations(bytes)).toContain('moov/udta/meta/ilst');

    const result = await uploadVideoAsset(projectId, { data: bytes });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid_video');
    expect(result.reason).toContain('-map_metadata -1');
    expect(result.issues.join()).toContain('ilst');
    expect(await listProjectAssets(projectId)).toHaveLength(0);
  });

  it('非视频字节（PNG）、mkv、超上限各因各的原因被拒', async () => {
    const projectId = await newProject('Video Rejects');
    const png = await uploadVideoAsset(projectId, { data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) });
    expect(png.ok).toBe(false);
    if (!png.ok) expect(png.issues.join()).toContain('ftyp');

    const mkv = await uploadVideoAsset(projectId, { data: mkvBytes() });
    expect(mkv.ok).toBe(false);
    if (!mkv.ok) expect(mkv.reason).toContain('只接受');

    // 超上限的样本必须是**合法的视频**：否则它先撞上"不是视频"那道门，
    // 测到的就不是"放不下"而是"不认得"——两道门各有各的理由，不能混
    const hugeBytes = new Uint8Array(MAX_VIDEO_BYTES + 1024);
    hugeBytes.set(Uint8Array.from(FTYP), 0);
    hugeBytes.set(Uint8Array.from(be32(hugeBytes.length - FTYP.length)), FTYP.length);
    hugeBytes.set(Uint8Array.from(enc('free')), FTYP.length + 4);
    const huge = await uploadVideoAsset(projectId, { data: hugeBytes });
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.reason).toContain('MB 上限');
  });
});

describe('uploadVideoAsset —— 渲染器不信任上游"已经剥干净了"', () => {
  it('参考帧带 GPS 注释：带旗成片干净，摘了 -map_metadata -1 注释就流进 ilst，摄入门拒', async () => {
    const projectId = await newProject('Video Metadata Passthrough');
    // 载体是 ffmpeg 自己产的一颗带 comment 元数据的 mp4——正是 §80 里
    // "位置信息顺着编码器流进成片"的现场。上传链路明明会剥元数据，
    // 但渲染器不能假设上游剥过了：这颗文件就是"没剥"的那一种
    const carrier = join(dir, 'carrier.mp4');
    await run(
      'ffmpeg',
      [
        '-y', '-f', 'lavfi', '-i', 'color=c=0x806040:s=320x180:r=30:d=1',
        '-frames:v', '1', '-metadata', 'comment=GPS: 31.2304,121.4737',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', carrier,
      ],
      { timeout: 120_000 },
    );
    expect(videoMetadataViolations(new Uint8Array(await readFile(carrier)))).toContain('moov/udta/meta/ilst');

    const plan = planVideoRender(board([shot({ id: 'a', prompt: '窗台上的猫', durationMs: 1000, referenceAssetId: 'r1' })]));
    const files = [{ shotId: 'a', path: carrier }];

    const cleanOut = join(dir, 'passthrough-clean.mp4');
    await run('ffmpeg', ['-y', ...buildFfmpegArgs(plan, files, { output: cleanOut }).args], { timeout: 120_000 });
    const cleanBytes = new Uint8Array(await readFile(cleanOut));
    expect(videoMetadataViolations(cleanBytes)).toEqual([]);

    // 只摘 -map_metadata -1，另两个旗留着：流进成片的只能是参考帧自己的注释
    const dirtyOut = join(dir, 'passthrough-dirty.mp4');
    await run('ffmpeg', ['-y', ...withoutMapMetadata(buildFfmpegArgs(plan, files, { output: dirtyOut }).args)], {
      timeout: 120_000,
    });
    const dirtyBytes = new Uint8Array(await readFile(dirtyOut));
    expect(videoMetadataViolations(dirtyBytes)).toContain('moov/udta/meta/ilst');

    const rejected = await uploadVideoAsset(projectId, { data: dirtyBytes });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.issues.join()).toContain('ilst');
    const accepted = await uploadVideoAsset(projectId, { data: cleanBytes });
    expect(accepted.ok).toBe(true);
  });
});

describe('§133 storage 配额：视频字节进存储之前先问放不放得下', () => {
  afterAll(async () => {
    const db = getDb();
    for (const id of quotaProjects) await db.delete(projects).where(eq(projects.id, id));
  });

  it('占用顶到上限时拒新写入，且理由里带数字', async () => {
    const db = getDb();
    const doc = await createProject(quotaOwnerId, { name: 'Video Quota', kind: 'website' });
    quotaProjects.push(doc.id);
    const used = await storageUsageBytes(quotaOwnerId);
    await db.insert(assets).values({
      projectId: doc.id,
      kind: 'image',
      name: 'quota-filler',
      storageKey: `quota-probe/${Date.now()}-${Math.random()}`,
      bytes: storageLimitBytes('free') - used,
    });
    // 每次换一句 prompt：色卡颜色由 shotId 定，checksum 不同才不会被去重挡住
    const bytes = await renderMp4(true);
    const result = await uploadVideoAsset(doc.id, { data: bytes });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('storage_exhausted');
    expect(result.reason).toMatch(/\d/);
  });
});