'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';
import { BIBLE_MARGINS } from '@/world-bible/margins.generated';

/**
 * ──BIBLE-MARGINS · 正典「页边批注」（2026-11-22 新模块）──────────────────
 *
 * 抄本师写在页边的话：不属于正文、不进名册、也不算进任何一道。它们逐字来自
 * `docs/world-bible/echoes/` 里以「> 页边：」开头的行，由 scripts/gen-margins.mts
 * 生成（slug 与 gen-bible-snapshot.mts 的 ECHO_WEB_SLUGS 同源，指向真实存在的回响页）。
 *
 * 玩法只有一件事：先读这句话，再决定要不要知道它出自哪一回响。
 * 纪律：不需要 provider、不需要网络；没有任何计数器冒充"读过的人数"。
 */

const COPY = {
  zh: {
    kicker: '典籍室 · 第四个角落',
    title: '页边批注',
    lede: '抄本师写在页边的话——不属于正文、不进名册、也不算进任何一道。先读这句话，再决定要不要知道它出自哪里。',
    count: (n: number) => `现存 ${n} 条`,
    reveal: '它出自哪一回响？',
    hide: '收起',
    revealed: (n: number, total: number) => `已翻看 ${n} / ${total}`,
    empty: '还没有人往页边写过什么——等下一道回响。',
    back: '← 回典籍室',
    anchorsLink: '去锚句回放',
    crumb: '低语诸王 · 典籍室',
  },
  en: {
    kicker: 'The shelf · a fourth corner',
    title: 'Margins of the Canon',
    lede: 'What the copyists wrote in the margins — not the body, not the register, not counted into any mark. Read the line first, then decide whether to learn where it came from.',
    count: (n: number) => `${n} kept`,
    reveal: 'Which echo is this from?',
    hide: 'Fold back',
    revealed: (n: number, total: number) => `${n} of ${total} opened`,
    empty: 'Nobody has written in a margin yet — the next echo may.',
    back: '← The shelf',
    anchorsLink: 'To Anchor Echo',
    crumb: 'The Whispers’ Kings · The shelf',
  },
} as const;

export function BibleMargins({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const rows = BIBLE_MARGINS;
  const toggle = (index: number): void => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <section className="bb-root" data-bible-margins data-bible-margins-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.crumb}>
        <Link href="/bible" className="bb-footLink" data-bible-margins-back>{c.back}</Link>
      </nav>
      <header className="bm-head">
        <p className="bm-kicker">{c.kicker}</p>
        <h1 className="bm-title">{c.title}</h1>
        <p className="bm-lede">{c.lede}</p>
        <p className="bm-count" data-bible-margins-count>{c.count(rows.length)}</p>
      </header>
      {rows.length === 0 ? (
        <p className="bm-empty" data-bible-margins-empty>{c.empty}</p>
      ) : (
        <ol className="bm-list" data-bible-margins-list>
          {rows.map((row, index) => {
            const shown = open.has(index);
            return (
              <li key={`${row.echo}-${index}`} className="bm-card" data-bible-margins-item>
                <p className="bm-note">{locale === 'en' ? row.en : row.zh}</p>
                <button
                  type="button"
                  className="bm-reveal"
                  onClick={() => toggle(index)}
                  aria-expanded={shown}
                  data-bible-margins-reveal={shown ? 'open' : 'closed'}
                >
                  {shown ? c.hide : c.reveal}
                </button>
                {shown && (
                  <p className="bm-from" data-bible-margins-from>
                    <Link href={row.slug} className="bb-footLink" data-bible-margins-echo-link>
                      {locale === 'en' ? row.titleEn : row.titleZh}
                    </Link>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <footer className="bm-foot">
        <p className="bm-tally" data-bible-margins-tally>{c.revealed(open.size, rows.length)}</p>
        <Link href="/bible/anchors" className="bb-footLink" data-bible-margins-anchors-link>{c.anchorsLink}</Link>
      </footer>
    </section>
  );
}
