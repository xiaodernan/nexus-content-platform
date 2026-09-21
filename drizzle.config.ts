import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './apps/web/src/server/db/schema.ts',
  out: './infra/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus',
  },
  strict: true,
  verbose: true,
});
