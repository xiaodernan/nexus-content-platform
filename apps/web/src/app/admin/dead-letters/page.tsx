import Link from 'next/link';
import { BrandTitle } from '@/components/BrandTitle';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { readDeadLettersPage, DEFAULT_LIMIT, MAX_LIMIT } from '@/server/deadLetters';

export const dynamic = 'force-dynamic';

/**
 * v689 死信巡检：毒消息隔离后，运维要有一扇只读的窗口。
 * - 列表只读（LLEN + 有界 LRANGE），不写、不阻塞、不触发 worker。
 * - cursor 分页（base64url {s,e}），分页期间被新 LPUSH 改写 → 409 请刷新（不是错数据）。
 * - 毒条目渲染 malformed 行——不让一行坏 JSON 让整页崩
 * - 导出 = NDJSON 附件（maxItems<=1000），不改 Redis 任何字节
 */
export default async function AdminDeadLettersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[]; limit?: string | string[] }>;
}) {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">死信巡检</h1>
        <p className="adm-deniedText">需要先登录才能看</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">死信巡检</h1>
        <p className="adm-deniedText">死信只对审核员（role=admin）开放</p>
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
              <p className="dl-label">快照读数</p>
              <p className="dl-stat">{result.snapshotSize}</p>
              <p className="dl-meta">nexus:ai:dead 当前条数（LLEN 的回执；不超读一条）</p>
            </div>
            <div className="dl-btnRow">
              <a className="dl-btnSm" href="/api/admin/dead-letters?download=1&maxItems=500" data-dead-letters-export>导出 NDJSON（上界 500）</a>
              <a className="dl-btnPrimary" href="/admin/dead-letters" data-dead-letters-refresh>刷新</a>
            </div>
          </div>
        </section>

        {result.snapshotSize === 0 ? (
          <section className="dl-cardRoomy" data-dead-letters-empty>
            <p className="dl-body14">目前没有死信。这不是“没失败过”，是没有任何毒消息攒够阈值进死信。</p>
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
          <p className="dl-footNote" data-dead-letters-scope>游标分页：每次读一屏最多 {MAX_LIMIT} 条。列表被 LPUSH 改写时要求刷新（tail 相对下标平移）。</p>
          {result.nextCursor ? (
            <Link className="dl-btnSm" href={`/admin/dead-letters?cursor=${encodeURIComponent(result.nextCursor)}`} data-dead-letters-next>下一页（更老）</Link>
          ) : (
            <span className="dl-end">到底了</span>
          )}
        </footer>
      </>
    ) : result.kind === 'unavailable' ? (
      <section className="dl-cardRoomy" data-dead-letters-unavailable>
        <p className="dl-body14">{result.note}</p>
        <p className="dl-meta">设置 NEXUS_REDIS_URL 指向持有 <code>nexus:ai:dead</code> 的那台（默认 nexus-redis:56379），刷新页面。</p>
      </section>
    ) : result.kind === 'invalid-cursor' ? (
      <section className="dl-cardRoomy" data-dead-letters-invalid-cursor>
        <p className="dl-body14">cursor 无法解析或被改写。</p>
        <a className="dl-btnSm" href="/admin/dead-letters" data-dead-letters-retry>回到第一页</a>
      </section>
    ) : result.kind === 'snapshot-stale' ? (
      <section className="dl-cardWarn" data-dead-letters-snapshot-stale>
        <p className="dl-body14">dead 列表被新 LPUSH 改写了：当前 tail 相对下标整体平移，中断分页防止读错数据。</p>
        <a className="dl-btnSm" href="/admin/dead-letters" data-dead-letters-retry>刷新重来</a>
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
          <BrandTitle>死信巡检</BrandTitle>
          <p className="adm-capNote" data-dead-letters-summary>毒消息耗尽重试后隔离于此；看这里的表，不用进 redis-cli。</p>
        </div>
        <AdminNav current="dead-letters" />
      </header>
      {body}
    </main>
  );
}
