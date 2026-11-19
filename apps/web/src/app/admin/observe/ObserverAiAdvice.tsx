'use client';

import { useState } from 'react';
import { generateAiAdvice, type AiAdviceItem, type ObserverMetricsInput } from './aiAdvice';
import type { Locale } from '@/lib/i18n';

const COPY = {
  zh: {
    kicker: 'AI 深读 · gpt-6.2-sol',
    idle: 'AI 看一遍真实聚合数字——形势·展望（带推断）·下一步。按钮触发，每次真调用，失败如实展示。',
    generate: '生成 AI 深读（真调用）',
    generating: '模型正在读这一串真实数字…',
    modelLabel: '模型：',
    errorBad: '读数失败：模型只给了空建议（已如实展示）。',
    errorBusy: '真模型调用失败——可能 provider 还没接好；规则建议在上方照旧。',
    retry: '重试',
    priority: { HIGH: '高', MEDIUM: '中', LOW: '低' },
  },
  en: {
    kicker: 'AI deep-read · gpt-6.2-sol',
    idle: 'The model reads the measured aggregates — situation, forecast (inference marked), next steps. Real call, triggered by button, failures shown honestly.',
    generate: 'Generate AI deep-read (real call)',
    generating: 'The model is reading these real numbers…',
    modelLabel: 'Model: ',
    errorBad: 'Readout failed: the model gave only empty suggestions (shown honestly).',
    errorBusy: 'The real provider call failed — the provider may not be wired yet; rule suggestions still stand.',
    retry: 'Retry',
    priority: { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' },
  },
} as const;

type State =
  | { phase: 'idle' }
  | { phase: 'busy' }
  | { phase: 'ok'; items: AiAdviceItem[]; model: string }
  | { phase: 'error'; message: string };

export function ObserverAiAdvice({ locale, metrics }: { locale: Locale; metrics: ObserverMetricsInput }) {
  const c = COPY[locale];
  const [state, setState] = useState<State>({ phase: 'idle' });

  async function generate() {
    setState({ phase: 'busy' });
    try {
      const r = await generateAiAdvice(metrics, locale);
      setState({ phase: 'ok', items: r.items, model: r.model });
    } catch (e) {
      const message = String((e as Error)?.message ?? e).slice(0, 400);
      setState({ phase: 'error', message });
    }
  }

  return (
    <div className="obs-aiAdvice">
      <h3 className="obs-aiAdviceKicker">{c.kicker}</h3>
      <p className="obs-subnote">{c.idle}</p>
      {state.phase === 'ok' && (
        <>
          <p className="obs-aiAdviceModel">{c.modelLabel}{state.model}</p>
          <ul className="obs-adviceList">
            {state.items.map((item, i) => (
              <li key={i} className="obs-aiAdviceItem">
                <span className="obs-aiAdvicePriority">{item.priority}</span>
                <strong>{item.basis}</strong>
                <em>{item.impact}</em>
                <span>{item.action}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {state.phase === 'error' && <p className="obs-subnote" role="alert">{state.message}</p>}
      {state.phase !== 'ok' && (
        <button type="button" onClick={() => void generate()} disabled={state.phase === 'busy'}>
          {state.phase === 'busy' ? c.generating : state.phase === 'idle' ? c.generate : c.retry}
        </button>
      )}
    </div>
  );
}
