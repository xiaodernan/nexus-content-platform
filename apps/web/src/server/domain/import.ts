/**
 * §105 CODE IMPORT 的 ZIP 那一路，也是 §144 的另一半：ADR-0024 说"所有导出必须能被另一个实例重新导入"
 * 是一句还没兑现的要求。这一格把它兑现成代码：**本平台自己导出的包，导回来是一个新项目**。
 *
 * 三条不太显然的决定：
 *
 * 1. **先认 `.nexus/manifest.json`，再谈内容**。不是"看着像 nexus 包就试着 parse"：一份形状变了的包
 *    会在某个字段上解析成功、然后导出一份**不完整的项目**（少了页面没人知道）。版本不认识就整包拒绝，
 *    并把"我认 v几、你这份是 v几"报出来。
 * 2. **代码不进库**（§16）。`code/**` 是设计模型的投影，导回来再把它当输入写进模型等于让投影反过来
 *    决定真值。所以导入只吃 `design/document.json` 与 `assets/**`，代码那一段数一下、原样报给调用方
 *    "这几份文件我没用，它们是投影"。
 * 3. **页面/组件/资产的 id 一律换号**。它们在库里是全局主键：同一份实例里导入源项目自己的包，
 *    不换号就是撞主键或者跟源项目共享一行记录（§27 Duplicate 同一形状，见 `duplicateProject`）。
 *    资产换号要靠包里的 `assetId`——这就是 `EXPORT_FORMAT_VERSION` 从 1 走到 2 的唯一原因：
 *    v1 的清单没记这个映射，导回来只能让图片引用指向**别人的**资产行或者干脆断掉，
 *    那种"导入成功但图不见了"比一句"这是 v1 的包，请重新导出"难查得多。
 */
import { duplicateDocument, remapAssetIds, type DesignDocument, type ProjectType } from '@nexus/design-model';
import { crc32 } from '@/lib/zip';
import { readZip, readZipText, type ZipFileEntry } from '@/lib/zip-read';
import { parseDocument } from '../validation';
import { uploadImageAsset } from './assets';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type NexusManifest } from './export';
import { createProject, loadDocument, PROJECT_KINDS, saveDocument } from './projects';

/**
 * 请求体上限（压缩后的整包字节）。
 *
 * 读端另有三档（条目数 / 单条 / 累计解压体积），这一档管的是"别先把 5GB 塞进内存再说不"：
 * 数字取累计解压上限的一半——一份 store 包不压缩，正常导出用不满它；
 * 真要贴到这一格，那是"有人拿别人的包来试"，不是用户导出后又导回来。
 *
 * **这一档必须在读正文之前判**（2026-10-21 查出来的）：
 * Next 16 的中间件会**先把请求正文读进来才运行**（默认 10MB 上限）→
 * 路由拿到的正文被截断（合法的 >10MB 导入就是坏的），
 * 而路由里那道"按 Content-Length 先拒"也来不及跑。
 * 所以导入路由**不进中间件**（见 `apps/web/src/middleware.ts` 的 matcher）→
 * 头一到手就能拒 → **正文一个字都不用读**。
 */
export const IMPORT_MAX_ZIP_BYTES = 128 * 1024 * 1024;

/** 包里那三层的路径约定，与 `export.ts` 写出去时同一套拼法 */
export const MANIFEST_PATH = '.nexus/manifest.json';
export const DESIGN_DOC_PATH = 'design/document.json';
const CODE_DIR = 'code/';
const ASSETS_DIR = 'assets/';

export interface ImportReceipt {
  projectId: string;
  name: string;
  kind: ProjectType;
  /** 进了库的部分：设计文档 1 份 + 资产若干 */
  counts: { design: number; assets: number };
  /** 包里有、但导入侧**故意**不用的：代码是投影 */
  codeFilesIgnored: number;
  /**
   * 一份资产没能落库的原因（超限、不是受支持的位图、配额满了）。
   * 不为空时导入仍然算成功——项目已经在了，但"图少了几张"必须点名，不能只报"导入完成"。
   */
  assetFailures: { path: string; reason: string }[];
  /** 源包里的 `generatedAt`：让界面能说清"这是哪一次导出" */
  exportedAt: string;
  /** 整包字节与解压后字节 */
  bytes: { zip: number; extracted: number };
  durationMs: number;
}

