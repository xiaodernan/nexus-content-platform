import { describe, expect, it } from 'vitest';
import { apiDatabaseTarget } from './verify-actuator.mts';

describe('apiDatabaseTarget', () => {
  it('uses the host, port and database from the configured JDBC URL', () => {
    expect(apiDatabaseTarget('jdbc:postgresql://localhost:55433/nexus_api_smoke')).toEqual({
      host: 'localhost',
      port: 55433,
      database: 'nexus_api_smoke',
      quotedDatabase: '"nexus_api_smoke"',
    });
  });

  it('uses the PostgreSQL default port when the URL omits one', () => {
    expect(apiDatabaseTarget('jdbc:postgresql://127.0.0.1/nexus_api_smoke').port).toBe(5432);
  });

  it('quotes database identifiers and strips IPv6 brackets from the host', () => {
    expect(apiDatabaseTarget('jdbc:postgresql://[::1]:55433/smoke%22db')).toEqual({
      host: '::1',
      port: 55433,
      database: 'smoke"db',
      quotedDatabase: '"smoke""db"',
    });
  });

  it('rejects a missing database and a non-PostgreSQL scheme', () => {
    expect(() => apiDatabaseTarget('jdbc:postgresql://localhost:55433/')).toThrow(/host and database/);
    expect(() => apiDatabaseTarget('jdbc:mysql://localhost:3306/nexus')).toThrow(/host and database/);
  });
});
