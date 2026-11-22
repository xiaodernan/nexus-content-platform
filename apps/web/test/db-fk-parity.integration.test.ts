import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../src/server/db/client';

/**
 * 库里的外键必须和 `infra/migrations/*.sql` 声明的是同一批。
 *
 * 为什么要有这一条：2026-11-23 那次全量跑红在 `credits.integration` 的「删掉任务行 → 账本的 task_id
 * 被外键置空」——看着像那个只追加触发器把外键动作也挡了，实际是本机开发库 `nexus` 上
 * `credit_ledger` 的三条外键**根本不存在**（表在、触发器在、索引在，独独外键没了：那是 `drizzle-kit push`
 * 按一份还没有这三条引用的 schema 推平的结果，而 runner 只认 `nexus_meta.schema_migrations` 的版本号，
 * 已应用的迁移永远不会把它们补回来）。同一条漂移还让 `visual-benchmark` 删不掉自己留下的 session 行
 * （`sessions_user_id_users_id_fk` 也不在了），于是第二次跑就撞在 `sessions_token_hash_key` 上。
 *
 * 所以这一腿量的不是「功能对不对」，是**这台库到底是不是这些迁移建出来的**。名字与删除动作都从
 * 迁移正文派生（不手填），两个方向都比：声明了而库里没有 = 漂移；库里有而没一条迁移声明 = 有人手工
 * 改库。缺的那一条会被点名，而不是让下一条用例以「外键动作没走」的姿态红。
 */

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'infra', 'migrations');

/** pg_constraint.confdeltype 的取值：a=NO ACTION r=RESTRICT c=CASCADE n=SET NULL d=SET DEFAULT */
const DEL_CODE: Record<string, string> = {
  'NO ACTION': 'a',
  RESTRICT: 'r',
  CASCADE: 'c',
  'SET NULL': 'n',
  'SET DEFAULT': 'd',
};

type Declared = { table: string; column: string; onDelete: string; file: string };

/** 同名外键被两条迁移声明成不同的形状——这是要单独点名的矛盾，不是"后一条覆盖前一条"。 */
const conflicts: string[] = [];

function onDeleteOf(tail: string): string {
  const m = /ON\s+DELETE\s+(SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION|RESTRICT|CASCADE)/i.exec(tail);
  return m ? m[1].toUpperCase().replace(/\s+/g, ' ') : 'NO ACTION';
}

/**
 * 迁移声明外键有两种写法，都得读：
 * 1. `ALTER TABLE "t" ADD CONSTRAINT "name" FOREIGN KEY ("col") REFERENCES …`——名字就是约束名；
 * 2. `CREATE TABLE "t" ( "col" uuid REFERENCES "r"(id) ON DELETE … )`——没写名字，Postgres 自动叫
 *    `<表>_<列>_fkey`（0024 那批 marketplace 表就是这一族，库里确有 22 条这种名字）。
 *
 * 名字第一次出现的那一条才是它的**出处**：0048 那种"把丢掉的补回来"的迁移会把同一条外键再抄一遍，
 * 如果让它覆盖，缺失清单就会把责任报给修复它的那条迁移，而不是当初立它的那条（2026-11-23 实测踩过）。
 * 所以这里第一见为准，后面的同名声明只用来查动作是否一致。
 */
function declaredForeignKeys(): Map<string, Declared> {
  const out = new Map<string, Declared>();
  const record = (name: string, d: Declared) => {
    const first = out.get(name);
    if (!first) {
      out.set(name, d);
      return;
    }
    if (first.table !== d.table || first.column !== d.column || first.onDelete !== d.onDelete) {
      conflicts.push(
        `${name}：${first.file} 说 ${first.table}.${first.column} ON DELETE ${first.onDelete}，${d.file} 说 ${d.table}.${d.column} ON DELETE ${d.onDelete}`,
      );
    }
  };
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const raw = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    for (const m of raw.matchAll(
      /ALTER\s+TABLE\s+(?:ONLY\s+)?"?([a-zA-Z0-9_.]+)"?\s+ADD\s+CONSTRAINT\s+"?([a-zA-Z0-9_]+)"?\s+FOREIGN\s+KEY\s*\(\s*"?([a-zA-Z0-9_]+)"?\s*\)([^;]*)/gis,
    )) {
      record(m[2], {
        table: m[1].replace(/^public\./, ''),
        column: m[3],
        onDelete: onDeleteOf(m[4]),
        file,
      });
    }
    for (const t of raw.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_.]+)"?\s*\(([\s\S]*?)\n\)/gi,
    )) {
      const table = t[1].replace(/^public\./, '');
      for (const line of t[2].split('\n')) {
        const body = line.replace(/--.*$/, '');
        const c =
          /^\s*"?([a-zA-Z0-9_]+)"?\s+[\w"(),\s\d.]+?\s+REFERENCES\s+"?([a-zA-Z0-9_.]+)"?\s*\([^)]*\)(.*)$/i.exec(body);
        if (!c) continue;
        record(`${table}_${c[1]}_fkey`, {
          table,
          column: c[1],
          onDelete: onDeleteOf(c[3]),
          file,
        });
      }
    }
  }
  return out;
}

