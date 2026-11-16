import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale } from '@/lib/i18n';
import { GUIDE_COPY } from '@/lib/guideCopy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '使用指南 · User Guide — NEXUS',
  description: 'NEXUS 平台的中文·English 双语说明书：5 分钟上手、功能地图、游戏玩法、常见问答。',
};

/**
 * 用户指南 / User Guide —— 这一宇宙用户打开后第一个应该看的页。
 * 全面真实：路线都是仓库里真的存在的页面；游戏规则与我在 Studio/game2d 里读懂的一致；
 * 不做任何虚假"功能清单"。
 */
export default async function GuidePage() {
  const locale = await getLocale();
  const copy = GUIDE_COPY[locale];
  return (
    <main className="gd-root" data-guide-root data-guide-locale={locale}>
      <header className="gd-hero">
        <p className="gd-kicker">{copy.kicker}</p>
        <h1 className="gd-title">{copy.title}</h1>
        <p className="gd-lede">{copy.lede}</p>
        <nav className="gd-toc" aria-label={locale === 'zh' ? '目录' : 'TOC'}>
          {copy.sections.map((section) => (
            <a key={section.heading} href={`#${section.heading.slice(2)}`} className="gd-tocLink">{section.heading}</a>
          ))}
        </nav>
      </header>
      {copy.sections.map((section) => (
        <section key={section.heading} id={section.heading.slice(2)} className="gd-section" aria-label={section.heading} data-guide-section={section.heading.slice(2)}>
          <h2 className="gd-sectionTitle">{section.heading}</h2>
          {section.body.map((para, i) => (
            <p key={i} className="gd-para">{para}</p>
          ))}
        </section>
      ))}
      <footer className="gd-foot">
        <Link className="am-linkImplicit" href="/about-nexus">← {locale === 'zh' ? '关于 NEXUS' : 'About NEXUS'}</Link>
        <Link className="am-linkImplicit" href="/map">{locale === 'zh' ? '世界全图 · The Atlas →' : 'World atlas →'}</Link>
        <Link className="am-linkImplicit" href="/discover">{locale === 'zh' ? '去广场 →' : 'Go to /discover →'}</Link>
      </footer>
    </main>
  );
}
