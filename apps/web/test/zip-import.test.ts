import { describe, expect, it } from 'vitest';
import { createDocument } from '@nexus/design-model';
import { crc32, textEntry, zipStore, type ZipEntry } from '@/lib/zip';
import {
  CHARACTERS_DOC_PATH,
  IMPORT_MAX_ZIP_BYTES,
  importProjectZip,
  inspectPackage,
  STORYBOARD_DOC_PATH,
} from '@/server/domain/import';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type NexusManifest } from '@/server/domain/export';

/**
 * §105/§144 导入侧的拒收表：只打纯函数，不碰库。
 *
 * 每一例都必须**在写库之前**被拒掉——所以这里根本不建数据库连接，
 * 走到 `createProject` 的那条路交给 `import.integration.test.ts` 去证。
 *
 * 包由这个文件自己拼（`pack`），清单由 `manifestOf` 造：
 * 两者都不叫 `buildProjectExport`，因为"自家写端出的包自家读得开"只证了对称，
 * 不证拒收——拒收要靠**故意写歪**的清单与字节来触发（`zip-read.test.ts` 同一道理）。
 */

function manifestOf(
  entries: ZipEntry[],
  opts: Partial<NexusManifest> = {},
): NexusManifest {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    generatedAt: '2026-10-02T00:00:00.000Z',
    project: { name: '导入用例', kind: 'website' },
    parts: ['design', 'code', 'assets'],
    entries: entries.map((e) => ({
      path: e.path,
      bytes: e.contents.length,
      crc32: crc32(e.contents).toString(16).toUpperCase().padStart(8, '0'),
    })),
    assetRefs: [],
    missingAssets: [],
    ...opts,
  };
}

/** 拼一份包：清单进 `.nexus/manifest.json`，其余条目原样放进去 */
function pack(files: ZipEntry[], manifest?: NexusManifest): Uint8Array {
  const entries = [...files];
  if (manifest) entries.unshift(textEntry('.nexus/manifest.json', JSON.stringify(manifest)));
  return zipStore(entries);
}

/** 一份能过界面校验门的设计文档（与 createProject 起手页同一来源） */
function goodDocument(): ZipEntry {
  return textEntry('design/document.json', JSON.stringify(createDocument('导入用例', 'website')));
}

/** 包里那份 README：两个汉字，字节数从真字节算出来，不手打（手打会把 CJK 报成 2） */
const README = textEntry('README.txt', '说明');

/** 一份过得了 StoryboardSaveRequestSchema 的分镜文档：导入侧判据的"合法那一半" */
function storyboardDocument(): Record<string, unknown> {
  return {
    id: 'sb-source',
    title: '导入用例分镜',
    source: { arrow: 'text-to-video', prompt: '一只猫跳过围墙' },
    shots: [
      { id: 'shot-1', prompt: '猫走近围墙', durationMs: 3000, camera: 'wide', transition: 'cut' },
      { id: 'shot-2', prompt: '猫起跳', durationMs: 3000, camera: 'medium', transition: 'fade', referenceAssetId: 'asset-1' },
    ],
    notes: [],
  };
}

