/**
 * §SC-54 立证：**真实写路径 → 事务提交 → 线路 → web 总线订阅者**。
 *
 * 与 `realtime-java-to-web.mts`（探针帧那一片）同构，但这次走的是**生产链路**：
 * 社区 like / follow 的完整写路径——`POST /api/v1/community/...` → CommunityService →
 * @Transactional 提交 → `@TransactionalEventListener(AFTER_COMMIT)` → WireCommunityEventListener →
 * WirePublisher → `nexus:realtime:v1` → web 的 RedisRealtimeBus → 本脚本的监听子进程。
 *
 * 判分面（全部实测，不虚报）：
 *   PREFLIGHT            domain-service 健康 + Redis PONG + 真库挑出一个 public 的已发布版本
 *   LIKE_EMIT_ON_ADD     第一次 like → 监听子进程收到《…点赞了《…》》帧，projectId 逐字匹配
 *   UNLIKE_SILENT        unlike（第二次同一下）→ 1.2s 内帧数不变（取消不是新消息）
 *   LIKE_RE_EMITS        再次 like（撤销后的重加）→ 又一帧（per-mutation 事件，不是一次性伎俩）
 *   LIKE_COUNT_EXACT     全程共收到恰好 2 条 like 帧（1 加 + 1 加，两个 unlike 一帧都没有）
 *   FOLLOW_EMIT_ON_ADD   follow → 《…开始关注你》帧
 *   FOLLOW_RE_EMITS      unfollow 后再 follow → 又一帧
 *   FOLLOW_UNFOLLOW_SILENT unfollow → 1.2s 内帧数不变
 *   WIRE_CLEAN           wireErrorCount=0（web 总线的 safeParse 门零丢帧）
 *
 * 收尾自动还原：actor 是本次随机 UUID，全程 like/like 与 follow/unfollow 成对翻转后，
 * 该 actor 在库里**零残留**（2 次 unlike + 2 次 unfollow 全部抵消）。
 *
 * 前提：domain-service 在 $NEXUS_DOMAIN_PORT（默认 8082）、连着 55433 的 Postgres 和 56379 的 Redis。
 * 跑：npm run realtime:java-community
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { Redis } from 'ioredis';

const ROOT = resolve(import.meta.dirname, '..');
const WEB_TSCONFIG = resolve(ROOT, 'apps/web/tsconfig.json');
const WORK = resolve(ROOT, '.scratch/realtime-java-community');
const REDIS_URL = process.env.NEXUS_REDIS_URL?.trim() || 'redis://127.0.0.1:56379';
const DOMAIN_URL = (process.env.NEXUS_DOMAIN_URL?.trim() || 'http://127.0.0.1:8082').replace(/\/$/, '');
const DB_URL = process.env.NEXUS_DATABASE_URL?.trim() || 'postgres://nexus:nexus_dev_only@127.0.0.1:55433/nexus';
const SUBJECT_HEADER = 'X-Nexus-Subject';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const require = createRequire(resolve(ROOT, 'apps/web/package.json'));
const postgres = require('postgres') as typeof import('postgres');

interface FrameSeen {
  type: string;
  title: string;
  projectId?: string;
}
interface ListenReady {
  pid: number;
  origin: string;
  ready: boolean;
}
interface ListenReport extends ListenReady {
  frames: FrameSeen[];
  wireErrorCount: number;
}

function write(name: string, value: unknown): void {
  const file = resolve(WORK, name);
  const tmp = `${file}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2));
    renameSync(tmp, file);
  } catch {
    // Windows 上 rename 到刚被外力占用的文件会间歇 EPERM（AV 扫描）——直写兜底；
    // 读侧 read() 任何残片都视为"还没好"，下一轮轮询即可。
    try {
      writeFileSync(file, JSON.stringify(value));
    } catch {
      /* 读侧自会重试 */
    }
  }
}
function read<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(resolve(WORK, name), 'utf8')) as T;
  } catch {
    return null;
  }
}

