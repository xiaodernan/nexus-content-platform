import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getLocale, type Locale } from '@/lib/i18n';
import { readObserverMetrics } from '@/server/admin/observer';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import {
  TIDE_WIRE_SYSTEM_PROMPT,
  buildTideWireUserMessage,
  compactTideStats,
  tideWireIsEmpty,
  type TideWireStats,
} from '@/server/domain/tideWire';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '今日潮声 · The Tide Wire — NEXUS',
  description:
    '全平台 aggregate 的潮耳朵：真实计数、真实模型、两口潮的言语。真实数据 · 每天更新 · 零个人信息。 The tide listening to the whole platform: real counts, real model, two sentences. Real data, updated hourly, no personal information.',
};

const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: string;
  statOpens7d: string;
  statOpens30d: string;
  statPublishes: string;
  statCompletion: string;
  statGame: string;
  statWork: string;
  emptyTitle: string;
  emptyBody: string;
  honestTitle: string;
  honestBody: string;
  demoTitle: string;
  demoBody: string;
  foot: string;
  oracleLink: string;
  pulseLink: string;
  bibleLink: string;
}> = {
  zh: {
    kicker: '今日潮声 · THE TIDE WIRE',
    title: '潮听见了整个平台',
    lede: '真实计数、真实模型、没有人名、没有项目名。潮只说两句——这一刻的潮。门槛是公开平台的聚合，不是任何人的日常。',
    statOpens7d: '近 7 天有效打开',
    statOpens30d: '近 30 天有效打开',
    statPublishes: '公开已过审作品',
    statCompletion: '近 30 天平均完成度',
    statGame: '游戏通关（真人）',
    statWork: '作品完成（真人）',
    emptyTitle: '潮还没响',
    emptyBody: '近 30 天平台里没有有效打开，也没有过审作品——潮不是没听见，是没有声音给它听。等平台有了内容，这里自然会有潮。',
    honestTitle: '潮退了',
    honestBody: '模型现在不想说话——这句话不是模型编的，是真实缺位。等潮再平，它自己会回来。',
    demoTitle: 'DEMO MODE',
    demoBody: '当前环境没有接上真 provider——潮说不了话，绝不会冒充一句「潮听到了」。接上真 provider 之后，这里会说出那两句。',
    foot: '本页所有计数来自实库（publication_visits / published_projects 等，剔除 suspected_bot）。模型每小时最多被问一次（同一天同 locale 共享一个缓存答案）。',
    oracleLink: '问潮 · 潮汐预言',
    pulseLink: '观测大厅（口令 123）',
    bibleLink: '世界大典',
  },
  en: {
    kicker: 'THE TIDE WIRE · 今日潮声',
    title: 'The tide hears the whole platform',
    lede: 'Real counts, a real model, no names, no project titles. The tide says two sentences — of this very hour. The threshold is the public aggregate of the platform, not anyone’s private day.',
    statOpens7d: 'Effective opens, last 7d',
    statOpens30d: 'Effective opens, last 30d',
    statPublishes: 'Public works, approved',
    statCompletion: 'Avg completion, 30d',
    statGame: 'Game completions (real)',
    statWork: 'Work completions (real)',
    emptyTitle: 'The tide is quiet',
    emptyBody: 'The platform holds no effective opens and no approved public works in the last 30 days — the tide is not deaf, it has nothing to hear. When the platform has content, the tide will speak.',
    honestTitle: 'The tide withdrew',
    honestBody: 'The model will not speak now — this is not a model-made sentence. When the water settles, it returns.',
    demoTitle: 'DEMO MODE',
    demoBody: 'No real provider is wired in this environment — the tide will not pretend to hear. Once a provider is connected, the two sentences appear.',
    foot: 'All counts come from the real database (publication_visits / published_projects … bots excluded). The model is asked at most once per hour per locale; both languages share one cached answer each.',
    oracleLink: 'Ask the tide · The Tide Oracle',
    pulseLink: 'Observatory (passphrase 123)',
    bibleLink: 'World Bible',
  },
};

interface TideWireData {
  stats: TideWireStats;
  sentence: string | null;
  status: 'ok' | 'empty' | 'honest' | 'demo';
  generatedAt: string;
}

const observationMetrics = unstable_cache(
  async (): Promise<TideWireStats> => compactTideStats(await readObserverMetrics()),
  ['tide-wire-stats-v1'],
  { revalidate: 3600, tags: ['tide-wire'] },
);

const getTideSentence = unstable_cache(
  async (locale: Locale, dayStamp: string, stats: TideWireStats): Promise<string> => {
    const chat = await chatWithCharacter({
      requestId: `tide-wire-${locale}-${dayStamp}`,
      system: TIDE_WIRE_SYSTEM_PROMPT,
      user: buildTideWireUserMessage(stats, locale, dayStamp),
      modelClass: 'fast',
    });
    if (!chat.ok) {
      throw new Error('provider-unavailable');
    }
    return (chat.response.text ?? '').trim();
  },
  ['tide-wire-sentence-v1'],
  { revalidate: 3600, tags: ['tide-wire'] },
);

