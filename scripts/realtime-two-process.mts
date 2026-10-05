/**
 * §163 跨实例那句话的最后一寸：两个**真实的操作系统进程**，不是一个进程里的两个对象。
 *
 * ADR-0025 §五 留下的约束是"换成 Redis 驱动做多实例扇出时这一格必须照样做得到，否则第六件
 * 只在一个进程里成立"。`apps/web/test/realtime.redis.integration.test.ts` 里那两个总线实例
 * 共享同一个 globalThis、同一个进程、同一份模块图——它证明的是**线路与帧**，证明不了
 * 生产路径上那台单例真的会在两个进程里各自选到 Redis 驱动。这里补的就是那一寸：
 *
 * - 监听侧是一条 `spawn` 出来的长命孩子进程，父进程拿 `spawnSync` 阻塞发命令时它照常在跑；
 * - 发布/关门侧每次都是一个新进程（四条线路 = 四次 spawn），所以那份单例在它们身上
 *   各建各的，谁也不是谁的引用；
 * - 两个进程之间唯一的通道是 Redis 的那一条线路名，与生产部署里两台机器之间的一样。
 *
 * 判据里最要紧的一条是 `ORIGINS_ALL_DISTINCT`：origin 是回环摘除的钥匙，而摘错方向的 bug
 * 长得和成功一模一样。这里的 origin 来自各进程自己的 `defaultOrigin()`（pid 打头），
 * 两个进程的 pid 必然不同，所以"别机的那一帧被当成自己的丢掉了"这种红在这里不可能伪装成绿。
 *
 * `CLOSED_CHANNEL_SILENT_AFTER_CLOSE` 单独一条是反证（"没收到"），所以配上
 * `OTHER_CHANNEL_LIVE_AFTER_CLOSE`：关门之后再往另一个频道发一条，它到了，才说明线路还活着、
 * 那个"没到"真的是关门关掉的，而不是发布没发出去。关门生效的正证另有其一——监听进程自己报上
 * 那个频道的订阅人数从 1 变成 0（`CLOSE_CROSSES_PROCESSES`），那是可观测量，不是缺席。
 *
 * 用法：`npm run realtime:two-process`（只要 Redis 在 56379，不需要数据库）。
 * 每条判据打一行 `verdict <名>: <值>`，任何一条不对就非零退出。
 *
 * 反向控制跑过一遍（2026-10-06，手工把发送侧那一趟的 `NEXUS_REDIS_URL` 指到没人听的 56399）：
 * 那一趟**零退出**（`publish` 不抛这条纪律在另一个进程里也一样）、`ready=false`、
 * `wireErrorCount=10`，而监听侧的 `receivedClosed` 停在空数组。所以 `CROSS_PROCESS_DELIVERY`
 * 读的是线路而不是磁盘上那份报告——这条脚本要是哪天变成"读文件读到就算绿"，这一遍就是它的反证。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Redis } from 'ioredis';
import type { RealtimeEvent } from '@nexus/schemas';

/** 与 `redisBus.ts` 的 `REDIS_URL_ENV` 同一串；父进程不 import 那个模块（见下面 load() 的说明）。 */
const REDIS_URL_ENV = 'NEXUS_REDIS_URL';

type BusModule = typeof import('../apps/web/src/server/realtime/bus');
type RedisBusModule = typeof import('../apps/web/src/server/realtime/redisBus');

/**
 * 只有拿到 role 的孩子进程才走到这里。顶层一个 app 模块都不 import：那些模块用了 `@/…`
 * 别名，父进程在仓库根下解析不到，而父进程本来也不该拿到总线的连接池——它只负责 spawn 与判定。
 */
async function load(): Promise<BusModule & RedisBusModule> {
  return {
    ...(await import('../apps/web/src/server/realtime/bus')),
    ...(await import('../apps/web/src/server/realtime/redisBus')),
  };
}

const ROOT = resolve(import.meta.dirname, '..');
/** apps/web 的模块用了 `@/…` 别名；tsx 只认这个 tsconfig，仓库根下没有。 */
const WEB_TSCONFIG = resolve(ROOT, 'apps/web/tsconfig.json');
const WORK = resolve(ROOT, '.scratch/realtime-two-process');
const REDIS_URL = process.env[REDIS_URL_ENV]?.trim() || 'redis://127.0.0.1:56379';

/** 关门要关的那条频道，与关门之后仍然活着的那条对照频道（都用生产的频道命名函数造）。 */
const CLOSED_CHANNEL = 'project:two-process-closed';
const LIVE_CHANNEL = 'project:two-process-live';

interface ListenReady {
  pid: number;
  origin: string;
  driver: string;
  ready: boolean;
  closedChannel: string;
  liveChannel: string;
  subscriberOnClosedAtStart: number;
  subscriberOnLiveAtStart: number;
}

