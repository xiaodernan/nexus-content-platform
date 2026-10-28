import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { METRICS, MAX_SERIES_PER_METRIC, increment, resetMetrics, snapshot } from '../src/server/observability';
import { getRateLimiter, rateKey } from '../src/server/security/rateLimit';

/**
 * 插桩的结构性门——这片代码最像"接上了其实没接上"的地方，因为计数器不接线也能编译、
 * `exposition()` 空表也能返回一串合法的空白。
 *
 * 所以钉的不是"模块能 import"，而是**每个声明出来的指标都有一个不在本模块里的调用方**，
 * 以及**每个调用方传的标签都在名单内**（后者是运行时也会抛的事，但要等到那条路被走到才炸；
 * 静态扫一遍让它在 `npm test` 里就红）。
 *
 * 自我怀疑一句并回答：光看"字符串出现过"会不会太弱？所以每条还配了具名锚点（第 2 组），
 * 钉的是"这个文件里那一行确实是 increment/observe 调用"，不是注释里提了一嘴。
 * 反过来也防一手：如果哪天有人把指标名塞进一个永不被调用的文件来糊这一格，
 * 第 3 组的"真跑一次限流闸，看计数器跟着动"会兜住。
 */

const SRC = join(__dirname, '..', 'src');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const files = sources(SRC);
const OWN_MODULE = join(SRC, 'server', 'observability.ts');
const byFile = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

