'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { formatHealthValue, type HealthCheck, type HealthReport } from '@nexus/creative-model';
import { cn } from '@/lib/cn';
import type { Locale } from '@/lib/i18n';
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
 * 双语（v745）：locale 由 PublishPanel / StudioShell 透传；zh 原文原样保留。
 */

const COPY = {
  zh: {
    gatePassed: '门禁',
    pass: '通过',
    fail: '未通过',
    computedLive: '实时按当前文档计算',
    recomputing: '重算中…',
    notRun: (list: string) => `未运行：${list}`,
    health: '项目健康',
    canPublish: '可发布',
    blocked: '有阻塞',
    computing: '计算中…',
    updatesOnEdit: '随改动更新',
    waitingDoc: '文档还没载入完，算不出健康度。',
    computingHealth: '正在算健康度…',
    onlyReference: '仅参考',
    zeroErrors: '零错误',
    findings: (total: number, shown?: number) => `${total} 项发现${shown ? `（列 ${shown}）` : ''}`,
    noFindings: '无发现',
    omitted: (n: number) => `另有 ${n} 条同类发现未列出（计分已计入）`,
    joinList: '、',
  },
  en: {
    gatePassed: 'Gate',
    pass: 'passed',
    fail: 'failed',
    computedLive: 'Computed live against the current document',
    recomputing: 'Recomputing…',
    notRun: (list: string) => `Not run: ${list}`,
    health: 'Project health',
    canPublish: 'Ready to publish',
    blocked: 'Blocked',
    computing: 'Computing…',
    updatesOnEdit: 'Updates on edits',
    waitingDoc: 'The document has not finished loading — no health readout yet.',
    computingHealth: 'Computing health…',
    onlyReference: 'Ref only',
    zeroErrors: 'No errors',
    findings: (total: number, shown?: number) => `${total} findings${shown ? ` (listing ${shown})` : ''}`,
    noFindings: 'No findings',
    omitted: (n: number) => `${n} more of the same kind not listed (already counted in the score)`,
    joinList: ', ',
  },
} as const;

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
  locale = 'zh',
}: {
  report: HealthReport;
  source?: string;
  healthSource?: HealthSource;
  pending?: boolean;
  seq?: number;
  computeMs?: number;
  locale?: Locale;
}) {
  const c = COPY[locale];
  return (
    <div
      className="hp-root"
      data-health-panel
      data-health-source={healthSource}
      data-health-pending={pending ? '1' : '0'}
      data-health-seq={seq}
      data-health-compute-ms={computeMs === undefined ? undefined : Math.round(computeMs)}
    >
      <p className="hp-summary" data-health-summary>
        {c.gatePassed}{report.passed ? c.pass : c.fail}
        <span className="hp-faint"> · {source ?? c.computedLive}</span>
        {pending ? <span className="hp-faint" data-health-recomputing> · {c.recomputing}</span> : null}
      </p>
      <ul className="hp-ul">
        {report.checks.map((check) => (
          <HealthRow key={check.id} check={check} c={c} />
        ))}
      </ul>
      {report.blockers.length ? (
        <ul className="hp-blockers" data-health-blockers>
          {report.blockers.map((blocker) => (
            <li key={blocker} className="hp-blocker">
              · {blocker}
            </li>
          ))}
        </ul>
      ) : null}
      {report.notRun.length ? (
        <p className="hp-notRun" data-gate-not-run>
          {c.notRun(report.notRun.join(c.joinList))}
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
export function HealthRail({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
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
    <div className="hp-railRoot" data-health-rail data-health-seq={reading?.seq ?? 0}>
      <header className="hp-railHead">
        <h2 className="hp-railTitle">{c.health}</h2>
        {reading ? (
          <span
            className="hp-railTide"
            data-health-rail-state={reading.report.passed ? 'pass' : 'fail'}
          >
            <span className={reading.report.passed ? 'hp-railStatePass' : 'hp-railStateFail'}>
              {reading.report.passed ? c.canPublish : c.blocked}
            </span>
          </span>
        ) : pending ? (
          <span className="hp-railPending" data-health-rail-pending>
            {c.computing}
          </span>
        ) : null}
      </header>
      <div className="hp-railBody">
        {reading ? (
          <HealthPanel
            report={reading.report}
            source={c.updatesOnEdit}
            healthSource={reading.source}
            pending={pending}
            seq={reading.seq}
            computeMs={reading.computeMs}
            locale={locale}
          />
        ) : (
          <p className="hp-railWait" data-health-rail-wait>
            {pending ? c.computingHealth : c.waitingDoc}
          </p>
        )}
      </div>
    </div>
  );
}

type HealthCopy = (typeof COPY)[Locale];

function HealthRow({ check, c }: { check: HealthCheck; c: HealthCopy }) {
  const [expanded, setExpanded] = useState(false);
  // 分数旁边只放"这条线是怎么定的"：≥80 分数线、零错误 = 有 error 就挡、仅参考 = 不参与门禁
  const chip = !check.gating ? c.onlyReference : check.threshold === null ? c.zeroErrors : `≥${check.threshold}`;
  const total = check.findings.length + check.omitted;
  /**
   * §85（第四十三片）：展开键原来只有 `aria-expanded`，没有 `aria-controls`——
   * 读屏用户听到"已折叠/已展开"，却不知道它管的是哪一块。展开列表保持同一条纪律：
   * id 只在列表真的渲染时存在，收起时不留一个指向不存在 id 的引用。
   *
   * 另一件事：零发现的行走原来也是 `<button aria-expanded="false">`，按下去什么都不出现。
   * 一颗说得出"可展开"却永远展不开的键，是给读屏用户的假控件（§159）——这种行改成静态读数。
   */
  const listId = `nexus-health-findings-${check.id}`;
  const summary = (
    <>
      <span
        className={check.state === 'pass' ? 'hp-inkPass' : check.state === 'fail' ? 'hp-inkFail' : 'hp-inkWarn'}
      >
        {STATE_MARK[check.state]}
      </span>
      <span className="hp-label">{check.label}</span>
      <span className="hp-score" data-health-score={check.id}>
        {formatHealthValue(check)}
      </span>
      <span className="hp-chip">
        {chip}
      </span>
      <span className="hp-findings" data-health-findings={check.id}>
        {total ? c.findings(total, check.omitted ? check.findings.length : undefined) : c.noFindings}
      </span>
    </>
  );
  return (
    <li
      className={cn('hp-row', check.state === 'fail' && 'hp-rowFail')}
      data-health-row={check.id}
      data-health-state={check.state}
    >
      {total ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          className="hp-summaryRow"
          data-health-toggle={check.id}
        >
          {summary}
        </button>
      ) : (
        <div className="hp-staticRow" data-health-static={check.id}>
          {summary}
        </div>
      )}
      <p className="hp-basis">{check.basis}</p>
      {check.metrics.length ? (
        <p className="hp-metrics">
          {check.metrics.map((metric) => `${metric.label} ${metric.value}`).join(' · ')}
        </p>
      ) : null}
      {expanded && total ? (
        <ul id={listId} className="hp-findingList" data-health-findings-list={check.id}>
          {check.findings.map((finding, i) => (
            <li key={`${finding.code}-${finding.nodeId ?? finding.path ?? ''}-${i}`} className="hp-finding">
              <span
                className={finding.severity === 'error' ? 'hp-sevError' : finding.severity === 'warning' ? 'hp-sevWarn' : 'hp-sevNeutral'}
              >
                {finding.severity[0]}
              </span>
              {finding.message}
              {finding.suggestion ? <span className="hp-faint"> · {finding.suggestion}</span> : null}
            </li>
          ))}
          {check.omitted ? (
            <li className="hp-omitted" data-health-omitted={check.id}>
              {c.omitted(check.omitted)}
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
