import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──SGRAPH-1 `/stategraph` 落点页 + `<StategraphTry>` 试跑面板（cont. 169）
 *
 * 与 FE-Guide 同一套治理公式：
 *  1. RSC-only（page.tsx 无 'use client'；交互面板单独成为 client 组件）
 *  2. metadata + force-dynamic + locale-aware
 *  3. 中英双语 COPY 体
 *  4. className 只允许 .sg-*
 *  5. .sg-* 全部收在 globals.css，forced-colors 有回退
 *  6. data-stategraph-* 锚钩
 *  7. SHA256 钉页（className 脱敏后）
 */
const ROOT = process.cwd();
const REAL = join(ROOT, 'apps/web/src/app/stategraph/page.tsx');
const TRY_PANEL = join(ROOT, 'apps/web/src/components/StategraphTry.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(REAL, 'utf8');
const tryPanel = readFileSync(TRY_PANEL, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tryCode = tryPanel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}
const SG_START = findOutsideComments(globals, /\.sg-root \{/);
if (SG_START < 0) throw new Error('globals.css 里没有 .sg-* 段');
const rest = globals.slice(SG_START);
const restNoComments = rest.replace(/\/\*[\s\S]*?\*\//g, '');
const TO_END = restNoComments.search(/\/\* ──{5,}/);
const sgSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [
  ...[...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!),
  ...[...tryCode.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!),
];

describe('──SGRAPH-1 /stategraph StateGraph 公开只读落点', () => {
  it('RSC + metadata + force-dynamic + locale-aware 骨架', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain('export const dynamic');
    expect(code).toContain('export const metadata');
    expect(code).toContain("import { getLocale");
    expect(code).toContain('const COPY');
  });

  it('中英双语 COPY（zh + en 同构 key）', () => {
    const zh = code.indexOf('zh: {');
    const en = code.indexOf('en: {');
    expect(zh).toBeGreaterThan(0);
    expect(en).toBeGreaterThan(0);
    for (const key of ['kicker', 'title', 'lede', 'nodes', 'why', 'where']) {
      expect(code).toContain(key);
    }
    // 节点名七个，两语言中各出现一次
    for (const nodeName of ['validate', 'check_provider', 'build_prefix', 'call_llm', 'cache_read', 'parse_and_release', 'assemble']) {
      expect(code, `节点名缺失 ${nodeName}`).toContain(nodeName);
    }
  });

  it('className 只允许 .sg-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(24);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `/stategraph 出现非 .sg-* 类：${tok}`).toMatch(/^sg-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.sg-* 全部收在 globals.css 中被定义，forced-colors 有回退', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    expect(used.size).toBeGreaterThanOrEqual(20);
    const defined = new Set([...globals.matchAll(/\.((?:sg)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.sg-root');
    expect(forced).toContain('.sg-section');
    expect(forced).toContain('.sg-title');
  });

  it('sg 段零十六进制、全部 var(--nexus-*) 且 tokens.css 认识', () => {
    expect(sgSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...sgSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(10);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
  });

  it('data-stategraph-* 锚钩 + 试跑纪律（dryRun / 限流 / 失败如实）', () => {
    for (const hook of ['data-stategraph-root', 'data-stategraph-locale=', 'data-stategraph-section=']) {
      expect(code, `落点页缺少 ${hook}`).toContain(hook);
    }
    // 试跑面板：固定载荷、dryRun、不吞失败
    expect(tryCode).toContain('/api/stategraph');
    expect(tryCode).toContain('data-stategraph-try');
    expect(tryCode).toContain('data-stategraph-result');
    expect(tryCode).toContain('data-stategraph-failure');
    // API 路由：真值纪律（固定载荷 + dryRun + 限流 + DEMO MODE 拒绝）
    const api = readFileSync(join(ROOT, 'apps/web/src/app/api/stategraph/route.ts'), 'utf8');
    expect(api).toContain('dryRun: true');
    expect(api).toContain('rateKey(');
    expect(api).toContain("'stategraph-try'");
    expect(api).toContain('demo_mode');
    expect(api).toContain('critique');
  });

  it('SHA256 钉页（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '6bdf804fe66831b616f0ca5c43cf693599c6db3c219e1e51e9032f3ceff8265f',
    );
  });
});
