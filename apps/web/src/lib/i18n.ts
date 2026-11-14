import { cookies } from 'next/headers';

/**
 * NEXUS 双语（zh-CN / en）切换 —— 最小诚实基础设施。
 *
 * 架构：
 * - server 端用 cookies() 读 NEXUS_LOCALE（避免在客户端读 document.cookie 的闪烁）；
 * - 客户端按钮调 POST /api/locale 改 cookie 并整页 reload —— 语言变更重渲染整页是最便宜且正确的方式
 * - 组件不自己读 window：所有 "当前语言" 由 layout 下发（<html lang>），其它一律问 server
 * - 不假装翻译不全：新增页面默认只有中文文案（原文原样发生），译文存在字典里；字典空的键在开发期由 log 抛出
 *
 * 不做（§159）：
 * - 不静默 fallback 到英文再宣称"我们支持双语"——缺译文 = 编译/测试报错
 * - 不对单串做"AI 机翻后看起来能读"的兜底
 */

export const LOCALE_COOKIE = 'NEXUS_LOCALE';
export const SUPPORTED_LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return value === 'zh' || value === 'en';
}

/** 普通 server component 用：当前语言（cookie 缺省 = zh，即中文先行）。 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return isLocale(store.get(LOCALE_COOKIE)?.value) ? (store.get(LOCALE_COOKIE)!.value as Locale) : 'zh';
}

/** 语言选择的彩色文案（机器可读 key → 本地化字符串）。 */
export function localeLabel(locale: Locale): string {
  return locale === 'zh' ? '简体中文' : 'English';
}
