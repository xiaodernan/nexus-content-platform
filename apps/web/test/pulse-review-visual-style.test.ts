import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──PULSE-REVIEW /observatory "AI 独立复核"（cont. 203）
 *
 *  1. PulseReviewCard 是 client 组件；/observatory（122 口令大厅）引用之；/api/pulse/review 服务端出复核
 *  2. className 只允许 .pr-*
 *  3. .pr-* 全部收在 globals.css；forced-colors 有回退；零 hex
 *  4. 服务端纪律：DEMO MODE 409；10/小时/IP；24h LRU（16 槽）；每条复核必须带数字（缺数字即 502）
 *  5. 复核只读 server 重算的规则真值（fitLinear/summarizeVolatility——纯函数，零 DB）
 *  6. SHA256 钉死（className 脱敏后）
 */
const ROOT = process.cwd();
const CARD = join(ROOT, 'apps/web/src/components/PulseReviewCard.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/pulse/review/route.ts');
const VIEW = join(ROOT, 'apps/web/src/components/PulsePublicView.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const card = readFileSync(CARD, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const view = readFileSync(VIEW, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PR_START = globals.indexOf('.pr-root {');
if (PR_START < 0) throw new Error('globals.css 里没有 .pr-* 段');
const prSegment = globals.slice(PR_START).replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);

describe('──PULSE-REVIEW /observatory "AI 独立复核"', () => {
  it('PulseReviewCard 是 client 组件，文案中英双语且诚实降级', () => {
    expect(code).toContain('use client');
    expect(code).toContain('const COPY');
    expect(code).toContain('locale');
    expect(card).toContain('err409');
  });

  it('服务端纪律：DEMO MODE 409；10/小时/IP；24h LRU；16 槽；缺数字即 502', () => {
    expect(apiRoute).toContain('demo_mode');
    expect(apiRoute).toContain("rateKey('pulse-review'");
    expect(apiRoute).toContain('10, 60 * 60 * 1000');
    expect(apiRoute).toContain('TTL_MS = 24 * 60 * 60 * 1000');
    expect(apiRoute).toContain('LRU_MAX = 16');
    expect(apiRoute).toContain('/\\d/');
  });

  it('复核对象是规则引擎自己重算的真值（纯函数，零 DB 写）', () => {
    expect(apiRoute).toContain('fitLinear');
    expect(apiRoute).toContain('summarizeVolatility');
    expect(apiRoute).not.toContain('getDb');
    expect(apiRoute).not.toContain('insert(');
  });

  it('/observatory 挂载 ReviewCard（DeepReadCard 同级）', () => {
    expect(view).toContain('ReviewCard');
    expect(view).toContain('<DeepReadCard');
  });

  it('className 只允许 .pr-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(15);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `PulseReviewCard 出现非 .pr-* 类：${tok}`).toMatch(/^pr-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.pr-* 全部收在 globals.css；forced-colors 有回退；零 hex；tokens 认识', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    const defined = new Set([...globals.matchAll(/\.((?:pr)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    expect(prSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...prSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(6);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
    const forced = prSegment.slice(prSegment.indexOf('@media (forced-colors: active) {'));
    expect(forced).toContain('.pr-root');
    expect(forced).toContain('.pr-item');
  });

  it('SHA256 钉死：PulseReviewCard（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(card)).digest('hex')).toBe(
      '9ab8e60098f6916f0ec89b8925a9bf6a29c82e076d5854c81445286494597d6a',
    );
  });
});
