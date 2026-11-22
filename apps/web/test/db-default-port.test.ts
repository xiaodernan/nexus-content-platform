/**
 * §DB-DEFAULT-PORT · 数据库默认端口不得撞 Windows Hyper-V 保留段（2026-11-21）。
 *
 * 2026-11-19 撞库演练顺带发现：client.ts 的兜底 DATABASE_URL 用 55433，落在
 * Windows 保留段 55379–55478，容器绑不上 → 所有 DB 页面静默 500。当时只修了
 * .env.local/.env.example（都改 5443），代码里的兜底仍是坏的。本门钉死：
 *   1. 代码默认端口 == .env.example 端口（单一真值，不漂移）；
 *   2. 默认 URL 不含保留段里的 55433。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const clientSrc = readFileSync(join(ROOT, 'src/server/db/client.ts'), 'utf-8');
const envExample = readFileSync(join(ROOT, '.env.example'), 'utf-8');

function defaultUrl(): string {
  const m = clientSrc.match(/process\.env\.NEXUS_DATABASE_URL\s*\?\?\s*'([^']+)'/);
  expect(m, 'client.ts 必须有 NEXUS_DATABASE_URL 的 ?? 兜底字面量').not.toBeNull();
  return m![1]!;
}

function portOf(url: string): string {
  const m = url.match(/:(\d+)\//);
  expect(m, `URL 里应有端口：${url}`).not.toBeNull();
  return m![1]!;
}

describe('§DB-DEFAULT-PORT 数据库兜底端口', () => {
  const fallback = defaultUrl();

  it('兜底端口与 .env.example 一致（单一真值）', () => {
    const exampleLine = envExample.split('\n').find((l) => l.startsWith('NEXUS_DATABASE_URL=')) ?? '';
    expect(portOf(fallback)).toBe(portOf(exampleLine));
  });

  it('兜底端口不在 Windows Hyper-V 保留段 55379–55478', () => {
    const port = Number(portOf(fallback));
    const inReservedRange = port >= 55379 && port <= 55478;
    expect(inReservedRange, `端口 ${port} 落在 Hyper-V 保留段，容器绑不上`).toBe(false);
    expect(port).toBe(5443);
  });

  it('兜底 URL 仍只指向本机 dev 库（不泄漏外部主机）', () => {
    expect(fallback).toMatch(/@(localhost|127\.0\.0\.1):/);
  });
});
