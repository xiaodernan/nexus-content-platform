import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { readDeadLettersPage, DEFAULT_LIMIT, MAX_LIMIT } from '@/server/deadLetters';
import { BrandTitle } from '@/components/BrandTitle';

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
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">死信巡检</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">死信巡检</h1>
        <p className="mt-2 text-13 text-fg-2">死信只对审核员（role=admin）开放</p>
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
        <section className="rounded-xl border border-border-subtle bg-bg-1 p-4" data-dead-letters-summary>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-11 uppercase tracking-wide text-fg-3">快照读数</p>
              <p className="text-24 font-semibold tabular-nums">{result.snapshotSize}</p>
              <p className="text-11 text-fg-3">nexus:ai:dead 当前条数（LLEN 的回执；不超读一条）</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="rounded-md border border-border-subtle px-3 py-1 text-12 hover:bg-bg-2" href="/api/admin/dead-letters?download=1&maxItems=500" data-dead-letters-export>导出 NDJSON（上界 500）</a>
              <a className="rounded-md bg-[var(--nexus-color-brand)] px-3 py-1 text-12 font-semibold text-[var(--nexus-color-accent-fg)]" href="/admin/dead-letters" data-dead-letters-refresh>刷新</a>
            </div>
          </div>
        </section>

        {result.snapshotSize === 0 ? (
          <section className="rounded-xl border border-border-subtle bg-bg-1 p-6" data-dead-letters-empty>
            <p className="text-14">目前没有死信。这不是“没失败过”，是没有任何毒消息攒够阈值进死信。</p>
          </section>
        ) : (
          <ol className="flex flex-col gap-2" data-dead-letters-list>
            {result.entries.map((e, i) => (
              <li key={`${e.job.jobId ?? 'n/a'}-${i}`} className="rounded-xl border border-border-subtle bg-bg-1 p-3 transition-colors hover:border-[var(--nexus-color-brand)]" data-dead-letters-item>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono text-11 text-fg-3">{e.job.jobId ?? '(unknown-job)'}</p>
                  <p className="text-11 text-fg-3 tabular-nums">attempts={e.attempts} · {e.job.queuedAt ?? 'time n/a'}</p>
                </div>
                <p className="mt-1 text-13 text-fg-1">{e.reason}</p>
                <p className="mt-0.5 text-11 text-fg-3">job={e.job.requestId ?? 'n/a'} · backend={e.job.backend ?? 'n/a'} · status={e.job.status ?? 'late-failed'}</p>
              </li>
            ))}
          </ol>
        )}

        <footer className="flex items-center justify-between gap-3 text-11">
          <p className="text-fg-3" data-dead-letters-scope>游标分页：每次读一屏最多 {MAX_LIMIT} 条。列表被 LPUSH 改写时要求刷新（tail 相对下标平移）。</p>
          {result.nextCursor ? (
            <Link className="rounded-md border border-border-strong px-3 py-1 hover:bg-bg-2" href={`/admin/dead-letters?cursor=${encodeURIComponent(result.nextCursor)}`} data-dead-letters-next>下一页（更老）</Link>
          ) : (
            <span className="text-fg-3">到底了</span>
          )}
        </footer>
      </>
    ) : result.kind === 'unavailable' ? (
      <section className="rounded-xl border border-border-subtle bg-bg-1 p-6" data-dead-letters-unavailable>
        <p className="text-14">{result.note}</p>
        <p className="mt-2 text-11 text-fg-3">设置 NEXUS_REDIS_URL 指向持有 <code>nexus:ai:dead</code> 的那台（默认 nexus-redis:56379），刷新页面。</p>
      </section>
    ) : result.kind === 'invalid-cursor' ? (
      <section className="rounded-xl border border-border-subtle bg-bg-1 p-6" data-dead-letters-invalid-cursor>
        <p className="text-14">cursor 无法解析或被改写。</p>
        <a className="mt-2 inline-block rounded-md border border-border-subtle px-3 py-1 text-12" href="/admin/dead-letters" data-dead-letters-retry>回到第一页</a>
      </section>
    ) : result.kind === 'snapshot-stale' ? (
      <section className="rounded-xl border border-[var(--nexus-color-warn)] bg-bg-1 p-6" data-dead-letters-snapshot-stale>
        <p className="text-14">dead 列表被新 LPUSH 改写了：当前 tail 相对下标整体平移，中断分页防止读错数据。</p>
        <a className="mt-2 inline-block rounded-md border border-border-subtle px-3 py-1 text-12" href="/admin/dead-letters" data-dead-letters-retry>刷新重来</a>
      </section>
    ) : (
      <section className="rounded-xl border border-border-subtle bg-bg-1 p-6" data-dead-letters-error>
        <p className="text-14">{result.note}</p>
      </section>
    );

  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-4 px-6 py-10" data-dead-letters-admin-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <BrandTitle className="relative inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight">死信巡检</BrandTitle>
          <p className="text-11 text-fg-3" data-dead-letters-summary>毒消息耗尽重试后隔离于此；看这里的表，不用进 redis-cli。</p>
        </div>
        <AdminNav current="dead-letters" />
      </header>
      {body}
    </main>
  );
}
