'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { GuestReclaimCandidate, GuestReclaimScan } from '@/server/domain/guest-reclaim';
import { adoptScan, allCheckedOf, clampPage, pageWindow, pageCount, scanCaveats, selectionOf, toggleId } from './reclaim-state';

/**
 * 过期访客回收的后台入口（ADR-0072）。
 *
 * 页面上第一份数字是服务端算好的，但**按下去之前一定要再数一遍**：这条规则判的是时间，
 * 一份挂着不动的清单几分钟后就是假话（与 `AccountDeletionPanel` 同一个理由）。
 *
 * 四件刻意的写法：
 * - **勾选框是"范围"不是"确认"**。默认全勾，所以不动它 = 收这一屏列出来的这些；一个都不勾时按钮
 *   直接禁用。它不额外要求人"先证明自己想清楚了"（那种门槛只会让人以为点了没反应是页面的错），
 *   要的是另一件事：这一次动作碰的人必须是**这一屏上看得见**的，不是"此刻全库够格的"（决定八）。
 * - **一屏列 8 行，一屏之外还有几屏**（决定九）。够格数说的是这份清单里一共几个，屏号说的是
 *   人眼里此刻这一屏几个——两件事分开写，不然「全选（8/8）」读起来像"全部"，其实只是第一屏。
 *   换屏时勾选回到"全勾这一屏"，带着上一屏的勾翻过来只会让按钮说一句没人点得动的"收走这 0 个"。
 * - **回执那句数由服务端算**（`点名的 N 个里收走了 M 个`），界面不自己数第二遍——两边各数一次
 *   迟早对不上，而对不上的时候人只能猜哪边是假的。
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

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN');
}

export function GuestReclaimPanel({ scan }: { scan: GuestReclaimScan }) {
  const router = useRouter();
  const [live, setLive] = useState<GuestReclaimScan>(scan);
  /** `null` = 全勾（清单上列出来的这些）；给了数组就是只勾这几行 */
  const [picked, setPicked] = useState<string[] | null>(null);
  /** 站在第几屏（0 起）。清单换了之后由 `clampPage` 决定它有效到哪一屏 */
  const [page, setPage] = useState(0);
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

  const totalEligible = live.candidates.length;
  const pages = pageCount(totalEligible);
  const current = clampPage(page, totalEligible);
  const shown: GuestReclaimCandidate[] = pageWindow(live.candidates, current);
  const shownIds = shown.map((c) => c.id);
  /** 勾着的行：读数一换，不在新清单上的那些 id 自动作废（判据在 `reclaim-state.ts`，与单元门同一份） */
  const selected = selectionOf(picked, shownIds);
  const allChecked = allCheckedOf(picked, shownIds);

  const toggleOne = (id: string): void => setPicked((prev) => toggleId(prev, shownIds, id));

  /**
   * 翻屏。勾选一起回到"全勾这一屏"：勾着的范围从来都是**这一屏**，
   * 把上一屏那些 id 带过来只会筛成空集，然后按钮说一句"收走这 0 个"——人以为页面坏了。
   */
  const goPage = (next: number): void => {
    setPage(clampPage(next, totalEligible));
    setPicked(null);
  };

  const call = async (dryRun: boolean): Promise<void> => {
    setBusy(dryRun ? 'count' : 'apply');
    setNotice(null);
    try {
      const res = await fetch('/api/admin/guests/reclaim', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        // 「重新数一遍」不带 ids：数的是整份清单，与勾了哪几行无关
        body: JSON.stringify(dryRun ? { dryRun } : { dryRun, ids: selected }),
      });
      const body = (await res.json().catch(() => null)) as Receipt | null;
      if (!res.ok || body?.ok === false) {
        setNotice(`没做成：${body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`}`);
        return;
      }
      const next = body?.scan;
      if (next) setLive((prev) => adoptScan(prev, next));
      setNotice(body?.message ?? '没收到回执');
      if (!dryRun && (body?.reclaimed?.length ?? 0) > 0) {
        // 换过读数之后"全勾"指的是新一屏列出来的这些，不是刚才收掉的那几个
        setPicked(null);
        router.refresh();
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '请求没走通');
    } finally {
      setBusy(null);
    }
  };

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
        沉默到线 {live.stale} 个 · 够格 {totalEligible} 个 · 发布过不碰 {live.skippedPublished} 个 ·
        带令牌不碰 {live.skippedLiveToken} 个 · 一次最多 {live.batch} 个
        {scanCaveats(live).map((s) => (
          <span key={s}> · {s}</span>
        ))}
      </p>

      {shown.length > 0 ? (
        <>
          <label className="flex items-center gap-2 text-11 text-fg-3">
            <input
              type="checkbox"
              checked={allChecked}
              // 勾了一半的时候让原生框进 indeterminate 态：否则读屏听到的是"未勾选"，
              // 而旁边那句「全选（1/2）」说的是另一件事（2026-10-30 看图看到的这一格）
              ref={(el) => {
                if (el) el.indeterminate = !allChecked && selected.length > 0;
              }}
              onChange={() => setPicked(allChecked ? [] : shownIds)}
              data-reclaim-pick-all
              aria-label="全选这一屏列出来的候选"
            />
            全选（{selected.length}/{shownIds.length}）
          </label>
          {pages > 1 ? (
            // 屏号单独一行，是因为「全选（8/8）」这句光看像"全部"：够格的一共几个、这一屏几个，
            // 得并排说出来人才知道自己在第几屏上（ADR-0072 决定九）
            <div className="flex flex-wrap items-center gap-2 text-11 text-fg-3" data-reclaim-page>
              <button
                type="button"
                onClick={() => goPage(current - 1)}
                disabled={busy !== null || current === 0}
                className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-0.5 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-40"
                data-reclaim-prev
              >
                ← 上一屏
              </button>
              第 {current + 1}/{pages} 屏 · 这一屏 {shownIds.length} 行 · 够格的一共 {totalEligible} 个
              <button
                type="button"
                onClick={() => goPage(current + 1)}
                disabled={busy !== null || current >= pages - 1}
                className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-0.5 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-40"
                data-reclaim-next
              >
                下一屏 →
              </button>
            </div>
          ) : null}
          <ul className="flex flex-col gap-1" data-reclaim-list>
            {shown.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-11 text-fg-3" data-reclaim-row={c.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggleOne(c.id)}
                  data-reclaim-pick={c.id}
                  aria-label={`收走 ${c.name}`}
                />
                <span className="text-fg-2">{c.name}</span>
                <span>{c.reason === 'orphan' ? '从来没有过会话' : `会话止于 ${dayOf(c.lastExpiry!)}`}</span>
                <span>注册于 {dayOf(c.createdAt)}</span>
                <span>{c.drafts > 0 ? `${c.drafts} 个草稿一起收起` : '没有草稿'}</span>
              </li>
            ))}
            {live.moreThanBatch ? (
              <li className="text-11 text-fg-3" data-reclaim-truncated>
                这份清单一次装 {live.batch} 个，够格的比这多——翻完这几屏也看不到剩下的那些，
                它们这一轮进不了清单，也就点不到。
              </li>
            ) : null}
          </ul>
        </>
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
          disabled={busy !== null || selected.length === 0}
          onClick={() => void call(false)}
          className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg disabled:opacity-40"
          data-reclaim-apply
        >
          {busy === 'apply' ? '回收中…' : `收走这 ${selected.length} 个`}
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