type Live = { table: string; column: string; delType: string; validated: boolean };

async function liveForeignKeys(): Promise<Map<string, Live>> {
  const rows = (await getDb().execute(
    sql`select c.conname as conname, t.relname as relname,
               a.attname as attname, c.confdeltype::text as confdeltype, c.convalidated::text as convalidated
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
          join pg_namespace n on n.oid = t.relnamespace
          where c.contype = 'f' and n.nspname = 'public'`,
  )) as unknown as { conname: string; relname: string; attname: string; confdeltype: string; convalidated: string }[];
  return new Map(
    rows.map((r) => [
      r.conname,
      { table: r.relname, column: r.attname, delType: r.confdeltype, validated: r.convalidated === 't' },
    ]),
  );
}

// 库不在就整族跳过（和 job-lane-idempotency 同一纪律）；顶层 await 让 skipIf 在收集期就看到答案。
const dbUp = await (async () => {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch (err) {
    console.warn('[db-fk-parity] 库不可用，跳过：', err instanceof Error ? err.message : String(err));
    return false;
  }
})();

const declared = declaredForeignKeys();
const live = dbUp ? await liveForeignKeys() : new Map<string, Live>();

describe('迁移声明的外键 = 库里的外键（v1096）', () => {
  it('两侧都有人口：迁移解析得出、库里查得出，否则后面的比对会因为什么都不比而假绿', async () => {
    expect(declared.size, `只从 ${MIGRATIONS_DIR} 解析出 ${declared.size} 条外键——解析器或目录出问题了`).toBeGreaterThan(
      80,
    );
    if (dbUp) {
      expect(live.size, '库里一条外键都查不到——这条腿会假绿').toBeGreaterThan(80);
    }
  });

  it('迁移声明的每一条外键，库里都在（缺的就是漂移，点名列出）', async () => {
    expect(await describeMissing(), []).toEqual([]);
  });

  it('同一个约束名只有一种声明：修复它的迁移不许改动作，也不许换出处', () => {
    expect(conflicts, `同名外键被声明成了两样：\n${conflicts.join('\n')}`).toEqual([]);
  });

  it('删除动作与声明一致：SET NULL 被换成 NO ACTION 也是漂移', async () => {
    if (!dbUp) return;
    const wrong: string[] = [];
    for (const [name, d] of declared) {
      const l = live.get(name);
      if (!l) continue; // 上一条用例负责点名缺失
      if (l.delType !== DEL_CODE[d.onDelete]) {
        wrong.push(`${name}: ${d.file} 声明 ON DELETE ${d.onDelete}(${DEL_CODE[d.onDelete]})，库里是 ${l.delType}`);
      }
    }
    expect(wrong, `外键的删除动作与迁移不一致：\n${wrong.join('\n')}`).toEqual([]);
  });

  it('库里不许有多余的外键：手改库的人得先写一条迁移', async () => {
    if (!dbUp) return;
    const extras = [...live.keys()].filter((n) => !declared.has(n)).sort();
    expect(
      extras,
      `这 ${extras.length} 条外键没有任何一条迁移声明它们（是 push/手工留下的）：\n${extras.join('\n')}`,
    ).toEqual([]);
  });

  it('外键挂的表与列也对得上（同名换列不算同一条）', async () => {
    if (!dbUp) return;
    const moved: string[] = [];
    for (const [name, d] of declared) {
      const l = live.get(name);
      if (!l) continue;
      if (l.table !== d.table || l.column !== d.column) {
        moved.push(`${name}: 迁移说 ${d.table}.${d.column}，库里是 ${l.table}.${l.column}`);
      }
    }
    expect(moved, `同名外键挂错了列：\n${moved.join('\n')}`).toEqual([]);
  });
});

/** 缺失清单要能独立解释自己：把缺的名字连同「谁声明的、该是什么动作」一起端出来。 */
async function describeMissing(): Promise<string[]> {
  if (!dbUp) return [];
  const missing: string[] = [];
  for (const [name, d] of declared) {
    if (!live.has(name)) missing.push(`${name}（${d.file}：${d.table}.${d.column}，ON DELETE ${d.onDelete}）`);
  }
  return missing;
}
