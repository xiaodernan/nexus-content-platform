import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-DL `/admin/dead-letters` 死信巡检 `.dl-*` 一族——合并后门面化，本片是它的视觉判据。
 *
 * 并行线 v689/ADR-0122（死信巡检 · 运维只读窗口）带入整页，合并后按 §FE 纪律门面化。
 * 职责：毒消息耗尽重试后隔离在此，运维在浏览器里看而不是进 redis-cli。
 * 纯读路径（LLEN+LRANGE），不写、不阻塞、不触发 worker；cursor 分页、NDJSON 附件导出。
 *
 * **剥 className 后全文 SHA256 钉死**：`22cb214b…`，合并后 2026-11-14 修实后的字节
 * （`@Import(SecurityConfig.class)` 只在后端，本文件当时未变）。
 */

const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/admin/dead-letters/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const code = strip(main);

const DL_START = globals.indexOf('.dl-card {');
if (DL_START < 0) throw new Error('globals.css 里没有 .dl- 段（.dl-card {）');
const nextSection = globals.indexOf('/* ── §FE-ASH', DL_START);
const segment = globals.slice(DL_START, nextSection > 0 ? nextSection : undefined);

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}');
}

describe('§FE-DL /admin/dead-letters 死信巡检', () => {
  it('server 组件 + denied×2 + adm-Name + readDeadLettersPage 只读进门', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain('readDeadLettersPage(');
    expect(code).toContain('data-admin-denied="anonymous"');
    expect(code).toContain('data-admin-denied="not-admin"');
    expect(code).toContain('<BrandTitle>');
    expect(code).toContain('<AdminNav current="dead-letters"');
    expect(code).toContain("role=");
  });

  it('字面 className 全 .dl-*/.adm-*/.am-*/.brand-title', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(14);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `dead-letters 出现域外类：${tok}`).toMatch(/^(dl|adm|am|brand)-/);
      }
    }
  });

  it('零裸 Tailwind（含 rounded-xl/border-*/px-/py- 变体）', () => {
    for (const re of ['rounded-', 'border-', 'px-', 'py-', 'p-', 'text-', 'flex-', 'items-', 'hover:', 'gap-', 'mt-']) {
      expect(code, `dead-letters 仍出现裸原子 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有定义', () => {
    const used = new Set([...code.matchAll(/\b(dl|adm|am|brand)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(16);
    const defined = new Set([...globals.matchAll(/\.((?:dl|adm|am|brand)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
  });

  it('.dl- 视觉段零 hex、零新增颜色 token；var(--nexus-*) 全部在 tokens.css 声明', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).not.toMatch(/--nexus-color-dl-/);
    const usedTokens = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('data 钩子守恒（summary/list/next/export/refresh/retry/scope/unavailable/error）', () => {
    for (const hook of ['data-dead-letters-admin-root', 'data-dead-letters-summary', 'data-dead-letters-export', 'data-dead-letters-refresh', 'data-dead-letters-empty', 'data-dead-letters-list', 'data-dead-letters-item', 'data-dead-letters-scope', 'data-dead-letters-next', 'data-dead-letters-unavailable', 'data-dead-letters-invalid-cursor', 'data-dead-letters-snapshot-stale', 'data-dead-letters-error']) {
      expect(code, `dead-letters 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('剥 className 后全文 SHA256 钉死（修实后字节：22cb214b0e09e524e288b8a2195db7722807a904906d8af17000805393fb036d）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '22cb214b0e09e524e288b8a2195db7722807a904906d8af17000805393fb036d',
    );
  });
});
