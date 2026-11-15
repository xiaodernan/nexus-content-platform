import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { clientLocale } from '@/lib/client-locale';

/**
 * §API-i18n（2026-11-15）客户端 locale 读侧的钉住门：
 * - SSR（document 不存在）一律回落 zh —— 与 RSC 缺省一致，不出现「服务端 zh/客户端 en」的双份真值；
 * - 浏览器里以文档 <html lang> 为唯一源；只有恰好等于 'en' 才返回 en；
 * - 其它一切（zh-CN / 空串 / 乱码）一律回落 zh —— 宁缺勿错。
 */
describe('clientLocale（public-reading-i18n 机制）', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  beforeEach(() => {
    // 模拟浏览器环境
    (globalThis as Record<string, unknown>).document = {
      documentElement: { lang: 'zh-CN' },
    };
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as Record<string, unknown>).document;
  });

  it('lang=en → en', () => {
    (globalThis as Record<string, unknown>).document = { documentElement: { lang: 'en' } };
    expect(clientLocale()).toBe('en');
  });

  it('lang=zh-CN → zh', () => {
    expect(clientLocale()).toBe('zh');
  });

  it('lang=空串 → zh', () => {
    (globalThis as Record<string, unknown>).document = { documentElement: { lang: '' } };
    expect(clientLocale()).toBe('zh');
  });

  it('lang=乱码 → zh（宁缺勿错）', () => {
    (globalThis as Record<string, unknown>).document = { documentElement: { lang: 'fr' } };
    expect(clientLocale()).toBe('zh');
  });

  it('document 不存在（SSR 阶段）→ zh', () => {
    delete (globalThis as Record<string, unknown>).document;
    expect(clientLocale()).toBe('zh');
  });
});
