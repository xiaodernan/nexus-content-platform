import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crc32, textEntry, zipStore, type ZipEntry } from '../src/lib/zip';
import { readZip, readZipText } from '../src/lib/zip-read';
import { buildProjectExport, type NexusManifest } from '../src/server/domain/export';
import { CHARACTERS_DOC_PATH, importProjectZip } from '../src/server/domain/import';
import { createProjectCharacter, listCharacters, updateCharacterProfile } from '../src/server/domain/characters';
import { listProjectAssets, uploadImageAsset, uploadVideoAsset } from '../src/server/domain/assets';
import { loadStoryboard, saveStoryboard } from '../src/server/domain/storyboards';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { users } from '../src/server/db/schema';

/**
 * v3/v4 长出来的两层：**分镜与角色跟着导出包走**（§40-42 × §144 × §46）。
 *
 * 这一份打真往返：源项目里造一份分镜（带参考帧、带成片、带角色），真导出、真导回来，逐条对：
 * - 镜头数与 prompt 原样回来；库里那一份是新行的 uuid，不是包里建档时的临时 id；
 * - `referenceAssetId` / `videoAssetId` 换成**新项目自己**的资产 id（换号，§16/§27 同一规矩）；
 * - `characterId` 换成新项目自己的角色 id（v4 起角色随包走；v3 及以前只能剥掉并点名）；
 * - 成片按字节类型走 `uploadVideoAsset` 而不是被当图片递过去（v3 之前视频资产其实进不来）。
 *
 * 夹具照 `video-asset.integration.test.ts` 的 mp4Clean 手搓：这一格要证的是"导入侧认不认这颗
 * 字节"，不需要真 ffmpeg 跑一遍渲染。包也不是手搓的，从真项目 `buildProjectExport` 出来，
 * 只在"换字节"那一例上做最小改动并重算清单（"包自洽但内容变了"）。
 */

const MANIFEST_PATH = '.nexus/manifest.json';

const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
function mp4Box(type: string, data: number[]): number[] {
  return [...be32(data.length + 8), ...enc(type), ...data];
}
const FTYP = mp4Box('ftyp', [...enc('isom'), 0, 0, 2, 0, ...enc('isom'), ...enc('mp42')]);
/** bitexact 真产物的形状：moov>udta>meta>hdlr + 空 ilst——摄入门必须放行 */
function mp4Clean(): Uint8Array {
  return Uint8Array.from([
    ...FTYP,
    ...mp4Box('moov', mp4Box('udta', mp4Box('meta', [0, 0, 0, 0, ...mp4Box('hdlr', enc('mdir')), ...mp4Box('ilst', [])]))),
    ...mp4Box('mdat', [1, 2, 3]),
  ]);
}

/** 与 `import.integration.test.ts` 同一套手搓 PNG：摄取门认 magic bytes 与 IHDR，不校验 CRC */
function makePng(seed = 1): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const body = [...enc(type), ...data];
    return [...be32(data.length), ...body, 0, 0, 0, 0];
  };
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [...be32(4), ...be32(3), 8, 6, 0, 0, 0]),
    ...chunk('IDAT', [seed, 2, 3, 4]),
    ...chunk('IEND', []),
  ]);
}

/** 读真包里第一位角色的档案（改它一处再压回去，就是"内容变了、清单重算"那类篡改） */
function characterInPackage(zipBytes: Uint8Array): { id: string; profile: Record<string, unknown> } {
  const text = readZipText(readZip(zipBytes), CHARACTERS_DOC_PATH);
  if (text === null) throw new Error('真包里没有角色档案');
  const all = JSON.parse(text) as { id: string; profile: Record<string, unknown> }[];
  return all[0]!;
}

/** 拆成真包的两层：清单 + 其余条目（条目原样，不重新编码） */
function packageOf(zipBytes: Uint8Array): { manifest: NexusManifest; files: ZipEntry[] } {
  const entries = readZip(zipBytes);
  const text = readZipText(entries, MANIFEST_PATH);
  if (text === null) throw new Error('真包里居然没有清单');
  return {
    manifest: JSON.parse(text) as NexusManifest,
    files: entries
      .filter((e) => e.path !== MANIFEST_PATH)
      .map((e) => ({ path: e.path, contents: e.contents })),
  };
}

