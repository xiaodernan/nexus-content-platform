import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * §BIBLE-4 `/bible/ask` 问典 —— **静态那一寸**。
 * 1. shell 是 server 组件 + getLocale + force-dynamic + metadata；
 * 2. BibleAsk.tsx 是 client 组件；fetch 只去 /api/bible/q；诚实 503 态必须存在；
 * 3. COPY 双语成对、无裸 Tailwind；
 * 4. .bbq-* 类全在 §BIBLE-4 段定义（globals.css 零 hex + var() 合法）；forced-colors 覆盖；
 * 5. SHA256 钉死（EOL 归一 + className→@）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/bible/ask/page.tsx');
const COMPONENT = join(ROOT, 'apps/web/src/components/BibleAsk.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const component = readFileSync(COMPONENT, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const BIBLE_START = globals.indexOf('§BIBLE-4');
const segment = BIBLE_START >= 0 ? globals.slice(BIBLE_START) : '';

function redactClasses(source: string): string {
  return source
    .replace(/^\uFEFF/, '') // BOM 不进哈希——钉的是内容，不是编码噪声
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§BIBLE-4 /bible/ask 问典', () => {
  it('shell 是 server 组件 + force-dynamic + metadata + getLocale', () => {
    expect(page).not.toContain('use client');
    expect(page).toContain('export const dynamic');
    expect(page).toContain('export const metadata');
    expect(page).toContain('import { getLocale');
    expect(page).toContain('BibleAsk');
  });

  it('BibleAsk 是 client 组件；fetch 只打 /api/bible/q；诚实横幅与 example 按钮都在', () => {
    expect(component.slice(0, 80)).toContain('use client');
    expect(component).not.toContain('/api/insight/');
    expect(component).toContain("'/api/bible/q'");
    expect(component).toContain('data-bible-ask-honest');
    expect(component).toContain('data-bible-ask-input');
    expect(component).toContain('data-bible-ask-submit');
    expect(component).toContain('data-bible-ask-badge');
    expect(component).toContain('data-bible-ask-example');
    expect(component).toContain('EXAMPLE_QUESTIONS');
    expect(component).toContain('503');
  });

  it('COPY 双语成对；参数 anka 风格 data-* 钩子齐全', () => {
    expect(component).toContain('Record<Locale');
    expect(component).toContain('zh:');
    expect(component).toContain('en:');
    for (const hook of ['data-bible-ask-root', 'data-bible-ask-form']) {
      expect(component).toContain(hook);
    }
  });

  it('.bbq-* 类全在 §BIBLE-4 段定义；forced-colors 覆盖关键控件', () => {
    expect(segment.length).toBeGreaterThan(0);
    const used = new Set<string>();
    for (const cls of [...component.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!)) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    }
    const defined = new Set([...segment.matchAll(/\.((?:bbq)-[A-Za-z0-9-]+)(?=[,{:\s[])/g)].map((m) => m[1]!));
    for (const cls of used) {
      if (cls.startsWith('bb-')) continue;
      expect(defined, `§BIBLE-4 段没有定义 ${cls}`).toContain(cls);
    }
    const forced = segment.slice(Math.max(0, segment.indexOf('@media (forced-colors: active) {')));
    for (const cls of ['.bbq-panel', '.bbq-input']) {
      expect(forced).toContain(cls);
    }
  });

  it('§BIBLE-4 段零 hex；var() 全部在 tokens.css 声明', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('SHA256 钉死（BOM/EOL 归一 + className→@）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'fabb91fcf73de4ff351e9ff7123d10e0256d9b7c8842259817281108afca46cf',
    );
    expect(createHash('sha256').update(redactClasses(component)).digest('hex')).toBe(
      '14ab07ded500b70222b8595b4042ba54152656cfb5c53d1fadb6bd27d98542c2',
    );
  });
});