interface ListenReport extends ListenReady {
  receivedClosed: string[];
  receivedLive: string[];
  subscriberOnClosed: number;
  subscriberOnLive: number;
  wireErrorCount: number;
}

interface SendReport {
  role: 'publish' | 'close';
  pid: number;
  origin: string;
  driver: string;
  ready: boolean;
  channel: string;
  title?: string;
  wireErrorCount: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 落盘走 temp + rename：父进程每 150ms 读一次，不能读到半份 JSON。 */
function write(name: string, value: unknown): void {
  const tmp = resolve(WORK, `${name}.tmp`);
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, resolve(WORK, name));
}

function read<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(resolve(WORK, name), 'utf8')) as T;
  } catch {
    return null;
  }
}

function makeChildEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    [REDIS_URL_ENV]: REDIS_URL,
    TSX_TSCONFIG_PATH: WEB_TSCONFIG,
    ...extra,
  };
}

const notification = (title: string): RealtimeEvent => ({ type: 'notification', level: 'info', title });

/** 监听侧：长命的那一个孩子，把每一步的可观测量写进 listen-report.json，父进程只读不猜。 */
async function roleListen(stopAfterMs: number): Promise<void> {
  const m = await load();
  const bus = m.getRealtimeBus();
  if (!(bus instanceof m.RedisRealtimeBus)) {
    throw new Error(`监听侧选到的驱动是 ${bus.constructor.name}，不是 RedisRealtimeBus——两个进程之间的这一寸根本没被走到`);
  }
  const ready = await bus.ready;

  const receivedClosed: string[] = [];
  const receivedLive: string[] = [];
  bus.subscribe(CLOSED_CHANNEL, (event) => {
    if (event.type === 'notification') receivedClosed.push(event.title);
  });
  bus.subscribe(LIVE_CHANNEL, (event) => {
    if (event.type === 'notification') receivedLive.push(event.title);
  });

  const base: ListenReady = {
    pid: process.pid,
    origin: bus.origin,
    driver: bus.constructor.name,
    ready,
    closedChannel: CLOSED_CHANNEL,
    liveChannel: LIVE_CHANNEL,
    subscriberOnClosedAtStart: bus.subscriberCount(CLOSED_CHANNEL),
    subscriberOnLiveAtStart: bus.subscriberCount(LIVE_CHANNEL),
  };
  write('listen-ready.json', base);

  // 报告随收随写，直到父进程写下 stop 信号或者预算用完（预算是保险，不是判据）。
  const deadline = Date.now() + stopAfterMs;
  for (;;) {
    const report: ListenReport = {
      ...base,
      receivedClosed,
      receivedLive,
      subscriberOnClosed: bus.subscriberCount(CLOSED_CHANNEL),
      subscriberOnLive: bus.subscriberCount(LIVE_CHANNEL),
      wireErrorCount: bus.wireErrorCount,
    };
    write('listen-report.json', report);
    if (existsSync(resolve(WORK, 'stop.json')) || Date.now() > deadline) break;
    await sleep(150);
  }

  bus.dispose();
  write('listen-done.json', read<ListenReport>('listen-report.json'));
  process.exit(0);
}

/** 发布/关门侧：每次一个新进程，走完 publish 那条纪律（不抛、只记账）后停一会儿让字节真的上线。 */
async function roleSend(role: 'publish' | 'close', channel: string, title: string, out: string): Promise<void> {
  const m = await load();
  const bus = m.getRealtimeBus();
  if (!(bus instanceof m.RedisRealtimeBus)) {
    throw new Error(`${role} 侧选到的驱动是 ${bus.constructor.name}，不是 RedisRealtimeBus`);
  }
  const ready = await bus.ready;
  if (role === 'publish') bus.publish(channel, notification(title));
  else bus.closeChannel(channel);
  // publish 是"发出去就不管"的那个签名（接口里它返回 void，且不抛）。这里等的是**这一趟**的
  // 观测窗口：命令的拒绝会在这一秒里落到 wireErrorCount 上，进程要是立刻退出，那一帧可能
  // 还在 socket 的写缓冲里，父进程读到的就成了假绿。
  await sleep(1_000);
  const report: SendReport = {
    role,
    pid: process.pid,
    origin: bus.origin,
    driver: bus.constructor.name,
    ready,
    channel,
    ...(title ? { title } : {}),
    wireErrorCount: bus.wireErrorCount,
  };
  write(out, report);
  bus.dispose();
  process.exit(0);
}

const ROLE = process.argv[2];
if (ROLE === 'listen' || ROLE === 'publish' || ROLE === 'close') {
  if (ROLE === 'listen') await roleListen(Number(process.argv[3] ?? 60_000));
  else await roleSend(ROLE, process.argv[3]!, process.argv[4] ?? '', process.argv[5]!);
  process.exit(0);
}

