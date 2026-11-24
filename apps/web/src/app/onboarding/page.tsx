import type { Metadata } from 'next';
import { getLocale, type Locale } from '@/lib/i18n';
import { OnboardingTour } from './OnboardingTour';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '上手漫游 — NEXUS',
        description: '新用户的 7 步漫游：从一句话想法走到真实发布操作。可中断、可重来、中英双语；完成标记只是本地自检。',
      }
    : {
        title: 'Onboarding — NEXUS',
        description: 'A seven-step walk from one sentence to a real publishing action. Interruptible, re-doable and bilingual; completion marks are local self-checks only.',
      };
}

const COPY: Record<Locale, { kicker: string; title: string; lede: string; footer: string; guideHint: string }> = {
  zh: {
    kicker: '上手漫游',
    title: '从一个词到一个作品：7 步上手漫游',
    lede: '这不是考试，也不承诺几分钟学完。每步做给你看，并带你前往相关页面。完成标记只表示你勾选过，不是系统验证你真的操作过；标记保存在本地浏览器，存储不可用时只在本次页面有效。',
    footer: '想重来，点「重来（清除本地进度）」。漫游本身不执行发布、删除或模型调用；跳转后的操作由目标页面负责。',
    guideHint: '还想看更细的？',
  },
  en: {
    kicker: 'ONBOARDING',
    title: 'From one word to one work: a seven-step onboarding',
    lede: 'This is not an exam or a promise to finish in minutes. Each step shows the move and points to the relevant page. A completion mark means only that you checked it off, not that the system observed the task; marks stay in this browser and last only for this page when storage is unavailable.',
    footer: 'To start again, press “Start over (clear local progress)”. The tour itself does not publish, delete or call a model; actions after a link opens belong to the destination page.',
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
