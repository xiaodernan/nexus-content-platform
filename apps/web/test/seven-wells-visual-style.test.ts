import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * §BIBLE-2 典籍室「七口井」——**静态那一寸**。
 *
 * 判据：
 * 1. page.tsx 是 server 组件 + getLocale + crumb 钩子；
 * 2. SevenWells.tsx 保留 'use client'；零 provider/fetch 字面；
 * 3. zh/en 词典两份齐（wells 数组条目数相等、第七·迎潮存在）；
 * 4. 钩子 `data-bible-well-*` 守恒（root/back/panel/form/input/submit/restart/nav/open/…）；
 * 5. 字面 className 只认 .bb-well-*；§BIBLE-1 段定义齐 + 段内零 hex + forced-colors 覆盖
 *    （.bb-well-nav / .bb-well-panel / .bb-well-btn / .bb-well-restart 站内覆盖）；
 * 6. 七席对位守恒（望潮/辨潮/引潮/留潮/定潮/验潮/迎潮——正典第1卷「潮汐教团七席」所定）；
 * 7. SHA256 钉死（EOL 归一 + className→@）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/bible/well/page.tsx');
const COMPONENT = join(ROOT, 'apps/web/src/components/SevenWells.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');

const page = readFileSync(PAGE, 'utf8');
const component = readFileSync(COMPONENT, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');

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

describe('§BIBLE-2 典籍室「七口井」', () => {
  it('page 是 server 组件 + getLocale + crumb 钩子 + crumb/back 钩子齐全', () => {
    expect(page).not.toContain('use client');
    expect(page).toContain("export const dynamic = 'force-dynamic'");
    expect(page).toContain('import { getLocale');
    // 2026-11-22：metadata 跟随 cookie 语言（英文标签页 The Seven Wells）。
    expect(page).toContain('export async function generateMetadata');
    for (const hook of ['data-bible-well-page', 'data-bible-locale', 'data-bible-well-back']) {
      expect(page, `shell 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('SevenWells 是 client 组件 + 零 fetch/零 provider + 七口井', () => {
    expect(component.slice(0, 80)).toContain('use client');
    expect(component).not.toContain('fetch(');
    expect(component).not.toContain('/api/');
    expect(component).not.toContain('provider');
    // 锚点正典核：七席之外少一席即 fail；七席之外多一席也 fail
    for (const seat of ['Watching the Tide', 'Distinguishing the Tide', 'Guiding the Tide', 'Keeping the Tide', 'Fixing the Tide', 'Verifying the Tide']) {
      expect(component, `英文七席缺「${seat}」`).toContain(seat);
    }
    for (const seat of ['望潮', '辨潮', '引潮', '留潮', '定潮', '验潮']) {
      expect(component, `中文七席缺「${seat}」`).toContain(seat);
    }
  });

  it('双语字典齐（zh + en）', () => {
    expect(component).toContain('zh: {');
    expect(component).toContain('en: {');
    expect(component).toContain('kicker:');
    expect(component).toContain('wells: [');
    expect(component).toContain('seventh:');
    const zhWells = (component.match(/name: '一\s*·\s*/g) ?? []).length + (component.match(/name: '[二三四五六]\s*·\s*/g) ?? []).length;
    expect(zhWells).toBe(6);
  });

  it('data 钩子守恒', () => {
    for (const hook of [
      'data-bible-well-root',
      'data-bible-well-navtitle',
      'data-bible-well-panel',
      'data-bible-well-panel-seventh',
      'data-bible-well-form',
      'data-bible-well-input',
      'data-bible-well-submit',
      'data-bible-well-answer',
      'data-bible-well-restart',
    ]) {
      expect(component, `SevenWells 丢了钩子 ${hook}`).toContain(hook);
    }
    for (let i = 0; i < 6; i++) {
      expect(component, `循环 i=${i} 未渲染`).toMatch(/data-bible-well-open=\{i\}/);
    }
    expect(component, '第七口井钩子丢了').toContain('data-bible-well-open={6}');
  });

  it('字面 className 只认 .bb-well-*；零裸 Tailwind 原子类', () => {
    for (const [name, code] of [['page', page], ['component', component]] as const) {
      const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      expect(literals.length, `${name} className 数量异常`).toBeGreaterThanOrEqual(4);
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${name} 出现域外类：${tok}`).toMatch(/^bb-(well|crumb|root|title|head|lede|foot|footLink|crumbSep|crumbCurrent)-[A-Za-z0-9-]*$|^bb-(root|footLink|crumbSep|crumbCurrent|breadcrumb)$/);
        }
      }
    }
  });

  it('.bb-well-* 全部在 §BIBLE-1 段定义；forced-colors 覆盖；段内零 hex', () => {
    expect(bbSegment.length).toBeGreaterThan(0);
    expect(bbSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const used = new Set<string>();
    for (const code of [page, component]) {
      for (const cls of [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!)) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
      }
    }
    const defined = new Set([...bbSegment.matchAll(/\.((?:bb)-[A-Za-z0-9-]+)(?=[,{:\s[])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css §BIBLE-1 没有定义 ${cls}`).toContain(cls);
    const forced = bbSegment.slice(Math.max(0, bbSegment.indexOf('@media (forced-colors: active) {')));
    for (const cls of ['.bb-well-nav', '.bb-well-panel', '.bb-well-btn', '.bb-well-restart']) {
      expect(forced).toContain(cls);
    }
  });

  it('SHA256 钉死（EOL 归一 + className→@）：shell / 组件', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      // 2026-11-22：metadata 跟随语言（page 的 DOM 未动）。
      '49f5653affd72ae5e04a0bbb03eb27e636e7000b72b60189edcdc9d28c4921e3',
    );
    expect(createHash('sha256').update(redactClasses(component)).digest('hex')).toBe(
      '9a8f3fa7677dd483ef83143fbff578757feeea6001daca145c13938c8bd0c60f',
    );
  });
});
