import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * §BIBLE-2 `/bible/quiz` 典籍室「潮汐挑战」——**静态那一寸**。
 *
 * 判据：
 * 1. quiz/page.tsx 是 server 组件 + RSC + getLocale + crumb 钩子；
 * 2. BibleQuiz.tsx 保留 'use client'；状态机走完整（seen steps = questions.length；restart = reset）；
 * 3. 页内禁止 provider/fetch 调用（这是归档品：题目全是本文件常量，本着"正典问正典"）；
 * 4. 双语字典 zh + en 两套都必备，且 zh 与 en 的题目数相等、答案分布相等；
 * 5. 零裸 Tailwind 原子类；门面类只认 .bb-*，且每个都在 globals.css 的 §BIBLE-1 段有定义；
 * 6. §BIBLE-1 段零 hex、forced-colors 覆盖；
 * 7. SHA256 钉死（EOL 归一 + className→@）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/bible/quiz/page.tsx');
const COMPONENT = join(ROOT, 'apps/web/src/components/BibleQuiz.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const component = readFileSync(COMPONENT, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const BIBLE_START = globals.indexOf('§BIBLE-1');
const bbSegment = BIBLE_START >= 0 ? globals.slice(BIBLE_START) : '';

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§BIBLE-2 /bible/quiz 典籍室「潮汐挑战」', () => {
  it('shell 是 server 组件 + getLocale + crumb 钩子；RSC 传入 locale', () => {
    expect(page).not.toContain('use client');
    expect(page).toContain('export const dynamic');
    expect(page).toContain('import { getLocale');
    expect(page).toContain('const COPY');
    expect(page).toContain("href=\"/bible\"");
    for (const hook of ['data-bible-quiz-page', 'data-bible-quiz-back', 'data-bible-locale']) {
      expect(page).toContain(hook);
    }
  });

  it('BibleQuiz 是 client 组件；零 provider/fetch；状态机覆盖 14 题', () => {
    expect(component.slice(0, 80)).toContain('use client');
    expect(component).not.toContain('fetch(');
    expect(component).not.toContain('/api/');
    expect(component).toContain('useState');
    expect(component).toContain('QUESTIONS');
    expect(component).toContain('restart');
  });

  it('双语题库：zh 与 en 题目数、答案序列完全相等；无 provider 字段外泄', () => {
    const zhPrompts = (component.match(/\bprompt: '/g) ?? []).length / 2;
    expect(zhPrompts).toBe(14);
    const zhAnswers = [...component.matchAll(/\banswer: (\d), ref: '/g)].map((m) => Number(m[1]));
    // 每个 element 内 zh/en 连续两次出现、答案镜像一致：zh0,en0,zh1,en1,…
    expect(zhAnswers).toEqual([2, 2, 0, 1, 3, 1, 2, 0, 1, 2, 1, 2, 0, 2].flatMap((a) => [a, a]));
    expect(component).toContain('zh:');
    expect(component).toContain('en:');
  });

  it('data 钩子守恒', () => {
    for (const hook of [
      'data-bible-quiz-root',
      'data-bible-quiz-step',
      'data-bible-quiz-progress',
      'data-bible-quiz-question',
      'data-bible-quiz-choice',
      'data-bible-quiz-feedback',
      'data-bible-quiz-next',
      'data-bible-quiz-restart',
      'data-bible-quiz-verdict',
      'data-bible-quiz-final-score',
    ]) {
      expect(component, `BibleQuiz 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .bb-*；零裸 Tailwind 原子类', () => {
    for (const [name, code] of [['page', page], ['component', component]] as const) {
      const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      expect(literals.length, `${name} 的 className 数量异常`).toBeGreaterThanOrEqual(4);
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${name} 出现域外类：${tok}`).toMatch(/^bb-[A-Za-z0-9][A-Za-z0-9-]*$/);
        }
      }
    }
  });

  it('.bb-quiz-* 在 globals.css §BIBLE-1 段定义；forced-colors 覆盖', () => {
    expect(bbSegment.length).toBeGreaterThan(0);
    const used = new Set<string>();
    for (const code of [page, component]) {
      for (const cls of [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!)) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
      }
    }
    const defined = new Set([...bbSegment.matchAll(/\.((?:bb)-[A-Za-z0-9-]+)(?=[,{:\s[])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css §BIBLE-1 没有定义 ${cls}`).toContain(cls);
    const forced = bbSegment.slice(Math.max(0, bbSegment.indexOf('@media (forced-colors: active) {')));
    for (const cls of ['.bb-quiz-choice', '.bb-quiz-title', '.bb-quiz-restart']) {
      expect(forced).toContain(cls);
    }
  });

  it('§BIBLE-1 段零 hex（含 bb-quiz-* 中）；quiz 新增类 var() 全声明', () => {
    expect(bbSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...bbSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('SHA256 钉死（EOL 归一 + className→@）：shell / 组件', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '612a074adcfa22378f36197e23cebac0fbc08f1d3a99e5b96b6f862e4ed6eb92',
    );
    expect(createHash('sha256').update(redactClasses(component)).digest('hex')).toBe(
      'e22d3dcd5f3bcdf0eb0eae429fb5782e231c717de73c2b832420651c204dba9f',
    );
  });
});
