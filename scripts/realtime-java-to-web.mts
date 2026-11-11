/**
 * §SC-53 立证·收官：Java → Redis 线路 → web 订阅者。
 *
 * 与 `scripts/realtime-two-process.mts`（web↔web 双进程）同构，但发布方换成 **java-domain-service**
 * 经网关之外的直连 HTTP 探针端点 `POST /api/v1/realtime/probe`。判分面只有三条，不虚报：
 *
 * 1. PROBE_PUBLISHED  —— 探针 HTTP 200 且 body.published === true（Java 真的把帧写上了线路）
 * 2. WEB_BUS_DELIVERED —— web 的 RedisRealtimeBus（不是手写 ioredis）在 `project:java-probe`
 *    频道上收到了这帧，且 event.title 精确匹配（schema safeParse 这一关在 bus 内部过了，
 *    否则帧会被丢弃且 wireErrorCount 动；下面一条专门钉死它）
 * 3. NO_WIRE_ERRORS   —— 监听端 wireErrorCount === 0（线路上没有一帧被判为"不是合法 wire frame"而丢弃）
 *
 * 前提：domain-service 已经在跑，NEXUS_DOMAIN_URL 指向它（默认 http://127.0.0.1:8082），
 * 且该实例能连上它的 Redis（本机 127.0.0.1:56379，见 docs/ENVIRONMENT.md）。
 * 跑：npm run realtime:java-to-web
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
const CHANNEL = 'project:java-probe';

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

// 先确认 domain-service 活着——不活着就如实报，不留一份"全绿"的幻觉
try {
  const health = await fetch(`${DOMAIN_URL}/actuator/health`, { signal: AbortSignal.timeout(8_000) });
  if (!health.ok) throw new Error(`HTTP ${health.status}`);
  console.log(`[java] domain-service 健康：${await health.text()}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`domain-service 不在 ${DOMAIN_URL}（先启动它再跑这条验证）：${message}`);
}

// 线路自检（同 two-process：手动 ping 一次，确认 Redis 真在这条地址上）
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

// 起监听进程（web 总线走 tsx 加载 apps/web 的模块图）
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

// 触发 Java 探针：真实帧，真实频道，真实 title —— 全唯一，避免误匹配
const title = `java-probe-${Date.now().toString(36)}`;
const subject = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const probeUrl = `${DOMAIN_URL}/api/v1/realtime/probe?channel=${encodeURIComponent(CHANNEL)}&title=${encodeURIComponent(title)}`;
const probe = await fetch(probeUrl, {
  method: 'POST',
  headers: { 'X-Nexus-Subject': subject },
  signal: AbortSignal.timeout(10_000),
});
const probeBody = (await probe.json()) as { published?: boolean; channel?: string; frame?: string; error?: string };
console.log(`[probe] HTTP ${probe.status} published=${String(probeBody.published)}`);

const delivered = await waitFor<ListenReport>(
  'web 总线收到帧',
  () => {
    const r = read<ListenReport>('listen-report.json');
    return r && r.received.includes(title) ? r : null;
  },
  12_000,
);

// 收尾：让监听进程写完最终报告，然后停掉它
writeFileSync(resolve(WORK, 'stop.json'), 'stop');
await waitFor<ListenReport>('监听进程收尾', () => read<ListenReport>('listen-report.json'), 10_000);
await sleep(500);
child.kill();

const verdicts: [string, boolean, string][] = [
  ['PROBE_PUBLISHED', probe.status === 200 && probeBody.published === true, `HTTP ${probe.status} published=${String(probeBody.published)}`],
  ['WEB_BUS_DELIVERED', delivered.received.includes(title), `received=${JSON.stringify(delivered.received)}`],
  ['NO_WIRE_ERRORS', delivered.wireErrorCount === 0, `wireErrorCount=${delivered.wireErrorCount}`],
];
for (const [name, ok, detail] of verdicts) console.log(`verdict ${name}: ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
const failed = verdicts.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`java→web 链路未通：${failed.join(', ')}`);
console.log('java→web 实时链路打通：domain-service 的帧经 Redis 到达 web 的 RedisRealtimeBus。');
