/**
 * §188 的那句限度换成数字：公网读一份大文档要传多少字节、公网写一次要多久。
 *
 * 用法（要先有 web 服务在 3100）：`npm run dev -w @nexus/web`，然后 `npx tsx scripts/perf-public-api.mts [节点数，默认 4000]`
 *
 * 走的是**真 HTTP**：拿一枚真凭据打 `/api/v1/*`。绕开路由去进程内调 `apiDesignDocument` 量不到这一片要量的东西
 * ——序列化、传输、以及"读—改—写那一整个事务"的代价都在路由那一侧（§146 那条"真实 HTTP 路径"的教训同形状）。
 *
 * 不做断言：这台机器的墙上时钟随负载飘（同一操作五遍里能差一倍），所以每项都报中位与最小，
 * 与 `perf-save.mts` 同一条纪律。数字记进 `docs/PERFORMANCE.md`。
 *
 * 四个读数各钉一件事：
 *  - GET 整份文档的**字节数**：这一格没有分页也没有裁剪，体积就是限度的全部内容，得说得出数；
 *  - gzip 那一份是本机对同一串字节压一遍，用来说"如果走压缩传输会是多少"，**不是**服务端真压过；
 *  - 小文档上 PATCH 一条 insert 与 200 条 set：写那一侧的固定代价与 op 数的斜率；
 *  - 大文档上 PATCH 一条 insert：读—改—写整个事务在 N 节点下的代价（这才是"公网能不能拿它改大项目"的答案）。
 */
