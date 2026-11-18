import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──AI-DEEP-READ `/observatory` 的"AI 深读"面板（cont. 190）
 *
 * 与 FE-Guide / SGRAPH-1 同一套治理：
 *  1. DeepReadCard 是 client 组件；`PulsePublicView` 负责把 body 交出去
 *  2. className 只允许 .dr-*
 *  3. .dr-* 全部收在 globals.css，forced-colors 有回退；零 hex
 *  4. 服务端 POST /api/ai/deep-read：DEMO MODE 按 409 如实拒绝；限流 10/小时；20 分钟缓存
 *  5. SHA256 钉死（className 脱敏后）
 */
const ROOT = process.cwd();
const CARD = join(ROOT, 'apps/web/src/components/DeepReadCard.tsx');
const PUBLIC_VIEW = join(ROOT, 'apps/web/src/components/PulsePublicView.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/ai/deep-read/route.ts');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const card = readFileSync(CARD, 'utf8');
const publicView = readFileSync(PUBLIC_VIEW, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DR_START = globals.indexOf('.dr-root {');
if (DR_START < 0) throw new Error('globals.css 里没有 .dr-* 段');
const drSegment = globals.slice(DR_START).replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);

describe('──AI-DEEP-READ /observatory 大厅 AI 深读', () => {
  it('DeepReadCard 是 client 组件，文案中英双语且不编造（依据提示词中多数值真实的聚合数据）', () => {
    expect(code).toContain('use client');
    expect(code).toContain('const COPY');
    expect(code).toContain('locale');
    // 复核 disclaimer 存在，并明确"AI 起草 · 实测数字 · 执行前人工复核"
    expect(apiRoute).toContain('disclaimer');
    expect(apiRoute).toContain('AI 起草');
    // CTL：服务端只用 POST body 的数字，不做任何二次聚合（省 DB、杜绝客户端自定义改写数字）
    expect(apiRoute).toContain("z.object({");
    expect(apiRoute).not.toContain('getDb');
    expect(apiRoute).not.toContain('platformPulse');
  });

  it('服务端纪律：DEMO MODE 409；每 IP 每小时 10 次；20 分钟 LRU 缓存；4 槽', () => {
    expect(apiRoute).toContain('demo_mode');
    expect(apiRoute).toContain("rateKey('ai-deep-read'");
    expect(apiRoute).toContain('10, 60 * 60 * 1000');
    expect(apiRoute).toContain('TTL_MS = 20 * 60 * 1000');
    expect(apiRoute).toContain('LRU_MAX = 4');
  });

  it('className 只允许 .dr-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(14);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `DeepReadCard 出现非 .dr-* 类：${tok}`).toMatch(/^dr-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.dr-* 全部收在 globals.css；forced-colors 有回退；零 hex；tokens 全部认识', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    const defined = new Set([...globals.matchAll(/\.((?:dr)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    expect(drSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...drSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(8);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.dr-root');
    expect(forced).toContain('.dr-item');
    expect(forced).toContain('.dr-button');
  });

  it('PulsePublicView 把 body 交给 DeepReadCard（观测大厅接上同一份数据）', () => {
    expect(publicView).toContain('DeepReadCard');
    expect(publicView).toContain('<DeepReadCard body={body} locale={locale} />');
  });

  it('SHA256 钉死：DeepReadCard（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(card)).digest('hex')).toBe(
      '174a32fa5f56bee186699614c89887756580513208c22caa46a81b8f3df71aaf',
    );
  });
});