/** 换掉包里的文件再压一份；`resync` 为真时按新字节重算清单的 entries */
function repack(files: ZipEntry[], manifest: NexusManifest, resync: boolean): Uint8Array {
  const fixed: NexusManifest = resync
    ? {
        ...manifest,
        entries: files.map((e) => ({
          path: e.path,
          bytes: e.contents.length,
          crc32: crc32(e.contents).toString(16).toUpperCase().padStart(8, '0'),
        })),
      }
    : manifest;
  return zipStore([textEntry(MANIFEST_PATH, JSON.stringify(fixed)), ...files]);
}

let userId: string;
let otherUserId: string;
let sourceId: string;
let imageAssetId: string;
let videoAssetId: string;
let characterId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now().toString(36);
  const [me] = await db
    .insert(users)
    .values({ displayName: '分镜导入', email: `sbi+${stamp}@nexus.test`, handle: `sbi${stamp}` })
    .returning({ id: users.id });
  userId = me!.id;
  const [other] = await db
    .insert(users)
    .values({ displayName: '分镜导入 另一位', email: `sbi-o+${stamp}@nexus.test`, handle: `sbio${stamp}` })
    .returning({ id: users.id });
  otherUserId = other!.id;

  const created = await createProject(userId, { name: '分镜往返 源项目', kind: 'website' });
  sourceId = created.id;

  const image = await uploadImageAsset(sourceId, {
    data: makePng(),
    filename: '参考帧.png',
    createdById: userId,
    source: 'upload',
  });
  if (!image.ok) throw new Error(`参考帧上传失败：${image.reason}`);
  imageAssetId = image.asset.id;

  const video = await uploadVideoAsset(sourceId, {
    data: mp4Clean(),
    filename: '成片.mp4',
    createdById: userId,
    genMeta: { storyboardId: 'sb-source', provider: 'local-ffmpeg', demoMode: true },
  });
  if (!video.ok) throw new Error(`成片上传失败：${video.reason}`);
  videoAssetId = video.asset.id;

  const character = await createProjectCharacter(sourceId, userId, { name: '阿猫' });
  if (!character.ok) throw new Error(`角色建档失败：${character.reason}`);
  characterId = character.character.id;

  // 档案里的参考图指着刚上传的那张位图：导入侧要把它也换成新项目的资产 id（§46/§80）
  const { items } = await listCharacters(sourceId);
  const sourceCharacter = items.find((c) => c.id === characterId);
  if (!sourceCharacter) throw new Error('刚建档的角色读不回来');
  const withReference = await updateCharacterProfile(characterId, sourceId, {
    ...sourceCharacter.profile,
    visualIdentity: { ...sourceCharacter.profile.visualIdentity, referenceAssetId: imageAssetId },
  });
  if (!withReference.ok) throw new Error(`角色档案写不回去：${withReference.reason}`);

  // 一份**满引用**的分镜：来源带角色与参考帧，第一镜挂角色，第二镜挂参考帧与成片
  const saved = await saveStoryboard(sourceId, userId, {
    document: {
      id: 'sb-source',
      title: '猫过围墙',
      source: { arrow: 'text-to-video', prompt: '一只猫跳过围墙', referenceAssetId: imageAssetId, characterId },
      shots: [
        { id: 'shot-1', prompt: '猫走近围墙', durationMs: 3000, camera: 'wide', transition: 'cut', characterId },
        {
          id: 'shot-2',
          prompt: '猫起跳',
          durationMs: 3000,
          camera: 'medium',
          transition: 'fade',
          referenceAssetId: imageAssetId,
          videoAssetId,
        },
      ],
      notes: ['投影：作者原话切成两镜'],
    },
  });
  if (!saved.ok) throw new Error(`源分镜保存失败：${saved.reason}`);
});

afterAll(async () => {
  // 与其它集成用例同一口径：行留给库，不在这里清（清理会撞并行文件的断言）
});