async function roleListen(stopAfterMs: number): Promise<void> {
  const m = {
    ...(await import('../apps/web/src/server/realtime/bus')),
    ...(await import('../apps/web/src/server/realtime/redisBus')),
  };
  const bus = m.getRealtimeBus();
  if (!(bus instanceof m.RedisRealtimeBus)) {
    throw new Error(`监听进程选到的不是 RedisRealtimeBus（${bus.constructor.name}）`);
  }
  const ready = await bus.ready;
  const channel = process.argv[4];
  if (!channel) throw new Error('roleListen 需要 argv[4]（channel）');
  const frames: FrameSeen[] = [];
  bus.subscribe(channel, (event) => {
    if (event.type !== 'notification') return;
    frames.push({
      type: event.type,
      title: event.title,
      ...(event.projectId ? { projectId: event.projectId } : {}),
    });
  });
  write('listen-ready.json', { pid: process.pid, origin: bus.origin, ready });
  const deadline = Date.now() + stopAfterMs;
  for (;;) {
    write('listen-report.json', {
      pid: process.pid,
      origin: bus.origin,
      ready,
      frames,
      subscriberOnChannel: bus.subscriberCount(channel),
      wireErrorCount: bus.wireErrorCount,
    });
    if (existsSync(resolve(WORK, 'stop.json')) || Date.now() > deadline) break;
    await sleep(150);
  }
  bus.dispose();
  process.exit(0);
}

const ROLE = process.argv[2];
if (ROLE === 'listen') {
  await roleListen(Number(process.argv[3] ?? 60_000));
  process.exit(0);
}

// ── 主流程 ──────────────────────────────────────────────────────────────────────────
mkdirSync(WORK, { recursive: true });
for (const name of ['stop.json', 'listen-ready.json', 'listen-report.json', 'verdicts.json']) {
  rmSync(resolve(WORK, name), { force: true });
}