// —— 以下是父进程 ——

mkdirSync(WORK, { recursive: true });
rmSync(resolve(WORK, 'stop.json'), { force: true });
for (const name of ['listen-ready.json', 'listen-report.json', 'listen-done.json', 'publish-1.json', 'close-1.json', 'publish-2.json', 'publish-3.json']) {
  rmSync(resolve(WORK, name), { force: true });
}

/**
 * 先探一次线路。这一格的失败里最坏的一种不是"代码坏了"而是"引擎没了"：
 * Docker 的端口在引擎死掉之后还会继续 LISTENING（本机实测过），于是这里会花掉整预算
 * 才超时，看起来像是新驱动有 bug。一次 ping 几毫秒就能把两种红分开。
 */
{
  const probe = new Redis(REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 2_000 });
  try {
    await probe.connect();
    const pong = await probe.ping();
    if (pong !== 'PONG') throw new Error(`ping 回来的不是 PONG：${String(pong)}`);
    console.log(`[线路] ${REDIS_URL} 在（PONG）`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Redis 线路不通（${REDIS_URL}）：${message}\n这一格只要 Redis，不要数据库：起服务用 npm run infra:up；引擎本身活着与否看 docker version。`, { cause: error });
  } finally {
    probe.disconnect();
  }
}

const script = import.meta.filename;
const log = resolve(WORK, 'log-listen.txt');
const fd = openSync(log, 'w');
const child = spawn(process.execPath, ['--import', 'tsx', script, 'listen', '60000'], {
  cwd: resolve(ROOT, 'apps/web'),
  env: makeChildEnv(),
  stdio: ['ignore', fd, fd],
});
let childExited = false;
let childExitCode: number | null = null;
const exited = new Promise<number>((resolveExit) => {
  child.on('exit', (code) => {
    childExited = true;
    childExitCode = code ?? -1;
    resolveExit(childExitCode);
  });
});
// 判据没过就 throw 的时候，Windows 上的孩子进程不会跟着父进程一起走：它是那条线路上的订阅者，
// 留着它，下一次跑就先撞在自己的旧报告上。
process.on('exit', () => {
  if (!childExited) child.kill();
});

/** 轮询一个"读得到才算数"的东西；孩子进程要是已经退出，立刻把日志尾巴端出来，不再空等预算。 */
async function waitFor<T>(what: string, poll: () => T | null, budgetMs = 25_000): Promise<T> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const value = poll();
    if (value !== null && value !== undefined) return value;
    if (childExited) throw new Error(`监听进程先退出了（status=${childExitCode}），等不到${what}。日志：\n${readFileSync(log, 'utf8').slice(-1500)}`);
    if (Date.now() > deadline) throw new Error(`等了 ${budgetMs / 1000}s 还等不到${what}。监听进程日志：\n${readFileSync(log, 'utf8').slice(-1500)}`);
    await sleep(150);
  }
}

function run(role: 'publish' | 'close', channel: string, title: string, out: string): SendReport {
  const args = ['--import', 'tsx', script, role, channel, title, out];
  const done = spawnSync(process.execPath, args, {
    cwd: resolve(ROOT, 'apps/web'),
    env: makeChildEnv(),
    encoding: 'utf8',
  });
  const printed = `${done.stdout ?? ''}${done.stderr ?? ''}`;
  writeFileSync(resolve(WORK, `log-${role}-${out}.txt`), printed);
  if (done.status !== 0) throw new Error(`${role} 这一趟非零退出（status=${done.status}）：\n${printed.slice(-1500)}`);
  const report = read<SendReport>(out);
  if (!report) throw new Error(`${role} 零退出却没写出 ${out}`);
  console.log(`[${role} pid=${report.pid}] ${title || 'close'} → ${channel}`);
  return report;
}

const started = await waitFor<ListenReady>('监听侧的就绪文件', () => read<ListenReady>('listen-ready.json'));
if (!started.ready) throw new Error(`监听侧 ready=false，线路没接上（${REDIS_URL}）`);
console.log(`[listen pid=${started.pid}] 上线，两条频道各 ${started.subscriberOnClosedAtStart} 人`);

// ① 跨进程投递：另一个进程 publish 的那一条要真的落到这个进程的订阅者上。
run('publish', CLOSED_CHANNEL, '第一趟：跨进程那一条', 'publish-1.json');
await waitFor('监听进程收到第一趟', () => {
  const r = read<ListenReport>('listen-report.json');
  return r && r.receivedClosed.length > 0 ? r : null;
});

// ② 关门跨进程：等监听侧自己报出"这条频道人数归零"，再去发后面那些条。
//    这个等待是顺序保证，不是礼貌：关门帧和后面的事件帧走同一条线路，
//    不等它就发下一条，收到的顺序没规定，"没收到"就可能只是没轮到。
run('close', CLOSED_CHANNEL, '', 'close-1.json');
const closed = await waitFor('监听进程把那条频道的订阅摘掉', () => {
  const r = read<ListenReport>('listen-report.json');
  return r && r.subscriberOnClosed === 0 ? r : null;
});

// ③ 关门之后：同一条频道再发一条（不该到），另一条频道发一条（该到，作为③的对照）。
run('publish', CLOSED_CHANNEL, '关门之后同频道那一条', 'publish-2.json');
run('publish', LIVE_CHANNEL, '关门之后另一条频道', 'publish-3.json');
await waitFor('另一条频道上那一条到达（证明线路在关门之后还活着）', () => {
  const r = read<ListenReport>('listen-report.json');
  return r && r.receivedLive.length > 0 ? r : null;
}, 15_000);
// 对照到了以后再给一段静默窗口，让"该到的到了、不该到的没到"这两个观测站在同一时刻上；
// 否则那条不该到的可能只是慢了一步，判据就成了测线路延迟。
await sleep(2_000);
writeFileSync(resolve(WORK, 'stop.json'), 'stop');
const final = await waitFor<ListenReport>('监听进程的最终报告', () => read<ListenReport>('listen-report.json'));
// 收尾：它读到 stop 就会自己退（连接也自己断）。这里等它，只是不给判据留一条还在收帧的连接；
// 真等不到就杀掉，别让一个孤儿进程挂在 Redis 上。
const exitCode = await Promise.race([exited, sleep(15_000).then(() => -9)]);
if (exitCode !== 0) child.kill();
console.log(`[listen] 退出码 ${exitCode}`);

const sends = ['publish-1.json', 'close-1.json', 'publish-2.json', 'publish-3.json']
  .map((name) => read<SendReport>(name))
  .filter((r): r is SendReport => r !== null);

const origins = [started.origin, ...sends.map((s) => s.origin)];
const verdicts: [string, boolean, string][] = [
  [
    'CHILDREN_USE_REDIS_DRIVER',
    final.driver === 'RedisRealtimeBus' && sends.every((s) => s.driver === 'RedisRealtimeBus'),
    `监听 ${final.driver}，发送侧 ${[...new Set(sends.map((s) => s.driver))].join('/')}`,
  ],
  [
    'ORIGINS_ALL_DISTINCT',
    new Set(origins).size === origins.length,
    `${origins.length} 个进程各一个 origin：${origins.map((o) => o.split(':')[0]).join(' / ')}（pid）`,
  ],
  [
    'READY_EVERYWHERE',
    final.ready && sends.every((s) => s.ready),
    `监听 ready=${final.ready}，发送侧 ${sends.filter((s) => s.ready).length}/${sends.length} ready`,
  ],
  [
    'CROSS_PROCESS_DELIVERY',
    closed.receivedClosed.includes('第一趟：跨进程那一条'),
    `监听侧收到 ${JSON.stringify(closed.receivedClosed)}`,
  ],
  [
    'CLOSE_CROSSES_PROCESSES',
    closed.subscriberOnClosed === 0 && final.subscriberOnLive === 1,
    `关门那条频道在监听进程里从 ${final.subscriberOnClosedAtStart} 人变 0 人，另一条频道还是 ${final.subscriberOnLive} 人`,
  ],
  [
    'CLOSED_CHANNEL_SILENT_AFTER_CLOSE',
    final.receivedClosed.length === 1 && final.receivedClosed[0] === '第一趟：跨进程那一条',
    `收到的 ${JSON.stringify(final.receivedClosed)}`,
  ],
  [
    'OTHER_CHANNEL_LIVE_AFTER_CLOSE',
    final.receivedLive.includes('关门之后另一条频道'),
    `另一条频道收到 ${JSON.stringify(final.receivedLive)}——上一句的"没收到"因此不是线路断了`,
  ],
  [
    'NO_WIRE_ERRORS',
    final.wireErrorCount === 0 && sends.every((s) => s.wireErrorCount === 0),
    `监听 ${final.wireErrorCount} 次，发送侧 ${sends.map((s) => s.wireErrorCount).join('/')} 次`,
  ],
];
for (const [name, ok, detail] of verdicts) console.log(`verdict ${name}: ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
const failed = verdicts.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  const tail = readFileSync(log, 'utf8').slice(-1200);
  throw new Error(`判据没过：${failed.join(', ')}｜产物在 ${WORK}\n监听进程日志尾巴：\n${tail}`);
}
console.log(`跨进程实时总线通过：${origins.length} 个进程、${sends.length} 次往返，线路 ${REDIS_URL}。`);
