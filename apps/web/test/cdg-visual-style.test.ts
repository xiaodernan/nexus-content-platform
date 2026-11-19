import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──CHAPTER-DIGEST /bible/[slug] "让 AI 读给你听"（cont. 193）
 *
 *  1. ChapterDigest 是 client 组件；/bible/[slug] 引用之；/api/bible/chapter-digest 服务端出摘要
 *  2. className 只允许 .cdg-*（.cd-* 归 CodePanel，.cdg-* 为本组件）
 *  3. .cdg-* 全部收在 globals.css；forced-colors 有回退；零 hex
 *  4. 服务端纪律：DEMO MODE 409；20/小时/IP；7 天 LRU 缓存（32 槽）；只读当前 slug 的原文摘录
 *  5. SHA256 钉死（className 脱敏后）
 */
const ROOT = process.cwd();
const CARD = join(ROOT, 'apps/web/src/components/ChapterDigest.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/bible/chapter-digest/route.ts');
const READER = join(ROOT, 'apps/web/src/app/bible/[slug]/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const card = readFileSync(CARD, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const reader = readFileSync(READER, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CDG_START = globals.indexOf('.cdg-root {');
if (CDG_START < 0) throw new Error('globals.css 里没有 .cdg-* 段');
const cdgSegment = globals.slice(CDG_START).replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);

describe('──CHAPTER-DIGEST /bible/[slug] "让 AI 读给你听"', () => {
  it('ChapterDigest 是 client 组件，文案中英双语且诚实降级', () => {
    expect(code).toContain('use client');
    expect(code).toContain('const COPY');
    expect(code).toContain('locale');
    expect(code).toContain('slug');
    // DEMO MODE 失败如实展示（不替 provider 圆场）
    expect(card).toContain('err409');
  });

  it('服务端纪律：DEMO MODE 409；20/小时/IP；7 天 LRU；32 槽；只读当前 slug 摘录', () => {
    expect(apiRoute).toContain('demo_mode');
    expect(apiRoute).toContain("rateKey('bible-digest'");
    expect(apiRoute).toContain('20, 60 * 60 * 1000');
    expect(apiRoute).toContain('TTL_MS = 7 * 24 * 60 * 60 * 1000');
    expect(apiRoute).toContain('LRU_MAX = 32');
    expect(apiRoute).toContain('MAX_DIGEST_MARKDOWN_CHARS = 6000');
    // 只读正典当前章，不读其他章节
    expect(apiRoute).toContain('BIBLE_CHAPTERS.find');
    expect(apiRoute).toContain('不许编造');
  });

  it('/bible/[slug] 引用 ChapterDigest，且只传当前章 slug + locale', () => {
    expect(reader).toContain('ChapterDigest');
    expect(reader).toContain('slug={chapter.slug}');
    expect(reader).toContain('locale={locale}');
  });

  it('className 只允许 .cdg-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(12);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `ChapterDigest 出现非 .cdg-* 类：${tok}`).toMatch(/^cdg-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.cdg-* 全部收在 globals.css；forced-colors 有回退；零 hex；tokens 认识', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    const defined = new Set([...globals.matchAll(/\.((?:cdg)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    expect(cdgSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...cdgSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(6);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
    const forced = cdgSegment.slice(cdgSegment.indexOf('@media (forced-colors: active) {'));
    expect(forced).toContain('.cdg-root');
    expect(forced).toContain('.cdg-ponder');
  });

  it('SHA256 钉死：ChapterDigest（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(card)).digest('hex')).toBe(
      '662a85a4f5f732808ba57a21f196ec4321c879a1209ece91a47cc5b848da7636',
    );
  });
});
