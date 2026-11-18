'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * ──OBSERVER-DEEPREAD · 只读观察站「AI 深读」按钮（cont. 209 slice）──────────
 *
 * 规则引擎建议已经是人的判断；这一颗按钮把**实测聚合**再喂给 gpt-6.1-terra，
 * 让模型按数字说出「形势 · 展望（未来 7 天推断，明确标注推断不是实测）· 下一步 · 优先级」三段——每条判断必须带数字（服务器机械校验，
 * 不合格直接 502 不展示）。失败不掩盖：错误原样展示给人看。
 *
 * 纪律：
 *  1. 按钮触发，绝不在挂载时烧 token；
 *  2. 服务端只接收 locale（指标由服务器自算）；
 *  3. 错误不过滤也不重试（点一次就真的打一次 provider）。
 */

interface DigestOk {
  digest: string;
  model: string;
  disclaimer: string;
  cached: boolean;
}

const COPY = {
  zh: {
    kicker: 'AI 深读 · gpt-6.1-terra',
    idle: '按实测聚合出「形势 · 展望（7 天推断）· 下一步」——GPT 写，数字保真（缺数字会原样拒绝展示）',
    generate: '生成 AI 深读',
    generating: '模型正在读这一串真实数字…',
    cachedTag: '缓存命中（24h 内相同输入不再烧 provider）',
    freshTag: '实时生成',
    modelLabel: '模型',
    retry: '重试',
  },
  en: {
    kicker: 'AI deep-read · gpt-6.1-terra',
    idle: '“Situation · Forecast (7-day inference) · Next steps” from measured aggregates — the model writes, figures stay true (no figure → server refuses to render)',
    generate: 'Generate AI deep-read',
    generating: 'The model is reading these real numbers…',
    cachedTag: 'Cache hit (identical input within 24h costs nothing)',
    freshTag: 'Fresh',
    modelLabel: 'Model',
    retry: 'Retry',
  },
} as const;

type State =
  | { phase: 'idle' }
  | { phase: 'busy' }
  | { phase: 'ok'; result: DigestOk }
  | { phase: 'error'; message: string };

export function ObserverDeepRead({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [state, setState] = useState<State>({ phase: 'idle' });

  async function generate() {
    setState({ phase: 'busy' });
    try {
      const r = await fetch('/api/admin/observer/digest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale }),
        cache: 'no-store',
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const message = body && typeof body === 'object' && 'message' in body ? String((body as { message?: unknown }).message) : `HTTP ${r.status}`;
        setState({ phase: 'error', message });
        return;
      }
      setState({ phase: 'ok', result: body as DigestOk });
    } catch {
      setState({ phase: 'error', message: locale === 'zh' ? '网络错误——没有打到服务器。' : 'Network error — the request never reached the server.' });
    }
  }

  if (state.phase === 'idle') {
    return (
      <div className="observer-aidr observer-aidr-idle" data-observer-deepread-idle>
        <div>
          <p className="observer-aidr-kicker">{c.kicker}</p>
          <p className="observer-aidr-hint">{c.idle}</p>
        </div>
        <button type="button" className="observer-aidr-button" onClick={() => { void generate(); }} data-observer-deepread-button>
          {c.generate}
        </button>
      </div>
    );
  }

  if (state.phase === 'busy') {
    return (
      <div className="observer-aidr observer-aidr-busy" data-observer-deepread-busy role="status" aria-live="polite">
        <p className="observer-aidr-kicker">{c.kicker}</p>
        <p className="observer-aidr-hint">{c.generating}</p>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="observer-aidr observer-aidr-error" data-observer-deepread-error role="alert">
        <p className="observer-aidr-kicker">{c.kicker}</p>
        <p className="observer-aidr-hint">{state.message}</p>
        <button type="button" className="observer-aidr-button" onClick={() => { void generate(); }} data-observer-deepread-retry>
          {c.retry}
        </button>
      </div>
    );
  }

  const { result } = state;
  return (
    <div className="observer-aidr observer-aidr-ok" data-observer-deepread data-observer-deepread-cached={result.cached ? '1' : '0'}>
      <p className="observer-aidr-kicker">
        {c.kicker}
        <span className="observer-aidr-cacheTag">{result.cached ? c.cachedTag : c.freshTag}</span>
      </p>
      <p className="observer-aidr-digest">{result.digest}</p>
      <p className="observer-aidr-foot">
        <span className="observer-aidr-model">{c.modelLabel}: <code>{result.model}</code></span>
        <span className="observer-aidr-disclaimer">{result.disclaimer}</span>
      </p>
    </div>
  );
}
