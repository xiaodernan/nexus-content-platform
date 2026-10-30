import Link from 'next/link';
import {
  API_ACCESS_GLOBAL_TOP_N,
  API_ACCESS_GLOBAL_WINDOWS_DAYS,
  listApiAccessGlobal,
  parseApiAccessWindowDays,
} from '@/server/domain/api-tokens';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

/**
 * §188 M8 第三片欠的那格（"这本账只有按人/按枚的视图，没有全局视图也没有导出"）。
 * 与 `/api-tokens` 那一格的分工写在页脚：那边是"我自己名下最近读过什么"，
 * 这边是"全平台谁在扫库、哪一枚凭据是热点"——同一张 `api_access_buckets`，同一本 30 天的账。
 *
 * 窗口走 `?days=1|7|30`（与端点同一份白名单），坏值由端点在门口 400——
 * 页面这侧同样不认（`parseApiAccessWindowDays` 兜成 7 并在链接上重新画选中态）。
 */
export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">访问账（全局）</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">访问账（全局）</h1>
        <p className="mt-2 text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：访问账全局视图只对 role=admin 可见。
        </p>
      </main>
    );
  }

  const query = await searchParams;
  // 坏窗口不跟着坏：页面按 7 天画，真要坏窗口的人打接口会在门口拿到 400
  const days = parseApiAccessWindowDays(query.days ?? null) ?? 7;
  const summary = await listApiAccessGlobal(days);

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-4 px-6 py-10" data-access-admin-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold">访问账（全局）</h1>
          <p className="text-11 text-fg-3" data-access-summary>
            最近 {days} 天：总调用 {summary.totalCalls} · 活跃凭据 {summary.activeTokens} 枚 ·
            涉及主人 {summary.activeOwners} 人（分钟合并，只留 30 天；只有读成功才记）
          </p>
        </div>
        <AdminNav current="access" />
      </header>

      <nav className="flex gap-2 text-11" aria-label="时间窗口">
        {API_ACCESS_GLOBAL_WINDOWS_DAYS.map((option) => (
          <Link
            key={option}
            href={`/admin/access?days=${option}`}
            aria-current={option === days ? 'page' : undefined}
            className={`rounded px-2 py-1 ${option === days ? 'bg-bg-2 text-fg-1' : 'text-fg-3 underline'}`}
            data-access-window={option}
          >
            {option} 天
          </Link>
        ))}
        <span className="ml-auto flex gap-2">
          <a
            href={`/api/admin/access/export?days=${days}&kind=tokens`}
            className="rounded bg-bg-2 px-2 py-1 text-fg-1"
            data-access-export="tokens"
          >
            导出凭据榜 CSV（不截断）
          </a>
          <a
            href={`/api/admin/access/export?days=${days}&kind=endpoints`}
            className="rounded bg-bg-2 px-2 py-1 text-fg-1"
            data-access-export="endpoints"
          >
            导出端点榜 CSV（不截断）
          </a>
        </span>
      </nav>

      <section className="flex flex-col gap-2" data-access-tokens>
        <h2 className="text-[var(--nexus-font-size-16)] font-semibold">
          热点凭据（前 {Math.min(summary.tokens.length, API_ACCESS_GLOBAL_TOP_N)} / 窗口内共 {summary.activeTokens} 枚）
        </h2>
        {summary.tokens.length === 0 ? (
          <p className="text-13 text-fg-2" data-access-tokens-empty>
            这个窗口里没有任何读成功的调用。
          </p>
        ) : (
          <table className="w-full text-11">
            <thead className="text-left text-fg-3">
              <tr>
                <th>凭据</th>
                <th>主人</th>
                <th>调用</th>
                <th>端点数</th>
                <th>项目数</th>
                <th>最后</th>
              </tr>
            </thead>
            <tbody>
              {summary.tokens.map((token) => (
                <tr key={token.tokenId} data-access-token={token.tokenId}>
                  <td>
                    <span className="text-fg-1">{token.tokenName}</span>{' '}
                    <span className="text-fg-3">…{token.tokenHint}</span>
                  </td>
                  <td data-access-token-owner>{token.ownerName}</td>
                  <td data-access-token-calls>{token.calls}</td>
                  <td data-access-token-endpoints>{token.endpoints}</td>
                  <td data-access-token-projects>{token.projects}</td>
                  <td className="text-fg-3">
                    {new Date(token.lastSeen).toLocaleString('zh-CN', { hour12: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-2" data-access-endpoints>
        <h2 className="text-[var(--nexus-font-size-16)] font-semibold">
          热点端点（前 {Math.min(summary.endpoints.length, API_ACCESS_GLOBAL_TOP_N)} / 窗口内共{' '}
          {summary.endpoints.length >= API_ACCESS_GLOBAL_TOP_N ? `${API_ACCESS_GLOBAL_TOP_N}+` : summary.endpoints.length} 个）
        </h2>
        {summary.endpoints.length === 0 ? (
          <p className="text-13 text-fg-2" data-access-endpoints-empty>
            这个窗口里没有任何读成功的调用。
          </p>
        ) : (
          <table className="w-full text-11">
            <thead className="text-left text-fg-3">
              <tr>
                <th>端点</th>
                <th>调用</th>
                <th>凭据数</th>
              </tr>
            </thead>
            <tbody>
              {summary.endpoints.map((row) => (
                <tr key={row.endpoint} data-access-endpoint={row.endpoint}>
                  <td>{row.endpoint}</td>
                  <td data-access-endpoint-calls>{row.calls}</td>
                  <td data-access-endpoint-tokens>{row.tokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-11 text-fg-3" data-access-scope>
        与 <Link href="/api-tokens" className="underline">/api-tokens</Link> 那一格是同一本账的两面：那边是"我自己名下最近读过什么"，
        这边是全平台的"谁在扫库、哪一枚是热点"。计数按分钟合并、只留 30 天；
        一次 401 / 403 不在这里（那是裁决，记在审计里）。榜单显示前 {API_ACCESS_GLOBAL_TOP_N}，导出不截断。
      </p>
    </main>
  );
}
