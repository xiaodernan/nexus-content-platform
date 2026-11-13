import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { readLedger } from '@/server/domain/metrics';
import { snapshot } from '@/server/observability';
import { getAiCapabilities } from '@/lib/env';
import { AdminNav } from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

/**
 * 观测页（补 `docs/ROADMAP.md` 里"线上发生了什么目前只能靠审计表 + stderr"那一格的读侧）。
 *
 * 两张表**故意不合并**：
 * - 上半是进程内计数器——只有本实例、只有这次启动以来的数，重启就清零。
 *   页面空着不等于平台上什么都没发生，很可能只是这里刚重启过，所以这一句要印在屏幕上而不是只写在代码注释里。
 * - 下半是库里的三本账（审计决定 / 任务终态与时长 / 凭据用量），跨重启、跨实例，但只有已经有写入方的那三张表。
 *
 * 与 `/admin/*` 其余几张同一口径：没登录与不是 admin 都只说一句拒绝，不外泄表里有多少行。
 */
export default async function AdminObservabilityPage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">观测</h1>
        <p className="adm-deniedText">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">观测</h1>
        <p className="adm-deniedText">
          这个页面对 {user.displayName}（role={user.role}）不开放：观测只对 role=admin 可见。
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
          <h1 className="adm-deniedTitle">观测</h1>
          <p className="adm-capNote" data-observability-scope>
            进程 {process.pid} · 本实例已运行 {Math.round(process.uptime())} 秒 · Node {process.version}
          </p>
        </div>
        <div className="am-headRowTight">
          <AdminNav current="observability" />
          <Link href="/api/admin/metrics?format=text" className="am-linkImplicit" data-observability-raw>
            原始读数（Prometheus 文本）
          </Link>
        </div>
      </header>

      <section className="am-audit" data-ai-readiness-section>
        <h2 className="am-sectionHeadSm" data-ai-readiness-heading>
          AI 就绪 · 这次渲染问 /healthz 的回答
        </h2>
        <p className="adm-capNote">
          每次渲染都现问 /healthz——能力不是猜测、不是缓存、任何模型只要没真接就不报 real。
          DEMO 表示该类暂无真实 provider；留空表示未填，我们就明说（不静默挂 DEMO 标）。图像和视频目前也没有真实
          provider——它们因此读 DEMO。某个能力只有在 ai-service 自己报 real 时才显示 real——永远不比 ai-service 知道的更乐观。
        </p>
        <table className="am-tableNarrow">
          <thead className="tl-thRow">
            <tr>
              <th>面</th>
              <th>读数</th>
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
          进程内计数器（本实例、本次启动；重启清零）
        </h2>
        {metrics.length === 0 ? (
          <p className="adm-capNote" data-metric-empty>
            这个实例从启动到现在没记到任何一次判定。这不等于平台上什么都没发生——服务刚重启过就是这样，
            跨重启的事实看下面那张库里的账。
          </p>
        ) : (
          // 第五十一片：与审计表同一形状——横滚区没有 tabindex（axe: scrollable-region-focusable）
          <div
            className="tl-tableScroll"
            data-metric-table-scroll
            role="region"
            aria-label="进程内计数器表（可横向滚动）"
            tabIndex={0}
          >
          <table className="am-tableNarrow">
            <thead className="tl-thRow">
              <tr>
                <th>指标</th>
                <th>标签</th>
                <th>次数</th>
                <th>合计</th>
                <th>均值</th>
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
          库里的账（最近 {ledger.windowHours} 小时，跨重启与实例）
        </h2>
        <div className="am-ledgerGrid">
          <LedgerTable
            title="审计决定"
            head={['动作', '结果', '条数']}
            rows={ledger.audit.map((r) => [r.action, r.allowed ? '放行' : '拒绝', String(r.n)])}
            marker="audit"
          />
          <LedgerTable
            title="生成任务"
            head={['状态', '能力', '条数', '均耗时']}
            rows={ledger.tasks.map((r) => [r.status, r.capability ?? '—', String(r.n), r.avgMs === null ? '—' : `${r.avgMs.toFixed(0)} ms`])}
            marker="tasks"
          />
          <LedgerTable
            title="凭据用量"
            head={['端点', '调用数']}
            rows={ledger.apiCalls.map((r) => [r.endpoint, String(r.calls)])}
            marker="api"
          />
        </div>
      </section>
    </main>
  );
}

function LedgerTable(props: { title: string; head: string[]; rows: string[][]; marker: string }) {
  return (
    <div className="am-stack">
      <h3 className="am-ledgerTitle" data-ledger-heading={props.marker}>
        {props.title}
      </h3>
      {props.rows.length === 0 ? (
        <p className="adm-capNote" data-ledger-empty={props.marker}>
          这个窗口里没有行。
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
