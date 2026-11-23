'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import { csrfHeaders } from '@/lib/csrf';
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
    askButton: '问典（状态图 · 模型释义）',
    askPlaceholder: '模型只会解释你搜到的 · 不会跳出典籍',
    askBusy: '模型翻看中…',
    askEmpty: '输入点什么先搜索，再点问典。模型只解释你搜到的东西。',
    askNetworkDown: '模型现在下线——这不是你输错了字，是通路断了。',
    askUnverified: '未通过机检（模型的草稿不接受），如实标错，不冒充通过。',
    askVerified: '✓ StateGraph 通过 · 看典籍里说的（非模型即兴）',
    askUnauth: '先登录再问。注销身份是保密的——这个按钮要登录。',
    askBadge: (m: string, cached: number) => cached > 0 ? `${m} · cached ${cached}` : m,
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
    askButton: 'Ask the canon (StateGraph · model paraphrase)',
    askPlaceholder: 'The model explains only what the canon contains — never invents beyond it',
    askBusy: 'The model is reading…',
    askEmpty: 'Search for something first, then ask. The model only explains what you found.',
    askNetworkDown: 'The model is offline right now — not a typo, a network or gateway issue.',
    askUnverified: 'Did not pass the mechanical check — the draft is marked as such, not passed off as clean.',
    askVerified: '✓ StateGraph pass · read canon-verified, not improvised',
    askUnauth: 'Sign in first. Identity is not required by the canon, but this button demands an authenticated session.',
    askBadge: (m: string, cached: number) => cached > 0 ? `${m} · cached ${cached}` : m,
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
  const [askPhase, setAskPhase] = useState<'idle' | 'loading' | 'answered' | 'honest' | 'unauth'>('idle');
  const [askAnswer, setAskAnswer] = useState<string>('');
  const [askVerdict, setAskVerdict] = useState<'pass' | 'unverified' | null>(null);
  const [askCached, setAskCached] = useState<number | null>(null);
  const [askModel, setAskModel] = useState<string | null>(null);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length === 0) return [];
    return corpus
      .filter((h) => h.line.toLowerCase().includes(needle))
      .sort((a, b) => b.score - a.score || a.order - b.order || a.realm.localeCompare(b.realm))
      .slice(0, 14);
  }, [q, corpus]);

  const ask = useCallback(async () => {
    const needle = q.trim();
    if (!needle || askPhase === 'loading') return;
    setAskPhase('loading');
    setAskAnswer('');
    setAskVerdict(null);
    setAskCached(null);
    setAskModel(null);
    const tryOnce = () =>
      fetch('/api/bible/q', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ question: needle, locale: locale === 'zh' ? 'zh' : 'en' }),
      });
    let resp: Response;
    try {
      resp = await tryOnce();
      // §LLM-RETRY-ONCE · 5xx 一次性自动重试（与 chatWithCharacter 同纪律）；4xx/429 不重试。
      if (resp.status >= 500) {
        await new Promise((r) => setTimeout(r, 800));
        resp = await tryOnce();
      }
    } catch {
      setAskPhase('honest');
      return;
    }
    if (resp.status === 401 || resp.status === 403) { setAskPhase('unauth'); return; }
    if (resp.status === 429 || resp.status >= 500) { setAskPhase('honest'); return; }
    const body = (await resp.json().catch(() => null)) as { answer?: string; model?: string; cachedTokens?: number; graph?: { verdict?: string } } | null;
    if (!resp.ok || typeof body?.answer !== 'string') { setAskPhase('honest'); return; }
    setAskAnswer(body.answer.trim());
    setAskVerdict(body?.graph?.verdict === 'pass' ? 'pass' : 'unverified');
    setAskCached(typeof body?.cachedTokens === 'number' ? body.cachedTokens : null);
    setAskModel(typeof body?.model === 'string' ? body.model : null);
    setAskPhase('answered');
  }, [q, askPhase, locale]);

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
      <div className="bb-searchAsk" data-bible-search-ask>
        <button
          type="button"
          className="bb-searchAskButton"
          onClick={() => void ask()}
          disabled={q.trim().length === 0 || askPhase === 'loading'}
          data-bible-search-ask-button
          title={c.askPlaceholder}
        >
          {askPhase === 'loading' ? c.askBusy : c.askButton}
        </button>
        {askPhase === 'answered' && askAnswer ? (
          <div className="bb-searchAskOutput" data-bible-search-ask-output>
            <p className="bb-searchAskVerdict" data-bible-search-ask-verdict data-verdict={askVerdict ?? 'unverified'}>
              {askVerdict === 'pass' ? c.askVerified : c.askUnverified}
            </p>
            <p className="bb-searchAskAnswer">{askAnswer}</p>
            {askModel && askCached !== null ? (
              <p className="bb-searchAskBadge" data-bible-search-ask-badge>
                {c.askBadge(askModel, askCached)}
              </p>
            ) : null}
          </div>
        ) : null}
        {askPhase === 'honest' ? (
          <p className="bb-searchAskHonest" data-bible-search-ask-honest>{c.askNetworkDown}</p>
        ) : null}
        {askPhase === 'unauth' ? (
          <p className="bb-searchAskHonest" data-bible-search-ask-unauth>{c.askUnauth}</p>
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
