import type { Metadata } from 'next';
import { getLocale } from '@/lib/i18n';
import { BibleAsk } from '@/components/BibleAsk';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '问典 · 低语诸王',
        // 真实计数口径改为不随每篇回响漂移的「全部回响」（2026-11-22 E220 落库时确认）。
        description: '向《低语诸王》世界大典提问：十四章正典 + 全部回响即时可答。',
      }
    : {
        title: 'The Tidal Inquiry · The Whispers’ Kings',
        description: 'Ask the Whispers’ Kings canon: fourteen chapters and all their echoes, answered live.',
      };
}

/**
 * §BIBLE-4 问典——正典 Q&A：只答典籍范围，明说没有，不编造（§159/§160）。
 * searchParams `q=` 如果直接带问题，先把它填进输入框——用户点"问一问"才真正调用 provider。
 */
export default async function BibleAskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [locale, query] = await Promise.all([getLocale(), searchParams]);
  const initial = typeof query?.q === 'string' ? query.q.slice(0, 400) : undefined;
  return <BibleAsk locale={locale} initialQuestion={initial} />;
}
