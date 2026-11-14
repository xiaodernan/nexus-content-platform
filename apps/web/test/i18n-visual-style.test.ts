import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-I18N — 中文 ↔ English 切换打通门。
 *
 * 判据不变式：
 *  1. RootLayout 是 async，读 getLocale 并把 lang 下发 <html lang>；
 *  2. LocaleToggle 挂在 layout 上（与 ThemeToggle 共存）；
 *  3. /api/locale 的 POST 只接受合法值（否则 400），force-dynamic；
 *  4. lib/i18n 导出 LOCALE_COOKIE / SUPPORTED_LOCALES / isLocale / getLocale；
 *  5. 缺一个算一个，不省不漏不伪造。
 */
const ROOT = process.cwd();
const LAYOUT = readFileSync(join(ROOT, 'apps/web/src/app/layout.tsx'), 'utf8');
const API_ROUTE = readFileSync(join(ROOT, 'apps/web/src/app/api/locale/route.ts'), 'utf8');
const LIB = readFileSync(join(ROOT, 'apps/web/src/lib/i18n.ts'), 'utf8');
const TOGGLE = readFileSync(join(ROOT, 'apps/web/src/components/LocaleToggle.tsx'), 'utf8');

describe('§FE-I18N 中英切换基础设施', () => {
  it('RootLayout：async + getLocale + <html lang> + LocaleToggle 挂载', () => {
    expect(LAYOUT).toContain('export default async function RootLayout');
    expect(LAYOUT).toContain('await getLocale()');
    expect(LAYOUT).toContain('<html lang={');
    expect(LAYOUT).toContain('<LocaleToggle />');
    expect(LAYOUT).toContain('<CommandPalette />');
    expect(LAYOUT).toContain('<KeyboardCheatsheet />');
    expect(LAYOUT).toContain('<ThemeToggle />');
  });

  it('lib/i18n：导出 LOCALE_COOKIE / 两个语言键 / isLocale / getLocale', () => {
    expect(LIB).toContain("LOCALE_COOKIE");
    expect(LIB).toContain("'zh'");
    expect(LIB).toContain("'en'");
    expect(LIB).toContain('isLocale');
    expect(LIB).toContain('getLocale');
    expect(LIB).toContain('SUPPORTED_LOCALES');
  });

  it('/api/locale：force-dynamic + POST + 400 on bad value', () => {
    expect(API_ROUTE).toContain("export const dynamic = 'force-dynamic'");
    expect(API_ROUTE).toContain('export async function POST');
    expect(API_ROUTE).toContain("{ status: 400 }");
    expect(API_ROUTE).toContain('isLocale');
    expect(API_ROUTE).toContain('store.set(LOCALE_COOKIE');
  });

  it('LocaleToggle：client component + POST /api/locale + reload + 两种 label', () => {
    expect(TOGGLE).toContain("'use client'");
    expect(TOGGLE).toContain("fetch('/api/locale'");
    expect(TOGGLE).toContain('window.location.reload()');
    // 语言走 cookie（与主题走 localStorage 的分工：语言影响 RSC 分发，需服务端可读）
    expect(TOGGLE.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('localStorage.');
    expect(TOGGLE).toContain('EN');
    expect(TOGGLE).toContain('中');
    expect(TOGGLE).toContain('data-locale-toggle=');
  });

  it('layout 字节级 SHA256（本线字节）', () => {
    const stripped = LAYOUT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const redact = (s: string) => s
      .replace(/className="[^"]*"/g, 'className="@"')
      .replace(/\s+/g, ' ');
    expect(createHash('sha256').update(redact(stripped)).digest('hex')).toBe('ddb0b88eaa0b26ce58cd4c1677c93763a6ca13ba948e88256c677d33d4232ef1');
  });
});
