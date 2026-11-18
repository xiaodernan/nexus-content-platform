import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──NOTIF-TRIAGE /notifications "AI 先读一下"（cont. 194）
 *
 *  1. NotifTriage 是 client 组件；/notifications 引用之；/api/notifications/digest 服务端出摘要
 *  2. className 只允许 .ntg-*
 *  3. .ntg-* 全部收在 globals.css；forced-colors 有回退；零 hex
 *  4. 服务端纪律：401 匿名；DEMO MODE 409；20/小时（IP+用户）；6h LRU（32 槽）；
 *     模型只看 inboxKindHistogram（kind+计数）——标题/正文/行为者一个字不进模型
 *  5. SHA256 钉死（className 脱敏后）
 */
const ROOT = process.cwd();
const CARD = join(ROOT, 'apps/web/src/components/NotifTriage.tsx');
const API_ROUTE = join(ROOT, 'apps/web/src/app/api/notifications/digest/route.ts');
const PAGE = join(ROOT, 'apps/web/src/app/notifications/page.tsx');
const DOMAIN = join(ROOT, 'apps/web/src/server/domain/notifications.ts');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const card = readFileSync(CARD, 'utf8');
const apiRoute = readFileSync(API_ROUTE, 'utf8');
const page = readFileSync(PAGE, 'utf8');
const domain = readFileSync(DOMAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const NTG_START = globals.indexOf('.ntg-root {');
if (NTG_START < 0) throw new Error('globals.css 里没有 .ntg-* 段');
const ntgSegment = globals.slice(NTG_START).replace(/\/\*[\s\S]*?\*\//g, '');

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);

describe('──NOTIF-TRIAGE /notifications "AI 先读一下"', () => {
  it('NotifTriage 是 client 组件，文案中英双语且诚实降级', () => {
    expect(code).toContain('use client');
    expect(code).toContain('const COPY');
    expect(code).toContain('locale');
    expect(card).toContain('err409');
    expect(card).toContain('err401');
  });

  it('服务端纪律：401 匿名；DEMO MODE 409；20/小时；6h LRU；32 槽；缺数字即 502', () => {
    expect(apiRoute).toContain('not_authenticated');
    expect(apiRoute).toContain('demo_mode');
    expect(apiRoute).toContain("rateKey('notif-digest'");
    expect(apiRoute).toContain('20, 60 * 60 * 1000');
    expect(apiRoute).toContain('TTL_MS = 6 * 60 * 60 * 1000');
    expect(apiRoute).toContain('LRU_MAX = 32');
    expect(apiRoute).toContain('/\\d/');
  });

  it('隐私红线：模型输入只来自 inboxKindHistogram（kind+计数）——标题/正文/行为者不进模型', () => {
    expect(apiRoute).toContain('inboxKindHistogram');
    expect(domain).toContain('export async function inboxKindHistogram');
    // 领域函数只选 kind+计数两列，不选 title/body/actor
    const histoBody = domain.slice(domain.indexOf('inboxKindHistogram'));
    const selectBlock = histoBody.slice(0, histoBody.indexOf('groupBy'));
    expect(selectBlock).not.toContain('title');
    expect(selectBlock).not.toContain('body');
    expect(selectBlock).not.toContain('actorName');
    // 路由里不出现收件箱行字段
    expect(apiRoute).not.toContain('.actorName');
    expect(apiRoute).not.toContain('page.items');
  });

  it('/notifications 只在收件箱非空时挂 NotifTriage', () => {
    expect(page).toContain('NotifTriage');
    expect(page).toContain('page.items.length > 0');
  });

  it('className 只允许 .ntg-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(12);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `NotifTriage 出现非 .ntg-* 类：${tok}`).toMatch(/^ntg-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.ntg-* 全部收在 globals.css；forced-colors 有回退；零 hex；tokens 认识', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    const defined = new Set([...globals.matchAll(/\.((?:ntg)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    expect(ntgSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...ntgSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(6);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
    const forced = ntgSegment.slice(ntgSegment.indexOf('@media (forced-colors: active) {'));
    expect(forced).toContain('.ntg-root');
    expect(forced).toContain('.ntg-basis');
  });

  it('SHA256 钉死：NotifTriage（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(card)).digest('hex')).toBe(
      '63c9f7bc487e1fbee344ac93c2b88496ed754e5f6b3c741424d1253ef0f53df9',
    );
  });
});
