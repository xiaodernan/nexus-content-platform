/**
 * 迁移执行器：按序应用 infra/migrations/*.sql，并把已应用的版本号记入 schema_migrations。
 * 不用 drizzle-kit migrate —— 它在本机连接 55433 时会挂起（见 docs/ENVIRONMENT.md）。
 * 用法：npm run db:migrate
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

const url = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';
const dir = resolve(import.meta.dirname, '../infra/migrations');

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const sql = postgres(url, { max: 1 });
try {
  await sql`set client_min_messages = warning`;
  await sql`create schema if not exists nexus_meta`;
  // pgvector 必须先于建表存在；drizzle-kit generate 不会输出 CREATE EXTENSION
  await sql`create extension if not exists vector`;
  await sql`create table if not exists nexus_meta.schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`;
  const applied = new Set((await sql`select version from nexus_meta.schema_migrations`).map((r) => r.version as string));

  let ran = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) {
      console.log(`= skip ${version} (already applied)`);
      continue;
    }
    const raw = readFileSync(resolve(dir, file), 'utf8');
    const statements = raw
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`> apply ${version} (${statements.length} statements)`);
    await sql.begin(async (tx) => {
      for (const statement of statements) await tx.unsafe(statement);
      await tx`insert into nexus_meta.schema_migrations (version) values (${version})`;
    });
    ran += 1;
  }
  console.log(ran ? `done: ${ran} migration(s) applied` : 'done: nothing to apply');
} finally {
  await sql.end({ timeout: 1 });
}