describe('每个声明的指标都有调用方', () => {
  /**
   * 唯一一条写在 observability.ts 自己里面的指标：基数溢出是这模块的安全阀，
   * 它的写入方就是折叠那一步，不该去 src 里找一个不存在的调用点。
   * 这一条不是豁免了就算——同一个文件里"真跑一次顶到上限，看溢出账涨 3"那格是它的运行时凭证。
   */
  const INTERNAL_WRITERS = new Set(['nexus_metric_cardinality_overflow_total']);

  it('指标名在 observability.ts 之外至少出现一次', () => {
    const dead: string[] = [];
    for (const name of Object.keys(METRICS)) {
      if (INTERNAL_WRITERS.has(name)) continue;
      const callers = [...byFile.entries()].filter(([f, text]) => f !== OWN_MODULE && text.includes(`'${name}'`));
      if (callers.length === 0) dead.push(name);
    }
    expect(dead, `这些指标只有声明、没有写入方：${dead.join(', ')}`).toEqual([]);
    // 反向也钉一下：豁免名单不许变成垃圾桶（里面每条都必须真是这模块自己写的）
    for (const name of INTERNAL_WRITERS) {
      expect(readFileSync(OWN_MODULE, 'utf8'), `${name} 并不由本模块折叠`).toContain(`'${name}'`);
    }
  });

  it('具名锚点：写入方在预期的那几个窄口上', () => {
    const anchors: Array<[string, string[]]> = [
      ['server/domain/audit.ts', ['increment(\'nexus_audit_decisions_total\'', 'increment(\'nexus_audit_write_failures_total\'']],
      ['server/security/rateLimit.ts', ['increment(\'nexus_rate_limit_decisions_total\'']],
      ['server/ai/submit.ts', ['increment(\'nexus_ai_jobs_submitted_total\'']],
      ['app/api/ai/run/route.ts', ['increment(\'nexus_ai_runs_total\'', 'observe(\'nexus_ai_run_duration_ms\'']],
      ['instrumentation.ts', ['increment(\'nexus_http_errors_total\'', 'export const onRequestError']],
      ['middleware.ts', ['requestHeaders.set(TRACE_HEADER', 'response.headers.set(TRACE_HEADER']],
    ];
    for (const [rel, needles] of anchors) {
      const text = byFile.get(join(SRC, ...rel.split('/')));
      expect(text, `${rel} 没找到——文件挪了还是这格没接？`).toBeDefined();
      for (const needle of needles) {
        expect(text!, `${rel} 里缺 ${needle}`).toContain(needle);
      }
    }
  });

  it('调用方传的标签名都在名单内（静态一遍，不等运行时炸）', () => {
    const callRe = /(?:increment|observe)\(\s*'(nexus_[a-z_]+)'(?:,\s*[^,{)]*)*\s*\{([^}]*)\}/g;
    const bad: string[] = [];
    for (const [file, raw] of byFile) {
      if (file === OWN_MODULE) continue;
      // 先把换行压平：`observe('x', durationMs, { … })` 的标签对象不是第二个参数，
      // 而跨行写法很常见——按"紧跟着就必须是 {"来认，会把真存在的标签报成缺
      const text = raw.replace(/\s+/g, ' ');
      for (const match of text.matchAll(callRe)) {
        const [, name, body] = match;
        const spec = METRICS[name as keyof typeof METRICS];
        if (!spec) {
          bad.push(`${file}：用了没声明的指标 ${name}`);
          continue;
        }
        // METRICS 是 `as const satisfies`，成员形状不齐（有的没声明标签），取标签名单要先看有没有这一栏
        const declared = Object.keys((spec as { labels?: Record<string, readonly string[] | null> }).labels ?? {});
        /**
         * 键的取法要认得**简写**：`{ capability, outcome: ok ? 'ok' : 'failed' }` 里
         * `capability` 后面没有冒号。只按 `key:` 找的话，这一格会把真实存在的标签报成"少传"——
         * 门报出真没有的违章，和漏报一样糟（第一次跑就是这么红的）。
         */
        const given = String(body ?? '')
          .split(',')
          .map((part) => part.trim().split(':')[0]!.trim())
          .filter((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key));
        for (const key of given) {
          if (!declared.includes(key)) bad.push(`${file}：${name} 没声明标签 ${key}`);
        }
        for (const key of declared) {
          if (!given.includes(key)) bad.push(`${file}：${name} 少传声明的标签 ${key}`);
        }
      }
    }
    expect(bad, `标签名单与调用点对不上：\n${bad.join('\n')}`).toEqual([]);
    // 这一格必须真的看到过调用点，否则"全对"只是因为一条都没匹配上（门空转的形状）
    const seen = [...byFile.values()].reduce(
      (acc, raw) => acc + [...raw.replace(/\s+/g, ' ').matchAll(/(?:increment|observe)\(\s*'nexus_[a-z_]+'/g)].length,
      0,
    );
    expect(seen, '静态扫描一个插桩调用点都没看到').toBeGreaterThanOrEqual(7);
  });

  it('没有任何调用点往标签里塞身份类字段（基数与隐私双账）', () => {
    const forbidden = /\b(projectId|userId|email|ip|actorId|targetId|token|handle)\s*:/;
    const offenders: string[] = [];
    for (const [file, text] of byFile) {
      if (file === OWN_MODULE) continue;
      for (const args of callArguments(text)) {
        if (forbidden.test(args)) offenders.push(`${file}：${args.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
    expect(offenders, `观测里出现了身份标签：\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * 上一格只查**调用点**，漏的是另一半：有人把 `email` 正儿八经声明进 METRICS 的标签名单，
   * 调用点就"合法"了——那时只有这一格看得见。
   */
  it('标签名单本身不含身份类字段（声明层也钉一遍）', () => {
    const forbiddenName = /^(projectId|userId|email|ip|actorId|targetId|token|handle)$/i;
    const offenders: string[] = [];
    for (const [name, spec] of Object.entries(METRICS)) {
      for (const label of Object.keys((spec as { labels?: Record<string, unknown> }).labels ?? {})) {
        if (forbiddenName.test(label)) offenders.push(`${name} 声明了身份标签 ${label}`);
      }
    }
    expect(offenders, `声明层漏进了身份标签：\n${offenders.join('\n')}`).toEqual([]);
  });
});

/**
 * 取 `increment(...)` / `observe(...)` 的**完整**实参列表——按括号配对数走，不是 `[^)]*`。
 *
 * 这条不是吹毛求疵，是变异臂逼出来的：`{ …, allowed: String(input.allowed), actorId: … }`
 * 用 `[^)]*` 会在 `String(input.allowed` 那个 `)` 处截断，身份标签正好落在截断之后，
 * 于是门在真实的违章面前报绿（`actorId` 那一条就是这么被放过去的）。
 */
function callArguments(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\b(?:increment|observe)\s*\(/g)) {
    let depth = 1;
    let i = match.index! + match[0].length;
    for (; i < text.length && depth > 0; i += 1) {
      const ch = text[i];
      if (ch === '(' || ch === '{' || ch === '[') depth += 1;
      else if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
    }
    // depth===0 时 i 停在收尾括号之后；没配平（跨行的注释里提到函数名）就放弃这一处
    if (depth === 0) out.push(text.slice(match.index! + match[0].length, i - 1));
  }
  return out;
}

describe('写入方真的在动（不是编得过去的死代码）', () => {
  it('走一次限流闸：放行与拒绝各计一次，标签只有闸名没有身份', () => {
    resetMetrics();
    const limiter = getRateLimiter();
    // 独立窗口，避免与同文件其它测试抢同一个桶；键的形状是 路由|身份|IP
    const key = rateKey(`probe-gate-${process.pid}`, '203.0.113.9', 'user-under-test');
    expect(limiter.hit(key, 2, 60_000).allowed).toBe(true);
    expect(limiter.hit(key, 2, 60_000).allowed).toBe(true);
    expect(limiter.hit(key, 2, 60_000).allowed).toBe(false);

    const metric = snapshot().find((m) => m.name === 'nexus_rate_limit_decisions_total');
    if (metric?.kind !== 'counter') throw new Error('限流闸没记到账上');
    const gates = metric.series.filter((s) => s.labels.gate === `probe-gate-${process.pid}`);
    expect(gates.map((s) => [s.labels.allowed, s.value])).toEqual([
      ['false', 1],
      ['true', 2],
    ]);
    // 身份不许进标签：整串键里只有第一段被留下
    for (const s of gates) {
      expect(JSON.stringify(s.labels)).not.toContain('user-under-test');
      expect(JSON.stringify(s.labels)).not.toContain('203.0.113.9');
    }
  });

  it('溢出账自己也算得动：顶到上限的那些次全折进一条', () => {
    resetMetrics();
    for (let i = 0; i < MAX_SERIES_PER_METRIC + 3; i += 1) {
      increment('nexus_rate_limit_decisions_total', { gate: `overflow-probe-${i}`, allowed: 'true' });
    }
    const overflow = snapshot().find((m) => m.name === 'nexus_metric_cardinality_overflow_total');
    expect(overflow?.kind === 'counter' && overflow.series[0]!.value).toBe(3);
  });

  it('观测不许把请求带崩：往无界值里灌一次，只折叠不抛', () => {
    resetMetrics();
    expect(() =>
      increment('nexus_rate_limit_decisions_total', { gate: 'x'.repeat(500) + ' 带空格与中文', allowed: 'true' }),
    ).not.toThrow();
    const rate = snapshot().find((m) => m.name === 'nexus_rate_limit_decisions_total');
    expect(rate === undefined || (rate.kind === 'counter' && rate.series.length === 0)).toBe(true);
  });
});
