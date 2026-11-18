'use client';

import { useState, type ReactElement } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * §SIM-1 行为演练面板：点一下 → 服务器灌入一批模拟人·天 → 展示本地接得的是什么
 *
 * 纪律：全部请求同一份视角—— suspectBot=true；按钮返回的是这一发的现场读数
 * （not "全站 average"），不与"真人"口径混在一起展示。
 */

interface SimulationSummary {
  inserted: number;
  targetProjectName: string;
  targetPath: string;
  byProfile: Record<string, number>;
  totalOpens: number;
  avgVisibleMs: number;
  avgCompletionPct: number;
  weightShare: Record<string, number>;
  seed: number;
}

const COPY: Record<Locale, {
  buttons: readonly string[];
  running: string;
  success: string;
  error: string;
  seedRow: string;
  targetRow: string;
  opensRow: string;
  completionRow: string;
  visibleMsRow: string;
  byProfileTitle: string;
  total: string;
  note: string;
}> = {
  zh: {
    buttons: ['模拟 20 个访客', '模拟 60 个访客', '模拟 120 个访客'],
    running: '灌入中——这条路会写进 publication_visits…',
    success: '已写进这一发的读数',
    error: '模拟失败',
    seedRow: 'seed',
    targetRow: '目标',
    opensRow: '总打开数',
    completionRow: '平均滚动深度 %',
    visibleMsRow: '人·天平均可见时长（ms）',
    byProfileTitle: '行为分档占比（人·天口径）',
    total: '总计',
    note: '这一发只影响一个目标作品。爬虫口径会正确反映在 /pulse 与 /analytics 的爬虫行。',
  },
  en: {
    buttons: ['Simulate 20 visitors', 'Simulate 60 visitors', 'Simulate 120 visitors'],
    running: 'Pumping rows into publication_visits…',
    success: 'Written — readout below',
    error: 'Simulation failed',
    seedRow: 'seed',
    targetRow: 'target',
    opensRow: 'opens total',
    completionRow: 'avg. scroll depth %',
    visibleMsRow: 'avg. visible ms / person-day',
    byProfileTitle: 'Profile share (of person-days)',
    total: 'total',
    note: 'This run targets one playable work only. Its rows land as bots everywhere you read bots — /pulse and /analytics both reflect it.',
  },
};

export function BehaviorSimPanel({ locale, panelTitle, ariaLabel }: { locale: Locale; panelTitle: string; ariaLabel: string }): ReactElement {
  const c = COPY[locale];
  const [result, setResult] = useState<SimulationSummary | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const run = async (count: number) => {
    setStatus('running');
    setErrorMessage('');
    try {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const response = await fetch('/api/admin/visitor-sim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count, seed }),
      });
      const body = await response.json() as Partial<SimulationSummary> & { message?: string };
      if (!response.ok) {
        setStatus('error');
        setErrorMessage(body.message ?? `HTTP ${response.status}`);
        return;
      }
      setResult(body as SimulationSummary);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="be-panel" aria-label={ariaLabel} data-behavior-sim-panel>
      <h2 className="be-panelTitle" data-behavior-sim-panel-title>{panelTitle}</h2>
      <div className="be-actions" data-behavior-sim-actions>
        {c.buttons.map((label, index) => {
          const count = [20, 60, 120][index]!;
          return (
            <button
              key={count}
              type="button"
              className="be-primaryBtn"
              disabled={status === 'running'}
              data-behavior-sim-run={count}
              onClick={() => void run(count)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {status === 'running' ? <p className="be-note" role="status" data-behavior-sim-running>{c.running}</p> : null}
      {status === 'error' ? <p className="be-error" role="alert" data-behavior-sim-error>{c.error}：{errorMessage}</p> : null}
      {result ? (
        <div className="be-result" data-behavior-sim-result>
          <p className="be-note" data-behavior-sim-ok>{c.success}</p>
          <dl className="be-metaGrid">
            <div className="be-metaCell"><dt>{c.seedRow}</dt><dd className="be-mono">{result.seed}</dd></div>
            <div className="be-metaCell"><dt>{c.targetRow}</dt><dd>{result.targetProjectName} <span className="be-mono">({result.targetPath})</span></dd></div>
          </dl>
          <div className="am-statGrid">
            <div className="am-statCell"><p className="am-statValue" data-behavior-sim-total-visitors>{result.inserted}</p><p className="am-statLabel">{c.total}</p></div>
            <div className="am-statCell"><p className="am-statValue" data-behavior-sim-total-opens>{result.totalOpens}</p><p className="am-statLabel">{c.opensRow}</p></div>
            <div className="am-statCell"><p className="am-statValue" data-behavior-sim-avg-completion>{result.avgCompletionPct.toFixed(1)}</p><p className="am-statLabel">{c.completionRow}</p></div>
            <div className="am-statCell"><p className="am-statValue" data-behavior-sim-avg-visible-ms>{Math.round(result.avgVisibleMs).toLocaleString()}</p><p className="am-statLabel">{c.visibleMsRow}</p></div>
          </div>
          <section className="be-byProfile" aria-label={c.byProfileTitle} data-behavior-sim-by-profile>
            <h3 className="be-subHead">{c.byProfileTitle}</h3>
            <ul className="be-profileList">
              {Object.entries(result.byProfile).map(([profile, count]) => {
                const pct = result.weightShare[profile] ?? 0;
                return (
                  <li key={profile} className="be-profileRow" data-behavior-sim-profile={profile}>
                    <span className="be-mono be-profileName">{profile}</span>
                    <span className="be-profileBar"><span className="be-profileFill" style={{ width: `${Math.min(100, pct)}%` }} /></span>
                    <span className="be-mono be-profileCount">{count} · {pct.toFixed(1)}%</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <p className="adm-capNote" data-behavior-sim-footnote>{c.note}</p>
        </div>
      ) : null}
    </section>
  );
}