// PREFLIGHT：domain-service + Redis + 一条真 public 发布
try {
  const health = await fetch(`${DOMAIN_URL}/actuator/health`, { signal: AbortSignal.timeout(8_000) });
  if (!health.ok) throw new Error(`HTTP ${health.status}`);
  console.log(`[java] domain-service 健康：${await health.text()}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`domain-service 不在 ${DOMAIN_URL}（先启动它再跑这条验证）：${message}`);
}
{
  const probe = new Redis(REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 2_000,
  });
  try {
    await probe.connect();
    if ((await probe.ping()) !== 'PONG') throw new Error('ping 没回 PONG');
    console.log(`[线路] ${REDIS_URL} 在线（PONG）`);
  } finally {
    probe.disconnect();
  }
}
const sql = postgres(DB_URL, { max: 1 });
let publication: { publication_id: string; project_id: string; owner_id: string; name: string } | undefined;
try {
  const rows = await sql<
    { publication_id: string; project_id: string; owner_id: string; name: string }[]
  >`select pp.id::text as publication_id,
             p.id::text as project_id,
             p.owner_id::text as owner_id,
             p.name
      from published_projects pp
      join projects p on p.id = pp.project_id
     where pp.visibility in ('public', 'unlisted')
       and pp.moderation <> 'rejected'
       and p.deleted_at is null
     order by pp.published_at desc
     limit 1`;
  publication = rows[0];
} finally {
  await sql.end({ timeout: 5 });
}
if (!publication) {
  throw new Error('库里找不到任何 public/unlisted 且未被人工拒绝的已发布版本——这条验证需要至少一行');
}
console.log(`[db] publication=${publication.publication_id.slice(0, 8)} project=${publication.project_id.slice(0, 8)} owner=${publication.owner_id.slice(0, 8)}《${publication.name}》`);
const ownerId = publication.owner_id;

// like/follow 的行都带外键，actor 必须真实存在于 users 表：挑一个与这个作品/这个作者零互动的真实用户
// （不是随机 UUID——库的 FK 会拒绝，已实测 500）。收尾时成对翻转，抵消后零残留。
const actorStore = postgres(DB_URL, { max: 1 });
let actor: string;
try {
  const rows = await actorStore<{ actor_id: string }[]>`
    select u.id::text as actor_id
    from users u
    where u.id <> ${ownerId}::uuid
      and u.deleted_at is null
      and not exists (select 1 from likes l where l.user_id = u.id and l.project_id = ${publication.project_id}::uuid)
      and not exists (select 1 from follows f where f.follower_id = u.id and f.followee_id = ${ownerId}::uuid)
    limit 1`;
  if (rows.length === 0) {
    throw new Error('找不到与该作品/该作者零互动的真实用户——这条验证需要至少一个干净的 actor');
  }
  const firstRow = rows[0];
  if (!firstRow) {
    throw new Error('找不到与该作品/该作者零互动的真实用户——这条验证需要至少一个干净的 actor');
  }
  actor = firstRow.actor_id;
} finally {
  await actorStore.end({ timeout: 5 });
}
console.log(`[db] actor=${actor.slice(0, 8)}（真实存在、与该作品/作者零互动）`);

// 起监听子进程（web 总线，订阅 user:<ownerId>——like 帧与 follow 帧落同一频道，按标题区分）
const script = import.meta.filename;
const log = resolve(WORK, 'log-listen.txt');
const fd = openSync(log, 'w');
const child = spawn(process.execPath, ['--import', 'tsx', script, 'listen', '60000', `user:${ownerId}`], {
  cwd: resolve(ROOT, 'apps/web'),
  env: { ...process.env, NEXUS_REDIS_URL: REDIS_URL, TSX_TSCONFIG_PATH: WEB_TSCONFIG },
  stdio: ['ignore', fd, fd],
});
let childExited = false;
child.on('exit', () => {
  childExited = true;
});
process.on('exit', () => {
  if (!childExited) child.kill();
});

async function waitFor<T>(what: string, poll: () => T | null, budgetMs = 30_000): Promise<T> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const v = poll();
    if (v) return v;
    if (childExited) {
      throw new Error(`监听进程已退出——等不到${what}。日志尾：\n${readFileSync(log, 'utf8').slice(-1500)}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`等 ${budgetMs / 1000}s 没等到${what}。日志尾：\n${readFileSync(log, 'utf8').slice(-1500)}`);
    }
    await sleep(150);
  }
}

const ready = await waitFor<ListenReady>('监听进程就绪', () => read<ListenReady>('listen-ready.json'));
if (!ready.ready) throw new Error('监听进程 ready=false');
console.log(`[listen pid=${ready.pid}] web 总线已订阅 user:${ownerId}`);

