import { generateProject, type DesignDocument } from '@nexus/design-model';
import type { RealtimeEvent } from '@nexus/schemas';
import { crc32, textEntry, zipStore, type ZipEntry } from '@/lib/zip';
import { channels, getRealtimeBus } from '../realtime/bus';
import { listProjectAssets, openAssetForOwner } from './assets';
import { emit } from './notifications';
import { listCharacters } from './characters';
import { loadDocument, loadProjectIdentity, projectBelongsTo } from './projects';
import { loadStoryboard } from './storyboards';

/**
 * §144 NO LOCK-IN 的导出那一半：把一份项目**交还到作者手里**。
 *
 * 为什么这一格值得单独做：设计文档、生成的代码、上传的资产今天都只在平台内部流转——
 * 作者拿不走，等于"作品属于用户"（§145）只写在了页面上。代码生成**早就有了**
 * （`generateProject()` 能产出 `GeneratedFile[]`），所以这一格缺的不是能力，
 * 是"把它交出去"的那一步。
 *
 * 四条纪律：
 *
 * 1. **先判归属再动字节**。不是自己的项目统一返回 `null`（路由翻成 404 而不是 403——
 *    403 会泄露"这个 id 存在"，与资产取字节那一格同一口径）。
 * 2. **缺的东西要写进包里，不静默跳过**。资产在库里有行、存储里的对象却没了，
 *    这种事会发生（本地驱动被清过、S3 凭据换过）。跳过的话作者会以为导全了，
 *    所以缺的每一项都列进 `README.txt` 的"缺了什么"一段（§159）。
 * 3. **包里要有一份说明**。解压出来看到几十个文件，没有一句话说清"这是什么、按什么生成的、
 *    哪些东西不在这里"，那份 zip 就是个谜。说明里同时写清**限度**：
 *    导出的是当前这一版，不含历史快照、不含分支、不含撤销栈、不含知识索引与对话。
 * 4. **它不是一次模型调用，所以能力那一栏不涉及 real/demo**（§160）——
 *    代码是确定性投影出来的，不是生成的。
 */

export type ExportPart = 'design' | 'code' | 'assets' | 'storyboard' | 'character';

export const EXPORT_PARTS: readonly ExportPart[] = ['design', 'code', 'assets', 'storyboard', 'character'];

export interface ExportOutcome {
  bytes: Uint8Array;
  filename: string;
  /** 各部分实际进了几个文件——页面上要能说清"导出了什么" */
  counts: Record<ExportPart, number>;
  /** 库里有行、字节却取不回来的资产；不为空时 README 里会点名 */
  missingAssets: string[];
  durationMs: number;
}

/** 文件名里只留安全字符：HTTP 头的编码比 zip 内部路径挑剔得多 */
export function slug(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'project';
}

function assetName(name: string, id: string, index: number): string {
  // 资产名是用户输入，可能带斜杠或重名：压平 + 前置序号，保证包内唯一且落在 assets/ 下
  const base = name.replace(/[\\/]/g, '-').replace(/^\.+/, '').slice(0, 60) || id.slice(0, 8);
  return `assets/${String(index + 1).padStart(2, '0')}-${base}`;
}

function manifest(args: {
  projectName: string;
  parts: ExportPart[];
  counts: Record<ExportPart, number>;
  missingAssets: string[];
  document: DesignDocument;
  /** 库里有行、档案却读不出来的角色数（README 里要点名，不静默少导几个人） */
  unreadableCharacters: number;
}): string {
  const { projectName, parts, counts, missingAssets, document, unreadableCharacters } = args;
  const lines: string[] = [
    `NEXUS 项目导出：${projectName}`,
    `生成时间：${new Date().toISOString()}`,
    '',
    '包里有什么',
  ];
  if (parts.includes('design')) lines.push(`  design/document.json — 设计文档本身（${document.pages.length} 页，${counts.design} 个文件）`);
  if (parts.includes('code')) lines.push(`  code/ — 由设计文档确定性投影出来的代码（${counts.code} 个文件）`);
  if (parts.includes('assets')) lines.push(`  assets/ — 本项目上传的资产（${counts.assets} 个文件）`);
  if (parts.includes('storyboard')) {
    lines.push(
      counts.storyboard > 0
        ? '  storyboard/storyboard.json — 分镜文档（§40-42）。镜头的参考帧在 assets/ 里，按 id 引用'
        : '  storyboard/ — 这一版没有分镜可导（项目里还没有分镜，或库里那份读不出来）',
    );
    lines.push('  分镜渲染出的成片是**本地确定性推演的 DEMO 产物**（本机没有视频 provider，§160），不是 AI 生成的。');
  }
  if (parts.includes('character')) {
    lines.push(
      counts.character > 0
        ? `  character/characters.json — 角色档案（${counts.character} 位）。世界归属不随包走：导入时角色挂到新项目自己的世界上`
        : '  character/ — 这一版没有角色可导（项目里还没有角色）',
    );
    if (unreadableCharacters > 0) {
      lines.push(`  另有 ${unreadableCharacters} 位角色的档案在库里读不出来，没有进包`);
    }
  }
  lines.push('', '不在这里的东西（导的是"当前这一版"，不是整个项目历史）');
  lines.push('  历史快照与分支、撤销栈、知识索引与语料、对话与 AI 任务账本、通知、审核记录。');
  lines.push('  导出是一次投影：改了设计再导一次就是另一份，它不会替你保存改动过程。');
  if (missingAssets.length) {
    lines.push('', '缺了什么（库里有记录，但存储里的字节取不回来了）');
    for (const name of missingAssets) lines.push(`  - ${name}`);
    lines.push('  这几个文件没有出现在 assets/ 里。这不是导出失败，是它们之前就不在了。');
  }
  return lines.join('\n');
}

