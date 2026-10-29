/**
 * ADR-0024 欠的那一寸：A 实例导出的那份 zip，在**另一个实例**上装回来。
 *
 * "另一个实例"在这里是三件事，缺一样这句就不成立：
 * - 另一个数据库（`nexus_two_instance_b`，**每一趟跑之前**重建并迁移，而且由 B 侧孩子自己数一遍它是空的）；
 * - 另一个存储目录（B 那个在每一趟之前**整个删掉**——不然字节可能是从共享磁盘上蹭来的，而不是从包里来的）；
 * - 另一个进程（孩子各自只拿到自己那一侧的 env，互相看不见对方的连接池）。
 * 两侧之间唯一的通道是磁盘上那一份 zip 字节，与作者手里拿的是同一个东西。
 *
 * 2026-10-29 这一片改了两次跑法都不包含的东西：
 *
 * ① **臂每趟都跑**。原先那条"包里没有 assets"的臂只在 `NEXUS_TWO_INSTANCE_SKIP_ASSETS=1` 时执行，
 *    而且执行完就 `process.exit(0)`——默认那一跑（也就是所有人实际跑的那一跑）从来没证过自己的判据会红。
 *    现在 A 侧只导出一次，五份**改过的包**由同一份好包剪出来，各自导进一份全新的 B，
 *    父进程要求**点名的那几条判据真的变红**，同时要求其余该绿的照旧绿：
 *    一条把一切都弄红的臂什么也不证明（与 `docs/EVALUATION.md` 臂表同一口径）。
 *
 * ② **走 storyboard 与 character 两层**。那七条判据是 2026-10-04 写的，比 `import.ts` 里分镜与角色
 *    那两段换号代码更早；那两层今天只被 vitest 用例证过，没被"另一个实例"证过。
 *
 * ③ **三趟探针**：臂只能红掉"B 侧读回来什么"那一串判据，`B_EMPTY_BEFORE_IMPORT` /
 *    `A_UNCHANGED_AFTER_EXPORT` / `B_OWNED_BY_B_USER` 这三条臂红不到它们（各自的原因见
 *    `docs/EVALUATION.md` 第二十一片）。每一趟只动一个变量，各自点名那一条必须红、其余 19 条必须照旧绿。
 *    探针 P3 就是这么抓到 `domain/projects.ts` 里 `isSlugConflict` 在 cause 链走到头时自己抛
 *    TypeError、把库里那句外键违例换成一句与病因无关的话。
 *
 * 用法：`npm run two:instance`。每条判据打一行 `verdict <名>: <值>`，任何一条不对就非零退出；
 * 全部判据（主跑 + 五趟臂 + 三趟探针的逐条读数）另落一份 `.scratch/two-instance/verdicts.txt`。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { createNode } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';
import type { Storyboard } from '@nexus/video-model';
import type { Character } from '@nexus/world-model';
import type { NexusManifest } from '../apps/web/src/server/domain/export';
import type { ZipEntry } from '../apps/web/src/lib/zip';
// 值的 import 只允许出现在**孩子进程**里：那些模块自己用了 `@/…` 别名，父进程在仓库根下解析不到，
// 而且父进程本来也不该连库——它只负责建库、删存储目录、spawn 孩子、比对报告。
// 所以这里全是 `import type`（编译后就擦掉，运行时一个字都不读），运行时用 load() 里的动态 import。
type DomainProjects = typeof import('../apps/web/src/server/domain/projects');
type DomainAssets = typeof import('../apps/web/src/server/domain/assets');
type DomainExport = typeof import('../apps/web/src/server/domain/export');
type DomainImport = typeof import('../apps/web/src/server/domain/import');
type DomainDb = typeof import('../apps/web/src/server/db/client');
type DomainSchema = typeof import('../apps/web/src/server/db/schema');
type DomainCharacters = typeof import('../apps/web/src/server/domain/characters');
type DomainStoryboards = typeof import('../apps/web/src/server/domain/storyboards');

interface Modules {
  projects: DomainProjects;
  assets: DomainAssets;
  exporter: DomainExport;
  importer: DomainImport;
  db: DomainDb;
  schema: DomainSchema;
  characters: DomainCharacters;
  storyboards: DomainStoryboards;
}

/** 只有拿到 role 的孩子进程才走到这里。顶层一个 app 模块都不 import，理由见上面那段。 */
async function load(): Promise<Modules> {
  return {
    projects: await import('../apps/web/src/server/domain/projects'),
    assets: await import('../apps/web/src/server/domain/assets'),
    exporter: await import('../apps/web/src/server/domain/export'),
    importer: await import('../apps/web/src/server/domain/import'),
    db: await import('../apps/web/src/server/db/client'),
    schema: await import('../apps/web/src/server/db/schema'),
    characters: await import('../apps/web/src/server/domain/characters'),
    storyboards: await import('../apps/web/src/server/domain/storyboards'),
  };
}

const ROOT = resolve(import.meta.dirname, '..');
/** apps/web 的模块用了 `@/…` 别名；tsx 只认这个 tsconfig，仓库根下没有。 */
const WEB_TSCONFIG = resolve(ROOT, 'apps/web/tsconfig.json');
const WORK = resolve(ROOT, '.scratch/two-instance');
const ZIP_PATH = resolve(WORK, 'instance-a-export.zip');

const URL_A = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';
// 只换 pathname：用正则切连接串最后一段会把 `//user:pass@host:port` 那一段也吃掉（实测造出一个
// hostname 是库名的连接串）。URL 对象改的就是那一段，别的都不动。
const URL_B = (() => {
  const url = new URL(URL_A);
  url.pathname = '/nexus_two_instance_b';
  return url.toString();
})();
const STORAGE_A = resolve(WORK, 'storage-a');
const STORAGE_B = resolve(WORK, 'storage-b');
/** 探针 P1 专用：库是主跑留下的那一份**非空**库，存储目录却换新的一份——不然"目录里两张 PNG"会替这条判据说话 */
const STORAGE_B_PROBE = resolve(WORK, 'storage-b-probe');

/** 五趟臂的名字。孩子进程与父进程共用这一份清单：臂的**执行**在孩子侧，臂的**判读**在父侧。 */
const ARM_NAMES = ['no-design', 'no-assets', 'skip-storyboard', 'skip-character', 'foreign-asset-id'] as const;
type ArmName = (typeof ARM_NAMES)[number];

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * 文档摘要：只取"作者看得见的东西"，并且把 uuid 归一掉。
 *
 * 归一 uuid 不是放宽判据，恰恰是这一片要测的那件事：页面、节点、组件、资产的 id 都会换号
 * （不换号在同一个实例里就是撞主键）。所以"图还在"要看的是**填充的形状**与字节的哈希，
 * 而不是填充里那个 id——把 id 算进摘要，正确的换号反而会被判成"文档变了"。
 */
