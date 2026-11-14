/**
 * §SC-53/§SC-61 立证·收官：Java → Redis 线路 → web 订阅者。
 *
 * 与 `scripts/realtime-two-process.mts`（web↔web 双进程）同构，但发布方换成 **java-domain-service**
 * 经网关之外的直连 HTTP 探针端点 `POST /api/v1/realtime/probe`。**SC-61 之后**不再接受
 * `channel/title` 参数——probe 不给调用方定制帧，只替代操作员间问一句"链路通吗"；
 * 调用方必须带 `X-Nexus-Operator-Token`（**必须**等于 domain-service 启动时
 * `nexus.operator.token` / 环境 `NEXUS_OPERATOR_TOKEN`；否则 403）。
 *
 * 判分面：PROBE_PUBLISHED —— probe HTTP 200 + body.published === true（Java 真的发了一帧）
 *          WEB_BUS_DELIVERED —— web 的 RedisRealtimeBus 在 `projects:probe` 上收到了那帧（wire safeParse 这道门也过了）
 *          NO_WIRE_ERRORS — 监听侧 wireErrorCount === 0
 *
 * 前提：domain-service 已经跑起来（NEXUS_DOMAIN_URL，默认 http://127.0.0.1:8082），它必须能连上
 * 它自己那条 Redis（NEXUS_REDIS_URL 或 127.0.0.1:56379），且**启动时必须带上** `NEXUS_OPERATOR_TOKEN`。
 * 跑：NEXUS_OPERATOR_TOKEN=<token> npm run realtime:java-to-web
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Redis } from 'ioredis';

type BusModule = typeof import('../apps/web/src/server/realtime/bus');
type RedisBusModule = typeof import('../apps/web/src/server/realtime/redisBus');

const ROOT = resolve(import.meta.dirname, '..');
const WEB_TSCONFIG = resolve(ROOT, 'apps/web/tsconfig.json');
const WORK = resolve(ROOT, '.scratch/realtime-java-to-web');
const REDIS_URL = process.env.NEXUS_REDIS_URL?.trim() || 'redis://127.0.0.1:56379';
const DOMAIN_URL = (process.env.NEXUS_DOMAIN_URL?.trim() || 'http://127.0.0.1:8082').replace(/\/$/, '');
const OPERATOR_TOKEN = process.env.NEXUS_OPERATOR_TOKEN?.trim();
const CHANNEL = 'projects:probe';  // §SC-61 fixed — the probe does not accept channel overrides

if (!OPERATOR_TOKEN) {
  throw new Error('NEXUS_OPERATOR_TOKEN is required: §SC-61 probe is closed by default. Set the same value the domain-service was started with.');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

interface ListenReady {
  pid: number;
  origin: string;
  driver: string;
  ready: boolean;
}
interface ListenReport extends ListenReady {
  received: string[];
  subscriberOnChannel: number;
  wireErrorCount: number;
}

async function roleListen(stopAfterMs: number): Promise<void> {
  const m = {
    ...(await import('../apps/web/src/server/realtime/bus')),
    ...(await import('../apps/web/src/server/realtime/redisBus')),
  } as BusModule & RedisBusModule;
  const bus = m.getRealtimeBus();
  if (!(bus instanceof m.RedisRealtimeBus)) {
    throw new Error(`监听进程选到的不是 RedisRealtimeBus（${bus.constructor.name}）；这条验证要求 web 走 Redis 驱动`);
  }
  const ready = await bus.ready;
  const received: string[] = [];
  bus.subscribe(CHANNEL, (event) => {
    if (event.type === 'notification') received.push(event.title);
  });
  write('listen-ready.json', { pid: process.pid, origin: bus.origin, driver: bus.constructor.name, ready });
  const deadline = Date.now() + stopAfterMs;
  for (;;) {
    const report: ListenReport = {
      pid: process.pid,
      origin: bus.origin,
      driver: bus.constructor.name,
      ready,
      received,
      subscriberOnChannel: bus.subscriberCount(CHANNEL),
      wireErrorCount: bus.wireErrorCount,
    };
    write('listen-report.json', report);
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

// ── 主流程 ──────────────────────────────────────────────────────────────
mkdirSync(WORK, { recursive: true });
rmSync(resolve(WORK, 'stop.json'), { force: true });
rmSync(resolve(WORK, 'listen-ready.json'), { force: true });
rmSync(resolve(WORK, 'listen-report.json'), { force: true });

try {
  const health = await fetch(`${DOMAIN_URL}/actuator/health`, { signal: AbortSignal.timeout(8_000) });
  if (!health.ok) throw new Error(`HTTP ${health.status}`);
  console.log(`[domain-service] healthy：${await health.text()}`);
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
    const pong = await probe.ping();
    if (pong !== 'PONG') throw new Error(`ping 回的是 ${String(pong)}`);
    console.log(`[线路] ${REDIS_URL} 在线（PONG）`);
  } finally {
    probe.disconnect();
  }
}

const script = import.meta.filename;
const log = resolve(WORK, 'log-listen.txt');
const fd = openSync(log, 'w');
const child = spawn(process.execPath, ['--import', 'tsx', script, 'listen', '45000'], {
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
if (!ready.ready) throw new Error(`监听进程 ready=false（线路 ${REDIS_URL} 没就位）`);
console.log(`[listen pid=${ready.pid}] web 总线已订阅 ${CHANNEL}（origin=${ready.origin}）`);

const probe = await fetch(`${DOMAIN_URL}/api/v1/realtime/probe`, {
  method: 'POST',
  headers: { 'X-Nexus-Operator-Token': OPERATOR_TOKEN },
  signal: AbortSignal.timeout(10_000),
});
const probeBody = (await probe.json()) as { published?: boolean; channel?: string; frame?: string; error?: string };
console.log(`[probe] HTTP ${probe.status} published=${String(probeBody.published)}${probe.status === 403 ? ` error=${probeBody.error}` : ''}`);

const delivered = await waitFor<ListenReport>(
  'web 总线收到帧',
  () => {
    const r = read<ListenReport>('listen-report.json');
    return r && r.received.includes('probe event') ? r : null;
  },
  12_000,
);

writeFileSync(resolve(WORK, 'stop.json'), 'stop');
await waitFor<ListenReport>('监听进程收尾', () => read<ListenReport>('listen-report.json'), 10_000);
await sleep(500);
child.kill();

const verdicts: [string, boolean, string][] = [
  ['PROBE_PUBLISHED', probe.status === 200 && probeBody.published === true, `HTTP ${probe.status} published=${String(probeBody.published)}`],
  ['WEB_BUS_DELIVERED', delivered.received.includes('probe event'), `received=${JSON.stringify(delivered.received)}`],
  ['NO_WIRE_ERRORS', delivered.wireErrorCount === 0, `wireErrorCount=${delivered.wireErrorCount}`],
];
for (const [name, ok, detail] of verdicts) console.log(`verdict ${name}: ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
const failed = verdicts.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`java→web 链路未通：${failed.join(', ')}`);
console.log('java→web 实时链路打通：domain-service 的帧经 Redis 到达 web 的 RedisRealtimeBus。');
