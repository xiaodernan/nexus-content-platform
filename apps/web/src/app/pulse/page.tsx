import type { Metadata } from 'next';
import { getLocale, type Locale } from '@/lib/i18n';
import { PulseGate } from '@/components/PulseGate';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '观测大厅 — NEXUS',
        description: '平台级聚合匿名读数，公开放映：打开数、访客、通关率、改编量……口令 123。',
        robots: { index: false, follow: false },
      }
    : {
        title: 'The Observatory — NEXUS',
        description: 'Platform-wide aggregate, shown publicly: opens, visitors, clears, remixes. Passphrase: 123.',
        robots: { index: false, follow: false },
      };
}

/**
 * §PULSE 观测大厅（/pulse）——"所有用户都知道密码，也都能进"（§九），
 * 口径 = 全平台聚合匿名，零个人信息。纪律写在服务器聚合层（server/domain/pulse.ts）。
 */
export default async function PulsePage() {
  const locale = await getLocale();
  return (
    <main className="pl-page" data-pulse-page data-pulse-locale={locale as Locale}>
      <PulseGate locale={locale as Locale} />
    </main>
  );
}