function digestOf(document: DesignDocument): string {
  const pages = document.pages
    .map((page) => ({
      name: page.name,
      width: page.width,
      height: page.height,
      nodes: Object.values(page.nodes)
        .map((node) =>
          [node.type, node.name, node.text ?? '', (node.children ?? []).length, norm(node.style?.fills ?? null)].join('|'),
        )
        .sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify({
    name: document.name,
    pageCount: pages.length,
    pages,
    components: Object.keys(document.components ?? {}).length,
    tokens: Object.keys(document.tokens ?? {}).length,
  });
}

/** 把 uuid 折成 `<id>`：这一片里 id 换号是正确行为，不是内容差异 */
function norm(value: unknown): string {
  return JSON.stringify(value).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>');
}

/**
 * 文档的**节点**引用到的资产 id。与 `import.ts` 里那个同名函数同一口径：
 * 不含 `document.assets` 那一栏——它是载入时从项目自己的行水合出来的，不是包里的引用。
 * 这里自己走一遍而不是借那个私有函数：判据要独立于被测代码，否则"两边都漏"就查不出来。
 */
function collectAssetRefs(document: DesignDocument): string[] {
  const ids = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'assetId' && typeof child === 'string') ids.add(child);
        else walk(child);
      }
    }
  };
  walk(document.pages);
  walk(document.components);
  return [...ids];
}

interface StoryboardSnap {
  /** 库里那一行的 uuid（`loadStoryboard` 用它覆盖文档自带的那个临时 id） */
  rowId: string;
  /** 只看文案与顺序：镜头 id、prompt、时长、机位、转场、标题、来源那句话、notes——引用字段一律不算 */
  textDigest: string;
  refAssetIds: string[];
  refCharacterIds: string[];
}

interface CharacterSnap {
  id: string;
  /** 档案的文案部分；`visualIdentity.referenceAssetId` 单独走引用那条判据 */
  profileDigest: string;
  refAssetId: string | null;
}

interface ReceiptSnap {
  counts: { design: number; assets: number; storyboard: number; character: number };
  assetFailures: { path: string; reason: string }[];
  storyboardNotes: string[];
  characterNotes: string[];
  codeFilesIgnored: number;
  /** B 侧整包拒收时那一句；null = 收下了 */
  refusal: string | null;
}

interface BundleSnap {
  parts: string[];
  assetRefIds: string[];
  bytes: number;
  entryCount: number;
}

/** 孩子进程交给父进程的那一份读数。臂那几趟数据不全（拒收 / 少一层），所以字段大多是可空的。 */
interface Snapshot {
  userId: string;
  projectId: string;
  digest: string;
  assetIds: string[];
  assetSha: string | null;
  assetCount: number;
  docRefAssetIds: string[];
  characters: CharacterSnap[];
  storyboard: StoryboardSnap | null;
  blankness?: Record<string, number>;
  receipt?: ReceiptSnap;
  bundle?: BundleSnap;
  note?: string;
}

function storySnap(document: Storyboard): StoryboardSnap {
  const refs = (value: string | undefined): string[] => (value ? [value] : []);
  return {
    rowId: document.id,
    textDigest: norm({
      title: document.title,
      source: { arrow: document.source.arrow, prompt: document.source.prompt },
      shots: document.shots.map((shot) => ({
        id: shot.id,
        prompt: shot.prompt,
        durationMs: shot.durationMs,
        camera: shot.camera,
        transition: shot.transition,
      })),
      notes: document.notes,
    }),
    // 顺序就是"第 1 镜的参考帧、第 1 镜的成片、…、来源的参考帧"，A/B 两侧同一拼法 ⇒ 按下标对齐才有意义
    refAssetIds: [
      ...document.shots.flatMap((shot) => [...refs(shot.referenceAssetId), ...refs(shot.videoAssetId)]),
      ...refs(document.source.referenceAssetId),
    ],
    refCharacterIds: [
      ...document.shots.flatMap((shot) => refs(shot.characterId)),
      ...refs(document.source.characterId),
    ],
  };
}

function characterSnap(character: Character): CharacterSnap {
  const { visualIdentity, ...rest } = character.profile;
  return {
    id: character.id,
    profileDigest: norm({ ...rest, visualIdentity: { ...visualIdentity, referenceAssetId: undefined } }),
    refAssetId: visualIdentity?.referenceAssetId ?? null,
  };
}

/** 空到没边的那一份：孩子进程连项目都没有（整包被拒）时用它，判据会逐条红而不是脚本崩 */
function emptySnapshot(userId: string): Snapshot {
  return {
    userId,
    projectId: '',
    digest: '',
    assetIds: [],
    assetSha: null,
    assetCount: 0,
    docRefAssetIds: [],
    characters: [],
    storyboard: null,
  };
}

const write = (name: string, value: unknown): void => writeFileSync(resolve(WORK, name), JSON.stringify(value, null, 2));

/** 一张 4x3 的 PNG：与集成用例同一份构造（摄取门按文件头判 PNG，见 docs/SECURITY.md） */
function makePng(seed = 7): Uint8Array {
  const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);
  const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const chunk = (type: string, data: number[]) => [...enc(type), ...data, 0, 0, 0, 0];
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13),
    ...chunk('IHDR', [...be32(4), ...be32(3), 8, 6, 0, 0, 0]),
    ...be32(5),
    ...chunk('IDAT', [seed, 9, 3, 1, 4]),
    ...be32(0),
    ...chunk('IEND', []),
  ]);
}

async function newUser(m: Modules, handle: string): Promise<string> {
  const stamp = `${handle}-${Date.now().toString(36)}`;
  const rows = await m.db
    .getDb()
    .insert(m.schema.users)
    .values({ displayName: `两实例 ${handle}`, email: `${stamp}@nexus.test`, handle: stamp.slice(0, 30) })
    .returning({ id: m.schema.users.id });
  return rows[0]!.id;
}

/**
 * "干净实例"这句话此前只是**建库那一侧**做的动作，没有人量过。
 * 这里在孩子进程导入之前数一遍：判据 `B_EMPTY_BEFORE_IMPORT` 要的是这个数，不是父进程的意图。
 */
async function blankness(m: Modules): Promise<Record<string, number>> {
  const db = m.db.getDb();
  const count = async (table: PgTable): Promise<number> => {
    const rows = await db.select({ n: sql<number>`count(*)::int` }).from(table);
    return Number(rows[0]?.n ?? -1);
  };
  return {
    projects: await count(m.schema.projects),
    users: await count(m.schema.users),
    assets: await count(m.schema.assets),
    characters: await count(m.schema.characters),
    storyboards: await count(m.schema.storyboards),
  };
}

async function snapshotOf(m: Modules, projectId: string, userId: string): Promise<Snapshot> {
  const document = await m.projects.loadDocument(projectId);
  if (!document) throw new Error(`项目 ${projectId} 的设计文档读不出来，这一趟失去意义`);
  const rows = await m.assets.listProjectAssets(projectId);
  let assetSha: string | null = null;
  if (rows.length === 1) {
    const file = await m.assets.openAssetFile(rows[0]!.id);
    assetSha = file ? sha(file.bytes) : null;
  }
  const { items } = await m.characters.listCharacters(projectId);
  const loaded = await m.storyboards.loadStoryboard(projectId);
  return {
    userId,
    projectId,
    digest: digestOf(document),
    assetIds: rows.map((row) => row.id),
    assetSha,
    assetCount: rows.length,
    docRefAssetIds: collectAssetRefs(document),
    characters: items.map(characterSnap),
    storyboard: loaded?.ok ? storySnap(loaded.document) : null,
  };
}

