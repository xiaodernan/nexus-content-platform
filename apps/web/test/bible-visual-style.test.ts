import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * §BIBLE-1 `/bible` 典籍室（目录 + 阅读页）——**静态那一寸**。
 *
 * 1. server 组件 + getLocale + force-dynamic + metadata；
 * 2. 页内钩子 `data-bible-*` 守恒（root/card/open/reader/anchors/back-index/prev/next/…）；
 * 3. 快照契约：pages 一律从 `@/world-bible/generated` 取章，不在源码里复制正典；
 * 4. 门面类只认 `.bb-*`，且每个都在 globals.css 的 §BIBLE-1 段有定义，forced-colors 覆盖；
 * 5. 段内零 hex，var(--nexus-*) 全部在 tokens.css 声明；
 * 6. BibleMarkdown 表格区带 `role="region"` + `tabIndex` + 双语 aria-label 入参；
 * 7. 与 `docs/world-bible/` 的成对译本一致由 `verify:world-bible` / `verify:bible-snapshot` 把关，
 *    这里只钉门面与钩子。
 * 8. SHA256 钉死（EOL 归一 + className→@，门内 redact 复算）。
 */
const ROOT = process.cwd();
const INDEX = join(ROOT, 'apps/web/src/app/bible/page.tsx');
const READER = join(ROOT, 'apps/web/src/app/bible/[slug]/page.tsx');
const COMPONENT = join(ROOT, 'apps/web/src/components/BibleMarkdown.tsx');
const GENERATED = join(ROOT, 'apps/web/src/world-bible/generated.ts');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const index = readFileSync(INDEX, 'utf8');
const reader = readFileSync(READER, 'utf8');
const component = readFileSync(COMPONENT, 'utf8');
const generated = readFileSync(GENERATED, 'utf8');
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

