import postgres from 'postgres';
import { createHash, randomUUID } from 'node:crypto';

/**
 * 给 e2e 种"沉默到线的访客"——回收面板那条常驻门需要库里有**属于这一趟的**候选。
 *
 * 为什么要在这一侧直接写库：判据是"最后一条会话过期之后再往后 30 天"，把这时间做出来只有两条路——
 * 把 `graceDays` 调小（那是在测一个产品里没有的形状，集成测试已经逐条证过参数化的判据），
 * 或者把时钟回拨（那是库里的真形状，面板与端点读的就是它）。这里选后者。
 *
 * 三条自律：
 * - **只动本地开发库**：连接串看着不像本地那块盘就直接拒。
 * - **每行都带这一趟独有的记号**（`bio`，界面上不显示、回滚只按它删）：绝不清别人的东西，
 *   也绝不留下东西——`afterAll` 按记号删干净，下一次跑看见的库和这一次开始前一样。
 * - **账龄 100 天**：候选按账龄从老到新排，所以这一趟造的行一定排在屏幕最前面，
 *   不会被开发库里那些历史行挤出去。
 */

const url = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

export interface SeededGuest {
  id: string;
  name: string;
}

export interface GuestState {
  deletedAt: string | null;
  /** 会话行数——收走之后该是 0（注销那六件事里"会话吊销"就是把它们清掉） */
  sessionRows: number;
  /** 未软删的草稿数——收走之后该是 0 */
  liveDrafts: number;
  /** `user.reclaim` 的审计行数 */
  reclaimAuditRows: number;
}

function devOnly(): void {
  if (!url.includes('nexus_dev_only')) {
    throw new Error(`拒绝执行：NEXUS_DATABASE_URL 看着不像本地开发库（${url.replace(/:[^:@/]*@/, ':***@')}）`);
  }
}

/** 种 count 个沉默访客，每个带一条 70 天前就烂掉的会话和一个草稿；返回他们的 id 与名字 */
export async function seedStaleGuests(marker: string, count: number): Promise<SeededGuest[]> {
  devOnly();
  const sql = postgres(url, { max: 1 });
  try {
    const out: SeededGuest[] = [];
    for (let n = 0; n < count; n += 1) {
      const name = `${marker}·${n}`;
      const rows = await sql`insert into users (display_name, guest, role, created_at, bio)
        values (${name}, true, 'creator', ${ago(100).toISOString()}, ${marker}) returning id`;
      const id = rows[0]?.id as string | undefined;
      if (!id) throw new Error(`建不出 ${name}`);
      await sql`insert into sessions (user_id, token_hash, expires_at, created_at)
        values (${id}, ${createHash('sha256').update(`${randomUUID()}-e2e-reclaim`).digest('hex')},
                ${ago(70).toISOString()}, ${ago(100).toISOString()})`;
      await sql`insert into projects (owner_id, slug, name, kind, visibility, created_at)
        values (${id}, ${slugify(name)}, ${name}, 'website', 'private', ${ago(99).toISOString()})`;
      out.push({ id, name });
    }
    return out;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function guestState(id: string): Promise<GuestState> {
  devOnly();
  const sql = postgres(url, { max: 1 });
  try {
    const [u] = await sql`select deleted_at from users where id = ${id}`;
    const [s] = await sql`select count(*)::int as n from sessions where user_id = ${id}`;
    const [p] = await sql`select count(*)::int as n from projects
      where owner_id = ${id} and deleted_at is null`;
    const [a] = await sql`select count(*)::int as n from audit_events
      where action = 'user.reclaim' and target_id = ${id}`;
    return {
      deletedAt: (u?.deleted_at as Date | undefined)?.toISOString() ?? null,
      sessionRows: Number(s?.n ?? 0),
      liveDrafts: Number(p?.n ?? 0),
      reclaimAuditRows: Number(a?.n ?? 0),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** 按记号删干净这一趟造的东西（含被软删的行）；返回删掉的用户数 */
export async function purgeStaleGuests(marker: string): Promise<number> {
  devOnly();
  const sql = postgres(url, { max: 1 });
  try {
    const ids = await sql`select id from users where bio = ${marker}`;
    for (const row of ids) {
      const id = row.id as string;
      await sql`delete from published_projects where project_id in (select id from projects where owner_id = ${id})`;
      await sql`delete from projects where owner_id = ${id}`;
      await sql`delete from sessions where user_id = ${id}`;
      await sql`delete from audit_events where actor_id = ${id} or target_id = ${id}`;
      await sql`delete from users where id = ${id}`;
    }
    return ids.length;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