/** A 侧：建项目 → 传一张图 → 画到节点上 → 建一位角色（参考图用那张图）→ 写一份分镜（引用角色与那张图）→ 导五份 part */
async function roleExport(): Promise<Snapshot> {
  const m = await load();
  const userId = await newUser(m, 'a');
  const projectId = (await m.projects.createProject(userId, { name: '两实例往返', kind: 'website' })).id;
  const uploaded = await m.assets.uploadImageAsset(projectId, {
    data: makePng(),
    filename: '封面.png',
    createdById: userId,
    source: 'upload',
  });
  if (!uploaded.ok) throw new Error(`A 侧素材上传失败：${uploaded.reason}`);
  const document = (await m.projects.loadDocument(projectId)) as DesignDocument;
  const page = document.pages[0]!;
  const frame = createNode({ type: 'frame', name: 'cover-image', parentId: page.rootId });
  frame.style.fills = [{ kind: 'image', assetId: uploaded.asset.id, fit: 'cover' }];
  page.nodes[frame.id] = frame;
  page.nodes[page.rootId]!.children = [...page.nodes[page.rootId]!.children, frame.id];
  await m.projects.saveDocument(projectId, document);

  // 角色：先建档（只有名字），再整份写档案——参考图那条指向 A 侧这张资产的行，
  // 它是导入侧 `remapCharacterProfile` 唯一会改写的字段，不留下来这一层就没被走过
  const built = await m.characters.createProjectCharacter(projectId, userId, { name: '守夜人' });
  if (!built.ok) throw new Error(`A 侧角色建档失败：${built.reason}`);
  const filled = await m.characters.updateCharacterProfile(built.character.id, projectId, {
    ...built.character.profile,
    appearance: '灰蓝风衣，左颊一道旧疤',
    personality: '话少，先观察再动手',
    backstory: '守了七年灯塔',
    goals: ['把最后一班灯守完'],
    fears: ['海面上没有灯的夜'],
    voice: { register: '低沉', pace: '慢', catchphrases: ['还有灯'], notes: '' },
    visualIdentity: {
      palette: ['#3b6ea5', '#111111'],
      silhouette: '长外套',
      motifs: ['灯塔'],
      referenceAssetId: uploaded.asset.id,
    },
    identity: '左颊旧疤加灰蓝风衣',
    style: '水彩',
    clothing: '灰蓝风衣',
    traits: ['沉默', '守夜'],
  });
  if (!filled.ok) throw new Error(`A 侧角色档案写入失败：${filled.reason}`);

  // 分镜：三镜，第一镜挂参考帧、第二镜挂角色、第三镜什么都不挂；来源那格两个引用都挂。
  // 这一份是手写的（不是投影出来的），因为要证的是**引用换号**，镜头怎么来的与这一片无关。
  const saved = await m.storyboards.saveStoryboard(projectId, userId, {
    document: {
      id: 'storyboard-drill',
      title: '灯塔夜班',
      source: {
        arrow: 'character-to-scene',
        prompt: '守夜人在灯下等一艘没回来的船',
        characterId: filled.character.id,
        referenceAssetId: uploaded.asset.id,
      },
      shots: [
        { id: 'shot-1-wide', prompt: '海面，远处的灯塔', durationMs: 4000, camera: 'wide', transition: 'cut', referenceAssetId: uploaded.asset.id },
        { id: 'shot-2-close', prompt: '守夜人转身', durationMs: 3000, camera: 'close', transition: 'fade', characterId: filled.character.id },
        { id: 'shot-3-detail', prompt: '灯亮起来', durationMs: 2500, camera: 'detail', transition: 'cut' },
      ],
      notes: ['演练手写的分镜：三镜，两条引用分别指向本项目的资产与角色'],
    },
  });
  if (!saved.ok) throw new Error(`A 侧分镜保存失败：${saved.reason}`);

  const before = await snapshotOf(m, projectId, userId);
  const bytes = await m.exporter.buildProjectExport(projectId, userId, [...m.exporter.EXPORT_PARTS]);
  if (!bytes) throw new Error('A 侧导出返回 null：项目不属于自己或者文档读不到');
  writeFileSync(ZIP_PATH, Buffer.from(bytes.bytes));
  const report: Snapshot = { ...before, note: `zip ${bytes.bytes.length} 字节，missingAssets ${bytes.missingAssets.length}` };
  write('a-export.json', report);
  console.log(
    `role export ok: ${bytes.bytes.length} 字节，parts=${Object.entries(bytes.counts).map(([k, v]) => `${k}=${v}`).join(' ')}`,
  );
  return report;
}

/** 从**同一份好包**剪出一趟臂要的那一份包；改完落盘，导入用的是从盘上读回来的字节，不是内存里的那份。 */
async function spliceBundle(arm: ArmName): Promise<string> {
  const m = await load();
  const { readZip, readZipText } = await import('../apps/web/src/lib/zip-read');
  const { zipStore, textEntry } = await import('../apps/web/src/lib/zip');
  const zipPath = resolve(WORK, `arm-${arm}.zip`);
  const files = readZip(new Uint8Array(readFileSync(ZIP_PATH)));
  const manifestText = readZipText(files, m.importer.MANIFEST_PATH);
  if (manifestText === null) throw new Error('好包里没有清单，剪不动');
  const manifest = JSON.parse(manifestText) as NexusManifest;

  const prefix =
    arm === 'no-design'
      ? 'design/'
      : arm === 'no-assets'
        ? 'assets/'
        : arm === 'skip-storyboard'
          ? 'storyboard/'
          : arm === 'skip-character'
            ? 'character/'
            : null;
  const dropped = new Set(files.filter((f) => !f.directory && prefix !== null && f.path.startsWith(prefix)).map((f) => f.path));
  const kept: ZipEntry[] = files
    .filter((f) => !f.directory && f.path !== m.importer.MANIFEST_PATH && !dropped.has(f.path))
    .map((f) => ({ path: f.path, contents: f.contents }));
  const droppedPart =
    arm === 'no-design'
      ? 'design'
      : arm === 'no-assets'
        ? 'assets'
        : arm === 'skip-storyboard'
          ? 'storyboard'
          : arm === 'skip-character'
            ? 'character'
            : null;
  let next: NexusManifest = {
    ...manifest,
    parts: droppedPart === null ? manifest.parts : manifest.parts.filter((p) => p !== droppedPart),
    entries: manifest.entries.filter((e) => !dropped.has(e.path)),
    assetRefs: arm === 'no-assets' ? [] : manifest.assetRefs,
  };
  if (arm === 'foreign-asset-id') {
    // 字节一个不动，只把"这些字节在模型里是谁"那一条改成一条本实例从来没收过的 id：
    // 这份包在清单层面完全自洽（entries 与 CRC 都对得上），红的只能是对引用完整性的判据
    if (next.assetRefs.length === 0) throw new Error('好包里一条 assetRefs 都没有，剪不出这一趟臂');
    next = { ...next, assetRefs: next.assetRefs.map((ref) => ({ ...ref, assetId: crypto.randomUUID() })) };
  }
  const entries: ZipEntry[] = [textEntry(m.importer.MANIFEST_PATH, JSON.stringify(next, null, 2)), ...kept];
  const spliced = zipStore(entries);
  writeFileSync(zipPath, Buffer.from(spliced));
  console.log(
    `role splice ok: ${arm} → ${spliced.length} 字节，parts=${next.parts.join(',')}，丢掉 ${dropped.size} 个条目，assetRefs ${next.assetRefs.length} 条`,
  );
  return zipPath;
}

/** B 侧（主跑与五趟臂共用）：数空 → 建档 → 只吃盘上那份 zip → 把读数原样交给父进程判
 *
 * `ownerOverride` 只给探针用：把 A 侧那个用户 id 直接递进来，看这一片是靠判据还是靠库里的外键挡住跨实例归属。
 */
