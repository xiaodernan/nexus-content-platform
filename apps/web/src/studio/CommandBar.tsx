'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentActivity, AgentPlan, AiResponse, ModelClass } from '@nexus/schemas';
import { DesignPatchSchema } from '@nexus/schemas';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { useRealtime, type RealtimeState } from '@/lib/useRealtime';
import { studio, toModelPatches, useStudioReady } from './store';

const MODES: { id: ModelClass; label: string }[] = [
  { id: 'fast', label: 'Fast' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'reasoning', label: 'Reasoning' },
];

const EXAMPLES = [
  'Make the hero 30% taller.',
  'Make this feel more cinematic.',
  'Add a section: 三档定价卡片',
  'Find accessibility issues.',
];

/** §163：这条通道只是加速器，断开时要把"以库为准"说出口，别让人以为还在实时 */
const REALTIME_TEXT: Record<RealtimeState, string> = {
  idle: '未开',
  connecting: '连接中',
  open: '已连接',
  closed: '已断开，以刷新后的数据为准',
};

/** §7 底部 AI 命令栏：输入 → Agent Plan → 执行 → Activity → 一次事务落地 → AI Diff → 可整体撤销 */
export function CommandBar() {
  const state = useStudioReady();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<ModelClass>('balanced');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 这次请求在 agent_tasks 里的那一行（§112）：命令栏只显式带出最近一次，历史在 /tasks 页
  const [taskId, setTaskId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // §163：订本项目频道。生成任务开始与结束各推一条，这一条连接让界面不必等 HTTP 响应。
  // 进度单独存一份：同一条连接也会推通知事件，用"最后一条事件"当进度显示会被别的类型顶掉，
  // 那一行就会在任务还在跑的时候自己消失（e2e 抓过一次）
  const [live, setLive] = useState<{ taskId: string; progress: number; message?: string } | null>(null);
  const realtime = useRealtime({
    projectId: state.projectId,
    onEvent: (event) => {
      if (event.type === 'generation.progress' && event.projectId === state.projectId) {
        setLive({ taskId: event.taskId, progress: event.progress, message: event.message });
      }
    },
  });

  useEffect(() => {
    const onSlash = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.isContentEditable) || Boolean(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onSlash);
    return () => window.removeEventListener('keydown', onSlash);
  }, []);

  const submit = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    // 服务端只能从库里装配上下文（§68），所以先把编辑器里的改动落库；存不上就停下报原因，
    // 而不是悄悄按旧版本生成
    const flushed = await studio.flushBeforeAi();
    if (!flushed.ok) {
      setError(flushed.reason);
      setBusy(false);
      return;
    }
    const body = {
      requestId: `req_${Date.now().toString(36)}`,
      intent: 'design-edit',
      prompt: text,
      modelClass: mode,
      variants: 1,
      context: {
        projectId: state.projectId,
        pageId: state.page.id,
        viewport: state.viewport === 'design' ? undefined : state.viewport,
        // 只报 id：这一轮"现场长什么样"由服务端按库里的权威文档回答（§68）。
        // 客户端上传文档、选中节点的描述或设计系统摘要，都会被 /api/ai/run 拒掉——
        // 那些字段服务端算得出来，让请求方发就等于让请求方定义现实。
        selection: state.selection,
      },
    };
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as (Partial<AiResponse> & { issues?: string[]; message?: string; error?: string }) | null;
      // 任务号在响应头里（AiResponse 是 web ↔ ai-service 的契约报文，不带 web 侧账本字段）。
      // 失败时服务端也会落一条 failed 的任务行，所以这里在 !res.ok 之前先取到它
      setTaskId(res.headers.get('x-nexus-task'));
      if (!res.ok || !payload) {
        const detail = payload?.issues?.join('；') ?? payload?.message ?? payload?.error ?? `HTTP ${res.status}`;
        throw new Error(detail);
      }
      const response = payload as AiResponse;
      setResult(response);
      if (response.error) {
        setError(`${response.error.code}：${response.error.message}${response.error.hint ? `（${response.error.hint}）` : ''}`);
      } else if (response.patches?.length) {
        // 服务端已按 AiResponseSchema 校验；这里再按补丁 schema 逐条把关，避免把不合法 op 打进模型
        const invalid = response.patches.find((p) => !DesignPatchSchema.safeParse(p).success);
        if (invalid) {
          setError('AI 返回的补丁不符合补丁契约，已拒绝写入');
        } else {
          const entry = studio.applyAiTransaction(response.explanation || text, toModelPatches(response.patches), {
            provider: response.provider,
            model: response.model,
            demoMode: response.usage.demoMode || response.capability === 'demo',
          });
          if (!entry) setError('补丁未能改动模型：AI 返回的 op 与当前文档不匹配');
        }
      }
      setPrompt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const demoMode = !result || result.capability === 'demo';

  return (
    <div className="shrink-0 border-t border-[var(--nexus-color-border-subtle)] bg-bg-1 px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]" data-command-bar>
      {live ? (
        <p className="text-11 text-fg-3" data-generation-progress={live.taskId}>
          实时进度 {Math.round(live.progress * 100)}% · {live.message ?? '生成中'} · 任务 {live.taskId.slice(0, 8)}
        </p>
      ) : null}
      {taskId ? (
        <p className="text-11 text-fg-3" data-ai-task>
          这次请求记为任务 {taskId.slice(0, 8)} ·
          <a href={`/tasks/${state.projectId}`} className="ml-1 text-accent-2 underline">
            这个项目的任务列表
          </a>
        </p>
      ) : null}
      {result?.plans?.length || result?.activities?.length ? (
        <ActivityFeed plan={result.plans[0]} activities={result.activities} />
      ) : null}
      {error ? (
        <p className="mb-1 text-12 text-danger" data-ai-error>
          {error}
        </p>
      ) : null}
      {result && !error ? (
        <p className="mb-1 flex flex-wrap items-center gap-2 text-12 text-fg-2" data-ai-result>
          <span className={cn('rounded px-[5px] py-[1px] font-mono text-11', demoMode ? 'bg-warn text-bg-0' : 'bg-success text-bg-0')} data-demo-mode={demoMode ? 'on' : 'off'}>
            {demoMode ? 'DEMO MODE' : 'LIVE'}
          </span>
          <span>{result.explanation || '已完成'}</span>
          {result.patches?.length ? (
            <span className="text-fg-3">
              {result.patches.reduce((sum, p) => sum + p.ops.length, 0)} 个 op ·{' '}
              <button type="button" className="underline" onClick={() => studio.undo()}>
                Ctrl+Z 可整体撤销本次事务
              </button>
            </span>
          ) : null}
        </p>
      ) : null}
      <p className="text-11 text-fg-3" data-realtime={realtime.state}>
        实时通道：{REALTIME_TEXT[realtime.state]}
        {realtime.received > 0 ? ` · 本次已收到 ${realtime.received} 条事件` : ''}
      </p>
      <div className="flex items-end gap-[var(--nexus-space-2)]">
        <div className="flex shrink-0 items-center gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              data-model-class={m.id}
              className={cn('rounded-[var(--nexus-radius-sm)] px-2 py-1 text-11', mode === m.id ? 'bg-bg-3 text-fg-1' : 'text-fg-3 hover:bg-bg-2')}
            >
              {m.label}
            </button>
          ))}
        </div>
        <textarea
          ref={inputRef}
          rows={1}
          value={prompt}
          placeholder="描述要改什么（/ 聚焦，Enter 执行，Shift+Enter 换行）。选中元素后只改该区域。"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          className="max-h-[120px] min-h-[34px] flex-1 resize-none rounded-[var(--nexus-radius-md)] bg-bg-2 px-[var(--nexus-space-3)] py-2 text-13 placeholder:text-fg-3"
          data-ai-input
        />
        <button
          type="button"
          disabled={busy || !prompt.trim()}
          onClick={() => void submit()}
          className="h-[34px] shrink-0 rounded-[var(--nexus-radius-md)] bg-brand px-[var(--nexus-space-4)] text-13 font-medium text-bg-0 disabled:opacity-40"
          data-ai-submit
        >
          {busy ? '执行中…' : '执行'}
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-[var(--nexus-space-2)]">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setPrompt(example)}
            className="truncate rounded-full border border-[var(--nexus-color-border-subtle)] px-2 py-[2px] text-11 text-fg-3 hover:text-fg-1"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityFeed({ plan, activities }: { plan?: AgentPlan; activities: AgentActivity[] }) {
  const [open, setOpen] = useState(true);
  if (!plan && !activities?.length) return null;
  return (
    <div className="mb-[var(--nexus-space-2)] rounded-[var(--nexus-radius-md)] bg-bg-2 p-[var(--nexus-space-2)]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-12 text-fg-2">
        <span className="font-mono text-11 text-fg-3">{open ? '▾' : '▸'}</span>
        <span className="truncate">{plan?.goal ?? '执行计划'}</span>
        {plan?.tasks?.length ? <span className="text-fg-3">{plan.tasks.length} 个任务</span> : null}
      </button>
      {open ? (
        <ul className="mt-1 flex flex-col gap-1 pl-[var(--nexus-space-5)]">
          {plan?.tasks?.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-12">
              <span className="font-mono text-11 uppercase text-fg-3">{task.status}</span>
              <span className="text-fg-1">{task.title}</span>
              <span className="text-fg-3">@{task.agent}</span>
            </li>
          ))}
          {activities?.map((activity, i) => (
            <li key={`${activity.stage}-${i}`} className="flex items-center gap-2 text-12 text-fg-3">
              <span className="font-mono text-11">{activity.status}</span>
              <span>{activity.summary}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
