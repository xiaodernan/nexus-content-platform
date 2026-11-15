'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import type { Locale } from '@/lib/i18n';

/**
 * §BIBLE-3 低语诸王 · 典籍室「直达」——典籍室可搜索检索器。
 *
 * 做法：世界大典快照（BIBLE_CHAPTERS/BIBLE_ECHOES）已经是全量文本常量，
 * 本组件在客户端做 substring 全文检索，把一段一段能说的答案出给读者。
 *
 * 纪律（§159）：
 * 上线零调用、零网络，全部本地（避开了任何“看似智能”的过载）；
 * - 命中的是**原文原样的行**——不拼接、不改写、不总结；
 * - 任何时候显示命中数是实数的那个数，空查询时明文说"还没有搜过"而不是画 0；
 * - 文本行完全取自正典原文；锚句优先（§165 锚句致密，指向真理不绕路）。
 */

const COPY = {
  zh: {
    kicker: '直达',
    placeholder: '搜一句锚、一个名字、一个字……',
    ariaLabel: '典籍室检索',
    empty: '还没有搜过东西。输入一句词或名，库里每一行都是真的。',
    none: '再换个词。搜法上宽泛些——比如只打一个字。',
    hitCount: (n: number) => `命中 ${n} 行`,
    openLink: '打开这一章 →',
    headingKind: '标题',
    bodyKind: '正文',
    anchorKind: '锚句',
  },
  en: {
    kicker: 'Jump to',
    placeholder: 'A phrase, a name, one character…',
    ariaLabel: 'Canon search',
    empty: 'Nothing searched yet. Type a phrase or a name — the corpus is raw text.',
    none: 'Try something shorter — single characters are fine.',
    hitCount: (n: number) => `${n} hit(s)`,
    openLink: 'Open this chapter →',
    headingKind: 'Heading',
    bodyKind: 'Body',
    anchorKind: 'Anchor',
  },
} as const;

interface Hit {
  realm: 'chapter' | 'echo';
  order: number;
  slug: string;
  title: string;
  era: string;
  line: string;
  kind: 'anchor' | 'heading' | 'body';
  score: number;
}

/** 单章所有「非空行」按种类打分；锚句优先、标题次之、正文兜底。 */
function buildCorpus(locale: Locale): Hit[] {
  const out: Hit[] = [];
  const put = (realm: 'chapter' | 'echo', list: readonly { order: number; slug: string; titleZh: string; titleEn: string; eraLineZh: string; eraLineEn: string; markdownZh: string; markdownEn: string }[]) => {
    for (const c of list) {
      const title = locale === 'en' ? c.titleEn : c.titleZh;
      const era = locale === 'en' ? c.eraLineEn : c.eraLineZh;
      const md = locale === 'en' ? c.markdownEn : c.markdownZh;
      for (const raw of md.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('|') || line.startsWith('---') || line.startsWith('```')) continue; // 表格、分割线不参与
        if (/^[-*]{3,}$/.test(line)) continue;
        let kind: Hit['kind'];
        let score: number;
        if (/^\*\*锚句\*\*/.test(line) || /^\*\*Anchor sentence\*\*/.test(line)) {
          kind = 'anchor';
          score = 3;
        } else if (line.startsWith('## ') || line.startsWith('### ')) {
          kind = 'heading';
          score = 2;
        } else {
          kind = 'body';
          score = 1;
        }
        out.push({ realm, order: c.order, slug: c.slug, title, era, line, kind, score });
      }
    }
  };
  put('chapter', BIBLE_CHAPTERS);
  put('echo', BIBLE_ECHOES);
  return out;
}

export function BibleSearch({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const corpus = useMemo(() => buildCorpus(locale), [locale]);
  const [q, setQ] = useState('');

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length === 0) return [];
    return corpus
      .filter((h) => h.line.toLowerCase().includes(needle))
      .sort((a, b) => b.score - a.score || a.order - b.order || a.realm.localeCompare(b.realm))
      .slice(0, 14);
  }, [q, corpus]);

  return (
    <section className="bb-searchWrap" data-bible-search-root>
      <div className="bb-searchBar">
        <span className="bb-searchKicker">{c.kicker}</span>
        <input
          type="search"
          className="bb-searchInput"
          placeholder={c.placeholder}
          aria-label={c.ariaLabel}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-bible-search-input
        />
        {q.trim().length > 0 ? (
          <span className="bb-searchCount" data-bible-search-count>
            {c.hitCount(hits.length)}
          </span>
        ) : null}
      </div>
      {q.trim().length === 0 ? (
        <p className="bb-searchEmpty" data-bible-search-empty>
          {c.empty}
        </p>
      ) : hits.length === 0 ? (
        <p className="bb-searchEmpty" data-bible-search-empty>
          {c.none}
        </p>
      ) : (
        <ol className="bb-searchResults" data-bible-search-results>
          {hits.map((hit, i) => (
            <li key={`${hit.slug}-${i}`} className="bb-searchHit" data-bible-search-hit>
              <Link href={`/bible/${hit.slug}`} className="bb-searchHitLink">
                <span className="bb-searchHitMeta">
                  <span className="bb-searchHitKind" data-kind={hit.kind}>
                    {hit.kind === 'anchor' ? c.anchorKind : hit.kind === 'heading' ? c.headingKind : c.bodyKind}
                  </span>
                  <span className="bb-searchHitTitle">{hit.title}</span>
                </span>
                <span className="bb-searchHitLine">{hit.line}</span>
                <span className="bb-searchHitEra">{hit.era}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