async function roleB(zipPath: string, outFile: string, ownerOverride?: string): Promise<Snapshot> {
  const m = await load();
  const blank = await blankness(m);
  const userId = ownerOverride ?? (await newUser(m, 'b'));
  const { readZip, readZipText } = await import('../apps/web/src/lib/zip-read');
  const bytes = new Uint8Array(readFileSync(zipPath));
  const files = readZip(bytes);
  const manifestText = readZipText(files, m.importer.MANIFEST_PATH);
  if (manifestText === null) throw new Error(`${zipPath} 里没有清单，这一趟失去意义`);
  const manifest = JSON.parse(manifestText) as NexusManifest;
  const bundle: BundleSnap = {
    parts: [...manifest.parts],
    assetRefIds: manifest.assetRefs.map((ref) => ref.assetId),
    bytes: bytes.length,
    entryCount: files.filter((f) => !f.directory).length,
  };

  const rejected = (refusal: string): Snapshot => {
    const snap = emptySnapshot(userId);
    snap.blankness = blank;
    snap.bundle = bundle;
    snap.receipt = {
      counts: { design: 0, assets: 0, storyboard: 0, character: 0 },
      assetFailures: [],
      storyboardNotes: [],
      characterNotes: [],
      codeFilesIgnored: 0,
      refusal,
    };
    write(outFile, snap);
    return snap;
  };

  let outcome: Awaited<ReturnType<typeof m.importer.importProjectZip>>;
  try {
    outcome = await m.importer.importProjectZip(userId, bytes);
  } catch (error) {
    // 抛出也写报告：探针要的是"这一趟到底进没进库"，静默非零退出会让父进程判不了。
    // 顶层那句在 Drizzle 那里只是 "Failed query: …"，库给的原因在 cause 链上 ⇒ 把链一并抄进来，
    // 读数才说得出"是外键挡的"还是别的什么挡的。
    const chain: string[] = [];
    let cursor: unknown = error;
    for (let depth = 0; depth < 5 && cursor !== null && cursor !== undefined; depth += 1) {
      const e = cursor as { message?: unknown; code?: unknown };
      const code = typeof e.code === 'string' ? `[${e.code}] ` : '';
      // 每一层单独截，别把整条链截断——第一层是 Drizzle 那句很长的 "Failed query: …"，
      // 按整串截 400 会把第二层那个 [23503] 直接切掉（第一版就是这么红的）
      const text = (typeof e.message === 'string' ? e.message : Object.prototype.toString.call(cursor)).slice(0, 140);
      chain.push(`${code}${text}`);
      cursor = (cursor as { cause?: unknown }).cause;
    }
    const joined = chain.join(' ← ');
    const snap = rejected(`导入抛出：${joined}`);
    console.log(`role b 抛出：${joined}`);
    return snap;
  }
  const snap = emptySnapshot(userId);
  snap.blankness = blank;
  snap.bundle = bundle;
  if (!outcome.ok) {
    snap.receipt = {
      counts: { design: 0, assets: 0, storyboard: 0, character: 0 },
      assetFailures: [],
      storyboardNotes: [],
      characterNotes: [],
      codeFilesIgnored: 0,
      refusal: `${outcome.reason}｜${outcome.issues.join('；')}`,
    };
    write(outFile, snap);
    console.log(`role b ok (整包拒收): ${outcome.reason}`);
    return snap;
  }
  const filled = await snapshotOf(m, outcome.projectId, userId);
  const report: Snapshot = {
    ...filled,
    blankness: blank,
    bundle,
    receipt: {
      counts: outcome.counts,
      assetFailures: outcome.assetFailures,
      storyboardNotes: outcome.storyboardNotes,
      characterNotes: outcome.characterNotes,
      codeFilesIgnored: outcome.codeFilesIgnored,
      refusal: null,
    },
    note: `解压后 ${outcome.bytes.extracted} 字节，忽略代码文件 ${outcome.codeFilesIgnored} 个`,
  };
  write(outFile, report);
  console.log(
    `role b ok: 新项目 ${outcome.projectId.slice(0, 8)}，counts=${Object.entries(outcome.counts).map(([k, v]) => `${k}=${v}`).join(' ')}`,
  );
  return report;
}

/** 回到 A 侧再读一遍：导出这一趟不该动过源项目 */
async function roleVerify(): Promise<Snapshot> {
  const m = await load();
  const source = JSON.parse(readFileSync(resolve(WORK, 'a-export.json'), 'utf8')) as Snapshot;
  const report = await snapshotOf(m, source.projectId, source.userId);
  write('a-verify.json', report);
  console.log('role verify ok');
  return report;
}

/** 探针 P2：导出之后改一笔 A 自己的数据（删掉演练自己那位角色）。
 * `A_UNCHANGED_AFTER_EXPORT` 若从没红过就是空判据——这一趟把它该红的那次造出来。
 * 动的只是本脚本自己造的 A 项目，不碰仓库里任何别的项目。 */
async function roleMutateA(): Promise<void> {
  const m = await load();
  const source = JSON.parse(readFileSync(resolve(WORK, 'a-export.json'), 'utf8')) as Snapshot;
  const character = source.characters[0];
  if (!character) throw new Error('A 侧那份读数里没有角色，这一趟失去意义');
  const removed = await m.characters.deleteCharacter(character.id, source.projectId);
  console.log(`role probe ok: 删掉 A 项目 ${source.projectId.slice(0, 8)} 的角色 ${character.id.slice(0, 8)}，deleteCharacter 返回 ${removed}`);
}

const ROLE = process.argv[2];
if (ROLE === 'export' || ROLE === 'verify') {
  const report = ROLE === 'export' ? await roleExport() : await roleVerify();
  write(`done-${ROLE}.json`, report);
  process.exit(0);
}
if (ROLE === 'probe-mutate-a') {
  await roleMutateA();
  process.exit(0);
}
if (ROLE === 'import') {
  await roleB(ZIP_PATH, 'b-main.json');
  process.exit(0);
}
if (ROLE === 'probe-dirty-b') {
  // 不重建 B：拿主跑留下那份**非空**的库再导一次，看 `B_EMPTY_BEFORE_IMPORT` 会不会红
  await roleB(ZIP_PATH, 'b-probe-dirty-b.json');
  process.exit(0);
}
if (ROLE === 'probe-foreign-owner') {
  const owner = process.env.NEXUS_TWO_INSTANCE_FOREIGN_OWNER;
  if (!owner) throw new Error('这一趟要 NEXUS_TWO_INSTANCE_FOREIGN_OWNER（A 侧那个用户 id）');
  await roleB(ZIP_PATH, 'b-probe-foreign-owner.json', owner);
  process.exit(0);
}
if (ROLE === 'arm') {
  const arm = process.argv[3] as ArmName;
  if (!ARM_NAMES.includes(arm)) throw new Error(`不认识这一趟臂：${String(arm)}。认的是 ${ARM_NAMES.join(' / ')}`);
  await roleB(await spliceBundle(arm), `b-arm-${arm}.json`);
  process.exit(0);
}

// —— 以下是父进程 ——

const BLANK_TABLES = ['projects', 'users', 'assets', 'characters', 'storyboards'];