import { performance } from 'node:perf_hooks';
import { request } from 'node:http';
import { gzipSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { createNode } from '@nexus/design-model';
import { createProject, loadDocument, saveDocument } from '../apps/web/src/server/domain/projects';
import { issueApiToken } from '../apps/web/src/server/domain/api-tokens';
import { getDb } from '../apps/web/src/server/db/client';
import { projects, users } from '../apps/web/src/server/db/schema';

const BASE = process.env.NEXUS_BASE_URL ?? 'http://localhost:3100';
const NODES = Number(process.argv[2] ?? 4000);
/**
 * 与 `perf-browser.mts` 同一条纪律：每一组数都要带着"这是什么构建"的口径。
 * 那一轮量过同一台机器上 `next dev` 与生产构建差 5 倍，所以不带口径的延迟没有比较价值。
 * 字节数那一栏不受构建影响（序列化的是同一份文档），受影响的是延迟与并发。
 */
const measuredUnder =
  process.env.PERF_LABEL ?? '未标口径（跑时带 PERF_LABEL=dev / prod-<commit>，否则这组延迟不能与别组比）';

interface Measured<T> {
  ms: number;
  bytes: number;
  gzipped: number;
  status: number;
  body: T;
  /**
   * 线上到底压没压。`bytes` 是解压之后的长度（fetch 会透明解压），所以"这一格 3.2MB"这句话
   * 只有在 encoding 为空时才成立；不看这一栏就会把"服务端压过"读成"没压"。
   */
  encoding: string | null;
  contentLength: string | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** 一行读数：中位 / 最小，外加每一遍的原始值（体积不在这里报，它跟的是最后一次的那一份） */
function report(label: string, runs: { ms: number }[]): void {
  const ms = runs.map((r) => r.ms);
  const shown = ms.map((v) => v.toFixed(1)).join(' / ');
  console.log(
    `${label}: 中位 ${median(ms).toFixed(1)}ms / 最小 ${Math.min(...ms).toFixed(1)}ms（${shown}）`,
  );
}

async function call<T>(path: string, token: string, init?: RequestInit): Promise<Measured<T>> {
  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    ms: performance.now() - started,
    bytes: buf.length,
    gzipped: gzipSync(buf).length,
    status: res.status,
    body: (buf.length ? JSON.parse(buf.toString('utf8')) : null) as T,
    encoding: res.headers.get('content-encoding'),
    contentLength: res.headers.get('content-length'),
  };
}

/**
 * 不经 fetch 的那一层透明解压，直接看线上走了多少字节。
 *
 * fetch 会把 gzip 解开，所以"响应 3.2MB"这句话在它那里永远成立——问不出"有没有压"。
 * 这里自己声明能收哪些编码，然后数收到的 chunk：encoding 是 identity 就是真没压。
 */
function wireProbe(path: string, token: string, acceptEncoding: string): Promise<{ status: number; wireBytes: number; encoding: string; ms: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${path}`);
    const started = performance.now();
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, 'accept-encoding': acceptEncoding },
      },
      (res) => {
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            wireBytes: total,
            encoding: res.headers['content-encoding'] ?? 'identity',
            ms: performance.now() - started,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function main(): Promise<void> {
  // 不带凭据打一次 v1：回 401 才算"服务在跑"且"鉴权那扇门是关着的"。
  // 这里没有 /api/health 可用（api 目录下没有那一格），而这一格本来就是这一片要量的门
  const gate = await fetch(`${BASE}/api/v1/projects`).then((r) => r.status).catch(() => 0);
  if (gate !== 401) {
    throw new Error(
      `${BASE} 上没在跑着可量的 web 服务（不带凭据的 /api/v1/projects 回 ${gate}，预期 401）——` +
        `起一个（dev：npm run dev -w @nexus/web；生产构建：npm run build -w @nexus/web 再 npx next start -p <端口>），` +
        `端口不是 3100 时用 NEXUS_BASE_URL 指过来`,
    );
  }

  console.log(`口径 ${measuredUnder} · 目标 ${BASE} · 大档 ${NODES} 节点`);

  const db = getDb();
  const [owner] = await db
    .insert(users)
    .values([{ displayName: 'Perf Public API Probe', email: `perf-api+${Date.now()}@nexus.test` }])
    .returning({ id: users.id });
  if (!owner) throw new Error('建不出用户，跑不下去');

  // 小于 1KB 的报文要说清字节数：清单那一格在探针用户还没有项目时就是几十个字节的 `{"projects":[]}`，
  // 一律除以 1024 会把它报成"0KB"，读的人就分不清"空"与"没量到"
  const kb = (n: number) => (n < 1024 ? `${n}B` : `${(n / 1024).toFixed(0)}KB`);

  try {
    const issued = await issueApiToken({
      userId: owner.id,
      name: 'Perf 探针',
      scopes: ['projects:read', 'design:read', 'design:write'],
    });
    const token = issued.token;

    const small = await createProject(owner.id, { name: 'Perf API 小文档', kind: 'website' });
    const smallDoc = (await loadDocument(small.id))!;
    const smallPage = smallDoc.pages[0]!;
    const smallRoot = smallPage.nodes[smallPage.rootId]!;
    // "小"档要有 200 个以上节点，否则那句"一次 200 条 op"是假的：`slice(0, 200)` 拿到的条数
    // 由文档自己说了算，只有 8 个节点时量到的其实是"一次 8 条"（第一遍跑就是这样）
    for (let i = 0; i < 220; i += 1) {
      const node = createNode({ type: 'text', name: `s${i}`, text: `v${i}`, parentId: smallRoot.id });
      smallPage.nodes[node.id] = node;
      smallRoot.children.push(node.id);
    }
    await saveDocument(small.id, smallDoc);
    console.log(`小文档档：${Object.keys(smallPage.nodes).length} 个节点`);

    const getSmall = await call<{ document: unknown }>(`/api/v1/projects/${small.id}/design`, token);
    console.log(
      `GET design（小）：${getSmall.status} · ${getSmall.ms.toFixed(1)}ms · ${kb(getSmall.bytes)}（gzip ${kb(getSmall.gzipped)}）`,
    );

    const inserts: { ms: number; bytes: number; gzipped: number }[] = [];
    let nodeCountAfter = 0;
    for (let i = 0; i < 5; i += 1) {
      const node = createNode({ type: 'text', name: `api-${i}`, text: `v${i}`, parentId: smallRoot.id });
      const r = await call<{ nodeCount: number; warnings: string[] }>(`/api/v1/projects/${small.id}/design`, token, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summary: `探针：加一条节点 ${i}`, ops: [{ op: 'insert', node, parentId: smallRoot.id }] }),
      });
      inserts.push(r);
      nodeCountAfter = r.body.nodeCount;
      if (r.status !== 200) console.log(`  第 ${i} 次 insert 回了 ${r.status}：${JSON.stringify(r.body)}`);
      else if (r.body.warnings.length) console.log(`  第 ${i} 次 insert 带 warning：${r.body.warnings.join(' | ')}`);
    }
    report(`PATCH 1 条 insert（小，起点 ${Object.keys(smallPage.nodes).length} 节点 → ${nodeCountAfter}）`, inserts);

    // 200 条是公网那一份的上限（内部 AI 是 4000，因为它在同一个进程里）；斜率 = (200 条 - 1 条) / 199
    const setOps = Object.values(smallPage.nodes)
      .slice(0, 200)
      .map((node) => ({ op: 'set', nodeId: node.id, path: 'name', value: `renamed-${Date.now()}` }));
    const bigPatch: { ms: number; bytes: number; gzipped: number }[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await call<{ appliedOps: number }>(`/api/v1/projects/${small.id}/design`, token, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summary: `探针：一次改 ${setOps.length} 条`, ops: setOps }),
      });
      bigPatch.push(r);
      if (r.status !== 200) console.log(`  ${setOps.length} 条那一次回了 ${r.status}：${JSON.stringify(r.body)}`);
    }
    report(`PATCH ${setOps.length} 条 set（小）`, bigPatch);

    const target = Object.values(smallDoc.pages[0]!.nodes).find((n) => n.id !== smallRoot.id)!;
    const refusal = await call<{ reason?: string }>(`/api/v1/projects/${small.id}/design`, token, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ summary: '探针：删一个节点', ops: [{ op: 'remove', nodeId: target.id }] }),
    });
    console.log(`PATCH 一条 remove（小）：${refusal.status} · ${refusal.ms.toFixed(1)}ms · ${JSON.stringify(refusal.body).slice(0, 160)}`);

    if (NODES > 0) {
      const large = await createProject(owner.id, { name: `Perf API ${NODES}`, kind: 'website' });
      const doc = (await loadDocument(large.id))!;
      const page = doc.pages[0]!;
      const root = page.nodes[page.rootId]!;
      for (let i = 0; i < NODES; i += 1) {
        const node = createNode({ type: 'text', name: `n${i}`, text: `value ${i}`, parentId: root.id });
        page.nodes[node.id] = node;
        root.children.push(node.id);
      }
      await saveDocument(large.id, doc);

      const reads: { ms: number; bytes: number; gzipped: number }[] = [];
      // 回执自己带 nodeCount（数的是库里那一份），所以这里不去拆 document——它是 z.unknown()，拆法一错就是编
      let lastRead: Measured<{ nodeCount: number; pageCount: number }> | null = null;
      for (let i = 0; i < 5; i += 1) {
        const r = await call<{ nodeCount: number; pageCount: number }>(
          `/api/v1/projects/${large.id}/design`,
          token,
        );
        reads.push(r);
        lastRead = r;
      }
      const lr = lastRead!;
      const storedNodes = lr.body.nodeCount;
      report(`GET design（${NODES} 档，回读 ${storedNodes} 节点 / ${lr.body.pageCount} 页）`, reads);
      console.log(
        `  同一份报文的体积：${kb(lr.bytes)} 解开后 / ${kb(lr.gzipped)} gzip（本机压的，不是服务端压的）· 每节点约 ${(lr.bytes / storedNodes).toFixed(0)} 字节`,
      );

      // "线上走了多少字节"要自己数 chunk：fetch 会透明解压，所以在它那里"响应 3.2MB"永远成立，
      // 问不出服务端到底压没压。两句一起报：声明能收 gzip 时走多少，只要 identity 时走多少。
      const wantGzip = await wireProbe(`/api/v1/projects/${large.id}/design`, token, 'gzip, deflate, br');
      const wantPlain = await wireProbe(`/api/v1/projects/${large.id}/design`, token, 'identity');
      console.log(
        `  线上实测：要 gzip 时 ${wantGzip.status} · content-encoding=${wantGzip.encoding} · ${kb(wantGzip.wireBytes)}（${wantGzip.ms.toFixed(0)}ms）；` +
          `要 identity 时 ${wantPlain.status} · ${kb(wantPlain.wireBytes)}（${wantPlain.ms.toFixed(0)}ms）`,
      );
      console.log(
        wantGzip.encoding === 'identity'
          ? `  → 这一格没压：${storedNodes} 个节点的读把 ${kb(wantGzip.wireBytes)} 原样推给调用方，而同一份内容 gzip 只要 ${kb(lr.gzipped)}`
          : `  → 服务端压过了（${wantGzip.encoding}），线上 ${kb(wantGzip.wireBytes)} 对解开的 ${kb(lr.bytes)}`,
      );

      const largeInserts: { ms: number; bytes: number; gzipped: number }[] = [];
      let after = 0;
      for (let i = 0; i < 3; i += 1) {
        const node = createNode({ type: 'text', name: `api-large-${i}`, text: `v${i}`, parentId: root.id });
        const r = await call<{ nodeCount: number; warnings: string[] }>(`/api/v1/projects/${large.id}/design`, token, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ summary: `探针：大文档加一条 ${i}`, ops: [{ op: 'insert', node, parentId: root.id }] }),
        });
        largeInserts.push(r);
        after = r.body.nodeCount;
        if (r.status !== 200) console.log(`  大文档第 ${i} 次 insert 回了 ${r.status}：${JSON.stringify(r.body).slice(0, 200)}`);
        else if (r.body.warnings.length) console.log(`  大文档第 ${i} 次带 warning：${r.body.warnings.join(' | ')}`);
      }
      report(`PATCH 1 条 insert（${NODES} 档 → ${after}）`, largeInserts);
    }

    // 清单放在最后量：这一格要报的是"名下有两个项目时公网读一次多大"，
    // 在探针还没建项目之前量到的是 `{"projects":[]}` 那几十个字节的空账
    const list = await call<{ projects: unknown[] }>('/api/v1/projects', token);
    console.log(
      `GET /api/v1/projects（名下 ${list.body.projects.length} 个项目）：${list.status} · ${list.ms.toFixed(1)}ms · ${kb(list.bytes)}`,
    );
  } finally {
    await db.delete(projects).where(eq(projects.ownerId, owner.id));
    await db.delete(users).where(eq(users.id, owner.id));
  }
  process.exit(0);
}

await main();