/** 一份过得了 CharacterSchema 的角色档案：导入侧判据的"合法那一半" */
function characterDocument(): Record<string, unknown> {
  return {
    id: 'char-source',
    projectId: 'p-source',
    worldId: null,
    profile: {
      name: '阿猫',
      appearance: '黑猫，绿眼睛',
      personality: '冷静',
      backstory: '港口的猫',
      goals: [],
      fears: [],
      relationships: [],
      voice: { register: '低沉', pace: '慢', catchphrases: [], notes: '' },
      visualIdentity: { palette: ['#000000'], silhouette: '瘦长', motifs: [], referenceAssetId: null },
    },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

/** 拼一份 parts 含 character 的包；`charactersText` 为 null 表示包里不放那份文档 */
function packWithCharacters(charactersText: string | null): Uint8Array {
  const files = [
    textEntry('README.txt', '说明'),
    goodDocument(),
    textEntry('code/index.tsx', 'export const A = 1;'),
    textEntry(STORYBOARD_DOC_PATH, JSON.stringify(storyboardDocument())),
  ];
  if (charactersText !== null) files.push(textEntry(CHARACTERS_DOC_PATH, charactersText));
  return pack(files, manifestOf(files, { parts: ['design', 'code', 'assets', 'storyboard', 'character'] }));
}

/** 拼一份 parts 含 storyboard 的包；`storyboardText` 为 null 表示包里不放那份文档 */
function packWithStoryboard(storyboardText: string | null): Uint8Array {
  const files = [textEntry('README.txt', '说明'), goodDocument(), textEntry('code/index.tsx', 'export const A = 1;')];
  if (storyboardText !== null) files.push(textEntry(STORYBOARD_DOC_PATH, storyboardText));
  return pack(files, manifestOf(files, { parts: ['design', 'code', 'assets', 'storyboard'] }));
}

/** 取一份真包的清单，改它一处再重新拼（这就是"内容没动、清单先动"那类篡改） */
function tamperManifest(tamper: (m: NexusManifest) => unknown): Uint8Array {
  const files = [README, goodDocument(), textEntry('code/index.tsx', 'export const A = 1;')];
  const manifest = manifestOf(files);
  const patched = { ...manifest, ...(tamper(manifest) as object) } as NexusManifest;
  return pack(files, patched);
}

const REFUSALS: { label: string; bytes: Uint8Array; message: string; issues?: string[] }[] = [
  { label: '空包', bytes: new Uint8Array(0), message: '包是空的' },
  {
    label: '没有清单',
    bytes: pack([goodDocument()]),
    message: '这份包不是本平台导出的：包里没有 .nexus/manifest.json',
  },
  {
    label: '清单不是 JSON',
    bytes: pack([textEntry('.nexus/manifest.json', '{这不是 JSON'), goodDocument()]),
    message: '.nexus/manifest.json 不是合法 JSON',
  },
  {
    label: '清单不是对象',
    bytes: pack([textEntry('.nexus/manifest.json', '[1,2,3]'), goodDocument()]),
    message: '.nexus/manifest.json 的形状不对',
  },
  {
    label: 'format 不对（别的工具打的包）',
    bytes: tamperManifest(() => ({ format: 'something-else' as typeof EXPORT_FORMAT })),
    message: '这份包不是 nexus 项目的导出包',
  },
  {
    label: 'v1 的包（没有 assetRefs，导回来图片引用会断）',
    bytes: tamperManifest(() => ({ formatVersion: 1 })),
    message: '包格式版本不认识：这份是 v1，本实例只认 v4',
    issues: ['v1 的清单没有记录每个文件对应的资产 id'],
  },
  {
    label: 'v2 的包（没有 storyboard 那一层，v3 才加的）',
    bytes: tamperManifest(() => ({ formatVersion: 2 })),
    message: '包格式版本不认识：这份是 v2，本实例只认 v4',
    issues: ['重新导出一次（v3）'],
  },
  {
    label: 'v3 的包（没有 character 那一层，v4 才加的）',
    bytes: tamperManifest(() => ({ formatVersion: 3 })),
    message: '包格式版本不认识：这份是 v3，本实例只认 v4',
    issues: ['重新导出一次（v4）'],
  },
  {
    label: '清单少了 entries',
    bytes: tamperManifest(() => ({ entries: 'x' })),
    message: '.nexus/manifest.json 少了 entries 或 assetRefs',
  },
  {
    label: 'parts 里有不认识的组合',
    bytes: tamperManifest(() => ({ parts: ['design', 'secrets'] as never })),
    message: '清单里的 parts 读不出一个合法组合',
  },
  {
    label: '清单说有、包里没有',
    bytes: tamperManifest((m) => ({ entries: [...m.entries, { path: 'assets/01-假的.png', bytes: 3, crc32: 'DEADBEEF' }] })),
    message: '清单与包内容对不上，整包拒收',
    issues: ['清单说有 assets/01-假的.png，包里没有'],
  },
  {
    label: '清单声明的字节数与实际不符',
    bytes: tamperManifest((m) => ({ entries: m.entries.map((e, i) => (i === 0 ? { ...e, bytes: e.bytes + 1 } : e)) })),
    message: '清单与包内容对不上，整包拒收',
    issues: [`README.txt：清单声明 ${README.contents.length + 1} 字节，实际 ${README.contents.length} 字节`],
  },
  {
    label: '清单的 CRC 与实际不符（内容被改过但清单没改的那一类）',
    bytes: tamperManifest((m) => ({ entries: m.entries.map((e, i) => (i === 0 ? { ...e, crc32: 'DEADBEEF' } : e)) })),
    message: '清单与包内容对不上，整包拒收',
    issues: ['README.txt：清单 CRC DEADBEEF，实际'],
  },
  {
    label: '包里多了一件清单没记的东西',
    bytes: (() => {
      const files = [textEntry('README.txt', '说明'), goodDocument()];
      const manifest = manifestOf(files);
      return pack([...files, textEntry('code/偷偷塞进去.txt', 'hi')], manifest);
    })(),
    message: '清单与包内容对不上，整包拒收',
    issues: ['包里有一份清单没记的东西：code/偷偷塞进去.txt'],
  },
  {
    label: 'assetRefs 指向 entries 里没有的路径',
    bytes: tamperManifest(() => ({ assetRefs: [{ path: 'assets/02-不存在的.png', assetId: 'a1', name: 'x' }] })),
    message: '清单与包内容对不上，整包拒收',
    issues: ['assetRefs 说有 assets/02-不存在的.png，entries 里却没有这一项'],
  },
  {
    label: '没导 design 的包',
    bytes: tamperManifest(() => ({ parts: ['code'] })),
    message: '这份包没导 design，导回来会是一个空项目',
  },
  {
    label: '清单说导了 design，包里却没有那份文档',
    bytes: (() => {
      const files = [textEntry('README.txt', '说明')];
      return pack(files, manifestOf(files));
    })(),
    message: '清单说导了 design，包里却没有 design/document.json',
  },
  {
    label: '设计文档不是合法 JSON',
    bytes: (() => {
      const files = [textEntry('README.txt', '说明'), textEntry('design/document.json', '{坏掉的')];
      return pack(files, manifestOf(files));
    })(),
    message: 'design/document.json 不是合法 JSON，整包拒收',
  },
  {
    label: '设计文档过不了界面同一条校验门',
    bytes: (() => {
      // 语法合法、形状不对：必须走到 parseDocument 那一条判据上，而不是被 JSON.parse 挡掉
      const files = [textEntry('README.txt', '说明'), textEntry('design/document.json', JSON.stringify({ name: '缺字段的一页' }))];
      return pack(files, manifestOf(files));
    })(),
    message: '包里的设计文档过不了校验，整包拒收',
  },
  {
    label: '清单说有 storyboard，包里却没有那份文档',
    bytes: packWithStoryboard(null),
    message: `清单说导了 storyboard，包里却没有 ${STORYBOARD_DOC_PATH}`,
  },
  {
    label: 'storyboard.json 不是合法 JSON',
    bytes: packWithStoryboard('{这不是 JSON'),
    message: `${STORYBOARD_DOC_PATH} 不是合法 JSON，整包拒收`,
  },
  {
    label: 'storyboard.json 过不了契约（缺 source/shots 的残片）',
    bytes: packWithStoryboard(JSON.stringify({ id: 'sb-残', title: '只有一行的分镜' })),
    message: '包里的分镜文档过不了契约，整包拒收',
  },
  {
    label: '清单说有 character，包里却没有那份档案',
    bytes: packWithCharacters(null),
    message: `清单说导了 character，包里却没有 ${CHARACTERS_DOC_PATH}`,
  },
  {
    label: 'characters.json 不是合法 JSON',
    bytes: packWithCharacters('{这不是 JSON'),
    message: `${CHARACTERS_DOC_PATH} 不是合法 JSON，整包拒收`,
  },
  {
    label: 'characters.json 不是数组',
    bytes: packWithCharacters(JSON.stringify({ id: 'char-x' })),
    message: `${CHARACTERS_DOC_PATH} 应该是一个角色数组，整包拒收`,
  },
  {
    label: '某位角色的档案过不了契约（缺 profile 的残片）',
    bytes: packWithCharacters(JSON.stringify([{ id: 'char-残' }])),
    message: '包里的角色档案过不了契约，整包拒收',
  },
  {
    label: '项目类型这个实例不认识',
    bytes: tamperManifest(() => ({ project: { name: '导入用例', kind: 'holodeck' } })),
    message: '清单里的项目类型这个实例不认识',
  },
];

describe('§105/§144 ZIP 导入：先挡再写库', () => {
  it.each(REFUSALS)('$label → 整包拒收，报的是这一条判据', async ({ bytes, message, issues }) => {
    const outcome = await importProjectZip('u-not-used', bytes);
    expect(outcome.ok, `本该拒收却走了写入这条路：${message}`).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain(message);
    for (const want of issues ?? []) expect(outcome.issues.join('\n')).toContain(want);
  });

  it('清单里的 project.name 不是字符串 → 不能崩，退回文档名（§159：如实边界，不是 500）', () => {
    // 形状畸形的清单（手改 / 别的工具重打包）：project.name 是数字时，
    // `name?.trim()` 里 `?.` 只挡 null/undefined，挡不住"有值但不是字符串"→ 直接 TypeError。
    // 这个字段是**装饰性**的（名字），不该让整包导入崩掉。
    const files = [README, goodDocument()];
    const manifest = manifestOf(files);
    const bytes = pack(files, { ...manifest, project: { name: 123 as never, kind: 'website' } });
    let plan: ReturnType<typeof inspectPackage> | undefined;
    expect(() => {
      plan = inspectPackage(bytes);
    }).not.toThrow();
    expect(plan!.ok).toBe(true);
    if (plan!.ok) expect(plan!.name).toBe('导入用例'); // 文档自己的名字兜底
  });

  it('parts 含 storyboard 且那份文档过得了契约 → 计划里带着分镜（写库前最后一关放行）', () => {
    const plan = inspectPackage(packWithStoryboard(JSON.stringify(storyboardDocument())));
    expect(plan.ok, plan.ok ? '' : `${plan.reason} / ${plan.issues.join('；')}`).toBe(true);
    if (!plan.ok) return;
    expect(plan.storyboard).not.toBeNull();
    expect(plan.storyboard!.document.id).toBe('sb-source');
    expect(plan.storyboard!.document.shots.map((shot) => shot.id)).toEqual(['shot-1', 'shot-2']);
    expect(plan.storyboard!.document.shots[1]!.referenceAssetId).toBe('asset-1');
  });

  it('parts 含 character 且每位角色都过得了契约 → 计划里带着角色（写库前最后一关放行）', () => {
    const plan = inspectPackage(packWithCharacters(JSON.stringify([characterDocument()])));
    expect(plan.ok, plan.ok ? '' : `${plan.reason} / ${plan.issues.join('；')}`).toBe(true);
    if (!plan.ok) return;
    expect(plan.characters).toHaveLength(1);
    expect(plan.characters[0]!.id).toBe('char-source');
    expect(plan.characters[0]!.profile.name).toBe('阿猫');
    // 源项目的 projectId / worldId 只是包里的装饰：导入侧一个都不用（只取 name 与 profile）
    expect(plan.characters[0]!.projectId).toBe('p-source');
  });

  it('整包体积超过上限 → 还没碰 ZIP 解析就拒', async () => {
    // 只造长度，不填内容：这一格判的是 `zipBytes.length`，早于 readZip
    const huge = new Uint8Array(IMPORT_MAX_ZIP_BYTES + 1);
    const outcome = await importProjectZip('u-not-used', huge);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain(`整包 ${IMPORT_MAX_ZIP_BYTES + 1} 字节超过上限 ${IMPORT_MAX_ZIP_BYTES} 字节`);
  });

  it('ZIP 读端的那几道门在这里也说话（zip bomb 不用自己再防一遍）', async () => {
    // 声明解压后 60MB 的一条，但整包只有几十字节——读端必须在导入侧就挡住
    const bomb = pack(
      [textEntry('.nexus/manifest.json', 'x'), goodDocument()],
      // 清单先放一边：这一例要证的是"包本身读不开"排在"清单对不对"之前
      manifestOf([textEntry('.nexus/manifest.json', 'x')]),
    );
    const withSizeLie = (() => {
      // 手改中央目录里第一条的"解压后体积"：把它报成 60MB，字节却没那么多
      const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);
      const eocd = bomb.length - 22;
      const at = view.getUint32(eocd + 16, true);
      const nameLen = view.getUint16(at + 28, true);
      view.setUint32(at + 24, 60 * 1024 * 1024, true); // central: uncompressed size
      void nameLen;
      return bomb;
    })();
    const outcome = await importProjectZip('u-not-used', withSizeLie);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/ZIP 拒绝：/);
  });

  it('除清单外一切正常的包能通过所有写库前的判据（上面那些红才是判据的红）', () => {
    // `inspectPackage` 是写库之前那一段的接缝：这一条通过，说明上面 18 例里
    // 每一次拒收都真的是因为那一处被改歪了，而不是我的夹具本来就不合法。
    // 它也保证这一整份单测不需要数据库。
    const files = [textEntry('README.txt', '说明'), goodDocument(), textEntry('code/index.tsx', 'export const A = 1;')];
    const manifest = manifestOf(files, { parts: ['design', 'code'] });
    const plan = inspectPackage(pack(files, manifest));
    expect(plan.ok, plan.ok ? '' : `${plan.reason} / ${plan.issues.join('；')}`).toBe(true);
    if (!plan.ok) return;
    expect(plan.name).toBe('导入用例');
    expect(plan.kind).toBe('website');
    expect(plan.files.map((f) => f.path)).toContain('design/document.json');
    // 代码进了计划但不会被写入：导入侧只数它（§16 投影）
    expect(manifest.entries.filter((e) => e.path.startsWith('code/')).length).toBe(1);
  });
});