/**
 * `verdictsOf` 会吐出的判据名，逐条登记在这里。
 * 加一条判据却没在这儿登记 ⇒ 每一趟臂当场失败；这一份名册存在的意义就是"新的判据不能悄悄混进池子里没被测过"。
 * 每一趟臂与探针只点名"该红的那几条"，剩下的按定义必须照旧绿 ⇒ 这一趟是外科手术，不是全场塌方。
 */
const VERDICT_NAMES = [
  'B_EMPTY_BEFORE_IMPORT',
  'B_IS_NEW_PROJECT',
  'B_OWNED_BY_B_USER',
  'DOCUMENT_DIGEST_EQUAL',
  'B_ASSET_COUNT_ONE',
  'ASSET_BYTES_EQUAL',
  'NO_ASSET_FAILURES',
  'BUNDLE_ASSET_MAP_VALID',
  'DOC_REF_ASSET_OWNED',
  'B_STORAGE_IS_OWN_COPY',
  'STORYBOARD_ROW_CREATED',
  'STORYBOARD_TEXT_EQUAL',
  'STORYBOARD_REF_CONSERVED',
  'STORYBOARD_IS_B_OWN_ROW',
  'STORYBOARD_NOTES_CLEAN',
  'CHARACTER_COUNT_ONE',
  'CHARACTER_PROFILE_EQUAL',
  'CHARACTER_REF_CONSERVED',
  'CHARACTER_NOTES_CLEAN',
  'A_UNCHANGED_AFTER_EXPORT',
];

interface Arm {
  name: ArmName;
  /** 必须变红的判据：这一趟臂声称要证的那件事。红的一旦多出一条或少一条，这一趟就不算过 */
  expectRed: string[];
  /** 除判据之外还要成立的一件事，逐字打进读数里 */
  claim: string;
  extra: (b: Snapshot, a: Snapshot) => boolean;
}

const ARMS: Arm[] = [
  {
    name: 'no-design',
    // 整包拒收那一趟：每一条依赖"B 侧读回来的东西"的判据都要红——这一趟不指望是外科手术，
    // 它证的是"塌方只塌在 B 侧"：库还是空的、归属没变、A 那份一个字没动、包里的资产清单本身仍然自洽。
    expectRed: [
      'B_IS_NEW_PROJECT',
      'DOCUMENT_DIGEST_EQUAL',
      'B_ASSET_COUNT_ONE',
      'ASSET_BYTES_EQUAL',
      'NO_ASSET_FAILURES',
      'DOC_REF_ASSET_OWNED',
      'B_STORAGE_IS_OWN_COPY',
      'STORYBOARD_ROW_CREATED',
      'STORYBOARD_TEXT_EQUAL',
      'STORYBOARD_REF_CONSERVED',
      'STORYBOARD_IS_B_OWN_ROW',
      'STORYBOARD_NOTES_CLEAN',
      'CHARACTER_COUNT_ONE',
      'CHARACTER_PROFILE_EQUAL',
      'CHARACTER_REF_CONSERVED',
      'CHARACTER_NOTES_CLEAN',
    ],
    claim: '清单没声明 design ⇒ 整包拒收，一个字节都不落库；红只红在"B 侧读回来什么"这一侧——B 原本空不空、归属、包内清单自洽、A 未动那四条不受牵连',
    extra: (b) => (b.receipt?.refusal ?? '') !== '' && b.projectId === '' && Object.values(b.blankness ?? {}).every((n) => n === 0),
  },
  {
    name: 'no-assets',
    expectRed: [
      'B_ASSET_COUNT_ONE',
      'ASSET_BYTES_EQUAL',
      'NO_ASSET_FAILURES',
      'BUNDLE_ASSET_MAP_VALID',
      'DOC_REF_ASSET_OWNED',
      'B_STORAGE_IS_OWN_COPY',
      'STORYBOARD_REF_CONSERVED',
      'STORYBOARD_NOTES_CLEAN',
      'CHARACTER_REF_CONSERVED',
      'CHARACTER_NOTES_CLEAN',
    ],
    claim: '包里没有 assets 那一份 ⇒ 文档/分镜/角色三层仍然进库，红的只有"字节是谁"那一串；失败只来自引用断链，不来自字节没收下',
    extra: (b) => {
      const failures = b.receipt?.assetFailures ?? [];
      return failures.length > 0 && failures.every((f) => !f.path.startsWith('assets/'));
    },
  },
  {
    name: 'skip-storyboard',
    expectRed: ['STORYBOARD_ROW_CREATED', 'STORYBOARD_TEXT_EQUAL', 'STORYBOARD_REF_CONSERVED', 'STORYBOARD_IS_B_OWN_ROW', 'STORYBOARD_NOTES_CLEAN'],
    claim: '清单没声明 storyboard ⇒ 分镜整层不进库，而文案与角色一层不受影响',
    extra: (b) => !(b.bundle?.parts.includes('storyboard') ?? true) && b.characters.length === 1,
  },
  {
    name: 'skip-character',
    expectRed: ['CHARACTER_COUNT_ONE', 'CHARACTER_PROFILE_EQUAL', 'CHARACTER_REF_CONSERVED', 'STORYBOARD_REF_CONSERVED', 'STORYBOARD_NOTES_CLEAN'],
    claim: '少导 character 这一 part ⇒ 挂在镜头上的角色引用被剥掉（分镜文案照旧在，notes 里点名剥了哪一镜）',
    extra: (b) => !(b.bundle?.parts.includes('character') ?? true) && (b.receipt?.counts.storyboard ?? 0) === 1,
  },
  {
    name: 'foreign-asset-id',
    expectRed: [
      'NO_ASSET_FAILURES',
      'BUNDLE_ASSET_MAP_VALID',
      'DOC_REF_ASSET_OWNED',
      'STORYBOARD_REF_CONSERVED',
      'STORYBOARD_NOTES_CLEAN',
      'CHARACTER_REF_CONSERVED',
      'CHARACTER_NOTES_CLEAN',
    ],
    claim: '字节全在、CRC 全对，只有"字节是谁"那一条是假的 ⇒ 只有引用完整性那几条能红',
    extra: (b, a) => {
      const failures = b.receipt?.assetFailures ?? [];
      const forged = b.bundle?.assetRefIds ?? [];
      return (
        failures.length > 0 &&
        failures.every((f) => !f.path.startsWith('assets/')) &&
        forged.length === 1 &&
        !a.assetIds.includes(forged[0]!)
      );
    },
  },
];

mkdirSync(WORK, { recursive: true });
rmSync(STORAGE_B, { recursive: true, force: true });
mkdirSync(STORAGE_A, { recursive: true });
mkdirSync(STORAGE_B, { recursive: true });
rmSync(STORAGE_B_PROBE, { recursive: true, force: true });
mkdirSync(STORAGE_B_PROBE, { recursive: true });

const { spawnSync } = await import('node:child_process');
const script = import.meta.filename;