let inflightWire: Promise<TideWireData> | null = null;
async function composeTideWire(locale: Locale, dayStamp: string): Promise<TideWireData> {
  // 同一进程内的并发首访合并：100 人同时打开本页，只打一次 provider
  // （生产多实例由 distributed single-flight + Redis replay 接力；本层是单进程单飞保险，失败不缓存）
  if (inflightWire) return inflightWire;
  inflightWire = (async (): Promise<TideWireData> => {
    const stats = await observationMetrics();
    const generatedAt = new Date().toISOString();
    if (tideWireIsEmpty(stats)) {
      return { stats, sentence: null, status: 'empty', generatedAt };
    }
    const caps = await getAiCapabilities();
    if (caps.text !== 'real') {
      return { stats, sentence: null, status: 'demo', generatedAt };
    }
    try {
      const sentence = await getTideSentence(locale, dayStamp, stats);
      if (!sentence) {
        return { stats, sentence: null, status: 'honest', generatedAt };
      }
      return { stats, sentence, status: 'ok', generatedAt };
    } catch {
      // 失败不写进缓存槽——"暂时说不了" 不是定局（下一小时自愈）
      return { stats, sentence: null, status: 'honest', generatedAt };
    }
  })();
  try {
    return await inflightWire;
  } finally {
    inflightWire = null;
  }
}

export default async function TideWirePage() {
  const locale = (await getLocale()) as Locale;
  const c = COPY[locale];
  const now = new Date();
  const dayStamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  let wire: TideWireData | null = null;
  try {
    wire = await composeTideWire(locale, dayStamp);
  } catch {
    wire = null;
  }

  const statDisplay = (value: number | null, unit = '') =>
    value === null ? (locale === 'zh' ? '还没有' : 'no data') : `${value}${unit}`;

  return (
    <main className="gd-root" data-tide-wire-page data-tide-wire-locale={locale}>
      <section className="tide-wire" aria-label={c.kicker} data-tide-wire>
        <p className="tide-wireKicker">{c.kicker}</p>
        <h1 className="tide-wireTitle">{c.title}</h1>
        <p className="tide-wireLede">{c.lede}</p>

        {wire === null && (
          <div className="tide-wireHonest" role="status" data-tide-wire-honest>
            <p className="tide-wireHonestTitle">{c.honestTitle}</p>
            <p className="tide-wireHonestBody">{c.honestBody}</p>
          </div>
        )}
        {wire?.status === 'empty' && (
          <div className="tide-wireHonest" role="status" data-tide-wire-empty>
            <p className="tide-wireHonestTitle">{c.emptyTitle}</p>
            <p className="tide-wireHonestBody">{c.emptyBody}</p>
          </div>
        )}
        {wire?.status === 'demo' && (
          <div className="tide-wireHonest" role="status" data-tide-wire-demo>
            <p className="tide-wireHonestTitle">{c.demoTitle}</p>
            <p className="tide-wireHonestBody">{c.demoBody}</p>
          </div>
        )}
        {wire?.status === 'ok' && wire.sentence && (
          <blockquote className="tide-wireLine" data-tide-wire-sentence>{wire.sentence}</blockquote>
        )}
        {wire?.status === 'honest' && (
          <div className="tide-wireHonest" role="status" data-tide-wire-withdrawn>
            <p className="tide-wireHonestTitle">{c.honestTitle}</p>
            <p className="tide-wireHonestBody">{c.honestBody}</p>
          </div>
        )}

        {wire && (
          <div className="tide-wireStats" data-tide-wire-stats>
            <div className="tide-wireStat"><span className="tide-wireStatLabel">{c.statOpens7d}</span><span className="tide-wireStatValue">{statDisplay(wire.stats.opens7d)}</span></div>
            <div className="tide-wireStat"><span className="tide-wireStatLabel">{c.statOpens30d}</span><span className="tide-wireStatValue">{statDisplay(wire.stats.opens30d)}</span></div>
            <div className="tide-wireStat"><span className="tide-wireStatLabel">{c.statPublishes}</span><span className="tide-wireStatValue">{statDisplay(wire.stats.publishesPublicApproved)}</span></div>
            <div className="tide-wireStat"><span className="tide-wireStatLabel">{c.statCompletion}</span><span className="tide-wireStatValue">{wire.stats.completionPctAvg30d === null ? (locale === 'zh' ? '还没有' : 'no data') : `${wire.stats.completionPctAvg30d.toFixed(1)}%`}</span></div>
            <div className="tide-wireStat"><span className="tide-wireStatLabel">{c.statGame}</span><span className="tide-wireStatValue">{statDisplay(wire.stats.completionsGame)}</span></div>
            <div className="tide-wireStat"><span className="tide-wireStatLabel">{c.statWork}</span><span className="tide-wireStatValue">{statDisplay(wire.stats.completionsWork)}</span></div>
          </div>
        )}
        <p className="tide-wireFoot">{c.foot}</p>
      </section>

      <footer className="gd-foot" aria-label={locale === 'zh' ? '相关入口' : 'Related links'}>
        <Link className="am-linkImplicit" href="/tide-oracle" data-tide-wire-link-oracle>{c.oracleLink}</Link>
        <Link className="am-linkImplicit" href="/pulse" data-tide-wire-link-pulse>{c.pulseLink}</Link>
        <Link className="am-linkImplicit" href="/bible" data-tide-wire-link-bible>{c.bibleLink}</Link>
      </footer>
    </main>
  );
}
