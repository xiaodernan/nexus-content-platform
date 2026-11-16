import type { Metadata } from 'next';
import { getLocale } from '@/lib/i18n';
import { BibleAsk } from '@/components/BibleAsk';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '问典 · The Tidal Inquiry — 低语诸王',
  description: '向《低语诸王》世界大典提问：五章正典 + 二十六篇回响即时可答。/ Ask the Whispers’ Kings canon: five chapters + twenty-six echoes, answered live.',
};

/** §BIBLE-4 问典——正典 Q&A：只答典籍范围，明说没有，不编造（§159/§160）。 */
export default async function BibleAskPage() {
  const locale = await getLocale();
  return <BibleAsk locale={locale} />;
}
