import postgres from 'postgres';
const url = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';
const t0 = Date.now();
const sql = postgres(url, { max: 2, connect_timeout: 10, idle_timeout: 5 });
async function step(label, fn) {
  const a = Date.now();
  try { const r = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 25000))]); console.log(label, Date.now() - a, 'ms ::', JSON.stringify(r).slice(0, 160)); }
  catch (e) { console.log(label, Date.now() - a, 'ms :: ERROR', e.message); }
}
await step('select 1', () => sql`select 1 as ok`);
await step('count projects', () => sql`select count(*)::int as n from projects`);
await step('backends', () => sql`select count(*)::int as n, max(state) as st from pg_stat_activity`);
await step('locks waiting', () => sql`select count(*)::int as n from pg_locks where not granted`);
console.log('total', Date.now() - t0, 'ms');
await sql.end({ timeout: 5 });