/**
 * `.nexus/manifest.json` 的格式版本。**导入侧必须按它判**，而不是"看起来像就试着读"：
 * 将来包里多一层或少一层，导入那边要能明确说"这份包是 v1、我认的是 v1"，
 * 而不是在一个形状变了的包上猜着解析，然后以某种方式读出一份**不完整的项目**——
 * 那种失败比"版本不认识"难查得多（ADR-0024 后果里定的下一片第一件就是这个）。
 *
 * 1 → 2 的唯一原因：v1 没有 `assetRefs`。导入侧要靠它把包里的字节对回文档里引用的那个资产，
 * 少了它只能让新项目的节点指向**源项目**的资产行（共享一行记录 = 删源项目把导入项目的图一起删掉，§80）
 * 或者干脆断掉引用。宁可对拿着 v1 包的人说一句"请重新导出"，也不要导出一份图不见了的项目。
 *
 * 3 → 4 的原因：多了 `character` 这一 part（§46 的角色档案）。分镜的镜头可以挂角色，
 * 不带角色走的包只能把引用剥掉——剥掉是"导入成功但少了一截"，与 v1 少 assetRefs 同一类问题。
 * 2 → 3 的原因：多了 `storyboard` 这一 part（§40-42 的分镜连同它的参考帧引用）。
 * 版本按相等判（导入侧 `manifest.formatVersion !== EXPORT_FORMAT_VERSION` 就整包拒收），
 * 所以加 part 必须同步升版本——否则本实例导出的包会被本实例的导入侧拒收，自己不认识自己。
 */
export const EXPORT_FORMAT = 'nexus-project-export';
export const EXPORT_FORMAT_VERSION = 4;

/** 机器可读的那一层。与 README.txt 分工：这份给程序看，那份给人看 */
export interface NexusManifest {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  generatedAt: string;
  project: { name: string; kind: string };
  parts: ExportPart[];
  /**
   * 包里除 `.nexus/manifest.json` 自己以外的每一个条目：路径、字节数、CRC32。
   *
   * 为什么清单不把自己列进去：它的字节取决于列表内容，列进去就成了自指。
   * 为什么带 CRC：导入侧拿它跟 zip 中央目录里声明的值对一遍，
   * **两份声明对不上就整包拒绝**——一份"内容被改过但清单没改"的包，比一份坏包更危险。
   */
  entries: { path: string; bytes: number; crc32: string }[];
  /**
   * `assets/**` 每一项对应的**库里**的资产 id 与名字。
   *
   * 为什么单独列一层而不是塞进 `entries`：`entries` 是"包里有什么字节"，一个字节都不多，
   * 校验侧只看那三样；这一层是"这些字节在模型里是谁"，导入侧才用得上。
   * 合在一起的话，每一份代码文件都要带上两个它永远不读的字段。
   */
  assetRefs: { path: string; assetId: string; name: string }[];
  /** 库里有记录、字节却取不回来的资产名（与 README 的"缺了什么"同一份来源） */
  missingAssets: string[];
}

function buildNexusManifest(args: {
  projectName: string;
  kind: string;
  parts: ExportPart[];
  entries: ZipEntry[];
  assetRefs: NexusManifest['assetRefs'];
  missingAssets: string[];
}): NexusManifest {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    project: { name: args.projectName, kind: args.kind },
    parts: args.parts,
    entries: args.entries.map((entry) => ({
      path: entry.path,
      bytes: entry.contents.length,
      // 大写 8 位十六进制：与 zip 工具显示 CRC 的写法一致，肉眼核对时不用换算
      crc32: crc32(entry.contents).toString(16).toUpperCase().padStart(8, '0'),
    })),
    assetRefs: args.assetRefs,
    missingAssets: args.missingAssets,
  };
}

