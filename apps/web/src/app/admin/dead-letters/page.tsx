import Link from 'next/link';
import { BrandTitle } from '@/components/BrandTitle';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { readDeadLettersPage, DEFAULT_LIMIT, MAX_LIMIT } from '@/server/deadLetters';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * v689 死信巡检：毒消息隔离后，运维要有一扇只读的窗口。
 * - 列表只读（LLEN + 有界 LRANGE），不写、不阻塞、不触发 worker。
 * - cursor 分页（base64url {s,e}），分页期间被新 LPUSH 改写 → 409 请刷新（不是错数据）。
 * - 毒条目渲染 malformed 行——不让一行坏 JSON 让整页崩
 * - 导出 = NDJSON 附件（maxItems<=1000），不改 Redis 任何字节
 *
 * v762：双语（getLocale）；远端裁定的 note（result.note）原文透传（§46 独立切片）。
 */
const COPY: Record<Locale, {
  deniedTitle: string;
  deniedAnonymous: string;
  deniedNotAdmin: string;
  title: string;
  capNote: string;
  snapshotLabel: string;
  snapshotMeta: string;
  exportLabel: string;
  refreshLabel: string;
  empty: string;
  footNote: (n: number) => string;
  nextPage: string;
  endOfList: string;
  unavailableMeta: string;
  invalidCursor: string;
  backToFirst: string;
  snapshotStale: string;
  refreshRetry: string;
}> = {
  zh: {
    deniedTitle: '死信巡检',
    deniedAnonymous: '需要先登录才能看',
    deniedNotAdmin: '死信只对审核员（role=admin）开放',
    title: '死信巡检',
    capNote: '毒消息耗尽重试后隔离于此；看这里的表，不用进 redis-cli。',
    snapshotLabel: '快照读数',
    snapshotMeta: 'nexus:ai:dead 当前条数（LLEN 的回执；不超读一条）',
    exportLabel: '导出 NDJSON（上界 500）',
    refreshLabel: '刷新',
    empty: '目前没有死信。这不是“没失败过”，是没有任何毒消息攒够阈值进死信。',
    footNote: (n: number) => `游标分页：每次读一屏最多 ${n} 条。列表被 LPUSH 改写时要求刷新（tail 相对下标平移）。`,
    nextPage: '下一页（更老）',
    endOfList: '到底了',
    unavailableMeta: '设置 NEXUS_REDIS_URL 指向持有 nexus:ai:dead 的那台（默认 nexus-redis:56379），刷新页面。',
    invalidCursor: 'cursor 无法解析或被改写。',
    backToFirst: '回到第一页',
    snapshotStale: 'dead 列表被新 LPUSH 改写了：当前 tail 相对下标整体平移，中断分页防止读错数据。',
    refreshRetry: '刷新重来',
  },
  en: {
    deniedTitle: 'Dead letters',
    deniedAnonymous: 'You must sign in first',
    deniedNotAdmin: 'Dead letters are visible only to admins (role=admin)',
    title: 'Dead letters',
    capNote: 'Poison messages land here after retries run out; read the ledger instead of a redis-cli.',
    snapshotLabel: 'Snapshot depth',
    snapshotMeta: 'current entries in nexus:ai:dead (an LLEN receipt; nothing beyond one read)',
    exportLabel: 'Export NDJSON (cap 500)',
    refreshLabel: 'Refresh',
    empty: 'No dead letters yet. That does not mean nothing ever failed — it means no poison message has backed up to the dead-letter threshold.',
    footNote: (n: number) => `Cursor paging: at most ${n} entries per screen. If the list is rewritten by an LPUSH, refresh is required (tail indices shift).`,
    nextPage: 'Next page (older)',
    endOfList: 'End of list',
    unavailableMeta: 'Point NEXUS_REDIS_URL at the host holding nexus:ai:dead (default nexus-redis:56379), then refresh.',
    invalidCursor: 'The cursor cannot be parsed or was rewritten.',
    backToFirst: 'Back to page one',
    snapshotStale: 'The dead-letter list was rewritten by a fresh LPUSH: relative indices in the tail shifted, paging stopped to avoid reading stale data.',
    refreshRetry: 'Refresh and restart',
  },
};

