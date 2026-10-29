/**
 * 过期访客回收的**界面见证夹具**：往本地开发库里摆五个 guest 身份，形状各不相同，
 * 让 /admin/users 那块面板一次把该显示的几格都显示出来——
 * 两个够格（一个会话过期、一个从来没有过会话）、一个发布过作品的（护身符）、
 * 一个会话还没到期的、一个沉默但还在宽限期内的（后两个都不该出现在候选里）。
 *
 * 用法：`npx tsx scripts/guest-reclaim-fixture.mts`（先清后种，可反复跑）
 *      `npx tsx scripts/guest-reclaim-fixture.mts --rollback`（把自己造的行删干净）
 *
 * 为什么要在库里回拨时钟而不是把 grace 调小：这一份要证的是**界面上那几个数长得对不对**，
 * 而"改判据参数"这件事集成测试已经逐条证过；把参数当夹具用，两边就都不是真的了。
 * 五个身份都带 `bio='s29witness'` 这个记号，回滚只按记号删自己造的东西。
 */
import postgres from 'postgres';
import { createHash, randomUUID } from 'node:crypto';

const url = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';
/** 防一手"环境变量还指着别的库"：这一份只应该动本地那块开发盘 */
if (!url.includes('nexus_dev_only')) {
  console.error(`拒绝执行：NEXUS_DATABASE_URL 看着不像本地开发库（${url.replace(/:[^:@/]*@/, ':***@')}）`);
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
const DAY = 86_400_000;
const marker = 's29witness';
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function rollback(): Promise<number> {
  const ids = await sql`select id from users where bio = ${marker}`;
  for (const { id } of ids) {
    await sql`delete from published_projects where project_id in (select id from projects where owner_id = ${id})`;
    await sql`delete from projects where owner_id = ${id}`;
    await sql`delete from sessions where user_id = ${id}`;
    await sql`delete from audit_events where actor_id = ${id} or target_id = ${id}`;
    await sql`delete from users where id = ${id}`;
  }
  return ids.length;
}

if (process.argv.includes('--rollback')) {
  console.log(`回滚：删掉 ${await rollback()} 个 ${marker} 身份及其项目与会话`);
  await sql.end({ timeout: 5 });
  process.exit(0);
}

async function guest(displayName: string, createdDaysAgo: number): Promise<string> {
  const rows = await sql`insert into users (display_name, guest, role, created_at, bio)
    values (${displayName}, true, 'creator', ${ago(createdDaysAgo).toISOString()}, ${marker}) returning id`;
  const id = rows[0]?.id as string | undefined;
  if (!id) throw new Error(`建不出 ${displayName}`);
  return id;
}

/** expiresInDays 为正 = 还没到期（活会话）；为负 = 已经过期那么多天 */
async function session(userId: string, expiresInDays: number): Promise<void> {
  const hash = createHash('sha256').update(`${randomUUID()}-reclaim-fixture`).digest('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * DAY);
  await sql`insert into sessions (user_id, token_hash, expires_at, created_at)
    values (${userId}, ${hash}, ${expiresAt.toISOString()}, ${new Date(expiresAt.getTime() - 30 * DAY).toISOString()})`;
}

async function draft(userId: string, name: string, publish: boolean): Promise<void> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const rows = await sql`insert into projects (owner_id, slug, name, kind, visibility, created_at)
    values (${userId}, ${slug}, ${name}, 'website', 'private', ${new Date().toISOString()}) returning id`;
  const projectId = rows[0]?.id as string | undefined;
  if (!projectId) throw new Error(`建不出草稿 ${name}`);
  if (publish) {
    await sql`insert into published_projects (project_id, path, visibility, moderation, published_at)
      values (${projectId}, ${`/n/reclaim-fixture/${slug}`}, 'public', 'approved', ${new Date().toISOString()})`;
  }
}

// 先清后种：上一次的真执行会把候选软删掉，而 published_projects.path 的唯一约束还留在那儿
await rollback();

const ids = {
  甲: await guest(`${marker}·甲沉默两月`, 100),
  乙: await guest(`${marker}·乙从来没有会话`, 90),
  丙: await guest(`${marker}·丙发布过`, 120),
  丁: await guest(`${marker}·丁才刚过期`, 20),
  戊: await guest(`${marker}·戊宽限期内`, 60),
};
await session(ids.甲, -70);
await draft(ids.甲, 'reclaim-fixture-draft', false);
await session(ids.丙, -100);
await draft(ids.丙, 'reclaim-fixture-published', true);
await session(ids.丁, 20);
await session(ids.戊, -10);

console.log(`种下 5 个 ${marker} 身份：${JSON.stringify(ids)}`);
console.log('期望读数：沉默到线 3（甲乙丙）· 发布过不碰 1（丙）· 够格 2（甲、乙）· 丁有活会话、戊在宽限期内');
await sql.end({ timeout: 5 });
