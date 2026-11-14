import postgres from 'postgres';
const sql = postgres('postgres://nexus:nexus_dev_only@127.0.0.1:55433/nexus', { max: 1 });

async function main() {
  const nodes = await sql`select id, page_id, data->>'name' as name, data->'typography'->>'fontSize' as fontsize from design_nodes where data->>'name' = 'Eyebrow' order by created_at desc limit 5`;
  for (const n of nodes) {
    console.log(`node id=${n.id} page=${n.page_id} name=${n.name} fontsize=${n.fontsize}`);
  }
  await sql.end({ timeout: 5 });
}
main().catch((e) => { console.error(e); process.exit(1); });
