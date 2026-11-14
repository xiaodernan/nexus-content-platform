import Link from 'next/link';
import {
  API_ACCESS_GLOBAL_TOP_N,
  API_ACCESS_GLOBAL_WINDOWS_DAYS,
  listApiAccessGlobal,
  parseApiAccessWindowDays,
} from '@/server/domain/api-tokens';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  deniedTitle: string;
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  summary: (days: number, totalCalls: number, activeTokens: number, activeOwners: number) => string;
  windowAria: string;
  daysUnit: string;
  exportTokens: string;
  exportEndpoints: string;
  tokensTitle: (shown: number, total: number) => string;
  endpointsTitle: (shown: number, total: number | string) => string;
  empty: string;
  colToken: string;
  colOwner: string;
  colCalls: string;
  colEndpoints: string;
  colProjects: string;
  colLast: string;
  colEndpoint: string;
  colCreds: string;
  scope: string;
}> = {
  zh: {
    deniedTitle: '访问账（全局）',
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：访问账全局视图只对 role=admin 可见。`,
    title: '访问账（全局）',
    summary: (days, totalCalls, activeTokens, activeOwners) => `最近 ${days} 天：总调用 ${totalCalls} · 活跃凭据 ${activeTokens} 枚 · 涉及主人 ${activeOwners} 人（分钟合并，只留 30 天；只有读成功才记）`,
    windowAria: '时间窗口',
    daysUnit: ' 天',
    exportTokens: '导出凭据榜 CSV（不截断）',
    exportEndpoints: '导出端点榜 CSV（不截断）',
    tokensTitle: (shown, total) => `热点凭据（前 ${shown} / 窗口内共 ${total} 枚）`,
    endpointsTitle: (shown, total) => `热点端点（前 ${shown} / 窗口内共 ${total} 个）`,
    empty: '这个窗口里没有任何读成功的调用。',
    colToken: '凭据',
    colOwner: '主人',
    colCalls: '调用',
    colEndpoints: '端点数',
    colProjects: '项目数',
    colLast: '最后',
    colEndpoint: '端点',
    colCreds: '凭据数',
    scope: '与 /api-tokens 那一格是同一本账的两面：那边是"我自己名下最近读过什么"，这边是全平台的"谁在扫库、哪一枚是热点"。计数按分钟合并、只留 30 天；一次 401 / 403 不在这里（那是裁决，记在审计里）。榜单显示前',
  },
  en: {
    deniedTitle: 'Access ledger (global)',
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): the global access ledger is visible only to role=admin.`,
    title: 'Access ledger (global)',
    summary: (days, totalCalls, activeTokens, activeOwners) => `Last ${days} days: ${totalCalls} calls · ${activeTokens} active tokens · ${activeOwners} owners (minute-merged, kept 30 days; only successful reads are counted)`,
    windowAria: 'Time window',
    daysUnit: ' d',
    exportTokens: 'Export token list (CSV, untruncated)',
    exportEndpoints: 'Export endpoint list (CSV, untruncated)',
    tokensTitle: (shown, total) => `Hot tokens (top ${shown} / ${total} in window)`,
    endpointsTitle: (shown, total) => `Hot endpoints (top ${shown} / ${total} in window)`,
    empty: 'No successful reads in this window.',
    colToken: 'Token',
    colOwner: 'Owner',
    colCalls: 'Calls',
    colEndpoints: 'Endpoints',
    colProjects: 'Projects',
    colLast: 'Last',
    colEndpoint: 'Endpoint',
    colCreds: 'Tokens',
    scope: 'This is the other face of the /api-tokens page — one ledger, two views: yours shows “what this account read lately”, this shows “who is sweeping the whole platform, which token is the hotspot”. Counts merge by minute and keep 30 days; a 401/403 is not counted here (that is a verdict — it lives in the audit ledger). The lists show the top',
  },
};

/**
 * §188 M8 第三片欠的那格（"这本账只有按人/按枚的视图，没有全局视图也没有导出"）。
 * 与 `/api-tokens` 那一格的分工写在页脚：那边是"我自己名下最近读过什么"，
 * 这边是"全平台谁在扫库、哪一枚凭据是热点"——同一张 `api_access_buckets`，同一本 30 天的账。
 *
 * 窗口走 `?days=1|7|30`（与端点同一份白名单），坏值由端点在门口 400——
 * 页面这侧同样不认（`parseApiAccessWindowDays` 兜成 7 并在链接上重新画选中态）。
 *
 * v768：双语（getLocale）。
 */
