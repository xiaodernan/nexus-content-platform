/**
 * READ-ONLY audit of the shared schema on local Postgres (55433).
 * Answers two questions honestly, without changing a byte:
 *   1. which tables are read by sequential scan more than index scan (missing-index candidates)?
 *   2. which indexes have never been scanned (write cost without read benefit)?
 * Output is plain text written to stdout — evidence capture is done by the operator.
 */
import postgres from 'postgres';

const url = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@127.0.0.1:55433/nexus';
const sql = postgres(url, { max: 1, connect_timeout: 5 });

const topSequential = await sql`
  select relname,
         n_live_tup::bigint                        as rows,
         seq_scan,
         coalesce(idx_scan, 0)                     as idx_scan,
         seq_tup_read
    from pg_stat_user_tables
   where seq_scan > 0
   order by seq_tup_read desc
   limit 15
`;
console.log('=== top 15 consumers of SEQUENTIAL READS (seq_tup_read) ===');
console.table(topSequential);

const neverIndexed = await sql`
  select t.relname                       as table_name,
         pg_size_pretty(pg_relation_size(t.relid)) as table_size,
         t.seq_scan,
         coalesce(t.idx_scan, 0)         as idx_scan
    from pg_stat_user_tables t
   where t.n_live_tup > 1000
     and coalesce(t.idx_scan, 0) = 0
   order by t.seq_tup_read desc
   limit 15
`;
console.log('=== tables >1000 rows NEVER read by index (idx_scan = 0) ===');
console.table(neverIndexed);

const unusedIndexes = await sql`
  select s.relname                              as table_name,
         s.indexrelname                         as index_name,
         s.idx_scan,
         pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size
    from pg_stat_user_indexes s
   where s.idx_scan = 0
     and pg_relation_size(s.indexrelid) > 1048576
   order by pg_relation_size(s.indexrelid) desc
   limit 20
`;
console.log('=== indexes >1MB with zero scans since restart ===');
console.table(unusedIndexes);

const sizes = await sql`
  select relname                              as table_name,
         pg_size_pretty(pg_total_relation_size(relid)) as total_size,
         n_live_tup                            as rows
    from pg_stat_user_tables
   order by pg_total_relation_size(relid) desc
   limit 10
`;
console.log('=== top 10 tables by total size ===');
console.table(sizes);

await sql.end({ timeout: 5 });
