'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentRunResponseSchema, type AgentRunView, type StepReport } from '@/lib/agent-runtime';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { useRealtime } from '@/lib/useRealtime';
import { useStudioReady } from './store';

/**
 * §112 / §25 的界面入口：「上架前检查」这份多步作业的计划、每一步的状态与结论。
 *
 * 三条边界写在界面上，因为不说清就会被当成别的意思：
 * - **只读**：这一轮不改设计、不发布、不生成像素。看到"检查"两个字以为是自动修复，是这一栏最容易造成的误会。
 * - **DEMO 规划**：计划来自确定性配方，不是模型（§160）。而每一步的读数（页数、门禁分、语料块数）是真算的。
 * - **库是权威**：实时事件只用来让界面快点跟上；刷新后读的是 `GET /api/projects/<id>/agent` 那一份。
 *   连接断了就写"以刷新后的数据为准"，不假装还在实时（ADR-0010 后果第 4 条）。
 */

const STATUS_MARK: Record<string, string> = {
  pending: '·',
  running: '…',
  done: '✓',
  failed: '✗',
  skipped: '—',
};

const STATUS_TONE: Record<string, string> = {
  pending: 'text-fg-3',
  running: 'text-accent-2',
  done: 'text-fg-2',
  failed: 'text-danger',
  skipped: 'text-warn',
};

const REAL_TIME_TONE: Record<string, string> = {
  idle: 'text-fg-3',
  connecting: 'text-warn',
  open: 'text-fg-3',
  closed: 'text-danger',
};

function messageOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('message' in body)) return null;
  const message = (body as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

export function AgentPanel() {
  const state = useStudioReady();
  const projectId = state.projectId;

  const [run, setRun] = useState<AgentRunView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [events, setEvents] = useState(0);

  /** 组件卸载后不许再 setState（长连接的事件可能还在路上） */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const read = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/agent`, { cache: 'no-store' });
      const body: unknown = await res.json().catch(() => null);
      if (!alive.current) return;
      if (!res.ok) {
        setReadError(`读不到这一次的状态（HTTP ${res.status}${messageOf(body) ? ` · ${messageOf(body)}` : ''}）`);
        return;
      }
      const parsed = AgentRunResponseSchema.safeParse(body);
      if (!parsed.success) {
        // §73 同一口径：读不出来就说读不出来，不画一个"空计划"让人以为没跑过
        setReadError('读到了，但报文不合契约：这次的计划与结论读不出来');
        return;
      }
      setReadError(null);
      setRun(parsed.data.run);
      setLoaded(true);
    } catch (error) {
      if (!alive.current) return;
      setReadError(`读不到：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [projectId]);

  useEffect(() => {
    void read();
  }, [read]);

  // 实时事件只做一件事：让界面快点跟上。权威状态还是库里的那一行
  const readRef = useRef(read);
  readRef.current = read;
  const realtime = useRealtime({
    projectId,
    onEvent: (event) => {
      if (event.projectId !== projectId) return;
      if (event.type !== 'agent.plan' && event.type !== 'agent.step' && event.type !== 'agent.activity') return;
      setEvents((n) => n + 1);
      void readRef.current();
    },
  });

  const start = async (): Promise<void> => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/agent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ goal }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!alive.current) return;
      if (!res.ok) {
        setNote(messageOf(body) ?? `这一次没能开跑（HTTP ${res.status}）`);
        return;
      }
      const parsed = AgentRunResponseSchema.safeParse(body);
      if (!parsed.success) {
        setNote('跑完了，但返回的报文不合契约：请刷新重看这一次的结论');
        return;
      }
      setReadError(null);
      setRun(parsed.data.run);
      setLoaded(true);
    } catch (error) {
      if (alive.current) setNote(`这一次没能开跑：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const steps = run?.steps ?? [];
  const plan = run?.plan ?? null;
  const done = steps.filter((step) => step.status === 'done').length;

  return (
    <div className="flex h-full min-h-0 flex-col" data-agent-panel>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-2">
        <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">Agent 作业</h2>
        <span
          className={cn('font-mono text-12', REAL_TIME_TONE[realtime.state] ?? 'text-fg-3')}
          data-agent-realtime={realtime.state}
        >
          {realtime.state === 'open' ? `实时在线 · 收到 ${events} 条` : '以刷新后的数据为准'}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-[var(--nexus-space-2)]">
        <p className="text-11 text-fg-3">
          上架前检查：四步只读作业（结构盘点 / 上架元信息 / 发布门禁 / 汇总）。这一轮不改设计、不发布、不生成像素。
        </p>
        {run?.capability === 'demo' ? (
          <p className="mt-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-warn" data-agent-planner="demo">
            计划由确定性配方生成（DEMO 规划），不是模型规划的；每一步的读数是真的。
          </p>
        ) : null}

        <div className="mt-2 flex items-end gap-1">
          <label className="min-w-0 flex-1">
            <span className="text-11 text-fg-3">这一轮想做什么（只进计划标题）</span>
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="例：上架前检查"
              maxLength={200}
              data-agent-goal
              className="mt-[2px] w-full rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 px-2 py-1 text-12 text-fg-1"
            />
          </label>
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy}
            data-agent-run
            className={cn(
              'shrink-0 rounded-[var(--nexus-radius-sm)] px-2 py-1 text-12',
              busy ? 'bg-bg-3 text-fg-3' : 'bg-accent-1 text-bg-0 hover:bg-accent-2',
            )}
          >
            {busy ? '跑着…' : '跑一次检查'}
          </button>
        </div>

        {note ? (
          <p className="mt-2 rounded-[var(--nexus-radius-sm)] bg-danger/10 px-2 py-1 text-11 text-danger" data-agent-note>
            {note}
          </p>
        ) : null}
        {readError ? (
          <p className="mt-2 rounded-[var(--nexus-radius-sm)] bg-danger/10 px-2 py-1 text-11 text-danger" data-agent-read-error>
            {readError}
          </p>
        ) : null}

        {!loaded && !readError ? <p className="mt-3 text-11 text-fg-3">读这一次的状态…</p> : null}

        {loaded && !run ? (
          <p className="mt-3 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-2 text-11 text-fg-3" data-agent-empty>
            这个项目还没有跑过 Agent 作业。这一栏不会显示"0 步完成"那种空壳——没有就是没有。
          </p>
        ) : null}

        {run ? (
          <div className="mt-3 flex flex-col gap-2" data-agent-plan>
            <div className="flex flex-wrap items-baseline gap-x-2 text-11">
              <span
                className={cn('font-mono', run.status === 'failed' ? 'text-danger' : run.status === 'succeeded' ? 'text-fg-2' : 'text-warn')}
                data-agent-status={run.status}
              >
                {run.status === 'succeeded' ? '完成' : run.status === 'failed' ? '失败' : '进行中'}
              </span>
              <span className="font-mono text-fg-3">
                {done}/{steps.length || plan?.tasks.length || 0} 步
              </span>
              <span className="text-fg-3" data-agent-goal-echo>
                {plan?.goal ?? ''}
              </span>
            </div>
            {run.error ? (
              <p className="rounded-[var(--nexus-radius-sm)] bg-danger/10 px-2 py-1 text-11 text-danger" data-agent-error>
                {run.error}
              </p>
            ) : null}

            <ol className="flex flex-col gap-[6px]">
              {steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </ol>

            {run.report?.notes.length ? (
              <ul className="flex flex-col gap-[2px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1" data-agent-notes>
                {run.report.notes.map((line) => (
                  <li key={line} className="text-11 text-fg-2">
                    · {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: StepReport }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1" data-agent-step={step.id} data-agent-step-status={step.status}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-baseline gap-[6px] text-left">
        <span className={cn('w-[12px] shrink-0 font-mono text-12', STATUS_TONE[step.status] ?? 'text-fg-3')}>
          {STATUS_MARK[step.status] ?? '?'}
        </span>
        <span className="min-w-0 flex-1 text-11 text-fg-1">{step.title}</span>
        <span className="shrink-0 font-mono text-10 text-fg-3">{step.agent}</span>
      </button>
      <p className="mt-[2px] text-11 text-fg-3" data-agent-step-summary={step.id}>
        {step.summary}
      </p>
      {open ? (
        <div className="mt-1 flex flex-col gap-[2px]">
          {Object.entries(step.counts).map(([key, value]) => (
            <p key={key} className="font-mono text-11 text-fg-3">
              {key} {value}
            </p>
          ))}
          {step.notes.map((line) => (
            <p key={line} className="text-11 text-fg-2">
              · {line}
            </p>
          ))}
          {step.handedOff?.length ? (
            <p className="text-11 text-fg-3">上游交接：{step.handedOff.map((item) => `${item.from}${item.artifact ? `(${item.artifact})` : ''}`).join('、')}</p>
          ) : null}
          {step.because?.length ? <p className="text-11 text-warn">被牵连：{step.because.join('、')}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
