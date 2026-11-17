import type { Metadata } from 'next';
import { getLocale } from '@/lib/i18n';
import { BibleAsk } from '@/components/BibleAsk';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '问典 · The Tidal Inquiry — 低语诸王',
  description: '向《低语诸王》世界大典提问：五章正典 + 七十一篇回响即时可答。/ Ask the Whispers’ Kings canon: five chapters + seventy-one echoes, answered live.',
};

/**
 * §BIBLE-4 问典——正典 Q&A：只答典籍范围，明说没有，不编造（§159/§160）。
 * searchParams `q=` 如果直接带问题，先把它填进输入框——用户点"问一问"才真正调用 provider。
 */
export default async function BibleAskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [locale, query] = await Promise.all([getLocale(), searchParams]);
  const initial = typeof query?.q === 'string' ? query.q.slice(0, 400) : undefined;
  return <BibleAsk locale={locale} initialQuestion={initial} />;
}
