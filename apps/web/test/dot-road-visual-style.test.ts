import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──DOT-ROAD 视觉/骨架门（2026-11-22 · 新模块 /bible/dot-road）
 *
 * 钉住四件事：
 *  1. 页面是 server component（generateMetadata + force-dynamic），组件才是 'use client'；
 *  2. 组件里的 dr- 类全部在 globals.css 的 §DOT-ROAD 段里有定义，且那段只用 token；
 *  3. token 全部真实存在于 tokens.css（打错一个 var 名字会红）；
 *  4. forced-colors / reduced-motion 两个降级真的写了。
 *
 * 与既有视觉门同一纪律：SHA 钉死 + className 脱敏，改样式必须来这里说明原因再重钉。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/bible/dot-road/page.tsx');
const COMPONENT = join(ROOT, 'apps/web/src/components/DotRoad.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const component = readFileSync(COMPONENT, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const redactClasses = (source: string): string =>
  source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');

const cssStart = globals.indexOf('§DOT-ROAD');
const cssSegment = cssStart >= 0 ? globals.slice(cssStart) : '';
const tokenNames = new Set(
  [...tokens.matchAll(/--nexus-[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]),
);

describe('§DOT-ROAD 骨架', () => {
  it('页面是 server component：generateMetadata + force-dynamic，客户端边界只在组件里', () => {
    expect(page).toContain('export async function generateMetadata');
    expect(page).toContain("export const dynamic = 'force-dynamic'");
    expect(page).toContain("from '@/components/DotRoad'");
    expect(page).not.toContain("'use client'");
    expect(component.startsWith("'use client';")).toBe(true);
  });

  it('数据只来自 generated 原文与本机存储，没有假读数', () => {
    expect(component).toContain("from '@/world-bible/generated'");
    expect(component).toContain('parseDotRoadAnchors');
    expect(component).toContain("const STORE_KEY = 'nexus.dotroad.v1'");
    expect(component).not.toMatch(/fetch\(/);
    expect(component).not.toMatch(/setInterval|setTimeout/);
  });

  it('可走：十九个点、六个站、空白、键盘与按钮都在', () => {
    expect(component).toContain('data-dr-board');
    expect(component).toContain('data-dr-dot={n}');
    expect(component).toContain('data-dr-kind={dotKind}');
    expect(component).toContain("event.key === 'ArrowRight'");
    expect(component).toContain("event.key === 'ArrowLeft'");
    expect(component).toContain("event.key === 'Home'");
    expect(component).toContain("event.key === 'End'");
    expect(component).toContain('data-dr-prev');
    expect(component).toContain('data-dr-next');
    expect(component).toContain('data-dr-restart');
    expect(component).toContain('data-dr-closing');
    expect(component).toContain('aria-current={n === step ? \'step\' : undefined}');
  });
});

describe('§DOT-ROAD 样式纪律', () => {
  it('组件用到的每个 dr- 类都在 §DOT-ROAD 段里有定义', () => {
    const classText = [...component.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
      .map((m) => (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' '))
      .join(' ');
    const used = new Set(
      classText.split(/\s+/).filter((name) => name.startsWith('dr-')),
    );
    expect(used.size).toBeGreaterThan(20);
    const missing = [...used].filter((name) => !new RegExp(`\\.${name}(?=[\\s,:{.])`).test(cssSegment));
    expect(missing, `未定义的类：${missing.join(', ')}`).toEqual([]);
  });

  it('§DOT-ROAD 段零写死 hex，只引用存在的 token', () => {
    expect(cssSegment.length).toBeGreaterThan(1500);
    expect(cssSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const vars = [...cssSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!);
    expect(vars.length).toBeGreaterThan(40);
    const unknown = [...new Set(vars)].filter((name) => !tokenNames.has(name));
    expect(unknown, `tokens.css 里没有：${unknown.join(', ')}`).toEqual([]);
  });

  it('forced-colors 与 reduced-motion 两个降级都写了', () => {
    expect(cssSegment).toContain('@media (forced-colors: active)');
    expect(cssSegment).toContain('.dr-dot, .dr-board');
    expect(cssSegment).toContain('@media (prefers-reduced-motion: reduce)');
    expect(cssSegment).toContain('transition: none');
  });

  it('SHA256 钉死（className 脱敏后）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'a14ad8929ee108773d617911b16dab0e3d0feca24fc2e3ac35e18f034cf03320',
    );
    expect(createHash('sha256').update(redactClasses(component)).digest('hex')).toBe(
      '5a3f4f8320e11aa1a26a523999bd3633b37a0946d3d6ac25cd34f87656be4317',
    );
  });
});
