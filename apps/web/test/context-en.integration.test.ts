import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { buildProjectContext } from '../src/server/domain/context';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * v736：NEXUS_LOCALE → 上下文装配的 en 读数面。
 * 独立的临时装配（不动共享 fixture），打真实 Postgres。
 */

let owner: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [row] = await db
    .insert(users)
    .values({ displayName: 'Context En Owner', email: `ctxen+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = row!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

describe('§66-71 en 读数面（v736）', () => {
  it('传 locale=en → unavailable / branches 为英文，totals 与 zh 装配逐字节相等', async () => {
    const id = (await createProject(owner, { name: 'Ctx En', kind: 'website' })).id;

    const zh = await buildProjectContext(id, owner, {}, 'zh');
    expect(zh.ok).toBe(true);
    if (!zh.ok) return;
    const en = await buildProjectContext(id, owner, {}, 'en');
    expect(en.ok).toBe(true);
    if (!en.ok) return;

    expect(en.context.unavailable[0]).toContain('Current selection / page / viewport');
    expect(en.context.unavailable.join(' ')).not.toContain('画布本地');

    const codeZh = zh.context.branches.find((b) => b.name === 'Code')!;
    const codeEn = en.context.branches.find((b) => b.name === 'Code')!;
    expect(codeZh.note).toMatch(/个文件、\d+ 个符号/);
    expect(codeEn.note).toMatch(/files, \d+ symbols/);
    expect(codeEn.note).not.toContain('个文件');

    // 数与图与语言无关：totals 两侧逐字相等
    expect(en.context.design.totals).toEqual(zh.context.design.totals);
    expect(en.context.code.totals).toEqual(zh.context.code.totals);

    // omissions/省略清单也跟语言走
    expect(en.context.design.omissions.join(' ')).toContain('style values');
  });

  it('预算极小 → trimmed 全部英文（设计目录与代码目录）', async () => {
    const id = (await createProject(owner, { name: 'Ctx En Tiny', kind: 'website' })).id;
    const en = await buildProjectContext(id, owner, { maxIndexChars: 1, maxCodeChars: 1 }, 'en');
    expect(en.ok).toBe(true);
    if (!en.ok) return;
    const trimmed = [...(en.context.design.trimmed ?? []), ...(en.context.code.trimmed ?? [])];
    expect(trimmed.length).toBeGreaterThan(0);
    for (const line of trimmed) {
      expect(line, `trimmed 含中文：${line}`).not.toMatch(/[一-鿿]/);
    }
  });
});
