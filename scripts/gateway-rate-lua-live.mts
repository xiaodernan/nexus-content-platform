/**
 * SC-12 那只共享桶的最后一寸：**Lua 脚本自己在真 Redis 上跑一遍**。
 *
 * `RedisRateLimitBackendTest` 那 5 条把 template 换成了 mock（它自己的注释写着"graded without a Redis
 * server"），所以它们证明的是"后端向 Redis 要了什么"——键名、参数、判定怎么翻译；脚本正文那 30 行
 * 在自动化里**一个读者都没有**。补水算错、`HMGET` 拿到的 nil 没兜住、`PEXPIRE` 写成常量、并发下
 * 两个调用方拿到同一枚令牌，这些都能在 mock 全绿的同时发生。这里补的就是那一寸。
 *
 * 脚本正文不抄第二份：从 `RedisRateLimitBackend.java` 的 text block 里**读出来**（找不到就红，
 * 不是跳过）。于是Java 那侧改一个字符，这一趟量的就是改过的那一份；两份抄写各自漂移的路被堵死。
 *
 * 判据只读线路：放行数由 `EVAL` 的返回值数出来，桶里剩几枚、TTL 多少由父进程自己 `HGET`/`PTTL`
 * 读出来，不采信任何一边的自述。键名带本次 run 的标识（`lua-live-<runId>-…`），与生产客户端的桶
 * 隔开——同一台 Redis 上可能正跑着真网关，见证不该去扣别人的名额。
 *
 * 最要紧的一对是 `SHARED_BUCKET_CAPPED` 与 `PER_INSTANCE_CONTROL`：前者说"同一只键上第三次被拒"，
 * 后者是它的对照——同样的脚本、同样的 burst/rate，只把第三个调用方换成**另一只键**（这正是
 * memory 后端的形状：每台一份），第三次就放行。少了后者，前者分不清是"共享计数生效"还是
 * "这台 Redis 上压根只放两次"。
 *
 * 用法：`npm run ratelimit:gateway-lua`（只要 Redis 在 56379，不需要数据库、不需要起任何 JVM）。
 * 每条判据打一行 `verdict <名>: <值>`，任何一条不对就非零退出；读数落在
 * `.scratch/gateway-rate-lua-live/readings.json`。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Redis } from 'ioredis';

const ROOT = resolve(import.meta.dirname, '..');
const WORK = resolve(ROOT, '.scratch/gateway-rate-lua-live');
const BACKEND_SOURCE = resolve(
  ROOT,
  'services/nexus-gateway/src/main/java/dev/nexus/gateway/RedisRateLimitBackend.java',
);
const REDIS_URL = process.env.NEXUS_REDIS_URL?.trim() || 'redis://127.0.0.1:56379';
/** 与 `application.yml` 的 `redis-key-prefix` 默认值同一串；客户端那一截换成本次 run 自己的。 */
const KEY_PREFIX = 'nexus:gateway:rate:';
const RUN_ID = `${Date.now().toString(36)}-${process.pid}`;

/** 从 Java text block 里取脚本正文。取不到就抛——一个"改了名字所以没测"的见证等于没有见证。 */
function luaFromSource(): string {
  const source = readFileSync(BACKEND_SOURCE, 'utf8');
  const marker = 'String LUA = """';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${BACKEND_SOURCE} 里找不到 \`String LUA = """\`：脚本搬家了，这一趟必须跟着搬`);
  const bodyStart = start + marker.length;
  const end = source.indexOf('"""', bodyStart);
  if (end < 0) throw new Error('LUA text block 没有闭合的 """');
  const body = source.slice(bodyStart, end).replace(/^\r?\n/, '');
  if (!body.includes("redis.call('TIME')")) throw new Error('取出来的正文里没有 redis.call(\'TIME\')——取错了段');
  return body;
}

const LUA = luaFromSource();
const LUA_SHA = createHash('sha256').update(LUA).digest('hex').slice(0, 12);

function client(): Redis {
  return new Redis(REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 2_000,
  });
}

const wire = client();
const created: string[] = [];
/** lazyConnect 失败时 ioredis 既 reject 又 emit 'error'；没有监听者就会多打一行 Unhandled error event。 */
let wireError: string | null = null;
wire.on('error', (error: Error) => {
  wireError = error.message;
});

function key(scenario: string): string {
  const k = `${KEY_PREFIX}lua-live-${RUN_ID}-${scenario}`;
  created.push(k);
  return k;
}

/** 一次 EVAL = 一个调用方问一次门。ARGV 的顺序与 `RedisRateLimitBackend.tryAcquire` 一致。 */
async function ask(redis: Redis, k: string, burst: number, rate: number, ttl: number): Promise<number> {
  const verdict = await redis.eval(LUA, 1, k, String(burst), String(rate), String(ttl));
  if (typeof verdict !== 'number') throw new Error(`EVAL  returned ${JSON.stringify(verdict)}（应为 0/1 整数）`);
  return verdict;
}

async function tokens(redis: Redis, k: string): Promise<string | null> {
  return redis.hget(k, 'tokens');
}

