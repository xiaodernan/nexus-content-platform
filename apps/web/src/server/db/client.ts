import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

export const DATABASE_URL =
  process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';

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
