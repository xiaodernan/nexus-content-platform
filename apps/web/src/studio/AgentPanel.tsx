'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_KINDS, GAME_KIND_LABELS, type GameKind } from '@nexus/game-model';
import {
  AgentDraftAcceptResponseSchema,
  AgentRunResponseSchema,
  READINESS_STEPS,
  type AgentRunView,
  type StepReport,
} from '@/lib/agent-runtime';
import { GAME_DRAFT_DEFAULT_KIND } from '@/lib/agent-game-draft';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { useRealtime } from '@/lib/useRealtime';
import { gameStore } from './gameStore';
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
  pending: 'ap-faint',
  running: 'ag-accent2Ink',
  done: 'hi-ink',
  failed: 'wd-danger11',
  skipped: 'cp-warn11',
};

const REAL_TIME_TONE: Record<string, string> = {
  idle: 'ap-faint',
  connecting: 'cp-warn11',
  open: 'ap-faint',
  closed: 'wd-danger11',
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
  /**
   * 这一份作业要编哪一型（§51，ADR-0052/0053）。
   *
   * **八型今天全都编得出来**（链上有配方）⇒ 这里列全部八型，不藏哪一型。
   * 缺省是链上的缺省型（RPG 原型）⇒ 不选就与今天的行为一模一样。
   */
  const [gameKind, setGameKind] = useState<GameKind>(GAME_DRAFT_DEFAULT_KIND);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [events, setEvents] = useState(0);
  /** §52 的接受回执挂在具体那一步上，所以与 `note`（这一栏整体的话）分开存 */
  const [accepting, setAccepting] = useState(false);
  // 那句回话属于**点掉的那一步**：链上有两份草稿时，另一行不能跟着显示"已写进项目"
  const [acceptNote, setAcceptNote] = useState<{ stepId: string; ok: boolean; text: string } | null>(null);

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
        body: JSON.stringify({ goal, gameKind }),
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

  /**
   * §52：把这一条作业里**某一步**留下的游戏草稿接受进项目。请求体只带任务号与步骤号——
   * 草稿由服务端从任务行读出来，界面上这一栏本来也读不到"能贴回去的整份文档"。
   * 为什么要步骤号：链上现在有两份草稿（game 的原始那份、combat 调过数值的那份），
   * 点的是哪一步就得说清接的是哪一份，不能让界面替用户猜。
   */
  const acceptDraft = async (stepId: string): Promise<void> => {
    if (!run) return;
    setAccepting(true);
    setAcceptNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/agent/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ taskId: run.taskId, stepId }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!alive.current) return;
      // 真 HTTP 状态码 + 服务端那句原因：409「已经有游戏」与 404「这一步读不回来」是两句不同的话，
      // 界面不能把它们都收成"失败了"
      if (!res.ok) {
        setAcceptNote({ stepId, ok: false, text: `没接受成（HTTP ${res.status}）：${messageOf(body) ?? '服务端没给出原因'}` });
        return;
      }
      const parsed = AgentDraftAcceptResponseSchema.safeParse(body);
      if (!parsed.success) {
        setAcceptNote({
          stepId,
          ok: false,
          text: '写进去了，但返回的报文不合契约（HTTP 200）：先刷新看游戏面板里有没有这一份，别重复点。',
        });
        return;
      }
      setAcceptNote({
        stepId,
        ok: true,
        text:
          `已写进项目：「${parsed.data.document.name}」${parsed.data.document.entities.length} 个实体` +
          `（接受的是「${stepId}」这一步留下的那一份草稿）。` +
          '切到「游戏」面板接着改，撤销走那边的 Command（§150），不是这一栏。',
      });
      gameStore.reload();
    } catch (error) {
      if (alive.current) {
        setAcceptNote({ stepId, ok: false, text: `没接受成：${error instanceof Error ? error.message : String(error)}` });
      }
    } finally {
      if (alive.current) setAccepting(false);
    }
  };

  const steps = run?.steps ?? [];
  const plan = run?.plan ?? null;
  const done = steps.filter((step) => step.status === 'done').length;

  return (
    <div className="wd-rootCol" data-agent-panel>
      <header className="ap-headBetween">
        <h2 className="wd-label">Agent 作业</h2>
        <span
          className={cn('font-mono text-12', REAL_TIME_TONE[realtime.state] ?? 'ap-faint')}
          data-agent-realtime={realtime.state}
        >
          {realtime.state === 'open' ? `实时在线 · 收到 ${events} 条` : '以刷新后的数据为准'}
        </span>
      </header>

      <div className="wd-scrollP2">
        <p className="sb-faint11">
          上架前检查：{READINESS_STEPS.length} 步作业，逐步列在下面。步数取自配方本身（`READINESS_STEPS`），
          不是这里手抄的——抄一份就会和配方漂。
          其中跑完留下游戏草稿的那几步（§52 那条链：草稿 → 调战斗数值 → 摆关卡位置），每一步上各有一个
          「接受进项目」按钮：点了才会写进 Game Studio，没点就只存在这一条作业里。
          这一轮不改设计、不发布、不生成像素。
        </p>
        {run?.capability === 'demo' ? (
          <p className="ag-warnRow" data-agent-planner="demo">
            计划由确定性配方生成（DEMO 规划），不是模型规划的；每一步的读数是真的。
          </p>
        ) : null}

        <div className="ag-rowEnd">
          <label className="ag-grow">
            <span className="sb-faint11">这一轮想做什么（只进计划标题）</span>
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="例：上架前检查"
              maxLength={200}
              data-agent-goal
              className="ag-inputFull"
            />
          </label>
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy}
            data-agent-run
            className={cn('ag-runBtn', busy ? 'ag-runBusy' : 'ag-runReady')}
          >
            {busy ? '跑着…' : '跑一次检查'}
          </button>
        </div>

        <label className="ag-blockMt1">
          <span className="sb-faint11">这一轮编哪一型（只影响游戏那几步；其余几步与型无关）</span>
          <select
            value={gameKind}
            onChange={(event) => setGameKind(event.target.value as GameKind)}
            data-agent-game-kind
            className="ag-inputFull"
          >
            {GAME_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {GAME_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>

        {note ? (
          <p className="ag-dangerCallout" data-agent-note>
            {note}
          </p>
        ) : null}
        {readError ? (
          <p className="ag-dangerCallout" data-agent-read-error>
            {readError}
          </p>
        ) : null}

        {!loaded && !readError ? <p className="ag-faintMt3">读这一次的状态…</p> : null}

        {loaded && !run ? (
          <p className="ag-infoBox" data-agent-empty>
            这个项目还没有跑过 Agent 作业。这一栏不会显示"0 步完成"那种空壳——没有就是没有。
          </p>
        ) : null}

        {run ? (
          <div className="ag-col3" data-agent-plan>
            <div className="ag-wrapBaseline">
              <span
                className={cn('cb-mono11', run.status === 'failed' ? 'wd-danger11' : run.status === 'succeeded' ? 'hi-ink' : 'cp-warn11')}
                data-agent-status={run.status}
              >
                {run.status === 'succeeded' ? '完成' : run.status === 'failed' ? '失败' : '进行中'}
              </span>
              <span className="sb-monoFaint">
                {done}/{steps.length || plan?.tasks.length || 0} 步
              </span>
              <span className="ap-faint" data-agent-goal-echo>
                {plan?.goal ?? ''}
              </span>
              {/* 这一轮编的是哪一型：跑完的人要能一眼看见（服务端那一份计划里记着，ADR-0052） */}
              <span className="ap-faint" data-agent-kind-echo>
                {plan?.gameKind ? GAME_KIND_LABELS[plan.gameKind as GameKind] : GAME_KIND_LABELS[GAME_DRAFT_DEFAULT_KIND]}
              </span>
            </div>
            {run.error ? (
              <p className="ag-dangerCallout" data-agent-error>
                {run.error}
              </p>
            ) : null}

            <ol className="ag-col6">
              {steps.map((step) => (
                <StepRow
                  key={step.id}
                  step={step}
                  accepting={accepting}
                  acceptNote={acceptNote && acceptNote.stepId === step.id ? acceptNote : null}
                  onAccept={() => void acceptDraft(step.id)}
                />
              ))}
            </ol>

            {run.report?.notes.length ? (
              <ul className="ag-colCard" data-agent-notes>
                {run.report.notes.map((line) => (
                  <li key={line} className="sb-ink11">
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

function StepRow({
  step,
  accepting,
  acceptNote,
  onAccept,
}: {
  step: StepReport;
  accepting: boolean;
  acceptNote: { ok: boolean; text: string } | null;
  onAccept: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="ag-slotCard" data-agent-step={step.id} data-agent-step-status={step.status}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? `agent-step-detail-${step.id}` : undefined}
        className="ag-rowBaseline"
      >
        <span className={cn('ag-stepDot', STATUS_TONE[step.status] ?? 'ap-faint')}>
          {STATUS_MARK[step.status] ?? '?'}
        </span>
        <span className="ag-growFaint">{step.title}</span>
        <span className="ds-mono10shrink">{step.agent}</span>
      </button>
      <p className="ag-mtHint" data-agent-step-summary={step.id}>
        {step.summary}
      </p>
      {step.draft ? (
        <div className="ag-colDense">
          <div className="ag-flexWrap6">
            <button
              type="button"
              onClick={onAccept}
              disabled={accepting}
              data-agent-accept-step={step.id}
              className={cn('ag-acceptBtn', accepting ? 'ag-acceptBusy' : 'ag-acceptReady')}
            >
              {accepting ? '写着…' : '接受进项目'}
            </button>
            <span className="ds-mono10">
              {step.draft.name} · {step.draft.entities.length} 个实体
            </span>
          </div>
          {acceptNote ? (
            <p
              className={cn(acceptNote.ok ? 'ag-noteOk' : 'ag-noteFail')}
              data-agent-accept-note={acceptNote.ok ? 'ok' : 'refused'}
            >
              {acceptNote.text}
            </p>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <div id={`agent-step-detail-${step.id}`} className="ag-colDense">
          {Object.entries(step.counts).map(([key, value]) => (
            <p key={key} className="sb-mono11">
              {key} {value}
            </p>
          ))}
          {step.notes.map((line) => (
            <p key={line} className="sb-ink11">
              · {line}
            </p>
          ))}
          {step.handedOff?.length ? (
            <p className="sb-faint11">上游交接：{step.handedOff.map((item) => `${item.from}${item.artifact ? `(${item.artifact})` : ''}`).join('、')}</p>
          ) : null}
          {step.because?.length ? <p className="cp-warn11">被牵连：{step.because.join('、')}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
