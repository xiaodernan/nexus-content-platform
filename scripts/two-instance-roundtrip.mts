/**
 * ADR-0024 欠的那一寸：A 实例导出的那份 zip，在**另一个实例**上装回来。
 *
 * "另一个实例"在这里是三件事，缺一样这句就不成立：
 * - 另一个数据库（`nexus_two_instance_b`，跑之前新建并迁移）；
 * - 另一个存储目录（B 的那个在跑之前**整个删掉**——不然字节可能是从共享磁盘上蹭来的，而不是从包里来的）；
 * - 另一个进程（两个孩子进程各自只拿到自己那一侧的 env，互相看不见对方的连接池）。
 * 两侧之间唯一的通道是磁盘上那一份 zip 字节，与作者手里拿的是同一个东西。
 *
 * 比的是三样，全部由孩子进程算、父进程判：
 * ① 文档摘要（页/节点的类型·名字·文案·子节点数·填充形状）逐位相同——
 *    摘要里把 uuid 归一掉了，因为**换号是这一片的正确行为**（§16：id 不是内容）；
 * ② 资产字节的 sha256 相同（B 侧那张图是从包里的字节重新摄取的，不是引用 A 的那一行）；
 * ③ A 侧在导出之后没有被动过（第三个孩子重新读一遍 A 的摘要，与导出那一刻的比）。
 *
 * 用法：`npm run two-instance`。每条判据打一行 `verdict <名>: <值>`，任何一条不对就非零退出。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { createNode } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';
// 这一格只允许**孩子进程**里出现：那些模块自己用了 `@/…` 别名，父进程在仓库根下解析不到，
// 而且父进程本来也不该连库——它只负责建库、删存储目录、 spawn 孩子、比对报告。
// 所以这里是动态 import（在 role 函数内部），顶层一个 app 模块都不 import。
type DomainProjects = typeof import('../apps/web/src/server/domain/projects');
type DomainAssets = typeof import('../apps/web/src/server/domain/assets');
type DomainExport = typeof import('../apps/web/src/server/domain/export');
type DomainImport = typeof import('../apps/web/src/server/domain/import');
type DomainDb = typeof import('../apps/web/src/server/db/client');
type DomainSchema = typeof import('../apps/web/src/server/db/schema');

interface Modules {
  projects: DomainProjects;
  assets: DomainAssets;
  exporter: DomainExport;
  importer: DomainImport;
  db: DomainDb;
  schema: DomainSchema;
}

/**
 * 只有拿到 role 的孩子进程才走到这里。顶层一个 app 模块都不 import：
 * 那些模块用了 `@/…` 别名，父进程在仓库根下解析不到，而且父进程本来也不该连库。
 */
async function load(): Promise<Modules> {
  return {
    projects: await import('../apps/web/src/server/domain/projects'),
    assets: await import('../apps/web/src/server/domain/assets'),
    exporter: await import('../apps/web/src/server/domain/export'),
    importer: await import('../apps/web/src/server/domain/import'),
    db: await import('../apps/web/src/server/db/client'),
    schema: await import('../apps/web/src/server/db/schema'),
  };
}

const ROOT = resolve(import.meta.dirname, '..');
/** apps/web 的模块用了 `@/…` 别名；tsx 只认这个 tsconfig，仓库根下没有。 */
const WEB_TSCONFIG = resolve(ROOT, 'apps/web/tsconfig.json');
const WORK = resolve(ROOT, '.scratch/two-instance');
const ZIP_PATH = resolve(WORK, 'instance-a-export.zip');

