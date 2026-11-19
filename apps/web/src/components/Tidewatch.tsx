'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { csrfHeaders } from '@/lib/csrf';
import {
  applyDelta,
  deriveClock,
  freshPersisted,
  pushMemory,
  readPersisted,
  toRequestState,
  TIDEWATCH_STORAGE_KEY,
  type TidewatchPersisted,
  type WorldStepDelta,
} from '@/lib/tidewatch';

const MAX_MOVE = 600;

type Citation = { anchor: string; quote: string };

const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: string;
  stateKicker: string;
  moveKicker: string;
  flowKicker: string;
  vigorLabel: string;
  depthLabel: string;
  sealsLabel: string;
  echoesLabel: string;
  memoryKicker: string;
  memoryEmpty: string;
  reset: string;
  placeholder: string;
  submit: string;
  busy: string;
  counter: (n: number) => string;
  flowNodes: readonly string[];
  narrationKicker: string;
  deltaKicker: string;
  citationsKicker: string;
  badgeCache: (cached: number, total: number, ms: number) => string;
  honestTitle: string;
  honestBody: string;
  honestLocked: string;
  honestLockedCta: string;
  unlockTag: (ids: string[]) => string;
  foot: string;
}> = {
  zh: {
    kicker: 'TIDEWATCH · 潮候步进',
    title: '让潮记下你这一步',
    lede: '每一步都是一张真实编译的 StateGraph：读局（analyze）→ 检索典籍室锚句（retrieve）→ 潮回叙事 + 结构化改动（narrate）→ 逐字核验（canon_guard）→ 落账（assemble）。潮不编造典籍室没有的东西，你的吃亏由你自己记。',
    stateKicker: '世界状态 · WORLD STATE',
    moveKicker: '这一步 · YOUR MOVE',
    flowKicker: '潮流转图',
    vigorLabel: '体力',
    depthLabel: '潮位',
    sealsLabel: '印记',
    echoesLabel: '已解锁回响',
    memoryKicker: '记忆（最近 6 条）',
    memoryEmpty: '还没动过——这一行是空的。说一样东西给潮听，它就开始记了。',
    reset: '重新上路',
    placeholder: '向潮说一步……（例如：我推开潮候院的门，问灯里的影子是谁。）',
    submit: '落账',
    busy: '潮在想这一步……',
    counter: (n) => `${n} / ${MAX_MOVE}`,
    flowNodes: ['analyze', 'retrieve', 'narrate', 'canon_guard', 'assemble'],
    narrationKicker: '潮回 · THE TIDE REPLIED',
    deltaKicker: '这一步改了什么',
    citationsKicker: '典籍室依据（逐字核验）',
    badgeCache: (cached, total, ms) => cached > 0 ? `cached ${cached}/${total} · ${ms}ms` : `${total} tok · ${ms}ms · 缓存未命中（如实）`,
    honestTitle: '潮停了',
    honestBody: '这一步没有被记下——provider 没答上来。潮不会编一份像样的回执糊弄你；等潮回来，再落一次账。',
    honestLocked: '先开门，再让潮记账',
    honestLockedCta: '去 /insight（口令 123）解锁',
    unlockTag: (ids) => `解锁 ${ids.join('、')}`,
    foot: '潮候步进是真实模型真实改动：两个真 provider 调用（读局 + 潮回）、本地锚句检索、逐字引用核验。回响解锁只接受典籍室真实存在的编号；delta 的每个数字都被夹紧到 -3..+3。这不是一份预言——是一笔你亲手记下的账。',
  },
  en: {
    kicker: 'TIDEWATCH · the tide records your steps',
    title: 'Let the tide record this step',
    lede: 'Every step is one real, compiled StateGraph: analyze the move → retrieve verified anchors from the canon → narrate + a structured delta → verbatim citation guard → assemble. The tide does not invent what the canon does not hold — and your losses are yours to ledger.',
    stateKicker: 'WORLD STATE',
    moveKicker: 'YOUR MOVE',
    flowKicker: 'THE FLOW GRAPH',
    vigorLabel: 'Vigor',
    depthLabel: 'Depth',
    sealsLabel: 'Seals',
    echoesLabel: 'Echoes unlocked',
    memoryKicker: 'Memory (last 6)',
    memoryEmpty: 'Nothing yet — this page is blank. Tell the tide one thing and it starts keeping the ledger.',
    reset: 'Set out again',
    placeholder: 'Say one step to the tide… (e.g. “I push the chapel door and ask whose shadow the lamp keeps.”)',
    submit: 'Record the step',
    busy: 'The tide is weighing this step…',
    counter: (n) => `${n} / ${MAX_MOVE}`,
    flowNodes: ['analyze', 'retrieve', 'narrate', 'canon_guard', 'assemble'],
    narrationKicker: 'THE TIDE REPLIED',
    deltaKicker: 'What changed',
    citationsKicker: 'Canon grounds (verbatim-verified)',
    badgeCache: (cached, total, ms) => cached > 0 ? `cached ${cached}/${total} · ${ms}ms` : `${total} tok · ${ms}ms · cache miss (as reported)`,
    honestTitle: 'The tide paused',
    honestBody: 'This step was not recorded — the provider did not answer. The tide will not fabricate a tidy receipt; come back when the water returns.',
    honestLocked: 'Unlock the door first, then let the tide ledger you',
    honestLockedCta: 'Go to /insight (passphrase 123)',
    unlockTag: (ids) => `Unlocked ${ids.join(', ')}`,
    foot: 'Tidewatch is a real model making a real change: two real provider calls (read the move + reply), local anchor retrieval, and verbatim citation guard. Echo unlocks only accept canon-anchored ids; every delta number is clamped to -3..+3. This is not a prophecy — it is a ledger you keep yourself.',
  },
};

