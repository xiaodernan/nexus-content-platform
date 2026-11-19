import type { Metadata } from 'next';
import { getLocale, type Locale } from '@/lib/i18n';
import { OnboardingTour } from './OnboardingTour';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '上手漫游 / Onboarding — NEXUS',
        description: '新用户的 7 步漫游：60 秒看懂从「一句话想法」到「发布出去」的每一步。可中断、可重来、可直达。中英双语。',
      }
    : {
        title: 'Onboarding — NEXUS',
        description: 'A 7-step walk for newcomers: sixty seconds from one sentence to one published work. Interruptible, re-doable, direct. Chinese and English.',
      };
}

const COPY: Record<Locale, { kicker: string; title: string; lede: string; footer: string; guideHint: string }> = {
  zh: {
    kicker: '上手漫游 · ONBOARDING',
    title: '60 秒走完「从一个词到一个作品」',
    lede: '这不是考试。每步做给你看，每步都带你直达那个页面——做完，就知道这块土地到底怎么走。随时可以离开、随时可以回来；进度存在本地浏览器里。',
    footer: '任何一步没做完、想重来：点左下角「重来」。整个过程不产生任何不可撤销的操作。',
    guideHint: '还想看更细的？',
  },
  en: {
    kicker: 'ONBOARDING · 上手漫游',
    title: 'Sixty seconds, from one word to one work',
    lede: 'This is not an exam. Each step shows you the move and jumps you straight to the page — finish it and you know this land. Leave anytime, return anytime; progress stays in your browser.',
    footer: 'Missed a step? Hit “Start over” at the bottom-left. Nothing here is irreversible.',
    guideHint: 'Want the full manual?',
  },
};

export default async function OnboardingPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="obv-root" data-onboarding-root data-onboarding-locale={locale}>
      <header className="obv-hero">
        <p className="obv-kicker">{c.kicker}</p>
        <h1 className="obv-title">{c.title}</h1>
        <p className="obv-lede">{c.lede}</p>
      </header>
      <OnboardingTour locale={locale} />
      <footer className="obv-foot">
        <p className="obv-footNote">{c.footer}</p>
        <a className="obv-footLink" href="/guide">{c.guideHint} /guide</a>
      </footer>
    </main>
  );
}