async function freshB(): Promise<void> {
  const admin = new URL(URL_A);
  admin.pathname = '/postgres';
  const adminSql = postgres(admin.toString(), { max: 1 });
  try {
    // 每一趟都重建：留着上一趟的行，"干净实例"就变成"同一个库再复制一份"（ADR-0024 明写不要的那种做法）。
    // 这个库是本脚本自己的产物（名字带 two-instance），与本机其它项目的库无关。
    await adminSql.unsafe('drop database if exists nexus_two_instance_b with (force)');
    await adminSql.unsafe('create database nexus_two_instance_b');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) throw error;
  } finally {
    await adminSql.end({ timeout: 1 });
  }
  rmSync(STORAGE_B, { recursive: true, force: true });
  mkdirSync(STORAGE_B, { recursive: true });

  const child = spawnSync(process.execPath, ['--import', 'tsx', resolve(ROOT, 'scripts/db-migrate.mts')], {
    cwd: ROOT,
    env: { ...process.env, NEXUS_DATABASE_URL: URL_B },
    encoding: 'utf8',
  });
  const out = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  writeFileSync(resolve(WORK, 'log-migrate-b.txt'), out);
  if (child.status !== 0) throw new Error(`B 侧迁移失败（status=${child.status}）：${out.slice(-1200)}`);
  // B 侧必须是**迁移过的空库**：没建表就导入，红的是连接错误而不是这一片的判据
  console.log(`[fresh B] ${/done: (.*)/.exec(out)?.[1] ?? out.trim().split(/\r?\n/).slice(-1)[0]}`);
}

type Role = 'export' | 'import' | 'verify' | 'arm' | 'probe-dirty-b' | 'probe-foreign-owner' | 'probe-mutate-a';

function run(
  role: Role,
  url: string,
  storageDir: string,
  arm?: ArmName,
  extraEnv?: Record<string, string>,
): { status: number; out: string } {
  const argv = arm ? [role, arm] : [role];
  const child = spawnSync(process.execPath, ['--import', 'tsx', script, ...argv], {
    cwd: resolve(ROOT, 'apps/web'),
    env: {
      ...process.env,
      NEXUS_DATABASE_URL: url,
      NEXUS_STORAGE_LOCAL_DIR: storageDir,
      TSX_TSCONFIG_PATH: WEB_TSCONFIG,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
  const out = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  const logName = arm ? `log-arm-${arm}` : `log-${role}`;
  writeFileSync(resolve(WORK, `${logName}.txt`), out);
  // 臂与探针那几趟允许孩子非零退出：那几趟本来就预期出问题，报告在不在盘上由父进程判
  if (child.status !== 0 && arm === undefined && !role.startsWith('probe')) {
    throw new Error(`${role} 这一趟非零退出（status=${child.status}），日志见 .scratch/two-instance/${logName}.txt：\n${out.slice(-1500)}`);
  }
  const last = out.trim().split(/\r?\n/).filter((l) => l.startsWith('role ')).slice(-1)[0] ?? '';
  console.log(`[${arm ? `arm ${arm}` : role}] ${last}`);
  return { status: child.status ?? 0, out };
}

/**
 * 存储目录里那一份真实的文件。这一格原本打的是 `b.note !== undefined`——那什么也没测：
 * 孩子进程总会写 note，哪怕 B 侧根本没落过盘。改成父进程自己数目录、自己哈希文件字节：
 * B 的存储目录是每趟跑前删掉重建的，所以那里出现一张对得上号的 PNG，就只可能是从包里摄取的。
 */
function pngFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .map((entry) => String(entry).replace(/\\/g, '/'))
      .filter((entry) => entry.endsWith('.png'))
      .sort();
  } catch {
    return [];
  }
}

type Verdict = [string, boolean, string];

/** bPngs 与它的 sha 都从同一个目录里数出来——把清单当参数、把根目录写死会让两者来自不同的地方（探针 P1 换目录时就是这么崩的） */
function verdictsOf(a: Snapshot, b: Snapshot, a2: Snapshot, bStorage: string, aPngs: string[]): Verdict[] {
  const bPngs = pngFiles(bStorage);
  const bPngSha = bPngs.length === 1 ? sha(readFileSync(resolve(bStorage, bPngs[0]!))) : null;
  const receipt = b.receipt;
  const counts = receipt?.counts ?? { design: 0, assets: 0, storyboard: 0, character: 0 };
  const failures = receipt?.assetFailures ?? [];
  const blank = b.blankness ?? {};
  const aSb = a.storyboard;
  const bSb = b.storyboard;
  const aCh = a.characters[0];
  const bCh = b.characters[0];
  // 整包被拒时"没有失败记录"不是好消息：那是什么都没试。这三条判据必须先承认真收下了，才谈得上干净
  const accepted = receipt !== undefined && receipt.refusal === null && b.projectId !== '';
  return [
    [
      'B_EMPTY_BEFORE_IMPORT',
      BLANK_TABLES.every((table) => blank[table] === 0),
      `${BLANK_TABLES.map((t) => `${t}=${blank[t] ?? '未数'}`).join(' ')}`,
    ],
    [
      'B_IS_NEW_PROJECT',
      b.projectId !== '' && b.projectId !== a.projectId,
      `A=${a.projectId.slice(0, 8)} B=${b.projectId.slice(0, 8)}`,
    ],
    ['B_OWNED_BY_B_USER', b.userId !== '' && b.userId !== a.userId, `A 用户 ${a.userId.slice(0, 8)}，B 用户 ${b.userId.slice(0, 8)}`],
    ['DOCUMENT_DIGEST_EQUAL', b.digest !== '' && b.digest === a.digest, `A ${a.digest.length} 字 / B ${b.digest.length} 字`],
    [
      'B_ASSET_COUNT_ONE',
      b.assetCount === 1 && counts.assets === 1,
      `库里行数 ${b.assetCount}，counts.assets=${counts.assets}`,
    ],
    ['ASSET_BYTES_EQUAL', b.assetSha !== null && b.assetSha === a.assetSha, `A ${(a.assetSha ?? '').slice(0, 12)} B ${(b.assetSha ?? '').slice(0, 12)}`],
    [
      'NO_ASSET_FAILURES',
      accepted && failures.length === 0,
      failures.length ? `失败 ${failures.length} 条：${failures.map((f) => f.path).join(' | ')}` : '一条也没有',
    ],
    [
      'BUNDLE_ASSET_MAP_VALID',
      (b.bundle?.assetRefIds.length ?? 0) === a.assetIds.length && (b.bundle?.assetRefIds ?? []).every((id) => a.assetIds.includes(id)),
      `包里 assetRefs ${b.bundle?.assetRefIds.length ?? 0} 条 ${JSON.stringify((b.bundle?.assetRefIds ?? []).map((id) => id.slice(0, 8)))}，A 侧资产行 ${JSON.stringify(a.assetIds.map((id) => id.slice(0, 8)))}`,
    ],
    [
      'DOC_REF_ASSET_OWNED',
      a.docRefAssetIds.length === 1 &&
        b.docRefAssetIds.length === 1 &&
        b.assetIds.includes(b.docRefAssetIds[0]!) &&
        b.docRefAssetIds[0] !== a.docRefAssetIds[0],
      `画布上那张图：A 引用 ${(a.docRefAssetIds[0] ?? '').slice(0, 8)}，B 引用 ${(b.docRefAssetIds[0] ?? '').slice(0, 8)}，B 自己的资产行 ${JSON.stringify(b.assetIds.map((id) => id.slice(0, 8)))}`,
    ],
    [
      'B_STORAGE_IS_OWN_COPY',
      bPngs.length === 1 && bPngSha === b.assetSha && !aPngs.includes(bPngs[0]!),
      `B 侧 ${JSON.stringify(bPngs)}，sha ${bPngSha?.slice(0, 12)}；A 侧 ${aPngs.length} 张，路径无一重合`,
    ],
    [
      'STORYBOARD_ROW_CREATED',
      bSb !== null && counts.storyboard === 1,
      `counts.storyboard=${counts.storyboard}，B 侧读回 ${bSb === null ? '没有分镜' : `${bSb.textDigest.length} 字摘要`}`,
    ],
    [
      'STORYBOARD_TEXT_EQUAL',
      aSb !== null && bSb !== null && aSb.textDigest === bSb.textDigest,
      `A ${aSb?.textDigest.length ?? 0} 字 / B ${bSb?.textDigest.length ?? 0} 字（标题、来源那句话、三镜的 id·文案·时长·机位·转场、notes）`,
    ],
    [
      'STORYBOARD_REF_CONSERVED',
      aSb !== null &&
        bSb !== null &&
        aSb.refAssetIds.length === bSb.refAssetIds.length &&
        aSb.refCharacterIds.length === bSb.refCharacterIds.length &&
        bSb.refAssetIds.every((id) => b.assetIds.includes(id)) &&
        bSb.refCharacterIds.every((id) => b.characters.some((c) => c.id === id)) &&
        bSb.refAssetIds.every((id, index) => id !== aSb.refAssetIds[index]) &&
        bSb.refCharacterIds.every((id, index) => id !== aSb.refCharacterIds[index]),
      `参考帧/成片引用 A ${aSb?.refAssetIds.length ?? 0} 条、B ${bSb?.refAssetIds.length ?? 0} 条；角色引用 A ${aSb?.refCharacterIds.length ?? 0} 条、B ${bSb?.refCharacterIds.length ?? 0} 条`,
    ],
    [
      'STORYBOARD_IS_B_OWN_ROW',
      aSb !== null && bSb !== null && bSb.rowId !== aSb.rowId,
      `A 的分镜行 ${(aSb?.rowId ?? '').slice(0, 8)}，B 的分镜行 ${(bSb?.rowId ?? '').slice(0, 8)}`,
    ],
    [
      'STORYBOARD_NOTES_CLEAN',
      accepted && (receipt?.storyboardNotes.length ?? 0) === 1 && (receipt?.storyboardNotes[0] ?? '').includes(aSb?.rowId ?? '-'),
      `notes ${receipt?.storyboardNotes.length ?? 0} 条（干净的那一份只剩"已入库并且点名两侧行 id"那一条）`,
    ],
    ['CHARACTER_COUNT_ONE', counts.character === 1 && b.characters.length === 1, `counts.character=${counts.character}，B 侧角色行 ${b.characters.length} 位`],
    [
      'CHARACTER_PROFILE_EQUAL',
      aCh !== undefined && bCh !== undefined && aCh.profileDigest === bCh.profileDigest,
      `档案文案摘要 A ${aCh?.profileDigest.length ?? 0} 字 / B ${bCh?.profileDigest.length ?? 0} 字（参考图那格不算，它走引用那条）`,
    ],
    [
      'CHARACTER_REF_CONSERVED',
      aCh?.refAssetId != null && bCh?.refAssetId != null && b.assetIds.includes(bCh.refAssetId) && bCh.refAssetId !== aCh.refAssetId,
      `参考图：A ${(aCh?.refAssetId ?? '').slice(0, 8)}，B ${(bCh?.refAssetId ?? '置空').slice(0, 8)}`,
    ],
    ['CHARACTER_NOTES_CLEAN', accepted && (receipt?.characterNotes.length ?? -1) === 0, `notes ${receipt?.characterNotes.length ?? '未收'} 条`],
    [
      'A_UNCHANGED_AFTER_EXPORT',
      a2.digest === a.digest &&
        a2.assetSha === a.assetSha &&
        a2.storyboard?.textDigest === a.storyboard?.textDigest &&
        a2.characters[0]?.profileDigest === a.characters[0]?.profileDigest,
      `导出后又读了一遍 A：文档 ${a2.digest.length} 字，分镜 ${(a2.storyboard?.textDigest ?? '').length} 字，档案 ${(a2.characters[0]?.profileDigest ?? '').length} 字`,
    ],
  ];
}

function read(name: string): Snapshot | null {
  const path = resolve(WORK, name);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Snapshot) : null;
}