const URL_A = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';
// 只换 pathname：用正则切最后一段会把 `//user:pass@host:port` 那一段也吃掉（实测造出一个
// hostname 是库名的连接串）。URL 对象改的就是那一段，别的都不动。
const URL_B = (() => {
  const url = new URL(URL_A);
  url.pathname = '/nexus_two_instance_b';
  return url.toString();
})();
const STORAGE_A = resolve(WORK, 'storage-a');
const STORAGE_B = resolve(WORK, 'storage-b');

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * 文档摘要：只取"作者看得见的东西"，并且把 uuid 归一掉。
 *
 * 归一 uuid 不是放宽判据，恰恰是这一片要测的那件事：页面、节点、组件、资产的 id 都会换号
 * （不换号在同一个实例里就是撞主键）。所以"图还在"要看的是**填充的形状**与字节的哈希，
 * 而不是填充里那个 id——把 id 算进摘要，正确的换号反而会被判成"文档变了"。
 */
function digestOf(document: DesignDocument): string {
  const norm = (value: unknown): string =>
    JSON.stringify(value).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>');
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

interface Report {
  projectId: string;
  userId: string;
  digest: string;
  assetSha: string | null;
  assetCount: number;
  note?: string;
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

/** A 侧：建项目 → 传一张图 → 把它画到节点上 → 导出成 zip → 落盘 */
async function roleExport(): Promise<Report> {
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

  const stored = (await m.projects.loadDocument(projectId)) as DesignDocument;
  const digest = digestOf(stored);
  const asset = await m.assets.openAssetFile(uploaded.asset.id);
  if (!asset) throw new Error('A 侧刚上传的字节取不回来，这一遍失去意义');
  const bytes = await m.exporter.buildProjectExport(
  projectId,
  userId,
  process.env.NEXUS_TWO_INSTANCE_SKIP_ASSETS === '1' ? ['design', 'code'] : ['design', 'code', 'assets'],
);
  if (!bytes) throw new Error('A 侧导出返回 null：项目不属于自己或者文档读不到');
  writeFileSync(ZIP_PATH, Buffer.from(bytes.bytes));
  const report: Report = {
    projectId,
    userId,
    digest,
    assetSha: sha(asset.bytes),
    assetCount: bytes.counts.assets,
    note: `zip ${bytes.bytes.length} 字节，missingAssets ${bytes.missingAssets.length}`,
  };
  write('a-export.json', report);
  console.log(`role export ok: ${bytes.bytes.length} 字节，assets=${bytes.counts.assets}`);
  return report;
}

/** B 侧：只拿到那份 zip 的字节，库里此刻还没有任何项目 */
async function roleImport(): Promise<Report> {
  const m = await load();
  const userId = await newUser(m, 'b');
  const bytes = new Uint8Array(readFileSync(ZIP_PATH));
  const outcome = await m.importer.importProjectZip(userId, bytes);
  if (!outcome.ok) {
    write('b-import.json', { reason: outcome.reason, issues: outcome.issues });
    throw new Error(`B 侧拒收：${outcome.reason}｜${outcome.issues.join('；')}`);
  }
  if (outcome.assetFailures.length) {
    throw new Error(`B 侧有资产没进库：${JSON.stringify(outcome.assetFailures)}`);
  }
  const stored = (await m.projects.loadDocument(outcome.projectId)) as DesignDocument;
  const rows = await m.assets.listProjectAssets(outcome.projectId);
  if (rows.length !== 1) throw new Error(`B 侧资产行数不是 1：${rows.length}`);
  const asset = await m.assets.openAssetFile(rows[0]!.id);
  if (!asset) throw new Error('B 侧那一行的字节取不回来');
  const report: Report = {
    projectId: outcome.projectId,
    userId,
    digest: digestOf(stored),
    assetSha: sha(asset.bytes),
    assetCount: outcome.counts.assets,
    note: `解压后 ${outcome.bytes.extracted} 字节，忽略代码文件 ${outcome.codeFilesIgnored} 个`,
  };
  write('b-import.json', report);
  console.log(`role import ok: 新项目 ${outcome.projectId.slice(0, 8)}，资产 ${outcome.counts.assets} 张`);
  return report;
}

/** 回到 A 侧再读一遍：导出这一趟不该动过源项目 */
async function roleVerify(): Promise<Report> {
  const m = await load();
  const source = JSON.parse(readFileSync(resolve(WORK, 'a-export.json'), 'utf8')) as Report;
  const stored = (await m.projects.loadDocument(source.projectId)) as DesignDocument;
  const rows = await m.assets.listProjectAssets(source.projectId);
  const asset = rows.length ? await m.assets.openAssetFile(rows[0]!.id) : null;
  const report: Report = {
    projectId: source.projectId,
    userId: source.userId,
    digest: digestOf(stored),
    assetSha: asset ? sha(asset.bytes) : null,
    assetCount: rows.length,
  };
  write('a-verify.json', report);
  console.log('role verify ok');
  return report;
}

const ROLE = process.argv[2];
if (ROLE === 'export' || ROLE === 'import' || ROLE === 'verify') {
  const report = ROLE === 'export' ? await roleExport() : ROLE === 'import' ? await roleImport() : await roleVerify();
  write(`done-${ROLE}.json`, report);
  process.exit(0);
}

// —— 以下是父进程 ——

mkdirSync(WORK, { recursive: true });
rmSync(STORAGE_B, { recursive: true, force: true });
mkdirSync(STORAGE_A, { recursive: true });
mkdirSync(STORAGE_B, { recursive: true });

const admin = new URL(URL_A);
admin.pathname = '/postgres';
const adminSql = postgres(admin.toString(), { max: 1 });
try {
  // 每次跑都重建：留着上一遍的行，"干净实例"就变成"同一个库再复制一份"（ADR-0024 明写不要的那种做法）。
  // 这个库是本脚本自己的产物（名字带 two-instance），与本机其它项目的库无关。
  await adminSql.unsafe('drop database if exists nexus_two_instance_b with (force)');
  await adminSql.unsafe('create database nexus_two_instance_b');
  console.log('重建 B 实例的库 nexus_two_instance_b');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/already exists/i.test(message)) throw error;
  console.log('库 nexus_two_instance_b 已存在，沿用（每次跑都清空 B 的存储目录）');
} finally {
  await adminSql.end({ timeout: 1 });
}

const { spawnSync } = await import('node:child_process');
const script = import.meta.filename;

/** B 侧必须是**迁移过的空库**：没建表就导入，红的是连接错误而不是这一片的判据 */
function migrateB(): void {
  const child = spawnSync(process.execPath, ['--import', 'tsx', resolve(ROOT, 'scripts/db-migrate.mts')], {
    cwd: ROOT,
    env: { ...process.env, NEXUS_DATABASE_URL: URL_B },
    encoding: 'utf8',
  });
  const out = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  writeFileSync(resolve(WORK, 'log-migrate-b.txt'), out);
  if (child.status !== 0) throw new Error(`B 侧迁移失败（status=${child.status}）：${out.slice(-1200)}`);
  const applied = /done: (\d+) migration\(s\) applied/.exec(out)?.[1] ?? out.trim().split(/\r?\n/).slice(-1)[0];
  console.log(`[migrate B] ${applied}`);
}
migrateB();

function run(role: 'export' | 'import' | 'verify', url: string, storageDir: string, expectFail = false): { status: number; out: string } {
  const child = spawnSync(process.execPath, ['--import', 'tsx', script, role], {
    cwd: resolve(ROOT, 'apps/web'),
    env: {
      ...process.env,
      NEXUS_DATABASE_URL: url,
      NEXUS_STORAGE_LOCAL_DIR: storageDir,
      TSX_TSCONFIG_PATH: WEB_TSCONFIG,
    },
    encoding: 'utf8',
  });
  const out = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  writeFileSync(resolve(WORK, `log-${role}.txt`), out);
  if (child.status !== 0 && !expectFail) {
    throw new Error(`${role} 这一趟非零退出（status=${child.status}），日志见 .scratch/two-instance/log-${role}.txt：\n${out.slice(-1500)}`);
  }
  if (child.status === 0 && expectFail) throw new Error(`${role} 本该失败（这一趟是臂），结果零退出`);
  const last = out.trim().split(/\r?\n/).filter((l) => l.startsWith('role ')).slice(-1)[0] ?? '';
  console.log(`[${role}] ${last}`);
  return { status: child.status ?? 0, out };
}

/**
 * 存储目录里那一份真实的文件。这一格原本打的是 `b.note !== undefined`——那什么也没测：
 * 孩子进程总会写 note，哪怕 B 侧根本没落过盘。改成父进程自己数目录、自己哈希文件字节：
 * B 的存储目录是跑前删掉重建的，所以那里出现一张对得上号的 PNG，就只可能是从包里摄取的。
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

run('export', URL_A, STORAGE_A);

// 臂：导出的那份包里没有 assets 这一份，B 侧不能默默导成一张"图不见了"的画布。
// 期望是**非零退出**并说清是哪张引用断了；它要是还能绿，说明这一片的资产判据是空的。
if (process.env.NEXUS_TWO_INSTANCE_SKIP_ASSETS === '1') {
  const armed = run('import', URL_B, STORAGE_B, true);
  const namesMissing = /资产没进库/.test(armed.out);
  console.log(`verdict ARM_SKIP_ASSETS_REDS: ${namesMissing ? 'PASS' : 'FAIL'} — status=${armed.status}｜${armed.out.split(/\r?\n/).filter((l) => l.includes('资产')).slice(-1)[0] ?? '（日志里没有那一句）'}`);
  if (!namesMissing) throw new Error('臂没红：包里没有 assets 也照样导入成功，说明 B 侧那条断链不会响');
  process.exit(0);
}

run('import', URL_B, STORAGE_B);
run('verify', URL_A, STORAGE_A);

const a = JSON.parse(readFileSync(resolve(WORK, 'a-export.json'), 'utf8')) as Report;
const b = JSON.parse(readFileSync(resolve(WORK, 'b-import.json'), 'utf8')) as Report;
const a2 = JSON.parse(readFileSync(resolve(WORK, 'a-verify.json'), 'utf8')) as Report;

const bPngs = pngFiles(STORAGE_B);
const aPngs = pngFiles(STORAGE_A);
const bPngSha = bPngs.length === 1 ? sha(readFileSync(resolve(STORAGE_B, bPngs[0]!))) : null;

const verdicts: [string, boolean, string][] = [
  ['B_IS_NEW_PROJECT', b.projectId !== a.projectId, `A=${a.projectId.slice(0, 8)} B=${b.projectId.slice(0, 8)}`],
  ['B_OWNED_BY_B_USER', b.userId !== a.userId, `A 用户 ${a.userId.slice(0, 8)}，B 用户 ${b.userId.slice(0, 8)}`],
  ['DOCUMENT_DIGEST_EQUAL', b.digest === a.digest, `A ${a.digest.length} 字 / B ${b.digest.length} 字`],
  ['ASSET_BYTES_EQUAL', b.assetSha === a.assetSha, `A ${(a.assetSha ?? '').slice(0, 12)} B ${(b.assetSha ?? '').slice(0, 12)}`],
  ['B_ASSET_COUNT_ONE', b.assetCount === 1 && b.digest.includes('cover-image'), `counts.assets=${b.assetCount}`],
  ['A_UNCHANGED_AFTER_EXPORT', a2.digest === a.digest && a2.assetSha === a.assetSha, a2.note ?? ''],
  [
    'B_STORAGE_IS_OWN_COPY',
    bPngs.length === 1 && bPngSha === b.assetSha && !aPngs.includes(bPngs[0]!),
    `B 侧 ${JSON.stringify(bPngs)}，sha ${bPngSha?.slice(0, 12)}；A 侧 ${aPngs.length} 张，路径无一重合`,
  ],
];
for (const [name, ok, detail] of verdicts) console.log(`verdict ${name}: ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
const failed = verdicts.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`判据没过：${failed.join(', ')}`);
console.log(`两实例往返通过。zip ${readFileSync(ZIP_PATH).length} 字节，B 侧存储目录跑前被删过：${STORAGE_B}`);
