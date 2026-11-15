import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { readLedger } from '@/server/domain/metrics';
import { snapshot } from '@/server/observability';
import { getAiCapabilities } from '@/lib/env';
import { AdminNav } from '@/components/AdminNav';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  rawText: string;
  uptimeNote: (pid: number, uptimeSeconds: number, version: string) => string;
  aiReadinessTitle: string;
  aiReadinessNote: string;
  aiColFace: string;
  aiColReadout: string;
  processTitle: string;
  processEmpty: string;
  processTableAria: string;
  processColMetric: string;
  processColLabels: string;
  processColCount: string;
  processColSum: string;
  processColAvg: string;
  ledgerTitle: (hours: number) => string;
  ledgerAuditTitle: string;
  ledgerTasksTitle: string;
  ledgerApiTitle: string;
  ledgerAuditHead: [string, string, string];
  ledgerTasksHead: [string, string, string, string];
  ledgerApiHead: [string, string];
  allowed: string;
  denied: string;
  ledgerEmpty: string;
}> = {
  zh: {
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：观测只对 role=admin 可见。`,
    title: '观测',
    rawText: '原始读数（Prometheus 文本）',
    uptimeNote: (pid, uptimeSeconds, version) => `进程 ${pid} · 本实例已运行 ${uptimeSeconds} 秒 · Node ${version}`,
    aiReadinessTitle: 'AI 就绪 · 这次渲染问 /healthz 的回答',
    aiReadinessNote: '每次渲染都现问 /healthz——能力不是猜测、不是缓存、任何模型只要没真接就不报 real。DEMO 表示该类暂无真实 provider；留空表示未填，我们就明说（不静默挂 DEMO 标）。图像和视频目前也没有真实 provider——它们因此读 DEMO。某个能力只有在 ai-service 自己报 real 时才显示 real——永远不比 ai-service 知道的更乐观。',
    aiColFace: '面',
    aiColReadout: '读数',
    processTitle: '进程内计数器（本实例、本次启动；重启清零）',
    processEmpty: '这个实例从启动到现在没记到任何一次判定。这不等于平台上什么都没发生——服务刚重启过就是这样，跨重启的事实看下面那张库里的账。',
    processTableAria: '进程内计数器表（可横向滚动）',
    processColMetric: '指标',
    processColLabels: '标签',
    processColCount: '次数',
    processColSum: '合计',
    processColAvg: '均值',
    ledgerTitle: (hours) => `库里的账（最近 ${hours} 小时，跨重启与实例）`,
    ledgerAuditTitle: '审计决定',
    ledgerTasksTitle: '生成任务',
    ledgerApiTitle: '凭据用量',
    ledgerAuditHead: ['动作', '结果', '条数'],
    ledgerTasksHead: ['状态', '能力', '条数', '均耗时'],
    ledgerApiHead: ['端点', '调用数'],
    allowed: '放行',
    denied: '拒绝',
    ledgerEmpty: '这个窗口里没有行。',
  },
  en: {
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): observability is visible only to role=admin.`,
    title: 'Observability',
    rawText: 'Raw reads (Prometheus text)',
    uptimeNote: (pid, uptimeSeconds, version) => `pid ${pid} · up ${uptimeSeconds}s · Node ${version}`,
    aiReadinessTitle: 'AI readiness · this render asked /healthz',
    aiReadinessNote: 'Every render asks /healthz live — capability is never guessed, never cached, and nothing reports real unless the model is really wired. DEMO means no real provider in that lane yet; empty stays empty and says so (no silent DEMO badge). Image and video have no real provider right now, so they read DEMO. A capability shows real only when ai-service itself reports real — never more optimistic than ai-service knows.',
    aiColFace: 'Face',
    aiColReadout: 'Readout',
    processTitle: 'In-process counters (this instance, since boot; cleared on restart)',
    processEmpty: 'Nothing has been recorded on this instance since boot. That does not mean nothing happened on the platform — a fresh restart looks exactly like this; for cross-restart facts, see the ledger below.',
    processTableAria: 'In-process counters table (horizontally scrollable)',
    processColMetric: 'Metric',
    processColLabels: 'Labels',
    processColCount: 'Count',
    processColSum: 'Sum',
    processColAvg: 'Avg',
    ledgerTitle: (hours) => `The ledger (last ${hours} h, across restarts and instances)`,
    ledgerAuditTitle: 'Audit decisions',
    ledgerTasksTitle: 'Generation tasks',
    ledgerApiTitle: 'Token usage',
    ledgerAuditHead: ['Action', 'Result', 'Rows'],
    ledgerTasksHead: ['Status', 'Capability', 'Rows', 'Avg'],
    ledgerApiHead: ['Endpoint', 'Calls'],
    allowed: 'Allowed',
    denied: 'Denied',
    ledgerEmpty: 'No rows in this window.',
  },
};

