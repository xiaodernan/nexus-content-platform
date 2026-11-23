import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──FOR-YOU-STRIP /discover "推荐位"（cont. 199）
 *
 *  1. ForYouStrip 是 client 组件；/discover 引用之（仅登录用户可见）；/api/discover/interest 服务端出荐语
 *  2. className 只允许 .fys-*
 *  3. .fys-* 全部收在 globals.css；forced-colors 有回退；零 hex
 *  4. 服务端纪律：401 匿名；DEMO MODE 409；10/小时（IP+用户）；24h LRU（32 槽）；
 *     模型只看**这个用户自己的实测阅读信号**（discoverInterestSignals）；≤3 张卡；无痕迹 → server-authored 空态
 *  5. SHA256 钉死（className 脱敏后）
 */
const ROOT = process.cwd();
const CARD = join(ROOT, 'apps/web/src/components/ForYouStrip.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/discover/interest/route.ts');
const SOCIAL = join(ROOT, 'apps/web/src/server/domain/social.ts');
const PAGE = join(ROOT, 'apps/web/src/app/discover/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const card = readFileSync(CARD, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const social = readFileSync(SOCIAL, 'utf8');
const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FYS_START = globals.indexOf('.fys-root {');
if (FYS_START < 0) throw new Error('globals.css 里没有 .fys-* 段');
const fysSegment = globals.slice(FYS_START).replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);

describe('──FOR-YOU-STRIP /discover "推荐位"', () => {
  it('ForYouStrip 是 client 组件，文案中英双语且诚实降级', () => {
    expect(code).toContain('use client');
    expect(code).toContain('const COPY');
    expect(code).toContain('locale');
    // 公共页：出错安静消失（注释在 code 里被剥掉，故查原文）
    expect(card).toContain('安静消失');
  });

  it('服务端纪律：401 匿名；DEMO MODE 409；10/小时；24h LRU；32 槽；缺数字即 502；无痕迹不调模型', () => {
    expect(apiRoute).toContain('not_authenticated');
    expect(apiRoute).toContain('demo_mode');
    expect(apiRoute).toContain("rateKey('discover-interest'");
    expect(apiRoute).toContain('10, 60 * 60 * 1000');
    expect(apiRoute).toContain('TTL_MS = 24 * 60 * 60 * 1000');
    expect(apiRoute).toContain('LRU_MAX = 32');
    expect(apiRoute).toContain('signals.length === 0');
    expect(apiRoute).toContain('no-model (server-authored empty case)');
  });

  it('隐私纪律：模型只看这个用户自己的实测阅读信号——姓名/时长/完成度都不进模型', () => {
    expect(apiRoute).toContain('discoverInterestSignals');
    expect(social).toContain('export async function discoverInterestSignals');
    const body = social.slice(social.indexOf('discoverInterestSignals'));
    const selectBlock = body.slice(0, body.indexOf('.groupBy'));
    expect(selectBlock).not.toContain('completionPct');
    expect(selectBlock).not.toContain('visibleMs');
    expect(selectBlock).not.toContain('displayName');
    expect(selectBlock).toContain('myOpens');
    expect(selectBlock).toContain('publicationVisits.userId');
  });

  it('/discover 只在登录用户可见（匿名不渲染推荐位）', () => {
    expect(page).toContain('ForYouStrip');
    expect(page).toContain('{viewer ? <ForYouStrip locale={locale} /> : null}');
  });

  it('className 只允许 .fys-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(12);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `ForYouStrip 出现非 .fys-* 类：${tok}`).toMatch(/^fys-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.fys-* 全部收在 globals.css；forced-colors 有回退；零 hex；tokens 认识', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    const defined = new Set([...globals.matchAll(/\.((?:fys)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    expect(fysSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...fysSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(5);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
    const forced = fysSegment.slice(fysSegment.indexOf('@media (forced-colors: active) {'));
    expect(forced).toContain('.fys-root');
    expect(forced).toContain('.fys-item');
  });

  it('SHA256 钉死：ForYouStrip（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(card)).digest('hex')).toBe(
      '6ea391acd0f0e37f5a39703bfad008375d3857f3da01419d261e98cf0d926a1a',
    );
  });
});
