'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentActivity, AgentPlan, AgentRoster, AiResponse, ModelClass } from '@nexus/schemas';
import { AiJobObservationSchema, AiResponseSchema, AgentRosterSchema, APPROVAL_TTL_MS, DesignPatchSchema } from '@nexus/schemas';
import { ttlLabel } from '@/lib/notify-plan';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { REALTIME_TEXT, useRealtime } from '@/lib/useRealtime';
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
  /**
   * §162 的异步那一路。默认不勾：同步那一路是"这次请求挂住等结果"，
   * 而队列那一路是"提交之后问"——两条路的账本、审批门与落地代码是同一份，
   * 差别只在谁等、等多久，所以勾上它不该改变"结果会不会被拦"（§74）。
   */
  const [asyncMode, setAsyncMode] = useState(false);
  const [asyncStatus, setAsyncStatus] = useState<string | null>(null);
  /** 这次提交的作业号：取消按钮要知道向谁取消（提交之后到终态之前一直挂着） */
  const [asyncJobId, setAsyncJobId] = useState<string | null>(null);
  /**
   * "取消已被受理"的存根（受理成功才置真）。waitJob 里同样是 `cancelled` 的两种来路要说两句话：
   * 用户自己点的取消（这里为真）说"你取消了这次作业"；审批被放弃的那一种说"先前已被放弃"。
   * 不靠这个标志分，两句话就会混成一句，而"我刚取消的"与"几天前有人放弃的"不是一件事。
   */
  const cancelRequested = useRef(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  /**
   * §112 的名册：库里那一份（`GET /api/ai/agents`），不是前端抄的 13 个名字。
   * 读失败就留空数组 + 一句原因——选择器只剩"不点名"，界面上仍然说得出为什么。
   */
  const [roster, setRoster] = useState<AgentRoster['agents']>([]);
  const [rosterNote, setRosterNote] = useState<string | null>(null);
  /** 用户选的（提名）那一位；服务端认不认、最后交给谁，看下面两条 */
  const [agentKey, setAgentKey] = useState('');
  const [runAgent, setRunAgent] = useState<string | null>(null);
  /** 提及没解析成 Agent 时服务端说的那一句（点名点错了 / 名册没播种） */
  const [agentNote, setAgentNote] = useState<string | null>(null);
  /** 组件卸载之后不许再有第二次 fetch：那会在没有界面的地方 setState。
      StrictMode/HMR 会把 effect 走一遍"清理再挂载"，所以每次挂载都要把开关拨回来，
      否则轮询还没开始就被上一轮的清理判了死刑（作业会被误报成超时） */
  const pollStop = useRef(false);
  useEffect(() => {
    pollStop.current = false;
    return () => {
      pollStop.current = true;
    };
  }, []);

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

  // §112：名册读一次就够（它不是每个项目一份的东西）。读不到要说原因：
  // 一个空选择器与"名册还没播种"是两件事，混成一谈的话用户会以为自己选错了地方
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/ai/agents', { cache: 'no-store' });
        const parsed = AgentRosterSchema.safeParse(await res.json().catch(() => null));
        if (cancelled) return;
        if (!res.ok || !parsed.success) {
          setRosterNote(`名册读不到（${res.ok ? '返回的报文不合契约' : `HTTP ${res.status}`}），这一轮只能不点名`);
          return;
        }
        setRoster(parsed.data.agents);
        if (parsed.data.agents.length === 0) setRosterNote('库里一个 Agent 都没有：跑一次 npm run db:seed 才会有名册');
      } catch (e) {
        if (!cancelled) setRosterNote(`名册读不到：${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
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
        const body = (await res.json()) as {
          pending?: { taskId: string; approvals?: { action: string; reason: string }[]; expiresAt?: string | null }[];
        };
        const first = body.pending?.[0];
        if (!first) return;
        // 只在没有卡片时补上：这一路是"找回现场"，不该把刚拿到的那一份盖掉
        setHeld((current) =>
          current ?? { taskId: first.taskId, approvals: first.approvals ?? [], expiresAt: first.expiresAt ?? null },
        );
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
   * `expiresAt` 只有从账本找回现场那一路拿得到（服务端算好的那一栏）；
   * 刚跑完那一次是 null，卡片上就只说时效本身，不编一个精确到分钟的截止时间。
   */
  const [held, setHeld] = useState<{ taskId: string; approvals: { action: string; reason: string }[]; expiresAt: string | null } | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalNote, setApprovalNote] = useState<string | null>(null);

  /** 把一份 AI 结果打进工作区。同步那一路与"批准后交回的那一版"共用这一条：一次事务、可整体撤销（§149/§150） */
  const applyResult = (response: AiResponse, fallbackText: string): void => {    const invalid = response.patches.find((p) => !DesignPatchSchema.safeParse(p).success);
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

  /**
   * 拿到一份能交回的结果之后怎么处置——同步那一路与异步轮询那一路共用这一段。
   * 两条路的形状必须一样：服务端扣下的高危结果在两边都是"补丁不在报文里 + approvals 非空"，
   * 于是审批卡片也只有一处实现。异步那条路如果自己另写一套"先落地再说"，§74 就等于没有。
   */
  const consume = (response: AiResponse, taskForApproval: string | null, text: string): void => {
    setResult(response);
    if (response.approvals?.length && taskForApproval) setHeld({ taskId: taskForApproval, approvals: response.approvals, expiresAt: null });
    if (response.error && response.error.code !== 'approval-required') {
      setError(`${response.error.code}：${response.error.message}${response.error.hint ? `（${response.error.hint}）` : ''}`);
    } else if (response.patches?.length) {
      applyResult(response, text);
    }
    setPrompt('');
  };

  /**
   * §162 的异步那一路：交给队列之后每 1.5 秒问一次，问到的都是真观察。
   * 三条不能省的诚实：进度没有来源就不画百分比（这条队列的 progress 一直是 null）；
   * 等满 3 分钟没结束就说"还没结束"，而不是替它编一个"快好了"；
   * 服务端扣下的那一版在报文里就是空的补丁列表——卡片说的是同一句"画布还没有被改动"。
   */
  const waitJob = async (jobId: string, taskId: string | null, text: string): Promise<void> => {
    for (let i = 0; i < 120 && !pollStop.current; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      if (pollStop.current) return;
      const res = await fetch(`/api/ai/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const parsed = AiJobObservationSchema.safeParse(await res.json().catch(() => null));
      if (!res.ok || !parsed.success) {
        const detail = parsed.success ? `HTTP ${res.status}` : parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('；');
        throw new Error(`问不到这个作业的状态：${detail}`);
      }
      const seen = parsed.data;
      // 异步这一路的"交给谁"以账本里那一行为准（观察报文带的就是它），不拿浏览器选的那一个冒充
      if (seen.agent) setRunAgent(seen.agent.name);
      setAsyncStatus(
        `作业 ${jobId} · ${seen.jobStatus ?? '没问到'} · 任务 ${seen.taskId.slice(0, 8)}${seen.notes[0] ? ` · ${seen.notes[0]}` : ''}`,
      );
      if (seen.response) {
        consume(seen.response, seen.taskId ?? taskId, text);
        return;
      }
      if (seen.jobStatus === 'failed' || seen.taskStatus === 'failed') {
        throw new Error(seen.outcome ?? '作业失败，没有给出原因');
      }
      // cancelled 有两种来路，各说各的（见 cancelRequested 的注释）。都停在这里：
      // 取消之后队列不再交回补丁，继续轮询只会把用户已知的终态再读一百遍
      if (seen.jobStatus === 'cancelled' || seen.taskStatus === 'cancelled') {
        if (cancelRequested.current) {
          setAsyncStatus(`已取消 · 作业 ${jobId}${seen.outcome ? ` · ${seen.outcome}` : ''}`);
          setApprovalNote('这次作业已经取消：没有补丁交回，画布没有被改动。任务列表里可以重试。');
        } else {
          setApprovalNote('这一份挂起的结果先前已被放弃，异步这一路不会再交回补丁。');
        }
        return;
      }
    }
    throw new Error(`等了 3 分钟，这个作业还没结束（作业号 ${jobId}）。它还在队列里跑，可以再回来问，或者在任务列表里看它。`);
  };

  /**
   * §162 取消：先把请求送到服务端（队列先立标志、账本后 CAS），受理成功才置 `cancelRequested`。
   * 没受理就照实报错——409"已经落成 succeeded"意味着结果已经在回来的路上，把按钮说成成功才是骗人。
   * 受理之后 jobStatus 可能仍是 running（只立了标志），所以状态行写"已受理"而不是"已取消"；
   * 真正的 cancelled 由下一次轮询观察到，那句话在 waitJob 里说。
   */
  const cancelAsync = async () => {
    const jobId = asyncJobId;
    if (!jobId || cancelBusy || cancelRequested.current) return;
    setCancelBusy(true);
    try {
      const res = await fetch(`/api/ai/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', headers: csrfHeaders() });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; error?: string; note?: string; jobStatus?: string | null; taskStatus?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      cancelRequested.current = true;
      setAsyncStatus(
        `取消已受理 · 作业 ${jobId} · 账本 ${body?.taskStatus ?? 'cancelled'}${
          body?.jobStatus === 'running' ? ' · 队列在跑，检查点落成 cancelled 之前状态仍是 running' : ''
        }${body?.note ? ` · ${body.note}` : ''}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelBusy(false);
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
    setAsyncStatus(null);
    setRunAgent(null);
    setAgentNote(null);
    // 新一次提交从干净的状态开始：上一轮的作业号与"取消受理过"都不能跟着过来——
    // 拿着旧作业号的取消按钮会去取消上一次的作业
    setAsyncJobId(null);
    cancelRequested.current = false;
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
      // §112：这里发的只是**提名**。名册、职责与权限由服务端按库装配（`agent` 那一栏客户端发过去会被 400）
      ...(agentKey ? { agentKey } : {}),
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
      const res = await fetch(asyncMode ? '/api/ai/jobs' : '/api/ai/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as
        | (Partial<AiResponse> & { jobId?: string; backend?: string; note?: string; issues?: string[]; message?: string; error?: string })
        | null;
      // 任务号在响应头里（AiResponse 是 web ↔ ai-service 的契约报文，不带 web 侧账本字段）。
      // 失败时服务端也会落一条 failed 的任务行，所以这里在 !res.ok 之前先取到它
      const taskIdHeader = res.headers.get('x-nexus-task');
      setTaskId(taskIdHeader);
      // §112：这一轮服务端交给了谁 + 提及没认出来时的那一句，都在响应头里（两条 provider 路同一组头）。
      // 头部给的是 key，界面报名字：读的人认得"QA Agent"，认得不了 `qa`
      const agentHeader = res.headers.get('x-nexus-agent');
      setRunAgent(agentHeader ? (roster.find((a) => a.key === agentHeader)?.name ?? agentHeader) : null);
      const rawNote = res.headers.get('x-nexus-agent-note');
      if (rawNote) setAgentNote(decodeURIComponent(rawNote));
      if (!res.ok || !payload) {
        // 409 demo_mode 那句原样报出来：异步作业要真 provider，这里不替它演一个"已提交"
        const detail = payload?.issues?.join('；') ?? payload?.message ?? payload?.error ?? `HTTP ${res.status}`;
        throw new Error(detail);
      }
      if (asyncMode) {
        if (!payload.jobId) throw new Error('提交没有拿到作业号，因此没东西可以问');
        setAsyncJobId(payload.jobId);
        setAsyncStatus(`已交给队列 · 作业 ${payload.jobId} · 后端 ${payload.backend ?? '未知'}${payload.note ? ` · ${payload.note}` : ''}`);
        await waitJob(payload.jobId, taskIdHeader, text);
        return;
      }
      consume(payload as AiResponse, taskIdHeader, text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const demoMode = !result || result.capability === 'demo';
  const selectedAgent = roster.find((agent) => agent.key === agentKey) ?? null;
  // 与 server/ai/approvals.ts 的 DESIGN_PATCH 同一个字符串。这里不 import 那一模块：
  // 它是服务端代码，引到客户端就会把设计模型的读取逻辑打进浏览器包里
  const canPatchDesign = selectedAgent?.capabilities.includes('design.patch') ?? false;

  return (
    <div className="shrink-0 border-t border-[var(--nexus-color-border-subtle)] bg-bg-1 px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]" data-command-bar>
      {live ? (
        <p className="text-11 text-fg-3" data-generation-progress={live.taskId}>
          实时进度 {Math.round(live.progress * 100)}% · {live.message ?? '生成中'} · 任务 {live.taskId.slice(0, 8)}
        </p>
      ) : null}
      {/* 异步那一路说的都是观察到的东西：作业号、队列报的状态、以及后端带来的限制 */}
      {asyncStatus ? (
        <p className="text-11 text-fg-3" data-async-status>
          {asyncStatus}
        </p>
      ) : null}
      {/* §162 取消：只在"有作业号 + 还在等 + 取消还没受理"时挂出来——终态后的取消按钮
          会去点一个已经落账的行，那只会得到一条 409 的坏消息 */}
      {asyncJobId && busy && !cancelRequested.current ? (
        <button
          type="button"
          onClick={() => void cancelAsync()}
          disabled={cancelBusy}
          data-async-cancel
          className="mb-1 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] px-2 py-[2px] text-11 text-fg-2 disabled:opacity-50"
        >
          {cancelBusy ? '取消请求发送中…' : '取消这次作业'}
        </button>
      ) : null}
      {taskId ? (
        <p className="text-11 text-fg-3" data-ai-task>
          这次请求记为任务 {taskId.slice(0, 8)} ·
          <a href={`/tasks/${state.projectId}`} className="ml-1 text-accent-2-ink underline">
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
          {/* §74 的时效要说在卡片上，而不是等用户按下批准才从 409 里知道：
              "这一份放着不管会自己作废"改变的是他要不要现在去看这 3 处删除，
              而那句作废的理由（补丁从未落地）与服务端写进账本的是同一句。 */}
          <p className="mt-[2px] text-11 text-fg-3" data-approval-expiry>
            {ttlLabel(APPROVAL_TTL_MS)}内未决定，这一份自动作废、被扣下的补丁不会落地
            {held.expiresAt ? `（截止 ${new Date(held.expiresAt).toLocaleString('zh-CN', { hour12: false })}）` : ''}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={approvalBusy}
              onClick={() => void decide('approve')}
              data-approval-approve
              className="rounded-[var(--nexus-radius-sm)] bg-warn px-2 py-[2px] text-11 text-accent-fg disabled:opacity-50"
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
            <a href={`/tasks/${state.projectId}`} className="text-11 text-accent-2-ink underline" data-approval-link>
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
      {/* §73 要说在前头：选了一位没有 design.patch 的 Agent，改动就会被服务端拒收。
          让人在按下"执行"之前看见这句，比让他看完一次失败再猜为什么强 */}
      {selectedAgent ? (
        <p className="text-11 text-fg-3" data-ai-agent-scope>
          {selectedAgent.name} 的职责：{selectedAgent.responsibilities.join('；') || '名册里没写'} ·
          {' '}权限：{selectedAgent.capabilities.join('、') || '无'}
          {canPatchDesign ? '' : '（没有 design.patch：这一位给出的改动会被服务端拒收，不进画布）'}
        </p>
      ) : null}
      {runAgent || agentNote || rosterNote ? (
        <p className="text-11 text-fg-3" data-ai-agent-line>
          {runAgent ? `这一轮交给 ${runAgent}` : rosterNote ? '' : '这一轮没有人被点名'}
          {agentNote ? <span data-ai-agent-note>{` · ${agentNote}`}</span> : null}
          {rosterNote ? <span data-ai-roster-note>{` · ${rosterNote}`}</span> : null}
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
          <span className={cn('rounded px-[5px] py-[1px] font-mono text-11', demoMode ? 'bg-warn text-accent-fg' : 'bg-success text-accent-fg')} data-demo-mode={demoMode ? 'on' : 'off'}>
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
        {/* §112：提名这一轮交给谁。也可以直接在提示词里写 @design / @qa——两处都写时以名册里那一位为准，
            而"名册里有没有"由服务端判，不由这里列了什么判 */}
        <label className="flex h-[34px] shrink-0 items-center gap-1 text-11 text-fg-3" title="名册来自库里的 agents 表（§112）。没点名就按这次请求的意图走">
          交给
          <select
            value={agentKey}
            onChange={(e) => setAgentKey(e.target.value)}
            data-ai-agent
            className="h-[26px] max-w-[150px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 text-11 text-fg-1"
          >
            <option value="">不点名</option>
            {roster.map((agent) => (
              <option key={agent.key} value={agent.key}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
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
          className="h-[34px] shrink-0 rounded-[var(--nexus-radius-md)] bg-brand px-[var(--nexus-space-4)] text-13 font-medium text-accent-fg disabled:opacity-40"
          data-ai-submit
        >
          {busy ? '执行中…' : '执行'}
        </button>
        {/* 勾上它只是换"谁在等"：等同步返回，还是交给队列然后一次一次问。拦不拦高危动作由服务端那道门说（§74） */}
        <label className="flex h-[34px] shrink-0 items-center gap-1 text-11 text-fg-3" title="交给 AI Service 的队列执行：不挂住这次请求，状态与结果靠回来问">
          <input type="checkbox" checked={asyncMode} onChange={(e) => setAsyncMode(e.target.checked)} data-ai-async />
          异步作业
        </label>
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