async function stamp(redis: Redis, k: string): Promise<number> {
  return Number(await redis.hget(k, 'ts'));
}

/** Redis 自己的时钟（秒 + 微秒），用来判"桶里那个 ts 是不是服务端写的"。 */
async function serverNow(redis: Redis): Promise<number> {
  const parts = await redis.time();
  return Number(parts[0]) + Number(parts[1]) / 1_000_000;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

mkdirSync(WORK, { recursive: true });
console.log(`[脚本] ${BACKEND_SOURCE.replace(ROOT, '')} 里的 LUA，sha256:${LUA_SHA}`);
try {
  await wire.connect();
  await wire.ping();
} catch (error) {
  const message = wireError ?? (error instanceof Error ? error.message : String(error));
  throw new Error(
    `Redis 线路不通（${REDIS_URL}）：${message}\n这一格只要 Redis，不要数据库、不要 JVM：起服务用 npm run infra:up。`,
    { cause: error },
  );
}
console.log(`[线路] ${REDIS_URL} 在（PONG）`);

try {
  // ① 共享桶：A 打两次、B 打第三次。B 从没碰过 A 的本地桶（这里根本没有本地桶），
  //    所以第三次那个 0 只可能来自"两只调用方共用一只键"。
  const sharedKey = key('shared');
  const shared = [
    await ask(wire, sharedKey, 2, 0, 3_600_000),
    await ask(wire, sharedKey, 2, 0, 3_600_000),
    await ask(wire, sharedKey, 2, 0, 3_600_000),
  ];
  const sharedTokens = await tokens(wire, sharedKey);
  const sharedTtl = await wire.pttl(sharedKey);

  // ② 对照：同一份脚本、同一组 burst/rate，第三个调用方换一只键（= memory 后端每台一份的形状）。
  const ownA = key('per-instance-a');
  const ownB = key('per-instance-b');
  const perInstance = [
    await ask(wire, ownA, 2, 0, 3_600_000),
    await ask(wire, ownA, 2, 0, 3_600_000),
    await ask(wire, ownB, 2, 0, 3_600_000),
  ];

  // ③ 原子性：三条**独立连接**同时各打 4 次，合计 12 次问同一只 burst=3 的键。
  //    读改写若不是原子的，两个调用方会读到同一个 tokens 再各自扣 1，放行数就超过 3。
  const burstKey = key('atomic');
  await ask(wire, burstKey, 3, 0, 3_600_000); // 建键并把 tokens 从 3 扣到 2
  const peers = [client(), client(), client()];
  await Promise.all(peers.map((p) => p.connect()));
  const concurrent = await Promise.all(
    peers.flatMap((p) => Array.from({ length: 4 }, () => ask(p, burstKey, 3, 0, 3_600_000))),
  );
  await Promise.all(peers.map((p) => p.quit()));
  const burstAllowedTotal = 1 + concurrent.filter((v) => v === 1).length;
  const burstTokens = await tokens(wire, burstKey);

  // ④ 补水用的是服务端时钟：打空之后等 1.1 秒（rate=2 ⇒ 补 2.2 枚），再问一次应当放行；
  //    桶里那个 ts 必须落在 EVAL 前后两次 Redis TIME 之间——不是调用方的钟。
  const refillKey = key('refill');
  const drained = [
    await ask(wire, refillKey, 2, 2, 3_000),
    await ask(wire, refillKey, 2, 2, 3_000),
    await ask(wire, refillKey, 2, 2, 3_000),
  ];
  await sleep(1_100);
  const beforeRefill = await serverNow(wire);
  const afterWait = await ask(wire, refillKey, 2, 2, 3_000);
  const afterRefill = await serverNow(wire);
  const refillStamp = await stamp(wire, refillKey);
  const refillTokens = Number(await tokens(wire, refillKey));

  // ⑤ 负 elapsed 要夹住：把 ts 写到未来（相当于另一台机器的钟快了），补水不能变成负数扣账，
  //    也不能因此放出令牌。tokens=0 + 未来 ts ⇒ 这一次必须拒。
  const skewKey = key('clock-skew');
  await ask(wire, skewKey, 1, 100, 3_000);
  const future = (await serverNow(wire)) + 30;
  await wire.hset(skewKey, 'tokens', '0', 'ts', String(future));
  const skewed = await ask(wire, skewKey, 1, 100, 3_000);
  const skewTokens = Number(await tokens(wire, skewKey));

  // ⑥ TTL 是传进去的那个数，不是常量；到期之后键真的消失，再问一次等于一只新桶。
  const ttlKey = key('ttl');
  const ttlFirst = await ask(wire, ttlKey, 1, 0, 1_200);
  const ttlWritten = await wire.pttl(ttlKey);
  await sleep(1_400);
  const ttlExists = await wire.exists(ttlKey);
  const ttlAfterExpiry = await ask(wire, ttlKey, 1, 0, 1_200);
  const zeroRateTtlKey = key('ttl-zero-rate');
  await ask(wire, zeroRateTtlKey, 2, 0, 3_600_000);
  const zeroRateTtl = await wire.pttl(zeroRateTtlKey);

  const readings = {
    runId: RUN_ID,
    redisUrl: REDIS_URL,
    luaSha256: LUA_SHA,
    at: new Date().toISOString(),
    shared: { verdicts: shared, tokens: sharedTokens, pttlMs: sharedTtl },
    perInstance: { verdicts: perInstance },
    atomic: { total: 1 + concurrent.length, allowed: burstAllowedTotal, verdicts: concurrent, tokens: burstTokens },
    refill: { drained, afterWait, stamp: refillStamp, serverBefore: beforeRefill, serverAfter: afterRefill, tokens: refillTokens },
    clockSkew: { verdict: skewed, tokens: skewTokens, futureStamp: future },
    ttl: { first: ttlFirst, writtenMs: ttlWritten, existsAfter: ttlExists, afterExpiry: ttlAfterExpiry, zeroRateMs: zeroRateTtl },
  };
  writeFileSync(resolve(WORK, 'readings.json'), JSON.stringify(readings, null, 2));

  const verdicts: [string, boolean, string][] = [
    [
      'SHARED_BUCKET_CAPPED',
      shared.join('') === '110' && sharedTokens === '0' && sharedTtl > 3_500_000 && sharedTtl <= 3_600_000,
      `同一只键上三次问门 = ${shared.join('/')}（应为 1/1/0）、桶里剩 ${sharedTokens} 枚（应为 0）、PTTL ${sharedTtl}ms（rate=0 ⇒ 一小时上限）。第三次那个拒是共享计数给的，不是哪一台的本地桶`,
    ],
    [
      'PER_INSTANCE_CONTROL',
      perInstance.join('') === '111',
      `对照：同一份脚本、同一组 burst=2/rate=0，只把第三个调用方换成另一只键 ⇒ ${perInstance.join('/')}（应为 1/1/1）。少了这句，上面那个"第三次被拒"分不清是共享生效还是这台 Redis 天生只放两次`,
    ],
    [
      'ATOMIC_BURST_THREE_CONNECTIONS',
      burstAllowedTotal === 3 && concurrent.filter((v) => v === 1).length === 2 && burstTokens === '0',
      `三条独立连接同时各打 4 次（加上建键那一次共 ${1 + concurrent.length} 次问门），burst=3 ⇒ 合计放行 ${burstAllowedTotal}（应为 3）、并发那 12 次里放行 ${concurrent.filter((v) => v === 1).length}（应为 2）、桶里剩 ${burstTokens} 枚。读改写若不原子，这里会大于 3`,
    ],
    [
      'REFILL_FROM_SERVER_CLOCK',
      drained.join('') === '110'
        && afterWait === 1
        && refillStamp >= beforeRefill
        && refillStamp <= afterRefill + 0.05
        && Math.abs(refillTokens - 1) < 1e-6,
      `打空 ${drained.join('/')} → 等 1.1s（rate=2 ⇒ 补 2.2 枚，但 capacity=2 夹住）→ 再问 = ${afterWait}（应为 1）、剩 ${refillTokens.toFixed(6)} 枚（应恰好 1：没有 math.min 那一步这里会是 1.2）；桶里 ts=${refillStamp.toFixed(6)} 落在 EVAL 前后两次 Redis TIME（${beforeRefill.toFixed(6)} … ${afterRefill.toFixed(6)}）之间 ⇒ 补水用的是服务端的钟`,
    ],
    [
      'FUTURE_STAMP_REFUSES',
      skewed === 0 && skewTokens === 0,
      `把 ts 写到未来 30 秒（另一台机器钟快了的形状）、tokens=0、rate=100 ⇒ 这一次 = ${skewed}（应为 0）、桶里 ${skewTokens} 枚。elapsed 为负要夹成 0，不能倒扣出令牌来`,
    ],
    [
      'TTL_IS_THE_ARGUMENT_AND_IT_EXPIRES',
      ttlFirst === 1
        && ttlWritten > 900
        && ttlWritten <= 1_200
        && ttlExists === 0
        && ttlAfterExpiry === 1
        && zeroRateTtl > 3_500_000
        && zeroRateTtl <= 3_600_000,
      `传 ttl=1200 ⇒ 写下的 PTTL ${ttlWritten}ms（不是常量）、1.4s 后 EXISTS=${ttlExists}（应为 0）、再问 = ${ttlAfterExpiry}（应为 1，等于一只新桶）；rate=0 那只键 PTTL ${zeroRateTtl}ms ⇒ 调用方决定的键集合不会永久驻留`,
    ],
  ];
  for (const [name, ok, detail] of verdicts) console.log(`verdict ${name}: ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
  const failed = verdicts.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) throw new Error(`判据没过：${failed.join(', ')}｜读数在 ${resolve(WORK, 'readings.json')}`);
  console.log(`网关共享限流的 Lua 在真 Redis 上通过：${verdicts.length} 条判据、脚本 sha256:${LUA_SHA}、线路 ${REDIS_URL}。`);
} finally {
  // 只删本次 run 自己造的键（名字里带 runId），不碰生产客户端的桶。
  if (created.length) await wire.del(...created);
  await wire.quit();
}