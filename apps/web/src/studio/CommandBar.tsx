'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentActivity, AgentPlan, AiResponse, ModelClass } from '@nexus/schemas';
import { AiResponseSchema, DesignPatchSchema } from '@nexus/schemas';
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
  // §74：删除类动作的入口。点了它会拿到一份被服务端扣下的结果，而不是直接改动画布
  '删除 Hero 区块',
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

  // §74：审批卡片不能只活在 React 状态里。刷新之后从账本找回还挂着的那一条（最新在前），
  // 否则库里那条等待中的任务在界面上就什么都不剩——没人能再决定它，它就一直等着。
  useEffect(() => {
    const projectId = state.projectId;
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/ai/pending-approvals?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { pending?: { taskId: string; approvals?: { action: string; reason: string }[] }[] };
        const first = body.pending?.[0];
        if (!first) return;
        // 只在没有卡片时补上：这一路是"找回现场"，不该把刚拿到的那一份盖掉
        setHeld((current) => current ?? { taskId: first.taskId, approvals: first.approvals ?? [] });
      } catch {
        // 拿不到就不显示卡片。审批入口少一次自动找回，比拿一份错现场顶上要好
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.projectId]);

  /**
   * §74：一次被服务端扣下的结果。只存"要审批什么"，不存补丁——
   * 补丁在库里那份上，界面上拿不到它，也就拿不到"绕过按钮直接应用"的可能。
   */
  const [held, setHeld] = useState<{ taskId: string; approvals: { action: string; reason: string }[] } | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalNote, setApprovalNote] = useState<string | null>(null);

  /** 把一份 AI 结果打进工作区。同步那一路与"批准后交回的那一版"共用这一条：一次事务、可整体撤销（§149/§150） */
  const applyResult = (response: AiResponse, fallbackText: string): void => {
    const invalid = response.patches.find((p) => !DesignPatchSchema.safeParse(p).success);
    if (invalid) {
      setError('AI 返回的补丁不符合补丁契约，已拒绝写入');
      return;
    }
    const entry = studio.applyAiTransaction(response.explanation || fallbackText, toModelPatches(response.patches), {
      provider: response.provider,
      model: response.model,
      demoMode: response.usage.demoMode || response.capability === 'demo',
    });
    if (!entry) setError('补丁未能改动模型：AI 返回的 op 与当前文档不匹配');
  };

  /**
   * 人工裁决。批准拿回的是**当初被扣下的那一份**（不是重新生成），交回之后仍走上面那条事务，
   * 所以撤销它与撤销一次普通生成是同一个动作。期间文档变了就可能"op 与当前文档不匹配"——
   * 那句红是真的失败了，不是审批没生效。
   */
  const decide = async (decision: 'approve' | 'reject'): Promise<void> => {
    if (!held || approvalBusy) return;
    setApprovalBusy(true);
    setApprovalNote(null);
    try {
      const res = await fetch(`/api/ai/tasks/${held.taskId}/approval`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ decision }),
      });
      const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const detail = (payload?.message ?? payload?.issues ?? `HTTP ${res.status}`) as string | string[];
        setApprovalNote(`没有生效：${Array.isArray(detail) ? detail.join('；') : detail}`);
        return;
      }
      if (decision === 'reject') {
        setHeld(null);
        setApprovalNote('已放弃这份结果，工作区没有被改动，删除也没有发生。');
        return;
      }
      const checked = AiResponseSchema.safeParse(payload?.held ?? null);
      if (!checked.success) {
        setApprovalNote('批准已记下，但交回的结果不符合契约，因此没有打进工作区。');
        setHeld(null);
        return;
      }
      applyResult(checked.data, '已批准并交回的 AI 结果');
      setHeld(null);
      setApprovalNote(`已批准：${checked.data.patches.reduce((n, p) => n + p.ops.length, 0)} 个 op 交回编辑区（Ctrl+Z 可整体撤销）。`);
    } catch (e) {
      setApprovalNote(`审批请求失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApprovalBusy(false);
    }
  };

  const submit = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setHeld(null);
    setApprovalNote(null);
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
      const taskIdHeader = res.headers.get('x-nexus-task');
      setTaskId(taskIdHeader);
      if (!res.ok || !payload) {
        const detail = payload?.issues?.join('；') ?? payload?.message ?? payload?.error ?? `HTTP ${res.status}`;
        throw new Error(detail);
      }
      const response = payload as AiResponse;
      setResult(response);
      // §74：有审批动作时补丁根本不会到这里（服务端已扣下），界面上说的是"等什么"，
      // 而不是把 approval-required 当成一条普通错误刷在结果行上
      if (response.approvals?.length && taskIdHeader) setHeld({ taskId: taskIdHeader, approvals: response.approvals });
      if (response.error && response.error.code !== 'approval-required') {
        setError(`${response.error.code}：${response.error.message}${response.error.hint ? `（${response.error.hint}）` : ''}`);
      } else if (response.patches?.length) {
        applyResult(response, text);
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
      {/* §74：被服务端扣下的高危结果。审批卡片是这条决定唯一的出口，界面上不给它任何"自动应用"的余地 */}
      {held ? (
        <div className="mb-1 rounded-[var(--nexus-radius-sm)] border border-warn/50 bg-bg-2 px-2 py-[6px]" data-approval-card>
          <p className="text-12 text-fg-1" data-approval-title>
            这份结果含 {held.approvals.length} 处需人工审批的动作，补丁已被服务端扣下，画布还没有被改动。
          </p>
          <ul className="mt-[2px] text-11 text-fg-3" data-approval-reasons>
            {held.approvals.map((a) => (
              <li key={`${a.action}:${a.reason}`} data-approval-reason>
                {a.action} · {a.reason}
              </li>
            ))}
          </ul>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={approvalBusy}
              onClick={() => void decide('approve')}
              data-approval-approve
              className="rounded-[var(--nexus-radius-sm)] bg-warn px-2 py-[2px] text-11 text-bg-0 disabled:opacity-50"
            >
              批准并交回编辑区
            </button>
            <button
              type="button"
              disabled={approvalBusy}
              onClick={() => void decide('reject')}
              data-approval-reject
              className="rounded-[var(--nexus-radius-sm)] px-2 py-[2px] text-11 text-fg-2 underline disabled:opacity-50"
            >
              放弃
            </button>
            <a href={`/tasks/${state.projectId}`} className="text-11 text-accent-2 underline" data-approval-link>
              在任务列表里看这一行
            </a>
          </div>
        </div>
      ) : null}
      {/* 裁决的回执在卡片之外：批准或放弃之后卡片就没了，回执要是住在里面，
          用户看到的是"卡片一闪，什么都不说"——那与没点过按钮长得一样 */}
      {approvalNote ? (
        <p className="mb-1 text-11 text-fg-3" data-approval-note>
          {approvalNote}
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