/** 拒收：整包不落库。`reason` 是一句话，`issues` 是要在界面上逐条列出来的细节 */
export type ImportRefusal = { ok: false; reason: string; issues: string[] };

export type ImportOutcome = ({ ok: true } & ImportReceipt) | ImportRefusal;

function refuse(reason: string, issues: string[] = []): ImportRefusal {
  return { ok: false, reason, issues };
}

/** 清单里声明的每一项都要在包里、体积与 CRC 都对得上；反过来包里的每一项也要在清单里 */
function crossCheckManifest(manifest: NexusManifest, files: ZipFileEntry[]): ImportRefusal | null {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const declared = new Set<string>();
  const problems: string[] = [];

  for (const item of manifest.entries) {
    declared.add(item.path);
    const actual = byPath.get(item.path);
    if (!actual) {
      problems.push(`清单说有 ${item.path}，包里没有`);
      continue;
    }
    if (actual.contents.length !== item.bytes) {
      problems.push(`${item.path}：清单声明 ${item.bytes} 字节，实际 ${actual.contents.length} 字节`);
      continue;
    }
    const crc = crc32(actual.contents).toString(16).toUpperCase().padStart(8, '0');
    if (crc !== item.crc32) {
      problems.push(`${item.path}：清单 CRC ${item.crc32}，实际 ${crc}`);
    }
  }

  // 包里有、清单没记的条目：清单是导出时数过的，多出来的东西只能是有人后来塞进去的
  for (const file of files) {
    if (file.directory) continue;
    if (file.path === MANIFEST_PATH) continue;
    if (!declared.has(file.path)) problems.push(`包里有一份清单没记的东西：${file.path}`);
  }

  // assetRefs 是"这些字节在模型里是谁"，它指的路径必须在 entries 里——
  // 否则导入侧会照着一条没有字节可对的映射去换号，那等于凭空造出一个资产 id
  for (const ref of manifest.assetRefs) {
    if (!declared.has(ref.path)) problems.push(`assetRefs 说有 ${ref.path}，entries 里却没有这一项`);
  }

  if (problems.length > 0) return refuse('清单与包内容对不上，整包拒收', problems);
  return null;
}

