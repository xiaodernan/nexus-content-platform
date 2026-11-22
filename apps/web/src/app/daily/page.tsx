import type { Metadata } from 'next';
import { getLocale, type Locale } from '@/lib/i18n';
import { DailyEdition } from '@/components/DailyEdition';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '今日潮候 — NEXUS',
        description: '每天从正典里抽一叶，模型只读这一叶——三句话与一句思考题。正典永远以原文为准。',
        robots: { index: false, follow: false },
      }
    : {
        title: 'The Daily Tide — NEXUS',
        description: 'One leaf of the canon a day, read honestly by the model: three sentences and one question to ponder. The canon’s original text stays the authority.',
        robots: { index: false, follow: false },
      };
}

/**
 * §DAILY 今日潮候 — 每天一期潮候笺的入口页。
 *
 * 潮候院的人不赶潮，他们只是每天记一笔。这个页面把那件事交给模型：
 * 同一天打开的人，看到同一片叶子；模型只读这一片，不许替正典发挥。
 */
export default async function DailyEditionPage() {
  const locale = (await getLocale()) as Locale;
  return (
    <main className="dle-page" data-daily-edition-page data-daily-edition-locale={locale}>
      <DailyEdition locale={locale} />
    </main>
  );
}