const probe = async (path: string): Promise<Record<string, unknown>> => {
  const res = await fetch(`${DOMAIN_URL}${path}`, {
    method: 'POST',
    headers: { [SUBJECT_HEADER]: actor },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`POST ${path} → HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
};

const likePath = `/api/v1/community/publications/${publication.publication_id}/like`;
const followPath = `/api/v1/community/users/${ownerId}/follow`;
const likeFrames = (): FrameSeen[] =>
  (read<ListenReport>('listen-report.json')?.frames ?? []).filter((f) => f.title.includes('点赞了《'));
const followFrames = (): FrameSeen[] =>
  (read<ListenReport>('listen-report.json')?.frames ?? []).filter((f) => f.title.includes('开始关注你'));

console.log(`[actor ${actor.slice(0, 8)}] 开始 like/follow 往返`);
const like1 = await probe(likePath);
console.log(`[like#1] liked=${String(like1.liked)}`);
const likeFrame1 = await waitFor('like 帧', () => likeFrames()[0] ?? null, 10_000);
console.log(`[frame#1] ${likeFrame1.title} projectId=${likeFrame1.projectId?.slice(0, 8)}`);

const like2 = await probe(likePath);
console.log(`[like#2 i.e. unlike] liked=${String(like2.liked)}`);
await sleep(1_500);
const unlikeSilent = likeFrames().length === 1;

const like3 = await probe(likePath);
console.log(`[like#3] liked=${String(like3.liked)}`);
const likeFrame2 = await waitFor('第二次 like 帧', () => likeFrames()[1] ?? null, 10_000);
console.log(`[frame#2] ${likeFrame2.title} projectId=${likeFrame2.projectId?.slice(0, 8)}`);
const like4 = await probe(likePath);
console.log(`[like#4 i.e. unlike] liked=${String(like4.liked)}`);
await sleep(1_500);
const unlike2Silent = likeFrames().length === 2;

const follow1 = await probe(followPath);
console.log(`[follow#1] following=${String(follow1.following)}`);
const followFrame1 = await waitFor('follow 帧', () => followFrames()[0] ?? null, 10_000);
console.log(`[frame#3] ${followFrame1.title}`);
const follow2 = await probe(followPath);
console.log(`[follow#2 i.e. unfollow] following=${String(follow2.following)}`);
await sleep(1_500);
const unfollowSilent = followFrames().length === 1;
const follow3 = await probe(followPath);
console.log(`[follow#3] following=${String(follow3.following)}`);
const followFrame2 = await waitFor('第二次 follow 帧', () => followFrames()[1] ?? null, 10_000);
console.log(`[frame#4] ${followFrame2.title}`);
const follow4 = await probe(followPath);
console.log(`[follow#4 i.e. unfollow] following=${String(follow4.following)}`);
await sleep(1_500);
const unfollow2Silent = followFrames().length === 2;

// 收尾
writeFileSync(resolve(WORK, 'stop.json'), 'stop');
const final = await waitFor<ListenReport>('监听进程收尾', () => read<ListenReport>('listen-report.json'), 10_000);
await sleep(500);
child.kill();

const verdicts: [string, boolean, string][] = [
  ['LIKE_EMIT_ON_ADD', like1.liked === true && like3.liked === true, `like#1 liked=${String(like1.liked)}, like#3 liked=${String(like3.liked)}`],
  ['LIKE_RE_EMITS', likeFrames().length === 2, `两次加 like 各一帧，共 ${likeFrames().length}`],
  ['UNLIKE_SILENT', unlikeSilent && unlike2Silent, `unlike 后 like 帧数仍为 ${likeFrames().length}（未增长）`],
  ['PROJECT_ID_ON_WIRE', likeFrame1.projectId === publication.project_id && likeFrame2.projectId === publication.project_id, `帧上 projectId=${likeFrame1.projectId?.slice(0, 8)}（库里 ${publication.project_id.slice(0, 8)}）`],
  ['FOLLOW_EMIT_ON_ADD', followFrames().length === 2, `两次 follow 各一帧，共 ${followFrames().length}（含《开始关注你》${JSON.stringify(followFrame1.title)}）`],
  ['FOLLOW_UNFOLLOW_SILENT', unfollowSilent && unfollow2Silent, `unfollow 后 follow 帧数仍为 ${followFrames().length}（未增长）`],
  ['WIRE_CLEAN', final.wireErrorCount === 0, `wireErrorCount=${final.wireErrorCount}`],
];
for (const [name, ok, detail] of verdicts) console.log(`verdict ${name}: ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
writeFileSync(resolve(WORK, 'verdicts.json'), JSON.stringify(verdicts, (_k, v) => (v === undefined ? null : v), 2));
const failed = verdicts.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`java 社区事件链路未通：${failed.join(', ')}`);
console.log('java 社区事件链路打通：写库 → 提交 → AFTER_COMMIT → 线路 → web bus，帧数与 projectId 全对。');
