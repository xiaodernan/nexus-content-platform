import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──OBSERVER-DEEPREAD /admin/observe "AI 深读"（cont. 209 slice）──
 *
 *  1. ObserverDeepRead 是 client 组件；按钮触发（不在挂载时烧 provider）
 *  2. className 只允 .observer-aidr-*
 *  3. .observer-aidr-* 全部收在 globals.css §ADMIN-13 补；零 hex；令牌全声明
 *  4. 服务端纪律：口令 123 守卫 + role=admin 直通 · DEMO MODE 409 · 5/h/IP · 24h LRU（16 槽）· 缺数字即 502
 *  5. SHA256 钉死（className 脱敏 · EOL 归一后重算）
 */
const ROOT = process.cwd();
const CARD = join(ROOT, 'apps/web/src/components/ObserverDeepRead.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/admin/observer/digest/route.ts');
const OBSERVE_ROUTE = join(ROOT, 'apps/web/src/app/api/admin/observer/route.ts');
const PAGE = join(ROOT, 'apps/web/src/app/admin/observe/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const card = readFileSync(CARD, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const observeRoute = readFileSync(OBSERVE_ROUTE, 'utf8');
const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const AIDR_START = globals.indexOf('.observer-aidr {');
if (AIDR_START < 0) throw new Error('globals.css 里没有 .observer-aidr-* 段');
const aidrSegment = globals.slice(AIDR_START).replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);

describe('──OBSERVER-DEEPREAD /admin/observe "AI 深读"', () => {
  it('ObserverDeepRead 是 client 组件；按钮触发（不在挂载时烧 provider）；zh/en 双语', () => {
    expect(code).toContain('use client');
    expect(card).toContain('ObserverDeepRead');
    expect(card).toContain('/api/admin/observer/digest');
    expect(card).toContain('useState');
    // 没有挂载即请求 provider 的 useEffect
    expect(card).not.toContain('useEffect');
    expect(card).toContain('data-observer-deepread-button');
    expect(card).toContain('AI deep-read');
    expect(page).toContain('ObserverDeepRead');
  });

  it('服务端纪律：口令 123 守卫（role=admin 直通）· DEMO 409 · 5/h/IP · 24h LRU 16 槽 · 缺数字 502', () => {
    expect(observeRoute).toContain("path: '/'");
    expect(apiRoute).toContain('OBSERVER_COOKIE');
    expect(apiRoute).toContain("rateKey('observer-deepread'");
    expect(apiRoute).toContain('5, 60 * 60 * 1000');
    expect(apiRoute).toContain('TTL_MS = 24 * 60 * 60 * 1000');
    expect(apiRoute).toContain('LRU_MAX = 16');
    expect(apiRoute).toContain('/\\d/');
    expect(apiRoute).toContain("demo_mode");
  });

  it('模型键名：zh/en 双语提示且都要求「每句带数字」', () => {
    expect(apiRoute).toContain('输出必须带数字');
    expect(apiRoute).toContain('Every sentence must carry a figure');
  });

  it('className 只允 .observer-aidr-*；零裸 Tailwind 原子类', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(6);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `出现域外类：${tok}`).toMatch(/^observer-aidr(-[A-Za-z0-9-]+)?$/);
      }
    }
  });

  it('.observer-aidr-* 全部收在 globals.css §ADMIN-13 补；零 hex；令牌全声明', () => {
    expect(aidrSegment.length).toBeGreaterThan(0);
    expect(aidrSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...aidrSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('data-observer-* 钩子守恒（idle/busy/ok/error/cached）', () => {
    for (const hook of ['data-observer-deepread-idle', 'data-observer-deepread-busy', 'data-observer-deepread-error', 'data-observer-deepread', 'data-observer-deepread-cached']) {
      expect(card, `组件丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('SHA256 钉死（EOL 归一 + className→@）：组件', () => {
    expect(createHash('sha256').update(redactClasses(card)).digest('hex')).toBe(
      '7123eaa090fabbf6dbc0a2a59ce81324630c0f4f859b8302010fa6e575f640c3',
    );
  });
});
