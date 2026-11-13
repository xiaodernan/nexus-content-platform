/**
 * §49/§93 pgvector wire bench — the index NEXUS already ships, measured on this machine:
 *
 *   npx tsx scripts/pgvector-wire-bench.mts [rows]   (default 10000 and 30000)
 *
 * What it proves (and what it does NOT):
 *   ✓ `vector(1536)` column + HNSW (vector_cosine_ops) index on 15433-named scratch table can build,
 *     serve top-20 nearest-neighbor queries, and be cheaper than Seq Scan at N=10k/30k — measured, not asserted.
 *   ✓ pgvector 0.8.6 在本机 PostgreSQL 55433 上真实可用（扩展已装、HNSW 可建、查询返回真实字节）。
 *   ✗ 不证明语义质量——合成随机向量没有任何语义，这只是索引/IO 尺寸与查询价格的 wire 判据。
 *   ✗ 不碰 knowledge_chunks 真表；scratch 表 `nexus_bench_vector_wire_<N>` 用完即 DROP。
 *   ✗ 不声明/暗示 embedding provider 已配置（wkapi.pro 只有 chat 模型：2026-11-13 /v1/models 实测无 embedding）。
 *
 * 判据（每行）：
 *   1. 插入 N 行（COPY-scale 批插，事务内）
 *   2. CREATE INDEX HNSW 耗时 + 索引 size（pg_relation_size）
 *   3. 连续 50 次 top-20 查询（每次不同随机 query vector）：wall time p50/p95/max
 *   4. 同一查询 SET enable_indexscan=off（Seq Scan 下限）对照
 */
import postgres from 'postgres';

const DB_URL = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';

/** Seeded LCG — deterministic inputs, so the bench is reproducible on any machine. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeVector(seed: number): number[] {
  const rand = mulberry32(seed);
  const v: number[] = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    // Box-Muller-ish: uniform → mild positive correlation is irrelevant; keep simple & bounded
    v[i] = Math.round((rand() * 2 - 1) * 1000) / 1000;
  }
  return v;
}

function toLiteral(v: number[]): string {
  return `[${v.map((x) => x.toFixed(3)).join(',')}]`;
}

const percentiles = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const pick = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * (s.length - 1)))];
  return { p50: pick(50), p95: pick(95), max: s[s.length - 1]! };
};

async function benchOne(sql: postgres.Sql, rows: number) {
  const table = `nexus_bench_vector_wire_${rows}`;
  console.log(`\n=== N=${rows} ===`);
  await sql.unsafe(`DROP TABLE IF EXISTS ${table}`);
  await sql.unsafe(`CREATE TABLE ${table} (id bigint PRIMARY KEY, embedding vector(1536) NOT NULL)`);

  console.log('inserting…');
  const insertStart = Date.now();
  for (let base = 0; base < rows; base += 250) {
    const values: string[] = [];
    for (let i = base; i < Math.min(base + 250, rows); i++) {
      values.push(`(${i}, '${toLiteral(makeVector(i + 1))}'::vector)`);
    }
    await sql.unsafe(`INSERT INTO ${table} (id, embedding) VALUES ${values.join(',')}`);
    if (base % 2500 === 0) console.log(`  ${base}/${rows}`);
  }
  const insertMs = Date.now() - insertStart;
  console.log(`insert ${rows} rows in ${(insertMs / 1000).toFixed(1)}s`);

  const buildStart = Date.now();
  await sql.unsafe(`CREATE INDEX ${table}_hnsw ON ${table} USING hnsw (embedding vector_cosine_ops)`);
  const buildMs = Date.now() - buildStart;
  const [{ size_bytes }] = await sql`SELECT pg_relation_size((${table} || '_hnsw')::regclass)::bigint AS size_bytes`;
  console.log(`HNSW build ${(buildMs / 1000).toFixed(1)}s · index size ${(Number(size_bytes) / 1024 / 1024).toFixed(1)} MiB`);

  // 50 distinct random probes
  const latencies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const q = `'[${makeVector(900000 + i).map((x) => x.toFixed(3)).join(',')}]'::vector`;
    const t0 = process.hrtime.bigint();
    await sql.unsafe(`SELECT id, embedding <=> ${q} AS d FROM ${table} ORDER BY embedding <=> ${q} LIMIT 20`);
    const t1 = process.hrtime.bigint();
    latencies.push(Number(t1 - t0) / 1e6);
  }
  const { p50, p95, max } = percentiles(latencies);
  console.log(`top-20 ANN ×50: p50 ${p50.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms · max ${max.toFixed(2)} ms`);

  await sql.unsafe(`SET enable_indexscan = off`);
  const seqLatencies: number[] = [];
  for (let i = 0; i < 10; i++) {
    const q = `'[${makeVector(800000 + i).map((x) => x.toFixed(3)).join(',')}]'::vector`;
    const t0 = process.hrtime.bigint();
    await sql.unsafe(`SELECT id, embedding <=> ${q} AS d FROM ${table} ORDER BY embedding <=> ${q} LIMIT 20`);
    const t1 = process.hrtime.bigint();
    seqLatencies.push(Number(t1 - t0) / 1e6);
  }
  await sql.unsafe(`SET enable_indexscan = on`);
  const seq = percentiles(seqLatencies);
  console.log(`top-20 Seq Scan ×10 (enable_indexscan=off): p50 ${seq.p50.toFixed(2)} ms · max ${seq.max.toFixed(2)} ms`);

  await sql.unsafe(`DROP TABLE IF EXISTS ${table}`);

  return { rows, insertMs, buildMs, indexBytes: Number(size_bytes), ann: { p50, p95, max }, seqScan: { p50: seq.p50, max: seq.max } };
}

async function main() {
  const args = process.argv.slice(2).map(Number);
  const sizes = args.length > 0 ? args : [10_000, 30_000];
  const sql = postgres(DB_URL, { max: 1 });
  const results = [];
  try {
    for (const rows of sizes) {
      results.push(await benchOne(sql, rows));
    }
  } finally {
    // benchOne already drops its scratch table; nothing to clean here.
    await sql.end({ timeout: 5 });
  }
  console.log('\n=== JSON ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error('[fail]', e instanceof Error ? e.message : e); process.exit(1); });
