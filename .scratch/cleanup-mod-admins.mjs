import postgres from 'postgres';
const sql = postgres('postgres://nexus:nexus_dev_only@localhost:55433/nexus', { max: 1 });
const gone = await sql`delete from users where email like 'mod+admin+%@nexus.test' returning id, email`;
console.log('removed:', gone.length);
for (const r of gone) console.log(' ', r.email);
await sql.end({ timeout: 5 });
