import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

// 默认端口必须与 apps/web/.env.example 的 5443 一致。
// 55433 是旧默认值，落在 Windows Hyper-V 保留段 55379–55478，容器根本绑不上——
// 2026-11-19 那次「所有 DB 页面 500」就是它。忘配 env 时也不能连一个不可能起来的端口。
export const DATABASE_URL =
  process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:5443/nexus';

let singleton: Db | undefined;
let client: postgres.Sql | undefined;

/** 连接池按 dev 复用；serverless 部署时改回每请求新建（docs/ARCHITECTURE.md）。 */
export function getDb(): Db {
  if (!singleton) {
    client = postgres(DATABASE_URL, { max: Number(process.env.NEXUS_DB_POOL ?? 5) });
    singleton = drizzle(client, { schema });
  }
  return singleton;
}

export { schema };
