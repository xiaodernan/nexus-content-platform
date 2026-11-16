import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '世界全图 · The Atlas — NEXUS',
  description: 'NEXUS 宇宙的完整航行图：大典与玩法、世界之门、创作岛屿、管理观察哨、说明书——每一个真实存在的入口，都在这里。中英双语。',
};

/**
 * 世界全图 / The Atlas —— 防止新用户在大陆上迷路的那一册图纸。
 *
 * 判据沿袋：凡列在此处的链接都真实存在（本页不做占位）；分类与 /guide §③ 一致，
 * 但把「世界玩法」与「管理观察」单独拎出来让迷路的人一眼找到「我现在该往哪走」。
 */
const COPY: Record<Locale, { kicker: string; title: string; lede: string; sections: { heading: string; body: string; links: { path: string; labelKey: keyof typeof LABELS }[] }[] }> = {
  zh: {
    kicker: '世界全图 · THE ATLAS',
    title: '这片土地是什么，以及它通向哪里',
    lede: '世界很大——但你可以一眼看完它的全部入口。每一格都是真实存在的页面；迷路时回到这里，挑一个门进去。推荐先走一圈典籍室 → 潮汐挑战 → 七口井，再回 Studio。',
    sections: [
      {
        heading: '① 大典入口 · 故事从这里开始',
        body: '正典原文有中英两种读法；玩法与读并进，不是「看完才能玩，玩完才能懂」。',
        links: [
          { path: '/bible', labelKey: 'bible' },
          { path: '/bible/quiz', labelKey: 'quiz' },
          { path: '/bible/well', labelKey: 'well' },
          { path: '/bible/ask', labelKey: 'ask' },
        ],
      },
      {
        heading: '② 世界之门 · 走进你画的世界（对某个世界接龙 web 画布上的世界）',
        body: '把你画的世界渲染成可走的 3D、可读的档案、可巡礼的潮汐线；从 Studio「世界」面板进入。',
        links: [
          { path: '/about-nexus', labelKey: 'about' },
        ],
      },
      {
        heading: '③ 创作的日常 · 从一句话到一个世界',
        body: '这一组链接是 Studio 流水线上的全部站点：建造、发布、交流、结算、追踪。',
        links: [
          { path: '/', labelKey: 'home' },
          { path: '/discover', labelKey: 'discover' },
          { path: '/marketplace', labelKey: 'market' },
          { path: '/blocks', labelKey: 'blocks' },
          { path: '/ship', labelKey: 'ship' },
          { path: '/analytics', labelKey: 'analytics' },
          { path: '/credits', labelKey: 'credits' },
          { path: '/notifications', labelKey: 'notifications' },
          { path: '/u', labelKey: 'creators' },
          { path: '/api-tokens', labelKey: 'apiTokens' },
          { path: '/search', labelKey: 'search' },
        ],
      },
      {
        heading: '④ 学习与照料 · 说明书、教程、问答',
        body: '任何时候点 Studio 顶栏「帮助」（⌘/F1），整册说明书就压在你眼前；这里是它们的完整目录。',
        links: [
          { path: '/onboarding', labelKey: 'onboarding' },
          { path: '/guide', labelKey: 'guide' },
        ],
      },
      {
        heading: '⑤ 管理与观察 · 掌控全站',
        body: '主页的后台账房；口令 123 即入，只看聚合，不看个人。',
        links: [
          { path: '/insight', labelKey: 'insight' },
          { path: '/admin', labelKey: 'admin' },
          { path: '/admin/savings', labelKey: 'savings' },
        ],
      },
    ],
  },
  en: {
    kicker: 'THE ATLAS · 世界全图',
    title: 'What this land is — and where every road goes',
    lede: 'The world is big — but you can read its whole map in one glance. Every tile here is a real route. If you are lost, come back and pick a door. A good first walk: /bible → /bible/quiz → /bible/well, then back to Studio.',
    sections: [
      {
        heading: '1 · The canon entry · where the story starts',
        body: 'The original text reads in Chinese and English; the playgrounds sit next to the reading, not behind it.',
        links: [
          { path: '/bible', labelKey: 'bible' },
          { path: '/bible/quiz', labelKey: 'quiz' },
          { path: '/bible/well', labelKey: 'well' },
          { path: '/bible/ask', labelKey: 'ask' },
        ],
      },
      {
        heading: '2 · World doors · enter the world you drew',
        body: 'Your Studio world renders as a walkable 3D scene, a readable tome, a tide you can consult; enter from Studio’s World panel.',
        links: [
          { path: '/about-nexus', labelKey: 'about' },
        ],
      },
      {
        heading: '3 · The making loop · from one sentence to a world',
        body: 'Every station on the Studio pipeline: build, publish, trade, settle, track.',
        links: [
          { path: '/', labelKey: 'home' },
          { path: '/discover', labelKey: 'discover' },
          { path: '/marketplace', labelKey: 'market' },
          { path: '/blocks', labelKey: 'blocks' },
          { path: '/ship', labelKey: 'ship' },
          { path: '/analytics', labelKey: 'analytics' },
          { path: '/credits', labelKey: 'credits' },
          { path: '/notifications', labelKey: 'notifications' },
          { path: '/u', labelKey: 'creators' },
          { path: '/api-tokens', labelKey: 'apiTokens' },
          { path: '/search', labelKey: 'search' },
        ],
      },
      {
        heading: '4 · Study & care · the manual, the tutorial, the FAQ',
        body: 'Press “Help” in the Studio top bar (or F1) and the whole manual lands in your hands; this is its complete index.',
        links: [
          { path: '/onboarding', labelKey: 'onboarding' },
          { path: '/guide', labelKey: 'guide' },
        ],
      },
      {
        heading: '5 · Command & observatory · run the platform',
        body: 'The back office. Passcode 123 enters; aggregates only, never personal rows.',
        links: [
          { path: '/insight', labelKey: 'insight' },
          { path: '/admin', labelKey: 'admin' },
          { path: '/admin/savings', labelKey: 'savings' },
        ],
      },
    ],
  },
};

