'use client';

import { useState } from 'react';
import type { AiAdviceItem } from './aiAdvice';
import { csrfHeaders } from '@/lib/csrf';
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
    auditPrefix: '未在快照原文出现（可能是模型推算）：',
    auditHint: '这些数字逐字比对过喂给模型的聚合快照；没找到的不删，只当面标注，判断权留给你。',
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
    auditPrefix: 'Not verbatim in the snapshot (possibly inferred): ',
    auditHint: 'Each number is matched against the exact aggregate brief sent to the model; unmatched ones are flagged, never deleted.',
  },
} as const;

type State =
  | { phase: 'idle' }
  | { phase: 'busy' }
  | { phase: 'ok'; items: AiAdviceItem[]; model: string }
  | { phase: 'error'; message: string };

export function ObserverAiAdvice({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [state, setState] = useState<State>({ phase: 'idle' });

  async function generate() {
    setState({ phase: 'busy' });
    try {
      // 服务端调用必须留在服务端：这里只发 locale，指标由 route 现算。
      const res = await fetch('/api/admin/observer/advice', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ locale }),
      });
      const body = (await res.json().catch(() => null)) as { items?: AiAdviceItem[]; model?: string; message?: string } | null;
      if (!res.ok || !body?.items?.length) {
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      setState({ phase: 'ok', items: body.items, model: body.model ?? 'unknown' });
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
                {item.unverifiedNumbers.length > 0 && (
                  <span className="obs-aiAdviceAudit" title={c.auditHint}>
                    {c.auditPrefix}
                    {item.unverifiedNumbers.join(' · ')}
                  </span>
                )}
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
