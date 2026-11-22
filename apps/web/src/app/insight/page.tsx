import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getLocale, type Locale } from '@/lib/i18n';
import { collectInsightSnapshot } from '@/server/domain/insight';
import { leastSquares, projectHorizonSum } from '@/lib/insight-math';
import { evaluateInsightRules, type InsightAction, type InsightSeverity } from '@/lib/insight-rules';
import { weightedHitRate } from '@/lib/llmSavingsAdmin';
import { InsightGate } from '@/components/InsightGate';
import { InsightLogoutButton } from '@/components/InsightLogoutButton';
import { InsightAiAnalysis } from '@/components/InsightAiAnalysis';
import { InsightCanonChat } from '@/components/InsightCanonChat';
import { InsightTideCast } from '@/components/InsightTideCast';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '观察哨 · Insight — NEXUS',
  description: '口令 123 即达的管理员洞察台：全站用户行为统计、近 30 天趋势与线性外推、基于真实指标的深度优化建议。只展示聚合数据。',
};

const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: string;
  lockedNote: string;
  s1: string; s2: string; s3: string; s4: string; s5: string; s6: string; s7: string; s8: string;
  benchmarks: { cite: string; note: string; href: string }[];
  benchmarksNote: string;
  totals: { users: string; guests: string; projects: string; published: string; likes: string; comments: string; follows: string; views: string; gameEnds: string; workEnds: string; aiCalls30d: string };
  trendTable: { series: string; slope: string; r2: string; projection: string };
  trendRows: { signups: string; publishes: string; opens: string };
  trendEmpty: string;
  trendCaption: (r2: string) => string;
  signals: { publishRate: string; guestShare: string; interactionRate: string; botShare: string; creditBurn: string };
  cache: { real: string; demo: string; tin: string; cached: string; rate: string; avgLatency: string; cost: string; note: string };
  severity: Record<InsightSeverity, string>;
  noActions: string;
  topWorksEmpty: string;
  refreshLabel: string;
  footerNotes: string[];
  backHome: string;
}> = {
  zh: {
    kicker: '观察哨',
    title: '管理员洞察台',
    lede: '这里摆的是全站用户的统计账实况：近 30 天日序列、线性外推、互动信号，以及一套按真实数字判定的行动建议。口令是公共口令（123）——所以这里没有任何个人信息。',
    lockedNote: '这道门挡路过的手，不挡蓄意的人；进来之后你只会看到聚合数据。',
    s1: '① 总览', s2: '② 近 30 天趋势 · 外推', s3: '③ 行为信号', s4: '④ 大模型成本与缓存（30 天）', s5: '⑤ 深度优化建议（按账面判定）', s6: '⑥ 最受欢迎的发布作品', s7: '⑦ 外部公开基线（公开发表的研究 · 不是本站实测）', s8: '⑧ 大模型解读（潮汐模型现读）',
    benchmarks: [
      { note: '79% 的被测试用户每次看到新页面都会先扫描（不逐字读）；只有 16% 会逐字读完。', cite: 'Jakob Nielsen — How Users Read on the Web · NN/g（1997）', href: 'https://www.nngroup.com/articles/how-users-read-on-the-web/' },
      { note: '眼追踪 130,000+ 次注视、120 名参与者：用户视线停留在首屏的约 57%，停留在前两个屏内（≤2160px）的约 74%。', cite: 'Therese Fessenden — Scrolling and Attention · NN/g（2018）', href: 'https://www.nngroup.com/articles/scrolling-and-attention/' },
    ],
    benchmarksNote: '这两条是 NN/g 公开研究直接引用——它们用来帮你读懂本站的「打开→离开」节奏；本站自己的数字在上面，不装作哪本经典。',
    totals: { users: '账号数', guests: '游客', projects: '项目', published: '公开发布', likes: '点赞', comments: '评论', follows: '关注', views: '作品总打开', gameEnds: '游戏通关', workEnds: '作品走完', aiCalls30d: 'AI 调用（30 天）' },
    trendTable: { series: '序列', slope: '斜率/天', r2: 'R²', projection: '外推 7 日合计' },
    trendRows: { signups: '新用户', publishes: '新发布', opens: '作品打开' },
    trendEmpty: '数据不足（少于 2 天），未外推。',
    trendCaption: (r2) => `线性最小二乘 · R² = ${r2} · 仅为近 30 天的外推参照，不是预测承诺。`,
    signals: { publishRate: '发布转化（发布 / 项目）', guestShare: '游客占比', interactionRate: '互动率（点赞+评论 / 打开，30 天）', botShare: '爬虫打开占比（30 天）', creditBurn: '额度消耗率（消耗 / 发放，30 天）' },
    cache: { real: '真实调用', demo: 'DEMO 调用', tin: '输入 tokens', cached: '其中 cached_tokens', rate: '按账面计算的缓存命中率', avgLatency: '平均延迟', cost: '成本估算（后端直报，USD）', note: '口径与 /admin/savings 一致：tokens_in ≈ prompt_tokens；命中率 = cached / tin。问典 digest 前缀（约 15 万 tokens、字节级稳定、sticky key 固定）的 KV 命中率实测 ~94%（§PROVED-9/13/17/18；§PROOF-V992 实测 12 发 seq 10×100% + 16 路并发 16/16 全额命中）；短提示短调用几乎缓存不到，被计数占大头，拉低了聚合读数。' },
    severity: { act: '立刻做', watch: '多盯着', keep: '保持' },
    noActions: '账面上一切正常——没有规则被触发。不是「没写规则」，是每一条阈值都查过了。',
    topWorksEmpty: '还没有公开发布的作品——没东西能进这个榜。',
    refreshLabel: '本页数据为服务端实时聚合，刷新即重算。',
    footerNotes: [
      '口令 123 是公共口令，任何知道它的人都可以进入；本页只展示聚合数据，不构成对任何个人的监视。',
      '视窗＝近 30 天；总览为全量。日序列按库时区日期归桶，缺天补 0（展示层补齐，不是写入假数）。',
      '外推＝近 30 天的线性最小二乘，R² 如实标出；它不是对未来的承诺。',
      '⑤ 的每条建议都是确定性规则（含阈值与证据数字），不是模型猜测。',
    ],
    backHome: '← 回首页',
  },
  en: {
    kicker: 'INSIGHT · OBSERVATORY',
    title: 'Admin Insight',
    lede: 'Everything this platform knows about itself, as aggregate arithmetic: the last-30-day series, a plain linear extrapolation, the behavior signals, and a rule set that cites the numbers that triggered it. The passcode is the public one (123) — which is why nothing here identifies a person.',
    lockedNote: 'This door stops passers-by, not adversaries. Behind it you will only ever see aggregate data.',
    s1: '1 · Overview', s2: '2 · Last 30 days · extrapolation', s3: '3 · Behavior signals', s4: '4 · LLM cost & cache (30 days)', s5: '5 · Deep optimization advice (from the ledger)', s6: '6 · Most-opened published works', s7: '7 · Anchored external benchmarks (publicly published research — not this site’s own)', s8: '8 · The model speaks (live)',
    benchmarks: [
      { note: '79% of test participants always scan any new page they meet (16% read word by word).', cite: 'Jakob Nielsen — How Users Read on the Web · NN/g (1997)', href: 'https://www.nngroup.com/articles/how-users-read-on-the-web/' },
      { note: '130,000+ fixations, 120 participants: ~57% of viewing time above the fold, ~74% within the first two screenfuls (≤2160px).', cite: 'Therese Fessenden — Scrolling and Attention · NN/g (2018)', href: 'https://www.nngroup.com/articles/scrolling-and-attention/' },
    ],
    benchmarksNote: 'Quoted from NN/g’s public articles — here they help you read this site’s opens→exits rhythm; this site’s numbers are the ones above, nothing borrowed.',
    totals: { users: 'Accounts', guests: 'Guests', projects: 'Projects', published: 'Public publishes', likes: 'Likes', comments: 'Comments', follows: 'Follows', views: 'Total work opens', gameEnds: 'Game completions', workEnds: 'Work completions', aiCalls30d: 'AI calls (30d)' },
    trendTable: { series: 'Series', slope: 'Slope / day', r2: 'R²', projection: 'Next 7 days (Σ)' },
    trendRows: { signups: 'New accounts', publishes: 'New publishes', opens: 'Work opens' },
    trendEmpty: 'Too few days to fit — no extrapolation.',
    trendCaption: (r2) => `Plain least-squares over 30 days · R² = ${r2} · reference, not a promise.`,
    signals: { publishRate: 'Publish rate (published / projects)', guestShare: 'Guest share', interactionRate: 'Interaction rate (likes+comments / opens, 30d)', botShare: 'Bot-open share (30d)', creditBurn: 'Credit burn (consumed / granted, 30d)' },
    cache: { real: 'Real calls', demo: 'Demo calls', tin: 'Input tokens', cached: 'of which cached_tokens', rate: 'Cache hit rate (from the ledger)', avgLatency: 'Avg latency', cost: 'Cost estimate (as billed, USD)', note: 'Same definitions as /admin/savings: tokens_in ≈ prompt_tokens; rate = cached / tin. The digest-prefix path (~150k tokens, byte-stable, fixed sticky key) measures ~94% KV hits (§PROVED-9/13/17/18; §PROOF-V992: 10×100% in a 12-call sequence + 16/16 full hits under a 16-way burst); short-prompt calls are largely uncacheable and dominate the count, dragging the aggregate down.' },
    severity: { act: 'Do now', watch: 'Watch', keep: 'Keep' },
    noActions: 'The ledger has no objections — every rule was checked and none fired.',
    topWorksEmpty: 'Nothing public yet — no leaderboard to show.',
    refreshLabel: 'Computed fresh on every request; refresh to recompute.',
    footerNotes: [
      'Passcode 123 is a public passcode — anyone who knows it may enter. This page shows aggregate data only and is not surveillance of anyone.',
      'Window = last 30 days; totals are all-time. Series are bucketed by library-local date; empty days are zero-filled at render time.',
      'Extrapolation = least-squares over 30 days with R² shown; it is a reference line, not a forecast commitment.',
      'Every §5 item is a deterministic rule with its threshold and evidence printed on it — never a model guess.',
    ],
    backHome: '← Back home',
  },
};