function readManifest(files: ZipFileEntry[]): { manifest?: NexusManifest; refusal?: ImportRefusal } {
  const text = readZipText(files, MANIFEST_PATH);
  if (text === null) {
    return {
      refusal: refuse(
        '这份包不是本平台导出的：包里没有 .nexus/manifest.json',
        ['只接受 Studio「导出」或 /api/projects/<id>/export 产出的包；解压后再压一份、别的工具打的包都不算'],
      ),
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { refusal: refuse('.nexus/manifest.json 不是合法 JSON，整包拒收') };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { refusal: refuse('.nexus/manifest.json 的形状不对：应该是一个对象') };
  }
  const manifest = raw as Partial<NexusManifest>;

  if (manifest.format !== EXPORT_FORMAT) {
    return {
      refusal: refuse('这份包不是 nexus 项目的导出包', [
        `清单里 format 是 ${JSON.stringify(manifest.format ?? null)}，本平台认的是 ${JSON.stringify(EXPORT_FORMAT)}`,
      ]),
    };
  }
  // 版本按相等判，不按"大于就试着读"：往回兼容要靠真的读端代码，不靠乐观
  if (manifest.formatVersion !== EXPORT_FORMAT_VERSION) {
    return {
      refusal: refuse(`包格式版本不认识：这份是 v${String(manifest.formatVersion)}，本实例只认 v${EXPORT_FORMAT_VERSION}`, [
        v1Hint(manifest.formatVersion),
      ]),
    };
  }
  if (!Array.isArray(manifest.entries) || !Array.isArray(manifest.assetRefs)) {
    return { refusal: refuse('.nexus/manifest.json 少了 entries 或 assetRefs，整包拒收') };
  }
  if (!Array.isArray(manifest.parts) || manifest.parts.some((p) => p !== 'design' && p !== 'code' && p !== 'assets')) {
    return { refusal: refuse('清单里的 parts 读不出一个合法组合', [`读到 ${JSON.stringify(manifest.parts)}`]) };
  }
  return { manifest: manifest as NexusManifest };
}

/** v1 的包为什么单独解释一句：那一版清单没记 assetId，导入会让图片引用断掉 */
function v1Hint(version: unknown): string {
  if (version === 1) {
    return 'v1 的清单没有记录每个文件对应的资产 id，导回来图片引用会指向不到自己那份字节——请在 Studio 重新导出一次（v2）';
  }
  return `只支持 v${EXPORT_FORMAT_VERSION}；更高版本要等本实例升级读端，更低版本要重新导出`;
}

/** 写库之前读出来的那份"计划"：包已经全部验过，只差落库 */
export interface PackagePlan {
  ok: true;
  manifest: NexusManifest;
  document: DesignDocument;
  name: string;
  kind: ProjectType;
  files: ZipFileEntry[];
  /** 解压后的总字节（配额按导入后的字节判，看的就是这个数） */
  extracted: number;
}

/**
 * 写库之前的全部判据。单独导出不是为了好看：
 * "我的夹具是一份合法的包"这件事需要一条**不碰库**的见证，否则上面那十几条拒收里
 * 任何一条红都可能只是夹具自己不合格（那种红会骗人）。
 */
export function inspectPackage(zipBytes: Uint8Array): PackagePlan | ImportRefusal {
  if (zipBytes.length === 0) return refuse('包是空的');
  if (zipBytes.length > IMPORT_MAX_ZIP_BYTES) {
    return refuse(`整包 ${zipBytes.length} 字节超过上限 ${IMPORT_MAX_ZIP_BYTES} 字节`, ['先在 Studio 少导几样（比如只导 design），或者删掉不要的素材再导']);
  }

  let files: ZipFileEntry[];
  try {
    files = readZip(zipBytes);
  } catch (error) {
    // 读端的判据本来就是一句话一个（zip slip、bomb、自相矛盾的头部……），原样传给用户最有信息量
    return refuse(error instanceof Error ? error.message : '这份 ZIP 读不开');
  }

  const manifestRead = readManifest(files);
  if (manifestRead.refusal) return manifestRead.refusal;
  const manifest = manifestRead.manifest!;

  const mismatch = crossCheckManifest(manifest, files);
  if (mismatch) return mismatch;

  const extracted = files.reduce((sum, f) => sum + (f.directory ? 0 : f.contents.length), 0);

  if (!manifest.parts.includes('design')) {
    return refuse('这份包没导 design，导回来会是一个空项目', ['在导出时勾上 design，或者用 /api/projects/<id>/export?parts=design']);
  }
  const docText = readZipText(files, DESIGN_DOC_PATH);
  if (docText === null) return refuse(`清单说导了 design，包里却没有 ${DESIGN_DOC_PATH}`);

  // 走的是界面保存同一条校验门（envelope + 节点上限 + validateDocument）：包是外部输入，不能因为"是自家导出的"就免检
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(docText);
  } catch {
    return refuse(`${DESIGN_DOC_PATH} 不是合法 JSON，整包拒收`);
  }
  const parsed = parseDocument(parsedBody);
  if (!parsed.ok) return refuse('包里的设计文档过不了校验，整包拒收', parsed.issues);

  const source = parsed.document as DesignDocument;
  const kind = manifest.project?.kind;
  if (!PROJECT_KINDS.includes(kind as ProjectType)) {
    return refuse('清单里的项目类型这个实例不认识', [`读到 ${JSON.stringify(kind)}，认的是 ${PROJECT_KINDS.join(' / ')}`]);
  }

  return {
    ok: true,
    manifest,
    document: source,
    name: (manifest.project?.name?.trim() || source.name).slice(0, 120) || '导入的项目',
    kind: kind as ProjectType,
    files,
    extracted,
  };
}

