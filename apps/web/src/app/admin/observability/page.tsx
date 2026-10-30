import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { readLedger } from '@/server/domain/metrics';
import { snapshot } from '@/server/observability';
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
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">观测</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">观测</h1>
        <p className="mt-2 text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：观测只对 role=admin 可见。
        </p>
      </main>
    );
  }

  const metrics = snapshot();
  const ledger = await readLedger(24);

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-5 px-6 py-10" data-observability-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold">观测</h1>
          <p className="text-11 text-fg-3" data-observability-scope>
            进程 {process.pid} · 本实例已运行 {Math.round(process.uptime())} 秒 · Node {process.version}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <AdminNav current="observability" />
          <Link href="/api/admin/metrics?format=text" className="inline-flex min-h-6 items-center rounded px-1 text-11 text-accent-2-ink underline" data-observability-raw>
            原始读数（Prometheus 文本）
          </Link>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-13 font-semibold" data-metric-heading="process">
          进程内计数器（本实例、本次启动；重启清零）
        </h2>
        {metrics.length === 0 ? (
          <p className="text-11 text-fg-3" data-metric-empty>
            这个实例从启动到现在没记到任何一次判定。这不等于平台上什么都没发生——服务刚重启过就是这样，
            跨重启的事实看下面那张库里的账。
          </p>
        ) : (
          <div className="overflow-x-auto" data-metric-table-scroll>
          <table className="w-full text-11">
            <thead className="text-left text-fg-3">
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
                        <td className="font-mono">{metric.name}</td>
                        <td className="font-mono text-fg-3">{Object.entries(s.labels).map(([k, v]) => `${k}=${v}`).join(' ') || '—'}</td>
                        <td>{s.value}</td>
                        <td className="text-fg-3">—</td>
                        <td className="text-fg-3">—</td>
                      </tr>
                    ))
                  : metric.series.map((s) => (
                      <tr key={`${metric.name}|${JSON.stringify(s.labels)}`} data-metric-row={metric.name}>
                        <td className="font-mono">{metric.name}</td>
                        <td className="font-mono text-fg-3">{Object.entries(s.labels).map(([k, v]) => `${k}=${v}`).join(' ') || '—'}</td>
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

      <section className="flex flex-col gap-2">
        <h2 className="text-13 font-semibold" data-ledger-section>
          库里的账（最近 {ledger.windowHours} 小时，跨重启与实例）
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
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
    <div className="flex flex-col gap-1">
      <h3 className="text-11 font-semibold text-fg-2" data-ledger-heading={props.marker}>
        {props.title}
      </h3>
      {props.rows.length === 0 ? (
        <p className="text-11 text-fg-3" data-ledger-empty={props.marker}>
          这个窗口里没有行。
        </p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-11">
          <thead className="text-left text-fg-3">
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
                  <td key={j} className={j === 0 ? 'font-mono' : undefined}>
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
