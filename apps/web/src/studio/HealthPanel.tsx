'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { formatHealthValue, type HealthCheck, type HealthReport } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import type { HealthJob } from '@/lib/health-job';
import { useHealthReport, type HealthSource } from './health-client';
import { useStudioReady } from './store';

/**
 * §178 项目健康的读数面板：Studio 与发布弹层共用同一份渲染，
 * 数字由 `analyzeHealth` 算——和服务端发布门禁是同一个函数，不会两边各说一套（§179）。
 *
 * 每一行都带"这项到底看了什么"（basis）：分数来历不明的话，用户只会当成装饰。
 * 没测的行显示"未评估"，不显示绿勾（§159）。
 *
 * §147：数字现在在 worker 里算（`health-client.ts`），面板据此多挂三个只读标记——
 * `data-health-source`（worker / sync）、`data-health-pending`（正在重算）、
 * `data-health-seq`（第几份报告）——探针与 e2e 靠它们分辨"后台算的"与"退回主线程算的"。
 */

const STATE_MARK: Record<HealthCheck['state'], string> = {
  pass: '✓',
  fail: '✗',
  'not-run': '—',
};

export function HealthPanel({
  report,
  source,
  healthSource,
  pending,
  seq,
  computeMs,
}: {
  report: HealthReport;
  source?: string;
  healthSource?: HealthSource;
  pending?: boolean;
  seq?: number;
  computeMs?: number;
}) {
  return (
    <div
      className="flex flex-col gap-[6px]"
      data-health-panel
      data-health-source={healthSource}
      data-health-pending={pending ? '1' : '0'}
      data-health-seq={seq}
      data-health-compute-ms={computeMs === undefined ? undefined : Math.round(computeMs)}
    >
      <p className="text-11 text-fg-3" data-health-summary>
        门禁{report.passed ? '通过' : '未通过'}
        <span className="text-fg-3"> · {source ?? '实时按当前文档计算'}</span>
        {pending ? <span className="text-fg-3" data-health-recomputing> · 重算中…</span> : null}
      </p>
      <ul className="flex flex-col gap-[6px]">
        {report.checks.map((check) => (
          <HealthRow key={check.id} check={check} />
        ))}
      </ul>
      {report.blockers.length ? (
        <ul className="flex flex-col gap-[2px]" data-health-blockers>
          {report.blockers.map((blocker) => (
            <li key={blocker} className="text-11 text-danger-ink">
              · {blocker}
            </li>
          ))}
        </ul>
      ) : null}
      {report.notRun.length ? (
        <p className="text-11 text-warn-ink" data-gate-not-run>
          未运行：{report.notRun.join('、')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * §178：Studio 左侧常驻的一栏，改一下文档就实时重算。
 *
 * §147：连续按键时不同步跟每一次 commit——`useDeferredValue` 让 React 先画旧读数，
 * 重算只发生在停顿后（防抖）；已算好的当页布局直接复用，不再解第二遍。
 * 只有 design 视口的布局才能复用：断点视口的几何是按断点宽度裁过的，
 * 拿它喂门禁会把"响应式换行后的尺寸"当成设计尺寸判（off-canvas / tap-target 全错）。
 * 2026-10-29 起这次重算整个搬进 worker（`health-client.ts`）：10k 节点 438ms 的全量体检
 * 不再占主线程；算的时候旧读数照常在，但会挂"重算中…"，不把旧数当当前值。
 */
export function HealthRail() {
  const state = useStudioReady();
  const deferred = useDeferredValue(state);
  const job = useMemo<HealthJob>(() => {
    const layouts =
      deferred.viewport === 'design' && deferred.layout && deferred.page
        ? { [deferred.page.id]: deferred.layout }
        : undefined;
    return { document: deferred.document, layouts };
  }, [deferred.document, deferred.viewport, deferred.layout, deferred.page]);
  const { reading, pending } = useHealthReport(job);
  return (
    <div className="flex h-full min-h-0 flex-col" data-health-rail data-health-seq={reading?.seq ?? 0}>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-2">
        <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">项目健康</h2>
        {reading ? (
          <span
            className="font-mono text-12"
            data-health-rail-state={reading.report.passed ? 'pass' : 'fail'}
          >
            <span className={reading.report.passed ? 'text-fg-2' : 'text-danger-ink'}>
              {reading.report.passed ? '可发布' : '有阻塞'}
            </span>
          </span>
        ) : pending ? (
          <span className="font-mono text-12 text-fg-3" data-health-rail-pending>
            计算中…
          </span>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-[var(--nexus-space-2)]">
        {reading ? (
          <HealthPanel
            report={reading.report}
            source="随改动更新"
            healthSource={reading.source}
            pending={pending}
            seq={reading.seq}
            computeMs={reading.computeMs}
          />
        ) : (
          <p className="px-3 py-8 text-center text-12 text-fg-3" data-health-rail-wait>
            {pending ? '正在算健康度…' : '文档还没载入完，算不出健康度。'}
          </p>
        )}
      </div>
    </div>
  );
}

function HealthRow({ check }: { check: HealthCheck }) {
  const [expanded, setExpanded] = useState(false);
  // 分数旁边只放"这条线是怎么定的"：≥80 分数线、零错误 = 有 error 就挡、仅参考 = 不参与门禁
  const chip = !check.gating ? '仅参考' : check.threshold === null ? '零错误' : `≥${check.threshold}`;
  const total = check.findings.length + check.omitted;
  return (
    <li
      className={cn(
        'rounded-[var(--nexus-radius-sm)] px-2 py-1',
        check.state === 'fail' ? 'bg-danger/10' : 'bg-bg-2',
      )}
      data-health-row={check.id}
      data-health-state={check.state}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-[6px] text-left"
        data-health-toggle={check.id}
      >
        <span
          className={cn(
            'w-[12px] shrink-0 font-mono text-12',
            check.state === 'pass' ? 'text-fg-2' : check.state === 'fail' ? 'text-danger-ink' : 'text-warn-ink',
          )}
        >
          {STATE_MARK[check.state]}
        </span>
        <span className="min-w-0 flex-1 truncate text-11 text-fg-1">{check.label}</span>
        <span className="shrink-0 font-mono text-11 text-fg-2" data-health-score={check.id}>
          {formatHealthValue(check)}
        </span>
        <span className="shrink-0 rounded-[3px] border border-[var(--nexus-color-border-subtle)] px-1 font-mono text-10 text-fg-3">
          {chip}
        </span>
        <span className="shrink-0 whitespace-nowrap font-mono text-11 text-fg-3" data-health-findings={check.id}>
          {total ? `${total} 项发现${check.omitted ? `（列 ${check.findings.length}）` : ''}` : '无发现'}
        </span>
      </button>
      <p className="mt-[2px] text-11 text-fg-3">{check.basis}</p>
      {check.metrics.length ? (
        <p className="mt-[2px] font-mono text-11 text-fg-3">
          {check.metrics.map((metric) => `${metric.label} ${metric.value}`).join(' · ')}
        </p>
      ) : null}
      {expanded && check.findings.length ? (
        <ul className="mt-1 flex flex-col gap-[2px]" data-health-findings-list={check.id}>
          {check.findings.map((finding, i) => (
            <li key={`${finding.code}-${finding.nodeId ?? finding.path ?? ''}-${i}`} className="text-11 text-fg-2">
              <span
                className={cn(
                  'mr-1 font-mono uppercase',
                  finding.severity === 'error' ? 'text-danger-ink' : finding.severity === 'warning' ? 'text-warn-ink' : 'text-fg-3',
                )}
              >
                {finding.severity[0]}
              </span>
              {finding.message}
              {finding.suggestion ? <span className="text-fg-3"> · {finding.suggestion}</span> : null}
            </li>
          ))}
          {check.omitted ? (
            <li className="text-11 text-fg-3" data-health-omitted={check.id}>
              另有 {check.omitted} 条同类发现未列出（计分已计入）
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
