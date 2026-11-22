import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDE_COPY } from '../src/lib/guideCopy';

/**
 * §FE-Guide「使用指南 / User Guide」（`/guide`）§v712 —— 用户说明书。
 *
 * 判据不变式：
 *  1. RSC-only（零 'use client'）；
 *  2. metadata + force-dynamic；
 *  3. 字典分 zh/en 两个 key（dict 必须是 Record<Locale,…>）；无裸 hex；
 *  4. JSX 字面 className 只认 .gd-* / .am-linkImplicit；
 *  5. .gd-* 全部在 globals.css；forced-colors 收口；
 *  6. data-guide-* 钩子守恒；7. SHA256 钉死。
 */
const ROOT = process.cwd();
const REAL = join(ROOT, 'apps/web/src/app/guide/page.tsx');
const LIB = join(ROOT, 'apps/web/src/lib/guideCopy.ts');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(REAL, 'utf8');
const dictSrc = readFileSync(LIB, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeLib = dictSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}
const GD_START = findOutsideComments(globals, /\.gd-root \{/);
if (GD_START < 0) throw new Error('globals.css 里没有 .gd-* 段');
const rest = globals.slice(GD_START);
const restNoComments = rest.replace(/\/\*[\s\S]*?\*\//g, '');
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const gdSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-Guide /guide 使用指南', () => {
  it('RSC + metadata + force-dynamic + locale-aware skeleton', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain('export const dynamic');
    expect(code).toContain('export const metadata');
    expect(code).toContain("import { getLocale");
    // 说明书正文已抽离为共享字典（v788：/guide 页与 Studio 内置 Help Drawer 共用同一个真值）
    expect(code).toContain('GUIDE_COPY');
    expect(code).not.toContain('const COPY');
    expect(codeLib).toContain('const COPY');
  });

  // 用户第五点：首页与各处错别字「有则改之」。这份是用户直接读的内嵌说明书，
  // 钉住几个最常见的同音错字，防止以后改文案时回潮。「登陆港口」是正确动词用法，
  // 故只查「不需要登陆 / 登陆平台」这种账户语境。
  it('说明书中文正文无常见账户类错别字', () => {
    const banned = [/不需要登陆/, /登陆平台/, /登陆账号/, /登陆后/, /请登陆/, /帐号/, /帐户/];
    for (const re of banned) {
      expect(dictSrc, `说明书中文出现错别字/异体：${re}`).not.toMatch(re);
    }
    expect(dictSrc).toContain('不需要登录');
  });

  it('双语字典齐（zh + en keys）', () => {
    const zh = codeLib.indexOf('zh: {');
    const en = codeLib.indexOf('en: {');
    expect(zh).toBeGreaterThan(0);
    expect(en).toBeGreaterThan(0);
    // 每语必须有 10 个节标题（①-⑥ 原版 + ⑦ 分镜 / ⑧ 世界 / ⑨ 市场团队 / ⑩ 安全网）
    for (const heading of ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']) {
      expect(codeLib, `双语字典缺节 ${heading}`).toContain(heading);
    }
    for (const key of ['kicker', 'title', 'lede', 'sections']) {
      expect(codeLib).toContain(key);
    }
    expect(codeLib).toContain('Record<Locale');
  });

  it('中英章节序列逐节对齐（2026-11-21：英文曾重复 ⑬、中文缺整节，审计把它读成内容错配）', () => {
    // 这不是文风检查，是结构不变量：/guide 与 Studio 抽屉逐节按 index 配对做双语对照，
    // 任一侧多一节/少一节，后面所有段落都会被错位比较，审计报出来的"漏译"全是假象。
    const zh = GUIDE_COPY.zh.sections;
    const en = GUIDE_COPY.en.sections;
    expect(zh.length).toBe(en.length);
    const ordinal = (h: string) => (h.match(/[\u2460-\u2473]/) ?? [''])[0];
    expect(zh.map((x) => ordinal(x.heading))).toEqual(en.map((x) => ordinal(x.heading)));
    // 序号可以缺（StateGraph 小课没有编号），但同一语种内不许出现两次同一个编号：
    // 曾有一个版本把中文版画布速查塞进 en.sections 末尾，en 的 ⑬ 出现两次，
    // 模型逐段对账时把「问典」段判成译文完全错配。
    for (const [locale, sections] of [['zh', zh], ['en', en]] as const) {
      const nums = sections.map((x) => ordinal(x.heading)).filter(Boolean);
      expect(new Set(nums).size, `${locale} 有重复章节号`).toBe(nums.length);
    }
    // 每种语言都要有正文；空节会让对照退化成"heading 相同即通过"的空门
    for (const [locale, sections] of [['zh', zh], ['en', en]] as const) {
      for (const sec of sections) {
        expect(sec.body.length, `${locale} / ${sec.heading} 正文为空`).toBeGreaterThan(0);
      }
    }
  });

  it('字面 className 只认 .gd-* 与 .am-linkImplicit', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(12);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `Guide 出现域外类：${tok}`).toMatch(/^(gd-[A-Za-z0-9][A-Za-z0-9-]*|am-linkImplicit)$/);
      }
    }
  });

  it('.gd-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const used = new Set<string>();
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    expect(used.size).toBeGreaterThanOrEqual(10);
    const defined = new Set([...globals.matchAll(/\.((?:gd|am)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.gd-root');
    expect(forced).toContain('.gd-sectionTitle');
    expect(forced).toContain('.gd-tocLink');
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(gdSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...gdSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(8);
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('data-guide-* 钩子守恒', () => {
    for (const hook of ['data-guide-root', 'data-guide-locale=', 'data-guide-section=']) {
      expect(code, `Guide 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  // 2026-11-22 重钉：页脚「世界全图 · The Atlas →」→「世界全图 →」；metadata 去掉并列英文。
  // 中文模式不再中英夹杂；正文仍在 lib/guideCopy（未动）。
  it('SHA256 钉死（瘦壳 · v788，正文已抽进 lib/guideCopy）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '1e2caf9a2e3430fcb1cdb959f49133f998135dbb0345079af1aee586103c6219',
    );
  });
});
