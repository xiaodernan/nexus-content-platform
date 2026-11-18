'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * cont. 169 · StateGraph 公开试跑面板（`/stategraph` 的唯一交互控件）。
 *
 * 纪律：
 *  1. 只 POST `/api/stategraph` —— 固定的 critique/dryRun 载荷，不带用户输入。
 *  2. 结果原样呈现：HTTP 状态、`x-nexus-orchestration` 头、provider/model、真模型
 *     的 explanation（verbatim，不改一个字）、token/缓存/延迟/花费计量。
 *  3. 失败也如实：409 DEMO MODE / 429 限流 / 502 provider-failed / 503 不可达，
 *     界面不包装成"成功"，只展示服务端给的 code + message。
 */

interface TryResult {
  ok: true;
  httpStatus: number;
  requestId: string;
  orchestrationHeader: string | null;
  provider: string;
  model: string;
  explanation: string;
  dryRun: boolean;
  patchesApplied: number;
  labels: string[];
  usage: {
    tokensIn: number;
    tokensOut: number;
    cachedTokens: number;
    cacheReported: boolean;
    latencyMs: number;
    costUsd: number;
    costBasis: string;
  };
}

interface TryFailure {
  ok: false;
  status: number | null;
  code: string;
  message: string;
  hint?: string;
  orchestrationHeader?: string | null;
}

const COPY = {
  zh: {
    kicker: '公开试跑 · live probe',
    button: '跑一遍真图',
    running: '图在跑……（validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble）',
    hint: '每 IP 6 次 / 10 分钟；载荷固定为 critique + dryRun + fast，不带你的任何输入。',
    resultTitle: '上一次试跑的真实现场',
    httpStatus: 'HTTP 状态',
    header: 'x-nexus-orchestration',
    headerMissing: '（响应里没有这个头 —— 一定如实显示，不会补一个）',
    provider: 'provider',
    model: '模型',
    requestId: 'requestId',
    dryRun: 'dryRun = true（预演，不写任何数据；patchesApplied 恒为 0）',
    tokensIn: 'tokensIn',
    tokensOut: 'tokensOut',
    cachedTokens: 'cachedTokens',
    cacheReportedOn: 'cacheReported = true（provider 报了这一栏）',
    cacheReportedOff: 'cacheReported = false（provider 没报 —— 0 不等于"没命中"，是"未知"）',
    latencyMs: 'latencyMs',
    costUsd: 'costUsd',
    costBasis: 'costBasis',
    explanation: '真模型输出（verbatim，服务端拼了"预演说明"前缀）',
    labels: 'labels',
    failTitle: '试跑如实失败',
    failNote: '以下是服务端原话（code + message），页面不替它圆场：',
    code: 'code',
    message: 'message',
    hintLabel: 'hint',
    failHeader: 'x-nexus-orchestration',
    networkFail: '请求没发出去（网络/网关）',
    again: '再跑一次',
  },
  en: {
    kicker: 'live probe',
    button: 'Run the graph once',
    running: 'The graph is running… (validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble)',
    hint: '6 runs / 10 min per IP; the payload is fixed (critique + dryRun + fast) and carries nothing you type.',
    resultTitle: 'What actually happened in the last run',
    httpStatus: 'HTTP status',
    header: 'x-nexus-orchestration',
    headerMissing: '(no such header in the response — shown as-is, never patched in)',
    provider: 'provider',
    model: 'model',
    requestId: 'requestId',
    dryRun: 'dryRun = true (rehearsal — nothing is written; patchesApplied is always 0)',
    tokensIn: 'tokensIn',
    tokensOut: 'tokensOut',
    cachedTokens: 'cachedTokens',
    cacheReportedOn: 'cacheReported = true (the provider reported this column)',
    cacheReportedOff: 'cacheReported = false (the provider did not report it — 0 means "unknown", not "missed")',
    latencyMs: 'latencyMs',
    costUsd: 'costUsd',
    costBasis: 'costBasis',
    explanation: 'Real model output (verbatim, with the server-side dry-run prefix)',
    labels: 'labels',
    failTitle: 'The run failed — honestly',
    failNote: 'Server words, verbatim (code + message). The page does not smooth them over:',
    code: 'code',
    message: 'message',
    hintLabel: 'hint',
    failHeader: 'x-nexus-orchestration',
    networkFail: 'The request never left (network/gateway)',
    again: 'Run again',
  },
} as const;