function pips(value: number) {
  const on = Math.max(0, Math.min(9, Math.trunc(value)));
  return (
    <div className="tw-pips" aria-label={`${on} / 9`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={i < on ? 'tw-pip tw-pipOn' : 'tw-pip'} aria-hidden="true" />
      ))}
    </div>
  );
}

export function Tidewatch({ locale = 'zh', nowIso }: { locale?: Locale; nowIso?: string }) {
  const c = COPY[locale];
  const bootInstant = useMemo(() => (nowIso ? new Date(nowIso) : new Date()), [nowIso]);
  const clock = useMemo(() => deriveClock(bootInstant, locale), [bootInstant, locale]);

  const [persisted, setPersisted] = useState<TidewatchPersisted>(() => freshPersisted());
  const [hydrated, setHydrated] = useState(false);
  const [move, setMove] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'answered' | 'honest' | 'locked'>('idle');
  const [narration, setNarration] = useState('');
  const [delta, setDelta] = useState<WorldStepDelta | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [badge, setBadge] = useState<string | null>(null);

  useEffect(() => {
    setPersisted(readPersisted(typeof window !== 'undefined' ? window.localStorage.getItem(TIDEWATCH_STORAGE_KEY) : null));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && typeof window !== 'undefined') {
      window.localStorage.setItem(TIDEWATCH_STORAGE_KEY, JSON.stringify(persisted));
    }
  }, [persisted, hydrated]);

  const canSubmit = move.trim().length > 0 && move.trim().length <= MAX_MOVE && phase !== 'loading';

  const reset = useCallback(() => {
    setPersisted(freshPersisted());
    setPhase('idle');
    setNarration('');
    setDelta(null);
    setCitations([]);
    setBadge(null);
  }, []);

  const submit = useCallback(async () => {
    const text = move.trim();
    if (!text || phase === 'loading') return;
    setPhase('loading');
    setNarration('');
    setDelta(null);
    setCitations([]);
    setBadge(null);
    try {
      const resp = await fetch('/api/ai/world-step', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ locale, state: toRequestState(persisted, clock), move: text }),
      });
      if (resp.status === 403) { setPhase('locked'); return; }
      if (resp.status === 429 || resp.status >= 500) { setPhase('honest'); return; }
      const body = (await resp.json()) as {
        narration?: string;
        delta?: WorldStepDelta;
        citations?: Citation[];
        model?: string;
        cachedTokens?: number;
        tokensIn?: number;
        latencyMs?: number;
      };
      if (!resp.ok || typeof body.narration !== 'string' || !body.delta) { setPhase('honest'); return; }
      setNarration(body.narration);
      setDelta(body.delta);
      setCitations(Array.isArray(body.citations) ? body.citations : []);
      setBadge(body.model ? c.badgeCache(body.cachedTokens ?? 0, body.tokensIn ?? 0, body.latencyMs ?? 0) : null);
      setPersisted((prev) => {
        let next = applyDelta(prev, body.delta as WorldStepDelta);
        next = pushMemory(next, { kind: 'step', text: `${text.slice(0, 140)} → ${body.delta?.risk ?? 'calm'}` });
        for (const seal of body.delta?.seals ?? []) next = pushMemory(next, { kind: 'seal', text: `印记 · ${seal}` });
        for (const echo of body.delta?.unlocks ?? []) next = pushMemory(next, { kind: 'echo', text: `回响 · ${echo}` });
        return next;
      });
      setMove('');
      setPhase('answered');
    } catch {
      setPhase('honest');
    }
  }, [move, phase, locale, persisted, clock, c]);

  return (
    <section className="tw-root" aria-label={c.kicker} data-tidewatch>
      <header className="tw-hero">
        <p className="tw-kicker">{c.kicker}</p>
        <h1 className="tw-title">{c.title}</h1>
        <p className="tw-lede">{c.lede}</p>
        <span className="tw-clock" suppressHydrationWarning>{clock.label}</span>
      </header>

      <div className="tw-grid">
        <aside className="tw-panel" aria-label={c.stateKicker}>
          <h2 className="tw-panelTitle">{c.stateKicker}</h2>
          <div className="tw-stateRow">
            <span className="tw-stateLabel">{c.vigorLabel}</span>
            {pips(persisted.vigor)}
          </div>
          <div className="tw-stateRow">
            <span className="tw-stateLabel">{c.depthLabel}</span>
            {pips(persisted.depth)}
          </div>
          <div>
            <p className="tw-panelTitle">{c.sealsLabel}</p>
            <div className="tw-chips">
              {persisted.seals.length === 0 ? <span className="tw-empty">—</span> : persisted.seals.map((s) => <span key={s} className="tw-chip">{s}</span>)}
            </div>
          </div>
          <div>
            <p className="tw-panelTitle">{c.echoesLabel}</p>
            <div className="tw-chips">
              {persisted.unlocks.length === 0 ? <span className="tw-empty">—</span> : persisted.unlocks.map((e) => <span key={e} className="tw-chip tw-chipEcho">{e}</span>)}
            </div>
          </div>
          <div>
            <p className="tw-panelTitle">{c.memoryKicker}</p>
            <div className="tw-memory">
              {persisted.memory.length === 0 ? <p className="tw-empty">{c.memoryEmpty}</p> : persisted.memory.map((m, i) => (
                <p key={i} className="tw-memoryItem"><span className="tw-memoryKind">{m.kind}</span>{m.text}</p>
              ))}
            </div>
          </div>
          <button type="button" className="tw-submit" onClick={reset} data-tidewatch-reset>{c.reset}</button>
        </aside>

        <section className="tw-panel" aria-label={c.moveKicker}>
          <h2 className="tw-panelTitle">{c.moveKicker}</h2>
          <div className="tw-flow" aria-label={c.flowKicker}>
            {c.flowNodes.map((node, i) => (
              <span key={node} style={{ display: 'contents' }}>
                <span className={phase === 'loading' ? 'tw-stage tw-stageActive' : 'tw-stage'}>{node}</span>
                {i < c.flowNodes.length - 1 ? <span className="tw-flowArrow" aria-hidden="true">→</span> : null}
              </span>
            ))}
          </div>
          <div className="tw-inputRow">
            <textarea
              className="tw-input"
              rows={3}
              value={move}
              maxLength={MAX_MOVE}
              placeholder={c.placeholder}
              onChange={(event) => setMove(event.target.value)}
              disabled={phase === 'loading'}
              aria-label={c.moveKicker}
              data-tidewatch-input
            />
            <button type="button" className="tw-submit" onClick={() => { void submit(); }} disabled={!canSubmit} data-tidewatch-submit>
              {phase === 'loading' ? c.busy : c.submit}
            </button>
          </div>
          <p className="tw-counter">{c.counter(move.trim().length)}</p>

          {phase === 'honest' ? (
            <div className="tw-honest" role="alert">
              <p className="tw-honestTitle">{c.honestTitle}</p>
              <p className="tw-honestBody">{c.honestBody}</p>
            </div>
          ) : null}
          {phase === 'locked' ? (
            <div className="tw-honest" role="alert">
              <p className="tw-honestTitle">{c.honestLocked}</p>
              <p className="tw-honestBody"><a className="am-linkImplicit" href="/insight">{c.honestLockedCta} →</a></p>
            </div>
          ) : null}

          {narration ? (
            <>
              <p className="tw-panelTitle">{c.narrationKicker}</p>
              <p className="tw-narration">{narration}</p>
              <p className="tw-panelTitle">{c.deltaKicker}</p>
              <div className="tw-deltaRow">
                {delta ? (
                  <>
                    <span className={`tw-delta ${delta.vigor >= 0 ? 'tw-deltaPos' : 'tw-deltaNeg'}`}>体力 {delta.vigor >= 0 ? `+${delta.vigor}` : delta.vigor}</span>
                    <span className={`tw-delta ${delta.depth >= 0 ? 'tw-deltaPos' : 'tw-deltaNeg'}`}>潮位 {delta.depth >= 0 ? `+${delta.depth}` : delta.depth}</span>
                    <span className={`tw-delta ${delta.risk === 'calm' ? 'tw-riskCalm' : delta.risk === 'storm' ? 'tw-riskStorm' : 'tw-riskUneasy'}`}>{delta.risk}</span>
                    {delta.unlocks.length > 0 ? <span className="tw-delta tw-deltaPos">{c.unlockTag(delta.unlocks)}</span> : null}
                  </>
                ) : null}
              </div>
              {citations.length > 0 ? (
                <>
                  <p className="tw-panelTitle">{c.citationsKicker}</p>
                  <ul className="tw-cite">
                    {citations.map((citation) => (
                      <li key={`${citation.anchor}-${citation.quote.slice(0, 12)}`} className="tw-citeItem">
                        <span className="tw-citeAnchor">{citation.anchor}</span>
                        <span>{citation.quote}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {badge ? <span className="tw-badge">{badge}</span> : null}
            </>
          ) : null}
        </section>
      </div>

      <footer className="tw-foot">{c.foot}</footer>
    </section>
  );
}
