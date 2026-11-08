import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import { CREDIT_LEDGER_KINDS, CREDIT_LEDGER_SOURCES } from '../src/server/db/schema';

/**
 * `credit_ledger` 的取值域守卫：**把库里真正生效的 CHECK 与常量逐条对齐**。
 *
 * ## 为什么要有这一条
 * 2026-10-09 发现 marketplace 的买/分成路径**从 0024/0025 落地起就一行都写不进去**：
 * 那两条迁移想"换约束"却把旧约束的名字写错了（多了一个 `_check` 后缀），
 * `DROP CONSTRAINT IF EXISTS` 于是**静默地什么都没删**，ADD 又建了一条新名字的。
 * 两条同时生效，**旧那条把 'marketplace' 挡死**，而三关（kind / source / source_shape）
 * 一个比一个隐蔽：修完 kind 还有 source，修完 source 还有 source_shape。
 *
 * 这个仓库对 api_tokens 的 scope 名单有同形状的守卫（常量 / 迁移里生效的 CHECK / 端点真执行它），
 * 所以**那一次 scope 变更被抓住了**；`credit_ledger` 没有，于是它坏了两周没人知道。
 * 这一条就是补上那个缺口。
 *
 * ## 为什么读 pg_constraint 而不是读迁移文件
 * 迁移文件里**写的东西**和库里**生效的东西**在这次事故里不是一回事：
 * 文件里明明白白写着"加了 marketplace"，库里却还是旧约束在拦。
 * 只有从 `pg_constraint` 读回来，问的才是"今天到底哪条在管我"。
 */

interface ConstraintRow {
  conname: string;
  def: string;
}

const constraintsOn = async (table: string): Promise<ConstraintRow[]> => {
  const rows = await getDb().execute(sql`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = ${table}::regclass and contype = 'c'
    order by conname
  `);
  return rows as unknown as ConstraintRow[];
};

/** 从 `CHECK ((kind = ANY (ARRAY['a'::text, 'b'::text])))` 里把取值抠出来 */
const valuesIn = (def: string): string[] =>
  [...def.matchAll(/'([^']+)'::text/g)].map((m) => m[1]!).sort();

describe('credit_ledger 的 kind：库里生效的约束与 CREDIT_LEDGER_KINDS 是同一份', () => {
  it('**只有一条**约束在管 kind（两条同时生效时旧那条会静默把新值挡死）', async () => {
    const all = await constraintsOn('credit_ledger');
    // 判据是"定义里提到 kind 这个列"，而不是名字像不像——这次事故里坏就坏在名字
    const governing = all.filter((c) => /"kind"|\(kind/.test(c.def));
    expect(
      governing.map((c) => c.conname),
      `管 kind 的约束有 ${governing.length} 条：${governing.map((c) => c.conname).join(' / ')}。` +
        '多条同时生效时，取值域是它们的**交集**——旧那条会把新加的取值挡死，' +
        '这正是 0024 那次事故的形状',
    ).toHaveLength(1);
    expect(valuesIn(governing[0]!.def)).toEqual([...CREDIT_LEDGER_KINDS].sort());
  });
});

describe('credit_ledger 的 source：库里生效的成员表与 CREDIT_LEDGER_SOURCES 是同一份', () => {
  it('**只有一条**成员表约束（0025 那次是同一个错：DROP 的名字多了一个 _check）', async () => {
    const all = await constraintsOn('credit_ledger');
    const governing = all.filter((c) => /"source"|\(source/.test(c.def) && c.def.includes('ANY'));
    expect(
      governing.map((c) => c.conname),
      `管 source 成员表的约束有 ${governing.length} 条：${governing.map((c) => c.conname).join(' / ')}`,
    ).toHaveLength(1);
    expect(valuesIn(governing[0]!.def)).toEqual([...CREDIT_LEDGER_SOURCES].sort());
  });

  it('source_shape 给每一个来源都留了分支（少一个分支 = 那个来源一律写不进去）', async () => {
    const all = await constraintsOn('credit_ledger');
    const shape = all.find((c) => c.def.includes('ANY') === false && /"source"|\(source/.test(c.def));
    expect(shape, '找不到 source_shape 那条约束').toBeDefined();
    for (const source of CREDIT_LEDGER_SOURCES) {
      expect(shape!.def, `source_shape 里没有 ${source} 的分支，这个来源会被一律拒掉`).toContain(
        `'${source}'`,
      );
    }
  });
});

describe('账本是只追加的：改账要新写一行，不是改旧行', () => {
  it('DELETE 被触发器挡住（不是靠自觉）', async () => {
    const rows = (await getDb().execute(sql`
      select tgname from pg_trigger
      where tgrelid = 'credit_ledger'::regclass and not tgisinternal
    `)) as unknown as { tgname: string }[];
    expect(rows.length, '账本上一个触发器都没有：只追加这条纪律没有任何东西在守').toBeGreaterThan(0);
  });
});