const LABELS = {
  bible: { zh: '典籍室 · Tide Conclave 原典', en: 'Tide Conclave canon' },
  quiz: { zh: '潮汐挑战 · The Tidal Trial', en: 'The Tidal Trial' },
  well: { zh: '七口井 · Seven Wells', en: 'The Seven Wells' },
  ask: { zh: '问典 · Ask the Canon', en: 'Ask the Canon' },

  about: { zh: '关于 NEXUS · About', en: 'About NEXUS' },
  home: { zh: '首页 · 创作大厅', en: 'Home / the making hall' },
  discover: { zh: '广场 · Discover', en: 'Discover' },
  market: { zh: '市场 · Marketplace', en: 'Marketplace' },
  blocks: { zh: '区块库 · Blocks', en: 'Blocks' },
  ship: { zh: '交付记录 · Ship', en: 'Ship' },
  analytics: { zh: '创作数据 · Analytics', en: 'Analytics' },
  credits: { zh: '额度账本 · Credits', en: 'Credits' },
  notifications: { zh: '通知中心 · Notifications', en: 'Notifications' },
  creators: { zh: '创作者主页 · 按 handle 公开的作品墙', en: 'Creator home — public work wall by handle' },
  apiTokens: { zh: 'API 令牌 · API tokens', en: 'API tokens' },
  search: { zh: '全平台搜索 · Search', en: 'Search' },
  onboarding: { zh: '上手漫游 · 6 步从一句到一作', en: 'Onboarding — 6 steps, one word to one work' },
  guide: { zh: '使用指南 · User Guide', en: 'User Guide' },
  insight: { zh: '观察哨 · Insight（口令 123）', en: 'Insight (passcode 123)' },
  admin: { zh: '管理台 · Admin（role=admin）', en: 'Admin console (role=admin)' },
  savings: { zh: 'AI 节省总账 · Savings', en: 'LLM savings ledger' },
} as const;

export default async function AtlasPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="map-root" data-map-root data-map-locale={locale}>
      <header className="map-hero">
        <p className="map-kicker">{c.kicker}</p>
        <h1 className="map-title">{c.title}</h1>
        <p className="map-lede">{c.lede}</p>
      </header>
      <div className="map-compass" aria-hidden="true" data-map-compass>
        <span className="map-compassPoint map-compassN">N</span>
        <span className="map-compassPoint map-compassE">E</span>
        <span className="map-compassPoint map-compassS">S</span>
        <span className="map-compassPoint map-compassW">W</span>
      </div>
      {c.sections.map((section) => (
        <section key={section.heading} className="map-section" aria-label={section.heading} data-map-section>
          <h2 className="map-sectionHead">{section.heading}</h2>
          <p className="map-sectionBody">{section.body}</p>
          <ul className="map-linkGrid">
            {section.links.map((link) => {
              const label = LABELS[link.labelKey][locale];
              return (
                <li key={link.path}>
                  <Link href={link.path} className="map-link" data-map-link>
                    <span className="map-linkPath">{link.path}</span>
                    <span className="map-linkLabel">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <footer className="map-foot">
        <p>{locale === 'zh' ? '这张图不是传单——迷路时回来，每次回来它都多一格。' : 'This atlas is not a leaflet — come back whenever lost; it grows a tile each season.'}</p>
        <Link className="am-linkImplicit" href="/guide">{locale === 'zh' ? '去看说明书 →' : 'Open the manual →'}</Link>
      </footer>
    </main>
  );
}
