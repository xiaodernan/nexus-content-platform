'use client';

import { useCallback, useEffect, useState } from 'react';
import { aiServiceUrl } from '@/server/ai/client';
import type { Locale } from '@/lib/i18n';

/**
 * Studio §CACHE-5：把 ai-service 的 /v1/ai/cache-stats 拉到 Studio 主界面——
 * 「缓存命中率是真的低还是代理顺积了？」在当下就有读数，不用读盘、不用 shell。
 *
 * 诚实边界（全仓老纪律）：读不到（服务不在、需登录只有 healthz 先门）时显示「不可读」，绝不伪造。
 */

interface AiCacheStatsReadout {
  prefix: { requests: number; reused: number; reuseRate: number | null };
  provider: { reported: number; missing: number; reportedHitRate: number | null };
  transport: { stream: boolean | null } | null;
}

interface AiCacheHealthData {
  base: string;
  prefixRate: number | null;
  providerReported: number;
  providerMissing: number;
  providerHitRate: number | null;
  stream: boolean | null;
  error: string | null;
}

export function useAiCacheHealth(): AiCacheHealthData {
  const [data, setData] = useState<AiCacheHealthData>({
    base: '', prefixRate: null, providerReported: 0, providerMissing: 0, providerHitRate: null,
    stream: null, error: null,
  });

  const fetchStats = useCallback(async (): Promise<AiCacheHealthData | null> => {
    const base = aiServiceUrl();
    if (!base) return { base: '', prefixRate: null, providerReported: 0, providerMissing: 0, providerHitRate: null, stream: null, error: '未配置 NEXUS_AI_SERVICE_URL' };
    try {
      const res = await fetch(`${base}/v1/ai/cache-stats`, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
      if (!res.ok) return { base, prefixRate: null, providerReported: 0, providerMissing: 0, providerHitRate: null, stream: null, error: `HTTP ${res.status}` };
      const body = (await res.json()) as AiCacheStatsReadout;
      return {
        base,
        prefixRate: body.prefix.reuseRate,
        providerReported: body.provider.reported,
        providerMissing: body.provider.missing,
        providerHitRate: body.provider.reportedHitRate,
        stream: body.transport?.stream ?? null,
        error: null,
      };
    } catch (e) {
      return { base, prefixRate: null, providerReported: 0, providerMissing: 0, providerHitRate: null, stream: null, error: e instanceof Error ? e.name : 'ERR' };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const d = await fetchStats();
      if (!cancelled && d) setData(d);
    };
    void run();
    const id = window.setInterval(() => { void run(); }, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [fetchStats]);

  return data;
}

export function pct(v: number | null, digits = 1): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : '—';
}

/** Studio 左侧常驻：LLM 缓存读数（§CACHE-5）——用户让 LLM 在项目流转中发挥最大作用，缓存读数要随时可见 */
export function AiCacheHealthRail({ locale = 'zh' }: { locale?: Locale }) {
  const d = useAiCacheHealth();
  const c = locale === 'zh' ? {
    title: 'LLM 缓存读数',
    rowA: '稳定前缀复用',
    rowB: '网关报账命中率',
    rowC: '上游未报账次数',
    rowD: '出站传输',
    errPrefix: 'ai-service 不可读：',
  } : {
    title: 'LLM cache readout',
    rowA: 'Stable-prefix reuse',
    rowB: 'Gateway-reported hit rate',
    rowC: 'Upstream missing',
    rowD: 'Transport',
    errPrefix: 'ai-service unreadable: ',
  };
  const streamLabel = d.stream === true ? (locale === 'zh' ? '流式' : 'stream') : d.stream === false ? (locale === 'zh' ? '非流' : 'non-stream') : '—';

  return (
    <div className="hp-railRoot" data-ai-cache-rail aria-label={c.title}>
      <header className="hp-railHead"><h2 className="hp-railTitle">{c.title}</h2></header>
      <div className="hp-railBody">
        <ul className="hp-ul">
          <li className="hp-railBodyLine" data-ai-cache-hint>
            {locale === 'zh' ? `稳前缀在本 ai-service 内逐字节一致的请求份数（Green ≥3 次·reuse ≥3/6）` : `prefix-stable requests inside this ai-service (Green ≥3 · reuse ≥3/6)`}
          </li>
        </ul>
        {d.error ? (
          <p className="hp-notRun" data-gate-not-run style={{ color: 'var(--nexus-color-warn-ink)' }}>{c.errPrefix}{d.error}</p>
        ) : null}
        {!d.error ? (
          <ul className="hp-ul">
            <li className="hp-railBodyLine">
              <span className="hp-label">{c.rowA}</span>
              <span className="hp-score">{pct(d.prefixRate)}</span>
              <span className="hp-chip">{locale === 'zh' ? 'Green ≥3/6 · Yellow 2/6 · None = 未有样本' : 'Green ≥3/6 · Yellow 2/6 · None = no samples yet'}</span>
            </li>
            <li className="hp-railBodyLine">
              <span className="hp-label">{c.rowB}</span>
              <span className="hp-score">{pct(d.providerHitRate)}</span>
            </li>
            <li className="hp-railBodyLine">
              <span className="hp-label">{c.rowC}</span>
              <span className="hp-score">{d.providerMissing}</span>
              <span className="hp-chip">{locale === 'zh' ? '上游没报 cached_tokens 的调用' : 'calls upstream never reported cached_tokens'}</span>
            </li>
            <li className="hp-railBodyLine">
              <span className="hp-label">{c.rowD}</span>
              <span className="hp-score">{streamLabel}</span>
            </li>
          </ul>
        ) : null}
        <p className="hp-railBodyLine" style={{ fontSize: '0.7rem', color: 'var(--nexus-color-fg-3)' }}>
          {locale === 'zh' ? `来源 ${d.base || '(未连上)'} · 30 秒刷新 · 不做臆测摊平` : `Source ${d.base || '(not up)'} · 30s refresh · no invented averages`}
        </p>
      </div>
    </div>
  );
}
