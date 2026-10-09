/**
 * §147 的「一次保存要写多少行」：`saveDocument` 在 N 节点文档上的耗时。
 *
 * 用法：npx tsx scripts/perf-save.mts [节点数，默认 4000]
 *
 * 不做断言：本机 16GB、还跑着一堆容器，把耗时写死成断言只会制造 flaky（与 perf-baseline.mts 同一条纪律）。
 * 数字记进 docs/PERFORMANCE.md；改写入路径前后各跑一遍，同一会话里量。
 *
 * 三个读数各自钉一件事：
 *  - 「首存」= 全部行都是 INSERT（项目刚建出来）；
 *  - 「改一个节点」= 增量保存的主战场：只该写一行，其余的行连 UPDATE 都不该发；
 *  - 「改一个节点（补丁路径）」= #62②：客户端发 set op，服务端锁内读-打-写——
 *    自动保存的现行主路，与上面那条全量 PUT 对照着看省下了哪一段；
 *  - 「无改动」= 保存一份原样文档：应当只有读 + 比对的代价。
 */
import { performance } from 'node:perf_hooks';
import { eq } from 'drizzle-orm';
import { createNode } from '@nexus/design-model';
import { createProject, loadDocument, patchProjectDocument, saveDocument } from '../apps/web/src/server/domain/projects';
import { getDb } from '../apps/web/src/server/db/client';
import { projects, users } from '../apps/web/src/server/db/schema';

const NODES = Number(process.argv[2] ?? 4000);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function timed(label: string, run: () => Promise<void>, rounds = 5): Promise<void> {
  const samples: number[] = [];
  for (let i = 0; i < rounds; i += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  const shown = samples.map((ms) => ms.toFixed(1)).join(' / ');
  // 这台机器的墙上时钟本来就随负载飘（同一次操作能差一倍），所以中位与最小值都报：
  // 最小值更接近「机器空着时的代价」，中位代表日常；只报一个数会让人把噪声读成结论。
  console.log(`${label}: 中位 ${median(samples).toFixed(1)}ms / 最小 ${Math.min(...samples).toFixed(1)}ms（${shown}）`);
}

async function main(): Promise<void> {
  const db = getDb();
  const [owner] = await db
    .insert(users)
    .values([{ displayName: 'Perf Save Probe', email: `perf-save+${Date.now()}@nexus.test` }])
    .returning({ id: users.id });
  if (!owner) throw new Error('建不出用户，跑不下去');

  try {
    const project = await createProject(owner.id, { name: `Perf Save ${NODES}`, kind: 'website' });
    const document = await loadDocument(project.id);
    if (!document) throw new Error('刚建的项目读不回来');
    const page = document.pages[0]!;
    const root = page.nodes[page.rootId]!;
    for (let i = 0; i < NODES; i += 1) {
      const node = createNode({ type: 'text', name: `n${i}`, text: `value ${i}`, parentId: root.id });
      page.nodes[node.id] = node;
      root.children.push(node.id);
    }
    console.log(`节点数 ${NODES}（一页），文档字符约 ${JSON.stringify(document).length}`);

    await timed('首存（全部 INSERT）', () => saveDocument(project.id, document), 1);

    const mutable = (await loadDocument(project.id))!;
    const targetName = `n${Math.floor(NODES / 2)}`;
    const target = Object.values(mutable.pages[0]!.nodes).find((node) => node.name === targetName)!;
    await timed(
      `改一个节点（${targetName}）后保存`,
      async () => {
        target.text = `changed ${Date.now()}`;
        await saveDocument(project.id, mutable);
      },
    );

    const fresh = (await loadDocument(project.id))!;
    await timed('无改动保存', () => saveDocument(project.id, fresh));

    // #62② 补丁路径：锁内读最新版 → 打一条 set op → 同一个写入者落库（自动保存的现行主路）
    const patchDoc = (await loadDocument(project.id))!;
    const patchNode = Object.values(patchDoc.pages[0]!.nodes).find((node) => node.name === targetName)!;
    await timed(
      '改一个节点（补丁路径 set op）',
      async () => {
        const outcome = await patchProjectDocument(project.id, [
          { ops: [{ op: 'set', nodeId: patchNode.id, path: 'text', value: `patched ${Date.now()}` }] },
        ]);
        if (!outcome.ok) throw new Error(`补丁路径没落库：${outcome.code}`);
      },
    );
  } finally {
    await db.delete(projects).where(eq(projects.ownerId, owner.id));
    await db.delete(users).where(eq(users.id, owner.id));
  }
  process.exit(0);
}

await main();
