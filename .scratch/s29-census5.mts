/** 写第二十九片那一节时的活体读数（此刻的库，不是夹具） */
import { scanGuestReclaimCandidates } from '../apps/web/src/server/domain/guest-reclaim';
import postgres from 'postgres';

const sql = postgres(process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus', { max: 1 });
const one = async (q: string) => (await sql.unsafe(q))[0] as Record<string, unknown>;

console.log('NOW', new Date().toISOString());
console.log('USERS', await one(`select count(*)::int as n, count(*) filter (where guest and deleted_at is null)::int as live_guest,
  count(*) filter (where deleted_at is not null)::int as deleted, min(created_at)::text as first_row from users`));
console.log('SESSIONS', await one(`select count(*)::int as n, count(*) filter (where expires_at > now())::int as live,
  min(expires_at)::text as min_exp, max(expires_at)::text as max_exp
  from sessions s where exists (select 1 from users u where u.id = s.user_id and u.guest)`));
const scan = await scanGuestReclaimCandidates();
console.log('SCAN', JSON.stringify({
  now: scan.now,
  cutoff: scan.cutoff,
  stale: scan.stale,
  eligible: scan.candidates.length,
  published: scan.skippedPublished,
  token: scan.skippedLiveToken,
  batch: scan.batch,
  truncated: scan.scanTruncated,
}));
const fk = await one(`select count(*)::int as n from pg_constraint where contype='f' and confrelid='users'::regclass`);
console.log('FK_TO_USERS', fk);
console.log('FK_ACTIONS', JSON.stringify(await sql`
  select c.confdeltype as act, count(*)::int as n from pg_constraint c where c.contype='f' and c.confrelid='users'::regclass
  group by 1 order by 1`));
await sql.end({ timeout: 5 });
process.exit(0);