export function StategraphTry({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const [failure, setFailure] = useState<TryFailure | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    setFailure(null);
    setNetworkError(null);
    try {
      const response = await fetch('/api/stategraph', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      });
      const body = (await response.json()) as (TryResult & { ok: true }) | (Partial<TryResult> & { ok?: false } & Record<string, unknown>);
      if (response.ok && body && (body as TryResult).ok === true) {
        setResult(body as TryResult);
      } else {
        const b = body as Record<string, unknown>;
        const asString = (v: unknown): string =>
          typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
        setFailure({
          ok: false,
          status: response.status,
          code: asString(b.error ?? b.code) || 'unknown',
          message: asString(b.message ?? b.error),
          hint: typeof b.hint === 'string' ? b.hint : undefined,
          orchestrationHeader: (b.orchestrationHeader as string | null | undefined) ?? null,
        });
      }
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sg-try" data-stategraph-try>
      <p className="sg-tryKicker">{c.kicker}</p>
      <div className="sg-tryRow">
        <button type="button" className="sg-tryButton" onClick={() => { void run(); }} disabled={busy} data-stategraph-run>
          {busy ? c.running : c.button}
        </button>
        <span className="sg-tryHint">{c.hint}</span>
      </div>

      {networkError ? (
        <div className="sg-tryFail" role="alert" data-stategraph-network-error>
          <p className="sg-tryFailTitle">{c.networkFail}</p>
          <p className="sg-tryFailNote">{networkError}</p>
        </div>
      ) : null}

      {failure ? (
        <div className="sg-tryFail" role="alert" data-stategraph-failure>
          <p className="sg-tryFailTitle">{c.failTitle}</p>
          <p className="sg-tryFailNote">{c.failNote}</p>
          <dl className="sg-tryGrid">
            <div className="sg-tryCell"><dt>HTTP {c.httpStatus}</dt><dd className="sg-tryMono">{failure.status ?? '—'}</dd></div>
            <div className="sg-tryCell"><dt>{c.failHeader}</dt><dd className="sg-tryMono">{failure.orchestrationHeader ?? '—'}</dd></div>
            <div className="sg-tryCell sg-tryCellWide"><dt>{c.code}</dt><dd className="sg-tryMono">{failure.code}</dd></div>
            <div className="sg-tryCell sg-tryCellWide"><dt>{c.message}</dt><dd>{failure.message}</dd></div>
            {failure.hint ? <div className="sg-tryCell sg-tryCellWide"><dt>{c.hintLabel}</dt><dd>{failure.hint}</dd></div> : null}
          </dl>
          <button type="button" className="sg-tryAgain" onClick={() => { void run(); }} disabled={busy}>{c.again}</button>
        </div>
      ) : null}

      {result ? (
        <div className="sg-tryOk" data-stategraph-result>
          <p className="sg-tryOkTitle">{c.resultTitle}</p>
          <p className="sg-tryDryRun">{c.dryRun}</p>
          <dl className="sg-tryGrid">
            <div className="sg-tryCell"><dt>HTTP {c.httpStatus}</dt><dd className="sg-tryMono">{result.httpStatus}</dd></div>
            <div className="sg-tryCell"><dt>{c.header}</dt><dd className="sg-tryMono">{result.orchestrationHeader ?? c.headerMissing}</dd></div>
            <div className="sg-tryCell"><dt>{c.provider}</dt><dd className="sg-tryMono">{result.provider}</dd></div>
            <div className="sg-tryCell"><dt>{c.model}</dt><dd className="sg-tryMono">{result.model}</dd></div>
            <div className="sg-tryCell"><dt>{c.requestId}</dt><dd className="sg-tryMono">{result.requestId}</dd></div>
            <div className="sg-tryCell"><dt>{c.tokensIn}</dt><dd className="sg-tryMono">{result.usage.tokensIn}</dd></div>
            <div className="sg-tryCell"><dt>{c.tokensOut}</dt><dd className="sg-tryMono">{result.usage.tokensOut}</dd></div>
            <div className="sg-tryCell"><dt>{c.cachedTokens}</dt><dd className="sg-tryMono">{result.usage.cachedTokens}</dd></div>
            <div className="sg-tryCell sg-tryCellWide"><dt>{result.usage.cacheReported ? c.cacheReportedOn : c.cacheReportedOff}</dt><dd className="sg-tryMono">cacheReported={String(result.usage.cacheReported)}</dd></div>
            <div className="sg-tryCell"><dt>{c.latencyMs}</dt><dd className="sg-tryMono">{result.usage.latencyMs}</dd></div>
            <div className="sg-tryCell"><dt>{c.costUsd}</dt><dd className="sg-tryMono">{result.usage.costUsd}</dd></div>
            <div className="sg-tryCell"><dt>{c.costBasis}</dt><dd className="sg-tryMono">{result.usage.costBasis}</dd></div>
          </dl>
          <blockquote className="sg-tryQuote">
            <p className="sg-tryQuoteLabel">{c.explanation}</p>
            <p className="sg-tryQuoteText">{result.explanation}</p>
          </blockquote>
          {result.labels.length > 0 ? (
            <p className="sg-tryLabels">{c.labels}: <span className="sg-tryMono">{result.labels.join(' · ')}</span></p>
          ) : null}
          <button type="button" className="sg-tryAgain" onClick={() => { void run(); }} disabled={busy}>{c.again}</button>
        </div>
      ) : null}
    </section>
  );
}