const fmtInt = (n: number): string => n.toLocaleString('en-US');
const fmtUsd = (n: number): string => `$${n.toFixed(2)}`;
const fmtPct = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const fmtSlope = (v: number): string => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2));

function Sparkline({ data, width = 190, height = 44, label }: { data: number[]; width?: number; height?: number; label: string }) {
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - (v / max) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <svg className="insg-spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none" data-insight-spark>
      <polyline points={points} fill="none" stroke="var(--nexus-color-accent-mix)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SeverityBadge({ locale, severity }: { locale: Locale; severity: InsightSeverity }) {
  const c = COPY[locale].severity;
  return <span className={`insg-severity insg-severity-${severity}`}>{c[severity]}</span>;
}

function ActionCard({ locale, action }: { locale: Locale; action: InsightAction }) {
  return (
    <li className="insg-actionCard" data-insight-action={action.id}>
      <div className="insg-actionHead">
        <SeverityBadge locale={locale} severity={action.severity} />
        <h3 className="insg-actionTitle">{action.title[locale]}</h3>
      </div>
      <p className="insg-actionEvidence">{action.evidence[locale]}</p>
      <p className="insg-actionText">{action.action[locale]}</p>
    </li>
  );
}

export default async function InsightPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const store = await cookies();
  const unlocked = store.get('nexus-insight')?.value === '1';

  if (!unlocked) {
    return (
      <main className="insg-root" data-insight-root data-insight-locale={locale} data-insight-locked>
        <header className="insg-hero">
          <p className="insg-kicker">{c.kicker}</p>
          <h1 className="insg-title">{c.title}</h1>
          <p className="insg-lede">{c.lede}</p>
          <p className="insg-lockedNote">{c.lockedNote}</p>
        </header>
        <InsightGate locale={locale} />
        <footer className="insg-foot">
          <Link className="insg-back" href="/">{c.backHome}</Link>
        </footer>
      </main>
    );
  }

  const snap = await collectInsightSnapshot();
  const actions = evaluateInsightRules(snap.metrics);

  const signupFit = leastSquares(snap.series30d.signups);
  const opensFit = leastSquares(snap.series30d.opens);
  const publishFit = leastSquares(snap.series30d.publishes);
  const r2Shown = (signupFit?.r2 ?? opensFit?.r2 ?? publishFit?.r2);

  const rate = snap.ai30d.tokensIn > 0
    ? weightedHitRate([{ tokensIn: snap.ai30d.tokensIn, cachedTokens: snap.ai30d.cachedTokens }])
    : null;

  const projectRatio = Math.min(1, snap.totals.projects === 0 ? 0 : snap.totals.published / snap.totals.projects);
  const guestShare = snap.totals.users + snap.totals.guests === 0 ? 0 : snap.totals.guests / (snap.totals.users + snap.totals.guests);
  const interactionRate = snap.opens30d === 0 ? 0 : (snap.likes30d + snap.comments30d) / snap.opens30d;
  const botShare = snap.opens30d === 0 ? 0 : snap.botOpens30d / snap.opens30d;
  const creditBurn = snap.credits30d.granted === 0 ? 0 : snap.credits30d.consumed / snap.credits30d.granted;

  return (
    <main className="insg-root" data-insight-root data-insight-locale={locale} data-insight-unlocked>
      <header className="insg-hero insg-heroRow">
        <div>
          <p className="insg-kicker">{c.kicker}</p>
          <h1 className="insg-title">{c.title}</h1>
          <p className="insg-lede">{c.lede}</p>
          <p className="insg-refresh">{c.refreshLabel}</p>
        </div>
        <InsightLogoutButton locale={locale} />
      </header>

      <section className="insg-section" aria-labelledby="insight-s1" data-insight-section="totals">
        <h2 id="insight-s1" className="insg-sectionHead">{c.s1}</h2>
        <div className="insg-statGrid">
          {[
            ['users', snap.totals.users],
            ['guests', snap.totals.guests],
            ['projects', snap.totals.projects],
            ['published', snap.totals.published],
            ['likes', snap.totals.likes],
            ['comments', snap.totals.comments],
            ['follows', snap.totals.follows],
            ['views', snap.totals.viewsAllTime],
            ['gameEnds', snap.totals.gameCompletions],
            ['workEnds', snap.totals.workCompletions],
            ['aiCalls30d', snap.totals.usageCalls30d],
          ].map(([key, value]) => (
            <div key={key as string} className="insg-stat">
              <span className="insg-statValue" data-insight-stat>{fmtInt(Number(value))}</span>
              <span className="insg-statLabel">{c.totals[key as keyof typeof c.totals]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="insg-section" aria-labelledby="insight-s2" data-insight-section="trend">
        <h2 id="insight-s2" className="insg-sectionHead">{c.s2}</h2>
        <div className="insg-trendGrid">
          {([
            ['signups', snap.series30d.signups],
            ['publishes', snap.series30d.publishes],
            ['opens', snap.series30d.opens],
          ] as const).map(([key, data]) => (
            <figure key={key} className="insg-trendCard">
              <figcaption className="insg-trendTitle">{c.trendRows[key]}</figcaption>
              <Sparkline data={data} label={c.trendRows[key]} />
              <div className="insg-trendMeta"><span data-insight-trend-total>{fmtInt(data.reduce((a, b) => a + b, 0))}</span><span className="insg-trendWindow">{locale === 'zh' ? '30 天合计' : '30-day Σ'}</span></div>
            </figure>
          ))}
        </div>
        <table className="insg-trendTable">
          <thead>
            <tr>
              <th scope="col">{c.trendTable.series}</th>
              <th scope="col">{c.trendTable.slope}</th>
              <th scope="col">{c.trendTable.r2}</th>
              <th scope="col">{c.trendTable.projection}</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['signups', snap.series30d.signups],
              ['publishes', snap.series30d.publishes],
              ['opens', snap.series30d.opens],
            ] as const).map(([key, data]) => {
              const fit = leastSquares(data);
              const projected = projectHorizonSum(data, 7);
              if (!fit || projected === null) {
                return (
                  <tr key={key} data-insight-trend-row>
                    <th scope="row">{c.trendRows[key]}</th>
                    <td colSpan={3}>{c.trendEmpty}</td>
                  </tr>
                );
              }
              return (
                <tr key={key} data-insight-trend-row>
                  <th scope="row">{c.trendRows[key]}</th>
                  <td>{fmtSlope(fit.slope)}</td>
                  <td>{fit.r2.toFixed(2)}</td>
                  <td>{fmtInt(Math.max(0, Math.round(projected)))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="insg-trendCaption">{c.trendCaption(r2Shown == null ? '—' : r2Shown.toFixed(2))}</p>
      </section>

      <section className="insg-section" aria-labelledby="insight-s3" data-insight-section="signals">
        <h2 id="insight-s3" className="insg-sectionHead">{c.s3}</h2>
        <div className="insg-signalList">
          {([
            ['publishRate', projectRatio, projectRatio],
            ['guestShare', guestShare, guestShare],
            ['interactionRate', Math.min(1, interactionRate), interactionRate],
            ['botShare', botShare, botShare],
            ['creditBurn', Math.min(1, creditBurn), creditBurn],
          ] as const).map(([key, bar, raw]) => (
            <div key={key} className="insg-signalRow">
              <span className="insg-signalLabel">{c.signals[key]}</span>
              <div className="insg-signalBar" data-insight-bar><span className="insg-signalFill" style={{ width: `${Math.round(bar * 100)}%` }} /></div>
              <span className="insg-signalValue">{fmtPct(raw)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="insg-section" aria-labelledby="insight-s4" data-insight-section="cache">
        <h2 id="insight-s4" className="insg-sectionHead">{c.s4}</h2>
        <div className="insg-statGrid insg-statGridTight">
          <div className="insg-stat"><span className="insg-statValue">{fmtInt(snap.ai30d.realCalls)}</span><span className="insg-statLabel">{c.cache.real}</span></div>
          <div className="insg-stat"><span className="insg-statValue">{fmtInt(snap.ai30d.demoCalls)}</span><span className="insg-statLabel">{c.cache.demo}</span></div>
          <div className="insg-stat"><span className="insg-statValue">{fmtInt(snap.ai30d.tokensIn)}</span><span className="insg-statLabel">{c.cache.tin}</span></div>
          <div className="insg-stat"><span className="insg-statValue">{fmtInt(snap.ai30d.cachedTokens)}</span><span className="insg-statLabel">{c.cache.cached}</span></div>
          <div className="insg-stat"><span className="insg-statValue">{fmtPct(rate)}</span><span className="insg-statLabel">{c.cache.rate}</span></div>
          <div className="insg-stat"><span className="insg-statValue">{snap.ai30d.avgLatencyMs === null ? '—' : `${fmtInt(snap.ai30d.avgLatencyMs)} ms`}</span><span className="insg-statLabel">{c.cache.avgLatency}</span></div>
          <div className="insg-stat"><span className="insg-statValue">{fmtUsd(snap.ai30d.costEstimateUsd)}</span><span className="insg-statLabel">{c.cache.cost}</span></div>
        </div>
        <p className="insg-cacheNote">{c.cache.note}</p>
      </section>

      <section className="insg-section" aria-labelledby="insight-s5" data-insight-section="actions">
        <h2 id="insight-s5" className="insg-sectionHead">{c.s5}</h2>
        {actions.length === 0 ? (
          <p className="insg-quiet">{c.noActions}</p>
        ) : (
          <ol className="insg-actionList" data-insight-actions>
            {actions.map((a) => <ActionCard key={a.id} locale={locale} action={a} />)}
          </ol>
        )}
      </section>

      <section className="insg-section" aria-labelledby="insight-s6" data-insight-section="top-works">
        <h2 id="insight-s6" className="insg-sectionHead">{c.s6}</h2>
        {snap.topWorks.length === 0 ? (
          <p className="insg-quiet">{c.topWorksEmpty}</p>
        ) : (
          <ol className="insg-topList" data-insight-top-works>
            {snap.topWorks.map((w) => (
              <li key={w.path} className="insg-topRow">
                <a href={w.path} className="insg-topLink">
                  <span className="insg-topName">{w.projectName}</span>
                  <span className="insg-topHandle">@{w.handle ?? '—'}</span>
                </a>
                <span className="insg-topViews">{fmtInt(w.views)} {locale === 'zh' ? '次打开' : 'opens'}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="insg-section" aria-labelledby="insight-s7" data-insight-section="benchmarks">
        <h2 id="insight-s7" className="insg-sectionHead">{c.s7}</h2>
        <ul className="insg-benchList" data-insight-benchmarks>
          {c.benchmarks.map((b) => (
            <li key={b.cite} className="insg-benchItem">
              <p className="insg-benchText">{b.note}</p>
              <span className="insg-benchCite">
                <a href={b.href} target="_blank" rel="noreferrer">{b.cite}</a>
              </span>
            </li>
          ))}
        </ul>
        <p className="insg-footNote" data-insight-benchmarks-note>{c.benchmarksNote}</p>
      </section>

      <section className="insg-section" aria-labelledby="insight-s8" data-insight-section="ai-analysis">
        <h2 id="insight-s8" className="insg-sectionHead">{c.s8}</h2>
        <InsightAiAnalysis locale={locale} />
        <InsightCanonChat locale={locale} />
        <InsightTideCast locale={locale} />
      </section>

      <footer className="insg-foot insg-footBlock">
        {c.footerNotes.map((note, i) => <p key={i} className="insg-footNote">{note}</p>)}
        <Link className="insg-back" href="/">{c.backHome}</Link>
      </footer>
    </main>
  );
}