/**
 * 把一份本平台导出的包导成**新项目**。
 *
 * 不做原地覆盖：导入的目标永远是新建的项目（§144 讲的是"带走"，不是"把别人的写回我的"）。
 * 归属在这里不是问题——写入方永远是调用者本人，包里的 `project` 只当作名字与类型来用。
 */
export async function importProjectZip(actorId: string, zipBytes: Uint8Array): Promise<ImportOutcome> {
  const startedAt = Date.now();
  const plan = inspectPackage(zipBytes);
  if (!plan.ok) return plan;
  const { manifest, document: source, name, kind, files, extracted } = plan;

  // 换号才能进库：页面与组件 id 是全局主键，同一个实例里导回自己的包不换号就是撞车
  const created = await createProject(actorId, {
    name,
    kind,
    fromDocument: duplicateDocument(source, name),
  });

  const idMap = new Map<string, string>();
  const assetFailures: { path: string; reason: string }[] = [];
  for (const item of manifest.assetRefs) {
    const file = files.find((f) => f.path === item.path);
    if (!file) continue; // crossCheckManifest 已经保证这一行不会发生；留着是为了不在这条路上写 undefined
    const result = await uploadImageAsset(created.id, {
      data: file.contents,
      filename: item.name || item.path.slice(ASSETS_DIR.length),
      createdById: actorId,
      source: 'upload',
    });
    if (!result.ok) {
      assetFailures.push({ path: item.path, reason: `${result.reason}：${result.issues.join('；')}` });
      continue;
    }
    idMap.set(item.assetId, result.asset.id);
  }

  let designCount = 1;
  const stored = await loadDocument(created.id);
  if (!stored) {
    designCount = 0;
  } else {
    // 断掉的引用要报出来：节点引用了一个包里没有的资产 id，那张图是真的没了，不是"还没上传完"。
    // 只看节点，不看 stored.assets——那份清单是 loadDocument 从**新项目自己的行**水合出来的（§16/§101），
    // 它的 id 天生就不在 idMap 的键里；把它算进来会给每次成功导入都编出一条"图会断"的假警报。
    const missingRefs = [...documentAssetRefs(stored)].filter((id) => !idMap.has(id));
    for (const id of missingRefs) {
      assetFailures.push({ path: `(文档引用) ${id}`, reason: '包里没有这个资产的字节，导入后这张图的引用会断' });
    }
    // 一张都没换成功时不重写文档：换号是唯一值得回写的那件事，重写一遍只会多一次快照
    if (idMap.size > 0) await saveDocument(created.id, remapAssetIds(stored, idMap));
  }

  return {
    ok: true,
    projectId: created.id,
    name,
    kind,
    counts: { design: designCount, assets: idMap.size },
    codeFilesIgnored: manifest.entries.filter((e) => e.path.startsWith(CODE_DIR)).length,
    assetFailures,
    exportedAt: manifest.generatedAt,
    bytes: { zip: zipBytes.length, extracted },
    durationMs: Date.now() - startedAt,
  };
}

/**
 * 文档的**节点**引用到的资产 id（`assetId` 字段，image paint 也走这一个键）。
 * 不含 `document.assets` 那一栏：它是载入时从项目自己的行水合出来的，不是包里的引用。
 */
function documentAssetRefs(document: DesignDocument): Set<string> {
  const ids = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        if (key === 'assetId' && typeof v === 'string') ids.add(v);
        else walk(v);
      }
    }
  };
  walk(document.pages);
  walk(document.components);
  return ids;
}