/**
 * 观测页（补 `docs/ROADMAP.md` 里"线上发生了什么目前只能靠审计表 + stderr"那一格的读侧）。
 *
 * 两张表**故意不合并**：
 * - 上半是进程内计数器——只有本实例、只有这次启动以来的数，重启就清零。
 *   页面空着不等于平台上什么都没发生，很可能只是这里刚重启过，所以这一句要印在屏幕上而不是只写在代码注释里。
 * - 下半是库里的三本账（审计决定 / 任务终态与时长 / 凭据用量），跨重启、跨实例，但只有已经有写入方的那三张表。
 *
 * 与 `/admin/*` 其余几张同一口径：没登录与不是 admin 都只说一句拒绝，不外泄表里有多少行。
 *
 * v768：双语（getLocale）。
 */
export default async function AdminObservabilityPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">
          {c.deniedNotAdmin(user.displayName, user.role)}
        </p>
      </main>
    );
  }

  const metrics = snapshot();
  const ledger = await readLedger(24);
  const aiReadiness = await getAiCapabilities();

  return (
    <main className="am-shellGapXl" data-observability-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <p className="adm-capNote" data-observability-scope>
            {c.uptimeNote(process.pid, Math.round(process.uptime()), process.version)}
          </p>
        </div>
        <div className="am-headRowTight">
          <AdminNav current="observability" />
          <Link href="/api/admin/metrics?format=text" className="am-linkImplicit" data-observability-raw>
            {c.rawText}
          </Link>
        </div>
      </header>

      <section className="am-audit" data-ai-readiness-section>
        <h2 className="am-sectionHeadSm" data-ai-readiness-heading>
          {c.aiReadinessTitle}
        </h2>
        <p className="adm-capNote">
          {c.aiReadinessNote}
        </p>
        <table className="am-tableNarrow">
          <thead className="tl-thRow">
            <tr>
              <th>{c.aiColFace}</th>
              <th>{c.aiColReadout}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="am-monoCell">text path</td><td data-ai-readiness-text={aiReadiness.text}>{aiReadiness.text}</td></tr>
            <tr><td className="am-monoCell">image path</td><td data-ai-readiness-image={aiReadiness.image}>{aiReadiness.image}</td></tr>
            <tr><td className="am-monoCell">video path</td><td data-ai-readiness-video={aiReadiness.video}>{aiReadiness.video}</td></tr>
            <tr><td className="am-monoCell">live capability</td><td data-ai-readiness-live={aiReadiness.live ? 'true' : 'false'}>{aiReadiness.live ? 'real' : 'not real'}</td></tr>
            <tr><td className="am-monoCell">cache backend</td><td data-ai-readiness-cache-backend={aiReadiness.cache?.backend ?? 'unavailable'}>{aiReadiness.cache?.backend ?? 'unavailable'}</td></tr>
            <tr>
              <td className="am-monoCell">cache hits / misses</td>
              <td data-ai-readiness-cache-hits={aiReadiness.cache?.hits ?? -1} data-ai-readiness-cache-misses={aiReadiness.cache?.misses ?? -1}>
                {aiReadiness.cache ? `${aiReadiness.cache.hits} / ${aiReadiness.cache.misses}` : '—'}
              </td>
            </tr>
            <tr>
              <td className="am-monoCell">cache hit rate</td>
              <td data-ai-readiness-cache-hitrate={aiReadiness.cache?.hit_rate ?? -1}>
                {aiReadiness.cache ? `${Math.round(aiReadiness.cache.hit_rate * 100)}%` : '—'}
              </td>
            </tr>
            <tr>
              <td className="am-monoCell">cache status</td>
              <td data-ai-readiness-cache-status={aiReadiness.cache ? (aiReadiness.cache.degraded ? 'degraded' : 'healthy') : 'disabled'}>
                {aiReadiness.cache ? (aiReadiness.cache.degraded ? 'degraded' : 'healthy') : 'disabled'}
              </td>
            </tr>
            <tr>
              <td className="am-monoCell">llm calls / errors</td>
              <td data-ai-readiness-llm-calls={aiReadiness.latency?.calls ?? -1} data-ai-readiness-llm-errors={aiReadiness.latency?.errors ?? -1}>
                {aiReadiness.latency ? `${aiReadiness.latency.calls} / ${aiReadiness.latency.errors}` : '—'}
              </td>
            </tr>
            <tr>
              <td className="am-monoCell">llm latency p50 / p95</td>
              <td data-ai-readiness-llm-p50={aiReadiness.latency?.p50_ms ?? -1} data-ai-readiness-llm-p95={aiReadiness.latency?.p95_ms ?? -1}>
                {aiReadiness.latency ? `${Math.round(aiReadiness.latency.p50_ms)} ms / ${Math.round(aiReadiness.latency.p95_ms)} ms` : '—'}
              </td>
            </tr>
            <tr>
              <td className="am-monoCell">single-flight mode</td>
              <td data-ai-readiness-flight-mode={aiReadiness.flight?.mode ?? 'disabled'}>
                {aiReadiness.flight?.mode ?? 'disabled'}
              </td>
            </tr>
            <tr>
              <td className="am-monoCell">coalesced local / cross-process</td>
              <td data-ai-readiness-flight-local-coalesced={aiReadiness.flight?.local?.coalesced ?? -1} data-ai-readiness-flight-distributed-coalesced={aiReadiness.flight?.distributed?.coalesced ?? -1}>
                {aiReadiness.flight
                  ? `${aiReadiness.flight.local?.coalesced ?? 0} / ${aiReadiness.flight.distributed?.coalesced ?? '—'}`
                  : '— / —'}
              </td>
            </tr>
            <tr>
              <td className="am-monoCell">provider calls (this process)</td>
              <td data-ai-readiness-flight-provider-calls={aiReadiness.flight?.provider_calls ?? -1}>
                {aiReadiness.flight ? aiReadiness.flight.provider_calls : '—'}
              </td>
            </tr>
            <tr>
              <td className="am-monoCell">timeouts / lock failures</td>
              <td data-ai-readiness-flight-timeouts={aiReadiness.flight?.local?.timeouts ?? -1} data-ai-readiness-flight-lock-failures={aiReadiness.flight?.distributed?.lock_failures ?? -1}>
                {aiReadiness.flight
                  ? `${aiReadiness.flight.local?.timeouts ?? 0} / ${aiReadiness.flight.distributed?.lock_failures ?? '—'}`
                  : '— / —'}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="am-audit">
        <h2 className="am-sectionHeadSm" data-metric-heading="process">
          {c.processTitle}
        </h2>
        {metrics.length === 0 ? (
          <p className="adm-capNote" data-metric-empty>
            {c.processEmpty}
          </p>
        ) : (
          // 第五十一片：与审计表同一形状——横滚区没有 tabindex（axe: scrollable-region-focusable）
          <div
            className="tl-tableScroll"
            data-metric-table-scroll
            role="region"
            aria-label={c.processTableAria}
            tabIndex={0}
          >
          <table className="am-tableNarrow">
            <thead className="tl-thRow">
              <tr>
                <th>{c.processColMetric}</th>
                <th>{c.processColLabels}</th>
                <th>{c.processColCount}</th>
                <th>{c.processColSum}</th>
                <th>{c.processColAvg}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) =>
                metric.kind === 'counter'
                  ? metric.series.map((s) => (
                      <tr key={`${metric.name}|${JSON.stringify(s.labels)}`} data-metric-row={metric.name}>
                        <td className="am-monoCell">{metric.name}</td>
                        <td className="am-monoMuted">{Object.entries(s.labels).map(([k, v]) => `${k}=${v}`).join(' ') || '—'}</td>
                        <td>{s.value}</td>
                        <td className="am-note">—</td>
                        <td className="am-note">—</td>
                      </tr>
                    ))
                  : metric.series.map((s) => (
                      <tr key={`${metric.name}|${JSON.stringify(s.labels)}`} data-metric-row={metric.name}>
                        <td className="am-monoCell">{metric.name}</td>
                        <td className="am-monoMuted">{Object.entries(s.labels).map(([k, v]) => `${k}=${v}`).join(' ') || '—'}</td>
                        <td>{s.count}</td>
                        <td>{s.sum.toFixed(0)} ms</td>
                        <td>{s.count ? `${(s.sum / s.count).toFixed(0)} ms` : '—'}</td>
                      </tr>
                    )),
              )}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section className="am-audit">
        <h2 className="am-sectionHeadSm" data-ledger-section>
          {c.ledgerTitle(ledger.windowHours)}
        </h2>
        <div className="am-ledgerGrid">
          <LedgerTable
            title={c.ledgerAuditTitle}
            head={c.ledgerAuditHead}
            rows={ledger.audit.map((r) => [r.action, r.allowed ? c.allowed : c.denied, String(r.n)])}
            marker="audit"
            emptyLabel={c.ledgerEmpty}
          />
          <LedgerTable
            title={c.ledgerTasksTitle}
            head={c.ledgerTasksHead}
            rows={ledger.tasks.map((r) => [r.status, r.capability ?? '—', String(r.n), r.avgMs === null ? '—' : `${r.avgMs.toFixed(0)} ms`])}
            marker="tasks"
            emptyLabel={c.ledgerEmpty}
          />
          <LedgerTable
            title={c.ledgerApiTitle}
            head={c.ledgerApiHead}
            rows={ledger.apiCalls.map((r) => [r.endpoint, String(r.calls)])}
            marker="api"
            emptyLabel={c.ledgerEmpty}
          />
        </div>
      </section>
    </main>
  );
}

function LedgerTable(props: { title: string; head: readonly string[]; rows: string[][]; marker: string; emptyLabel: string }) {
  return (
    <div className="am-stack">
      <h3 className="am-ledgerTitle" data-ledger-heading={props.marker}>
        {props.title}
      </h3>
      {props.rows.length === 0 ? (
        <p className="adm-capNote" data-ledger-empty={props.marker}>
          {props.emptyLabel}
        </p>
      ) : (
        <div className="tl-tableScroll">
        <table className="tl-table">
          <thead className="tl-thRow">
            <tr>
              {props.head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, i) => (
              <tr key={`${props.marker}-${i}`} data-ledger-row={props.marker}>
                {row.map((cell, j) => (
                  <td key={j} className={j === 0 ? 'am-monoCell' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