export default async function AdminDeadLettersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[]; limit?: string | string[] }>;
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
        <p className="adm-deniedText">{c.deniedNotAdmin}</p>
      </main>
    );
  }

  const sp = await searchParams;
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : null;
  const limit = typeof sp.limit === 'string' ? sp.limit : undefined;
  const result = await readDeadLettersPage({ cursor, limit: limit === undefined ? DEFAULT_LIMIT : Number(limit) });

  const body =
    result.kind === 'ok' ? (
      <>
        <section className="dl-card" data-dead-letters-summary>
          <div className="dl-summaryRow">
            <div>
              <p className="dl-label">{c.snapshotLabel}</p>
              <p className="dl-stat">{result.snapshotSize}</p>
              <p className="dl-meta">{c.snapshotMeta}</p>
            </div>
            <div className="dl-btnRow">
              <a className="dl-btnSm" href="/api/admin/dead-letters?download=1&maxItems=500" data-dead-letters-export>{c.exportLabel}</a>
              <a className="dl-btnPrimary" href="/admin/dead-letters" data-dead-letters-refresh>{c.refreshLabel}</a>
            </div>
          </div>
        </section>

        {result.snapshotSize === 0 ? (
          <section className="dl-cardRoomy" data-dead-letters-empty>
            <p className="dl-body14">{c.empty}</p>
          </section>
        ) : (
          <ol className="dl-list" data-dead-letters-list>
            {result.entries.map((e, i) => (
              <li key={`${e.job.jobId ?? 'n/a'}-${i}`} className="dl-item" data-dead-letters-item>
                <div className="dl-itemTop">
                  <p className="dl-jobId">{e.job.jobId ?? '(unknown-job)'}</p>
                  <p className="dl-attempts">attempts={e.attempts} · {e.job.queuedAt ?? 'time n/a'}</p>
                </div>
                <p className="dl-reason">{e.reason}</p>
                <p className="dl-jobMeta">job={e.job.requestId ?? 'n/a'} · backend={e.job.backend ?? 'n/a'} · status={e.job.status ?? 'late-failed'}</p>
              </li>
            ))}
          </ol>
        )}

        <footer className="dl-foot">
          <p className="dl-footNote" data-dead-letters-scope>{c.footNote(MAX_LIMIT)}</p>
          {result.nextCursor ? (
            <Link className="dl-btnSm" href={`/admin/dead-letters?cursor=${encodeURIComponent(result.nextCursor)}`} data-dead-letters-next>{c.nextPage}</Link>
          ) : (
            <span className="dl-end">{c.endOfList}</span>
          )}
        </footer>
      </>
    ) : result.kind === 'unavailable' ? (
      <section className="dl-cardRoomy" data-dead-letters-unavailable>
        <p className="dl-body14">{result.note}</p>
        <p className="dl-meta">{c.unavailableMeta}</p>
      </section>
    ) : result.kind === 'invalid-cursor' ? (
      <section className="dl-cardRoomy" data-dead-letters-invalid-cursor>
        <p className="dl-body14">{c.invalidCursor}</p>
        <a className="dl-btnSm" href="/admin/dead-letters" data-dead-letters-retry>{c.backToFirst}</a>
      </section>
    ) : result.kind === 'snapshot-stale' ? (
      <section className="dl-cardWarn" data-dead-letters-snapshot-stale>
        <p className="dl-body14">{c.snapshotStale}</p>
        <a className="dl-btnSm" href="/admin/dead-letters" data-dead-letters-retry>{c.refreshRetry}</a>
      </section>
    ) : (
      <section className="dl-cardRoomy" data-dead-letters-error>
        <p className="dl-body14">{result.note}</p>
      </section>
    );

  return (
    <main className="am-shellGapXl" data-dead-letters-admin-root>
      <header className="adm-headBaseline">
        <div>
          <BrandTitle>{c.title}</BrandTitle>
          <p className="adm-capNote" data-dead-letters-summary>{c.capNote}</p>
        </div>
        <AdminNav current="dead-letters" />
      </header>
      {body}
    </main>
  );
}