describe('§40-42 × §144 × §46：分镜与角色跟着导出包走（v3-v4）', () => {
  it('完整往返：分镜与角色都回来了，引用换成新项目自己的资产与角色', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'assets', 'storyboard', 'character']);
    if (!exported) throw new Error('自己的项目导不出来');
    expect(exported.counts.storyboard).toBe(1);
    expect(exported.counts.character).toBe(1);

    const outcome = await importProjectZip(otherUserId, exported.bytes);
    expect(outcome.ok, outcome.ok ? '' : `${outcome.reason} / ${outcome.issues.join('；')}`).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.counts.storyboard).toBe(1);
    expect(outcome.counts.assets).toBe(2);
    expect(outcome.counts.character).toBe(1);

    const back = await loadStoryboard(outcome.projectId);
    if (!back?.ok) throw new Error('导回来的项目里没有分镜');
    expect(back.document.title).toBe('猫过围墙');
    expect(back.document.shots.map((shot) => shot.prompt)).toEqual(['猫走近围墙', '猫起跳']);
    // 库里这一份是新行的 uuid，不是包里那个建档时的临时 id
    expect(back.document.id).not.toBe('sb-source');

    // 资产在新项目里，且视频那颗走的是视频摄取门（kind 落在行上）
    const assetsIn = await listProjectAssets(outcome.projectId);
    const newImage = assetsIn.find((a) => a.kind === 'image');
    const newVideo = assetsIn.find((a) => a.kind === 'video');
    expect(newImage, '导入的项目里没有图片资产').toBeTruthy();
    expect(newVideo, '导入的项目里没有视频资产——视频字节被当图片拒了？').toBeTruthy();

    // v4：角色随包走。新项目里有一位角色，且不是源项目那一行
    const charactersIn = await listCharacters(outcome.projectId);
    expect(charactersIn.items.length, '导入的项目里没有角色').toBe(1);
    const newCharacter = charactersIn.items[0]!;

    // 换号：引用指向新项目自己的资产行，不是源项目那两个 id
    expect(back.document.source.referenceAssetId).toBe(newImage!.id);
    expect(back.document.source.referenceAssetId).not.toBe(imageAssetId);
    expect(back.document.shots[1]!.referenceAssetId).toBe(newImage!.id);
    expect(back.document.shots[1]!.videoAssetId).toBe(newVideo!.id);
    expect(back.document.shots[1]!.videoAssetId).not.toBe(videoAssetId);

    // v4：characterId 换成新项目自己的角色 id，不再剥掉
    expect(back.document.shots[0]!.characterId).toBe(newCharacter.id);
    expect(back.document.shots[0]!.characterId).not.toBe(characterId);
    expect(back.document.source.characterId).toBe(newCharacter.id);
    // 档案里的参考图也过了 idMap：指着新项目自己的资产行，不是源项目那张
    expect(newCharacter.profile.visualIdentity.referenceAssetId).toBe(newImage!.id);

    // 角色顺利进门时一条剥离都不该有："剥掉"只属于没进来或没建档成功的
    const notes = outcome.storyboardNotes.join('\n');
    expect(notes).not.toContain('已剥离');
    expect(notes).not.toContain('这处角色引用已剥掉');
    expect(notes).toContain('storyboardId 是源包那一份的');
  });

  it('成片字节过不了摄取门：项目还在，那处引用删掉并点名（删字段，不删镜头）', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'assets', 'storyboard', 'character']);
    if (!exported) throw new Error('自己的项目导不出来');
    const { manifest, files } = packageOf(exported.bytes);
    const videoPath = manifest.assetRefs.find((r) => r.path.endsWith('.mp4'))?.path;
    if (!videoPath) throw new Error('真包里没有成片条目');

    // 把成片字节换成一坨不是视频也不是图片的东西，清单跟着重算：拒的原因只剩"摄取门不收"
    const hijacked = files.map((f) =>
      f.path === videoPath ? { ...f, contents: textEntry(f.path, '这不是视频').contents } : f,
    );
    const outcome = await importProjectZip(otherUserId, repack(hijacked, manifest, true));

    expect(outcome.ok, outcome.ok ? '' : `${outcome.reason} / ${outcome.issues.join('；')}`).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.counts.assets).toBe(1);
    expect(outcome.counts.storyboard).toBe(1);
    expect(outcome.counts.character).toBe(1);
    // 字节不合格要被点名（它被当图片递过去，得到的是图片摄取门那条拒绝理由）
    const refused = outcome.assetFailures.find((f) => f.path === videoPath);
    expect(refused, '不合格的成片字节没有被点名').toBeTruthy();
    expect(refused!.reason).toContain('只接受 PNG');

    const back = await loadStoryboard(outcome.projectId);
    if (!back?.ok) throw new Error('分镜没导回来');
    // 悬空引用删掉，不留着让 saveStoryboard 整份拒收；删的是字段，不是镜头
    expect(back.document.shots[1]!.videoAssetId).toBeUndefined();
    expect(back.document.shots.length).toBe(2);
    const notes = outcome.storyboardNotes.join('\n');
    expect(notes).toContain('这处引用已删除');
    expect(notes).toContain('第 2 镜（shot-2） 的成片');
  });

  it('角色建档失败（包里那位没有名字）：项目还在，镜头上的角色剥掉并点名', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'assets', 'storyboard', 'character']);
    if (!exported) throw new Error('自己的项目导不出来');
    const { manifest, files } = packageOf(exported.bytes);
    const base = characterInPackage(exported.bytes);

    // 把包里那位角色的名字改成空串：CharacterSchema 过得去（name 只限长不限空），
    // 但 createProjectCharacter 拒收没有名字的角色——失败发生在写库那一步，不在验包那一步
    const nameless = files.map((f) =>
      f.path === CHARACTERS_DOC_PATH
        ? {
            ...f,
            contents: textEntry(f.path, JSON.stringify([{ ...base, profile: { ...base.profile, name: '' } }])).contents,
          }
        : f,
    );
    const outcome = await importProjectZip(otherUserId, repack(nameless, manifest, true));

    expect(outcome.ok, outcome.ok ? '' : `${outcome.reason} / ${outcome.issues.join('；')}`).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.counts.character).toBe(0);
    expect(outcome.counts.storyboard).toBe(1);
    const characterNotes = outcome.characterNotes.join('\n');
    expect(characterNotes).toContain('没建档');
    expect(characterNotes).toContain('角色要有名字');

    const back = await loadStoryboard(outcome.projectId);
    if (!back?.ok) throw new Error('分镜没导回来');
    // 剥掉的是角色引用，不是镜头：两镜都在，只是不再挂着谁
    expect(back.document.shots[0]!.characterId).toBeUndefined();
    expect(back.document.source.characterId).toBeUndefined();
    expect(back.document.shots.length).toBe(2);
    expect(outcome.storyboardNotes.join('\n')).toContain('这处角色引用已剥掉');
  });

  it('角色档案里的参考图换不到号：置空并点名，不留悬空引用', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'assets', 'storyboard', 'character']);
    if (!exported) throw new Error('自己的项目导不出来');
    const { manifest, files } = packageOf(exported.bytes);
    const base = characterInPackage(exported.bytes);
    const visualIdentity = base.profile.visualIdentity as Record<string, unknown>;

    // 把档案里的参考图改成一个包里没有的资产 id：契约过得去（只查形状不查归属），
    // 但 idMap 里没有它——这一处必须置空并点名，而不是存一条指着空气的引用
    const dangling = files.map((f) =>
      f.path === CHARACTERS_DOC_PATH
        ? {
            ...f,
            contents: textEntry(
              f.path,
              JSON.stringify([
                { ...base, profile: { ...base.profile, visualIdentity: { ...visualIdentity, referenceAssetId: 'asset-不存在' } } },
              ]),
            ).contents,
          }
        : f,
    );
    const outcome = await importProjectZip(otherUserId, repack(dangling, manifest, true));

    expect(outcome.ok, outcome.ok ? '' : `${outcome.reason} / ${outcome.issues.join('；')}`).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.counts.character).toBe(1);
    expect(outcome.characterNotes.join('\n')).toContain('这处引用已置空');
    const charactersIn = await listCharacters(outcome.projectId);
    expect(charactersIn.items[0]!.profile.visualIdentity.referenceAssetId).toBeNull();
    // 角色本身还在，镜头上的引用也换上了新角色——坏的只是那一处参考图
    const back = await loadStoryboard(outcome.projectId);
    if (!back?.ok) throw new Error('分镜没导回来');
    expect(back.document.shots[0]!.characterId).toBe(charactersIn.items[0]!.id);
  });
});