export async function buildProjectExport(
  projectId: string,
  actorId: string,
  parts: ExportPart[],
): Promise<ExportOutcome | null> {
  // 归属在动字节之前判：不是自己的项目，连"有这个项目"都不该从这一格漏出去
  if (!(await projectBelongsTo(projectId, actorId))) return null;
  const document = await loadDocument(projectId);
  if (!document) return null;

  const startedAt = Date.now();
  // 类型取自项目行（设计文档里没有它）；项目行读不到就退回文档名，清单里照实写 website 之外的默认
  const identity = await loadProjectIdentity(projectId);
  const projectName = identity?.name ?? document.name;
  const counts: Record<ExportPart, number> = { design: 0, code: 0, assets: 0, storyboard: 0, character: 0 };
  const missingAssets: string[] = [];
  let unreadableCharacters = 0;
  const assetRefs: NexusManifest['assetRefs'] = [];
  const entries: ZipEntry[] = [];

  if (parts.includes('design')) {
    entries.push(textEntry('design/document.json', JSON.stringify(document, null, 2)));
    counts.design = 1;
  }

  if (parts.includes('code')) {
    // 代码是设计模型的投影（§16），所以导出的是**当时那份文档**投出来的结果，不是缓存
    for (const file of generateProject(document, { cssVarPrefix: 'nx' })) {
      entries.push(textEntry(`code/${file.path}`, file.contents));
      counts.code += 1;
    }
  }

  if (parts.includes('assets')) {
    const refs = await listProjectAssets(projectId);
    for (const [index, ref] of refs.entries()) {
      const file = await openAssetForOwner(ref.id, actorId);
      if (!file) {
        missingAssets.push(ref.name);
        continue;
      }
      const path = assetName(file.name, ref.id, index);
      entries.push({ path, contents: file.bytes });
      // 导入侧靠这一行把字节对回模型里的那个资产；没有它，导回来的项目会指向别人的那一份字节
      assetRefs.push({ path, assetId: ref.id, name: ref.name });
      counts.assets += 1;
    }
  }

  if (parts.includes('storyboard')) {
    // 分镜文档单独一份 JSON。镜头的参考帧引用的是 assets/ 里的字节（按 id），
    // 所以这一part 不重复带字节——同一个 mp4 在包里出现两遍只是让包变大。
    const loaded = await loadStoryboard(projectId);
    if (loaded?.ok) {
      entries.push(textEntry('storyboard/storyboard.json', JSON.stringify(loaded.document, null, 2)));
      counts.storyboard = 1;
    }
    // 没有分镜或读不出来：README 里那一行已经写明"这一版没有分镜可导"，
    // 不静默跳过——否则解压的人会以为分镜从来没被创建过
  }

  if (parts.includes('character')) {
    // 角色档案一份 JSON 数组。`projectId` / `worldId` 是**源项目**的 id，不随包走——
    // 导入侧只取 name 与 profile，角色挂到新项目自己的世界上（§46，与资产换号同一规矩）
    const { items, unreadable } = await listCharacters(projectId);
    if (items.length > 0) {
      entries.push(textEntry('character/characters.json', JSON.stringify(items, null, 2)));
      counts.character = items.length;
    }
    // 读不出来的档案进不了包：README 里点名数量，不静默少导几个人
    if (unreadable.length > 0) unreadableCharacters += unreadable.length;
  }

  entries.unshift(
    textEntry('README.txt', manifest({ projectName, parts, counts, missingAssets, document, unreadableCharacters })),
  );
  // 机器可读的那一层放在**最前面**：读回来的一方要先认格式版本，再谈里面的内容
  entries.unshift(
    textEntry(
      '.nexus/manifest.json',
      JSON.stringify(
        buildNexusManifest({
          projectName,
          kind: identity?.kind ?? 'website',
          parts,
          entries,
          assetRefs,
          missingAssets,
        }),
        null,
        2,
      ),
    ),
  );

  const bytes = zipStore(entries);
  return {
    bytes,
    filename: `nexus-${slug(projectName)}.zip`,
    counts,
    missingAssets,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * §163：导出是又一个真会走完的构建动作，所以它是 `build.status` 的生产者之一。
 * `preview.status` 与它无关（导出不产生一个可访问的地址），这一格不发。
 */
export function publishBuildStatus(projectId: string, status: 'building' | 'ok' | 'failed', log: string): void {
  const event: RealtimeEvent = { type: 'build.status', projectId, status, log };
  getRealtimeBus().publish(channels.project(projectId), event);
}

/**
 * §164 的第四类（Build complete）终于有来源：导出走完就发这一条。
 *
 * 成功但**缺了资产**时也要发，而且要按 warning 而不是 success——
 * 默默少几个文件比明说少几个更糟：作者拿着那份 zip 走人之后才发现缺图，
 * 那时候平台这边已经没有机会告诉他了（§159）。
 */
export async function notifyBuildComplete(args: {
  projectId: string;
  projectName: string;
  actorId: string;
  ok: boolean;
  counts: Record<ExportPart, number>;
  missingAssets: number;
  durationMs: number;
  detail: string | null;
}): Promise<void> {
  await emit({
    kind: 'build',
    recipientId: args.actorId,
    projectId: args.projectId,
    projectName: args.projectName,
    // 每次导出都是一件新事：键挂在它上面，所以第二次导出还会出声
    exportId: crypto.randomUUID(),
    ok: args.ok,
    counts: args.counts,
    missingAssets: args.missingAssets,
    durationMs: args.durationMs,
    detail: args.detail,
  });
}
