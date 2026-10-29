'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { GuestReclaimCandidate, GuestReclaimScan } from '@/server/domain/guest-reclaim';
import { adoptScan } from './reclaim-state';

/**
 * 过期访客回收的后台入口（ADR-0072）。
 *
 * 页面上第一份数字是服务端算好的，但**按下去之前一定要再数一遍**：这条规则判的是时间，
 * 一份挂着不动的清单几分钟后就是假话（与 `AccountDeletionPanel` 同一个理由）。
 *
 * 两件刻意的不做：
 * - **不做"必须先勾选确认才允许执行"那种门槛**。真正的门是 CSRF、审核员身份、按人的限流、
 *   一次最多 200 个与那一行审计；再加一层纯界面的勾选只会让人以为点了没反应是页面的错。
 *   被拒的那一次在界面上看得见（下面那行回执），这才是要的显形方式。
 * - **不显示"一共还有多少个 guest"**。这一片管的是沉默的那几个，不是总量；把总量放在一起，
 *   人读到的会是"49 个里的 2 个"这种把两条不相干的数混起来的比例。
 */

interface Receipt {
  ok?: boolean;
  error?: string;
  message?: string;
  dryRun?: boolean;
  reclaimed?: { id: string; name: string }[];
  skippedUnderLock?: number;
  scan?: GuestReclaimScan;
  issues?: string[];
}

const PREVIEW_LIMIT = 8;

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN');
}

export function GuestReclaimPanel({ scan }: { scan: GuestReclaimScan }) {
  const router = useRouter();
  const [live, setLive] = useState<GuestReclaimScan>(scan);
  const [busy, setBusy] = useState<'count' | 'apply' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * 真收走之后 `router.refresh()` 会送下来一份新的服务端快照，但 `useState(scan)` 只在挂载时读 props——
   * 不接住它，屏幕上半截会一直停在"够格 2 个"那张旧清单上，而库里那两个人早就走了。
   * 2026-10-30 截图见证跑到的就是这一格：回执说"收走了 2 个"，列表还是那 2 行。
   */
  useEffect(() => {
    setLive((prev) => adoptScan(prev, scan));
  }, [scan]);

  const call = async (dryRun: boolean): Promise<void> => {
    setBusy(dryRun ? 'count' : 'apply');
    setNotice(null);
    try {
      const res = await fetch('/api/admin/guests/reclaim', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ dryRun }),
      });
      const body = (await res.json().catch(() => null)) as Receipt | null;
      if (!res.ok || body?.ok === false) {
        setNotice(`没做成：${body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`}`);
        return;
      }
      const next = body?.scan;
      if (next) setLive((prev) => adoptScan(prev, next));
      setNotice(body?.message ?? '没收到回执');
      if (!dryRun && (body?.reclaimed?.length ?? 0) > 0) router.refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '请求没走通');
    } finally {
      setBusy(null);
    }
  };

  const shown: GuestReclaimCandidate[] = live.candidates.slice(0, PREVIEW_LIMIT);

  return (
    <section
      className="flex flex-col gap-[var(--nexus-space-2)] rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]"
      data-reclaim-root
      aria-label="过期访客回收"
    >
      <h2 className="text-13 font-semibold text-fg-1">过期访客回收</h2>
      <p className="text-11 text-fg-3" data-reclaim-rule>
        判据是沉默：最后一条会话过期之后<strong>再过 {live.graceDays} 天</strong>——会话本身活 {live.graceDays} 天，
        所以从这个人最后一次打开页面算，大约是两个月。认领过（注册）的、名下有已发布作品的、还带着有效 API 令牌的，
        都不在这一轮。收走走的是注销那六件事：草稿进回收站、会话与凭据吊销，不是把行从库里抹掉（ADR-0025／ADR-0072）。
      </p>

      <p className="text-11 text-fg-2" data-reclaim-counts>
        沉默到线 {live.stale} 个 · 够格 {live.candidates.length} 个 · 发布过不碰 {live.skippedPublished} 个 ·
        带令牌不碰 {live.skippedLiveToken} 个 · 一次最多 {live.batch} 个
        {live.moreThanBatch ? ' · 这一轮装不下，还有剩下的' : ''}
        {live.scanTruncated ? ` · 只数了前 1000 个` : ''}
      </p>

      {shown.length > 0 ? (
        <ul className="flex flex-col gap-1" data-reclaim-list>
          {shown.map((c) => (
            <li key={c.id} className="flex flex-wrap gap-2 text-11 text-fg-3" data-reclaim-row={c.id}>
              <span className="text-fg-2">{c.name}</span>
              <span>{c.reason === 'orphan' ? '从来没有过会话' : `会话止于 ${dayOf(c.lastExpiry!)}`}</span>
              <span>注册于 {dayOf(c.createdAt)}</span>
              <span>{c.drafts > 0 ? `${c.drafts} 个草稿一起收起` : '没有草稿'}</span>
            </li>
          ))}
          {live.candidates.length > shown.length ? (
            <li className="text-11 text-fg-3" data-reclaim-truncated>
              只列了 {shown.length} 个，够格的有 {live.candidates.length} 个。
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-11 text-fg-3" data-reclaim-empty>
          此刻没有够格的访客——这是好消息，不是这个入口坏了。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void call(true)}
          className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-3 py-1 text-12 text-fg-2 hover:bg-bg-2 disabled:opacity-40"
          data-recount-button
        >
          {busy === 'count' ? '数中…' : '重新数一遍'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void call(false)}
          className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg disabled:opacity-40"
          data-reclaim-apply
        >
          {busy === 'apply' ? '回收中…' : `收走这 ${live.candidates.length} 个`}
        </button>
      </div>

      {notice ? (
        // 这一行是那次批量动作的回执。刻意不做成带边框的一小块——那一长看就像颗还能点的按钮，
        // 而它什么都不做；要它显眼，靠的是这一屏里唯一加粗的一行字
        <p className="text-11 font-medium text-fg-1" data-reclaim-notice aria-live="polite">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