export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.deniedTitle}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.deniedTitle}</h1>
        <p className="adm-deniedText">
          {c.deniedNotAdmin(user.displayName, user.role)}
        </p>
      </main>
    );
  }

  const query = await searchParams;
  // 坏窗口不跟着坏：页面按 7 天画，真要坏窗口的人打接口会在门口拿到 400
  const days = parseApiAccessWindowDays(query.days ?? null) ?? 7;
  const summary = await listApiAccessGlobal(days);

  return (
    <main className="am-shellWide" data-access-admin-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <p className="adm-capNote" data-access-summary>
            {c.summary(days, summary.totalCalls, summary.activeTokens, summary.activeOwners)}
          </p>
        </div>
        <AdminNav current="access" />
      </header>

      <nav className="am-windowNav" aria-label={c.windowAria}>
        {API_ACCESS_GLOBAL_WINDOWS_DAYS.map((option) => (
          <Link
            key={option}
            href={`/admin/access?days=${option}`}
            aria-current={option === days ? 'page' : undefined}
            className={option === days ? 'am-windowChipActive' : 'am-windowChipIdle'}
            data-access-window={option}
          >
            {option}{c.daysUnit}
          </Link>
        ))}
        <span className="am-windowNavPush">
          <a
            href={`/api/admin/access/export?days=${days}&kind=tokens`}
            className="am-btn"
            data-access-export="tokens"
          >
            {c.exportTokens}
          </a>
          <a
            href={`/api/admin/access/export?days=${days}&kind=endpoints`}
            className="am-btn"
            data-access-export="endpoints"
          >
            {c.exportEndpoints}
          </a>
        </span>
      </nav>

      <section className="am-audit" data-access-tokens>
        <h2 className="am-auditTitle">
          {c.tokensTitle(Math.min(summary.tokens.length, API_ACCESS_GLOBAL_TOP_N), summary.activeTokens)}
        </h2>
        {summary.tokens.length === 0 ? (
          <p className="am-empty" data-access-tokens-empty>
            {c.empty}
          </p>
        ) : (
          <table className="tl-table">
            <thead className="tl-thRow">
              <tr>
                <th>{c.colToken}</th>
                <th>{c.colOwner}</th>
                <th>{c.colCalls}</th>
                <th>{c.colEndpoints}</th>
                <th>{c.colProjects}</th>
                <th>{c.colLast}</th>
              </tr>
            </thead>
            <tbody>
              {summary.tokens.map((token) => (
                <tr key={token.tokenId} data-access-token={token.tokenId}>
                  <td>
                    <span className="am-strongText">{token.tokenName}</span>{' '}
                    <span className="am-mutedText">…{token.tokenHint}</span>
                  </td>
                  <td data-access-token-owner>{token.ownerName}</td>
                  <td data-access-token-calls>{token.calls}</td>
                  <td data-access-token-endpoints>{token.endpoints}</td>
                  <td data-access-token-projects>{token.projects}</td>
                  <td className="am-note">
                    {new Date(token.lastSeen).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="am-audit" data-access-endpoints>
        <h2 className="am-auditTitle">
          {c.endpointsTitle(Math.min(summary.endpoints.length, API_ACCESS_GLOBAL_TOP_N), summary.endpoints.length >= API_ACCESS_GLOBAL_TOP_N ? `${API_ACCESS_GLOBAL_TOP_N}+` : summary.endpoints.length)}
        </h2>
        {summary.endpoints.length === 0 ? (
          <p className="am-empty" data-access-endpoints-empty>
            {c.empty}
          </p>
        ) : (
          <table className="tl-table">
            <thead className="tl-thRow">
              <tr>
                <th>{c.colEndpoint}</th>
                <th>{c.colCalls}</th>
                <th>{c.colCreds}</th>
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

      <p className="adm-capNote" data-access-scope>
        {c.scope} {API_ACCESS_GLOBAL_TOP_N}{locale === 'en' ? '. Exports are not truncated.' : '。导出不截断。'}
      </p>
    </main>
  );
}