const verdictLog: string[] = [];
const record = (pass: string, rows: Verdict[]): void => {
  for (const [name, ok, detail] of rows) verdictLog.push(`${pass}\t${name}\t${ok ? 'PASS' : 'FAIL'}\t${detail}`);
};

run('export', URL_A, STORAGE_A);
run('verify', URL_A, STORAGE_A);
const a = read('a-export.json');
const a2 = read('a-verify.json');
if (!a || !a2) throw new Error('A 侧的两份读数没落盘（a-export.json / a-verify.json）');
const aPngs = pngFiles(STORAGE_A);

await freshB();
run('import', URL_B, STORAGE_B);
const b = read('b-main.json');
if (!b) throw new Error('B 侧主跑没写出 b-main.json');
if (b.receipt?.refusal) console.log(`B 侧整包拒收：${b.receipt.refusal}`);
const mainRows = verdictsOf(a, b, a2, STORAGE_B, aPngs);
for (const [name, ok, detail] of mainRows) console.log(`verdict ${name}: ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
record('main', mainRows);
const failed = mainRows.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`主跑判据没过：${failed.join(', ')}`);

// —— 每一趟臂/探针共用的判定 ——
// 点名该红的必须全红，其余每一条必须照旧绿：红多出一条就是"动的比声称的多"，少一条就是判据没牙。
const passFailures: string[] = [];
/** 每一趟臂/探针的最后结果，summary 那一句里的数目从这里数出来，不是手写的 */
const passRuns: { kind: 'arm' | 'probe'; line: string; ok: boolean }[] = [];

interface PassCheck {
  /** 打印前缀，如 `arm no-assets` / `probe dirty-b` */
  label: string;
  kind: 'arm' | 'probe';
  /** 这一趟自己的判据名 */
  line: string;
  expectRed: string[];
  claim: string;
  rows: Verdict[];
  /** 除判据之外还要成立的那件事，由这一趟自己算 */
  extraOk: boolean;
  refusal?: string | null;
}

function assertPass(pass: PassCheck): void {
  const { label, kind, line, expectRed, claim, rows, extraOk, refusal } = pass;
  const byName = new Map(rows.map(([name, ok]) => [name, ok]));
  const listed = rows.map(([name]) => name);
  const drift = [...listed.filter((name) => !VERDICT_NAMES.includes(name)), ...VERDICT_NAMES.filter((name) => !byName.has(name))];
  const unknownRed = expectRed.filter((name) => !VERDICT_NAMES.includes(name));
  const stillGreen = expectRed.filter((name) => byName.get(name) !== false);
  const redNames = listed.filter((name) => byName.get(name) === false);
  const unexpected = redNames.filter((name) => !expectRed.includes(name));
  const ok = drift.length === 0 && unknownRed.length === 0 && stillGreen.length === 0 && unexpected.length === 0 && extraOk;
  console.log(
    `verdict ${line}: ${ok ? 'PASS' : 'FAIL'} — 点名该红的 ${expectRed.length} 条全红${stillGreen.length ? `（没红的：${stillGreen.join(', ')}）` : ''}；` +
      `其余 ${rows.length - redNames.length} 条照旧绿${unexpected.length ? `（没点名却红了：${unexpected.join(', ')}）` : ''}；` +
      `判据名册${drift.length === 0 ? `对得上（${VERDICT_NAMES.length} 条）` : `对不上：${drift.join(', ')}`}；${claim}${extraOk ? '（成立）' : '（不成立）'}` +
      `${refusal ? `｜整包拒收：${refusal}` : ''}`,
  );
  console.log(`  [${label}] 这趟红的判据：${redNames.join(', ') || '（没有）'}`);
  passRuns.push({ kind, line, ok });
  if (!ok) {
    passFailures.push(
      `${label}：${stillGreen.length ? `该红的照旧绿 ${stillGreen.join(', ')}；` : ''}` +
        `${unexpected.length ? `没点名就红了 ${unexpected.join(', ')}；` : ''}` +
        `${unknownRed.length ? `点名了名册外的判据 ${unknownRed.join(', ')}；` : ''}` +
        `${drift.length ? `判据名册对不上 ${drift.join(', ')}；` : ''}` +
        `${extraOk ? '' : '额外那件事不成立'}`,
    );
  }
}

// —— 三趟探针：主跑那 20 条里有几条从没红过，就逐条造一次"它该红"的场景量一遍 ——
// 顺序是挑过的：P1 换一份**新的存储目录**（让"库不空"成为唯一变量），P2 趁 STORAGE_B 还是主跑那一份时判，
// P3 与臂各自重建 B。P2 删的是演练自己在 A 侧造的那位角色，那份项目本来就是这一片的产物。
run('probe-dirty-b', URL_B, STORAGE_B_PROBE);
const p1 = read('b-probe-dirty-b.json');
if (!p1) throw new Error('探针 P1 没写出读数（b-probe-dirty-b.json）');
const p1Rows = verdictsOf(a, p1, a2, STORAGE_B_PROBE, aPngs);
record('probe:dirty-b', p1Rows);
assertPass({
  label: 'probe dirty-b',
  kind: 'probe',
  line: 'PROBE_DIRTY_B',
  expectRed: ['B_EMPTY_BEFORE_IMPORT'],
  claim: 'B 不重建、再导一次（ADR-0024 明写不要的"同一个库再复制一份"）⇒ 导入前行数不为零，这一条量的是库里的行数，不是父进程的意图',
  rows: p1Rows,
  extraOk: Object.values(p1.blankness ?? {}).some((n) => n !== 0),
  refusal: p1.receipt?.refusal,
});

run('probe-mutate-a', URL_A, STORAGE_A);
run('verify', URL_A, STORAGE_A);
const a3 = read('a-verify.json');
if (!a3) throw new Error('探针 P2 之后 verify 没写出读数（a-verify.json）');
const p2Rows = verdictsOf(a, b, a3, STORAGE_B, aPngs);
record('probe:mutated-a', p2Rows);
assertPass({
  label: 'probe mutated-a',
  kind: 'probe',
  line: 'PROBE_MUTATED_A',
  expectRed: ['A_UNCHANGED_AFTER_EXPORT'],
  claim: '导出之后删掉 A 侧那位角色再读一遍 A ⇒ 只有"A 没被动过"这一条红，B 侧那 19 条不受牵连（a-verify.json 从此是改过的读数）',
  rows: p2Rows,
  extraOk: a3.characters.length === 0 && a2.characters.length === 1,
  refusal: b.receipt?.refusal,
});

await freshB();
run('probe-foreign-owner', URL_B, STORAGE_B, undefined, { NEXUS_TWO_INSTANCE_FOREIGN_OWNER: a.userId });
const p3 = read('b-probe-foreign-owner.json');
if (!p3) throw new Error('探针 P3 没写出读数（b-probe-foreign-owner.json）');
const p3Rows = verdictsOf(a, p3, a2, STORAGE_B, aPngs);
record('probe:foreign-owner', p3Rows);
assertPass({
  label: 'probe foreign-owner',
  kind: 'probe',
  line: 'PROBE_FOREIGN_OWNER',
  expectRed: [
    'B_IS_NEW_PROJECT',
    'B_OWNED_BY_B_USER',
    'DOCUMENT_DIGEST_EQUAL',
    'B_ASSET_COUNT_ONE',
    'ASSET_BYTES_EQUAL',
    'NO_ASSET_FAILURES',
    'DOC_REF_ASSET_OWNED',
    'B_STORAGE_IS_OWN_COPY',
    'STORYBOARD_ROW_CREATED',
    'STORYBOARD_TEXT_EQUAL',
    'STORYBOARD_REF_CONSERVED',
    'STORYBOARD_IS_B_OWN_ROW',
    'STORYBOARD_NOTES_CLEAN',
    'CHARACTER_COUNT_ONE',
    'CHARACTER_PROFILE_EQUAL',
    'CHARACTER_REF_CONSERVED',
    'CHARACTER_NOTES_CLEAN',
  ],
  claim: '把 A 侧那个用户 id 直接递给 B 的导入 ⇒ 归属这一条红；挡在前面的是 projects.owner_id 的外键（SQLSTATE 23503，读数里带着），判据是后面的第二道',
  rows: p3Rows,
  extraOk: p3.userId === a.userId && (p3.receipt?.refusal ?? '').includes('23503'),
  refusal: p3.receipt?.refusal,
});

// 五趟臂：每一趟都用一份全新的 B，剪包用的还是主跑那一份导出
for (const arm of ARMS) {
  await freshB();
  run('arm', URL_B, STORAGE_B, arm.name);
  const armed = read(`b-arm-${arm.name}.json`);
  const line = `ARM_${arm.name.toUpperCase().replace(/-/g, '_')}_REDS`;
  if (!armed) {
    passFailures.push(`${arm.name}：孩子进程没写出报告（见 .scratch/two-instance/log-arm-${arm.name}.txt）`);
    console.log(`verdict ${line}: FAIL — 没有读数，判不了`);
    continue;
  }
  const rows = verdictsOf(a, armed, a2, STORAGE_B, aPngs);
  record(`arm:${arm.name}`, rows);
  assertPass({ label: `arm ${arm.name}`, kind: 'arm', line, expectRed: arm.expectRed, claim: arm.claim, rows, extraOk: arm.extra(armed, a), refusal: armed.receipt?.refusal });
}

const armCount = passRuns.filter((r) => r.kind === 'arm').length;
const probeCount = passRuns.filter((r) => r.kind === 'probe').length;
writeFileSync(resolve(WORK, 'verdicts.txt'), `${verdictLog.join('\n')}\n`);
// 少一趟读数＝那一趟根本没判（臂或探针被跳过了），不能拿"其余都绿"冒充通过
const expectedPassLines = [...ARMS.map((arm) => `ARM_${arm.name.toUpperCase().replace(/-/g, '_')}_REDS`), 'PROBE_DIRTY_B', 'PROBE_MUTATED_A', 'PROBE_FOREIGN_OWNER'];
const missingPasses = expectedPassLines.filter((line) => !passRuns.some((r) => r.line === line));
if (missingPasses.length) throw new Error(`这些趟没判成（臂加探针该有 ${expectedPassLines.length} 趟）：${missingPasses.join(', ')}`);
if (passFailures.length) throw new Error(`臂或探针没按点名红：${passFailures.join(' / ')}`);

console.log(
  `两实例往返通过。主跑 ${mainRows.length} 条判据全绿 + ${armCount} 趟臂 + ${probeCount} 趟探针各自点名红（全过：${passRuns.every((r) => r.ok)}）；` +
    `zip ${readFileSync(ZIP_PATH).length} 字节，B 的库与存储目录每趟重建。逐条读数：.scratch/two-instance/verdicts.txt`,
);