describe('§BIBLE-1 /bible 典籍室', () => {
  it('目录页与阅读页都是 server 组件 + getLocale + force-dynamic + metadata', () => {
    for (const f of [index, reader]) {
      expect(f).not.toContain('use client');
      expect(f).toContain('export const dynamic');
      expect(f).toContain('import { getLocale');
      expect(f).toContain('const COPY');
    }
    expect(index).toContain('export const metadata');
    expect(reader).toContain('generateMetadata');
  });

  it('两个页都从 @/world-bible/generated 取快照，正典不复制到源码里', () => {
    for (const f of [index, reader]) {
      expect(f).toContain("from '@/world-bible/generated'");
    }
    expect(generated).toContain('export const BIBLE_CHAPTERS');
    expect(generated).toContain('slug:');
    expect(generated).toContain('**锚句**');
    expect(generated).toContain('**Anchor sentence**');
    expect(reader).toContain('extractAnchors(chapter.markdownZh, chapter.markdownEn)');
  });

  it('页内钩子守恒（目录 + 阅读页）', () => {
    for (const hook of ['data-bible-root', 'data-bible-locale', 'data-bible-chapters', 'data-bible-card', 'data-bible-open', 'data-bible-anchor-count', 'data-bible-doors', 'data-bible-back-guide', 'data-bible-back-discover']) {
      expect(index, `目录页丢了钩子 ${hook}`).toContain(hook);
    }
    for (const hook of ['data-bible-root', 'data-bible-locale', 'data-bible-reader', 'data-bible-back-index', 'data-bible-era', 'data-bible-anchors', 'data-bible-prev', 'data-bible-next']) {
      expect(reader, `阅读页丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('页内不出现正典正文句子（正典只活在快照/docs/world-bible/）', () => {
    for (const f of [index, reader]) {
      for (const sentence of ['盐海', '雾港灯人', '我们还欠着你', '打翻的镜子', '潮汐教团余烬', '潮汐室的门槛上', '第七次日蚀']) {
        expect(f, `页内混入正典正文：${sentence}`).not.toContain(sentence);
      }
    }
  });

  it('字面 className 只认 .bb-*；不出现裸 Tailwind 原子类', () => {
    for (const [name, code] of [['index', index], ['reader', reader], ['component', component]] as const) {
      const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      expect(literals.length, `${name} 一个 className 都没有`).toBeGreaterThanOrEqual(8);
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${name} 出现域外类：${tok}`).toMatch(/^bb-[A-Za-z0-9][A-Za-z0-9-]*$/);
        }
      }
    }
  });

  it('.bb-* 全部在 globals.css 的 §BIBLE-1 段定义；forced-colors 收口', () => {
    expect(bbSegment.length).toBeGreaterThan(0);
    const used = new Set<string>();
    for (const code of [index, reader, component]) {
      for (const cls of [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!)) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
      }
    }
    const defined = new Set([...bbSegment.matchAll(/\.((?:bb)-[A-Za-z0-9-]+)(?=[,{:\s[])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css §BIBLE-1 没有定义 ${cls}`).toContain(cls);
    const forced = bbSegment.slice(Math.max(0, bbSegment.indexOf('@media (forced-colors: active) {')));
    for (const cls of ['.bb-root', '.bb-card', '.bb-title', '.bb-p', '.bb-anchorZh', '.bb-footLink']) {
      expect(forced).toContain(cls);
    }
  });

  it('§BIBLE-1 段零 hex；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(bbSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...bbSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(8);
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('§BIBLE-1 段带打印成册收口（@media print：黑字纸面、导航不进纸、断页保护）', () => {
    const printAt = bbSegment.indexOf('@media print {');
    expect(printAt).toBeGreaterThan(0);
    const printSegment = bbSegment.slice(printAt);
    expect(printSegment).toContain('.bb-breadcrumb, .bb-foot');
    expect(printSegment).toContain('display: none');
    expect(printSegment).toContain('break-inside: avoid');
    expect(printSegment).toContain('page-break-inside: avoid');
    expect(printSegment).toContain('Georgia');
    // 打印段依旧零 hex（只允许命名的 black）
    expect(printSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(bbSegment).toMatch(/@page\s*\{/);
  });

  it('BibleMarkdown：表格区 role=region + tabIndex + 双语 aria-label 入参；锚句提取器成对取', () => {
    expect(component).toContain('role="region"');
    expect(component).toContain('tabIndex={0}');
    expect(component).toContain('tableRegionAria');
    expect(component).toContain('extractAnchors');
    expect(component).toContain('**锚句**');
    expect(component).toContain('**Anchor sentence**');
  });

  // 2026-11-22 重钉（并轨 origin/master）：
  //   index —— master 侧把典籍室从十三扇门改成十四扇门（新增第十四章与页边角落入口）；
  //   reader —— main 线此前给阅读页加了「顺藤摸瓜 · 同线索的回响」，当时**忘了重钉**
  //             （这一格在并轨前就是红的，现一并补上并记在 CURRENT-STATE）；
  //   component —— BibleMarkdown 本轮未动，钉子不变。
  // 门面类名、零 hex、钩子守恒等其余各条门在重钉前已全绿，改的是哪一格写在上面对得上。
  // 2026-11-22 再钉：index —— 中文 echoTitle 去掉并列英文（「回响 · Echoes」→「回响」），
  // 中文模式不再中英夹杂；reader / component 未动。
  it('SHA256 钉死（EOL 归一 + className→@）：目录页 / 阅读页 / 渲染器', () => {
    expect(createHash('sha256').update(redactClasses(index)).digest('hex')).toBe(
      '19b1f7e8b5613f1e71488f31920d54953e1c98fafed243eea0294d46f7cde617',
    );
    expect(createHash('sha256').update(redactClasses(reader)).digest('hex')).toBe(
      'c76bec23b6a5a94a46d7b849459817b04a6633791f1de57bf7000202ad076df7',
    );
    expect(createHash('sha256').update(redactClasses(component)).digest('hex')).toBe(
      '5051a2bdbb11cca3f3e5369562edbcce97bbf5a53a568f8024da3fef9ac8ad82',
    );
  });
});
