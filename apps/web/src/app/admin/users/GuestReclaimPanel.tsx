'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';
import type { GuestReclaimCandidate, GuestReclaimScan } from '@/server/domain/guest-reclaim';
import { adoptScan, allCheckedOf, clampPage, pageWindow, pageCount, scanCaveats, selectionOf, toggleId } from './reclaim-state';

const COPY = {
  zh: {
    sectionAria: '过期访客回收',
    heading: '过期访客回收',
    rule: (graceDays: number) =>
      `判据是沉默：最后一条会话过期之后再过 ${graceDays} 天——会话本身活 ${graceDays} 天，所以从这个人最后一次打开页面算，大约是两个月。认领过（注册）的、名下有已发布作品的、还带着有效 API 令牌的，都不在这一轮。收走走的是注销那六件事：草稿进回收站、会话与凭据吊销，不是把行从库里抹掉（ADR-0025／ADR-0072）。`,
    counts: (stale: number, eligible: number, skippedPublished: number, skippedLiveToken: number, batch: number) =>
      `沉默到线 ${stale} 个 · 够格 ${eligible} 个 · 发布过不碰 ${skippedPublished} 个 · 带令牌不碰 ${skippedLiveToken} 个 · 一次最多 ${batch} 个`,
    pickAllAria: '全选这一屏列出来的候选',
    pickAll: (selected: number, shown: number) => `全选（${selected}/${shown}）`,
    prevPage: '← 上一屏',
    nextPage: '下一屏 →',
    pageInfo: (current: number, pages: number, shown: number, total: number) =>
      `第 ${current}/${pages} 屏 · 这一屏 ${shown} 行 · 够格的一共 ${total} 个`,
    reclaimOneAria: (name: string) => `收走 ${name}`,
    reasonOrphan: '从来没有过会话',
    reasonExpired: (day: string) => `会话止于 ${day}`,
    registeredOn: (day: string) => `注册于 ${day}`,
    draftsTogether: (n: number) => `${n} 个草稿一起收起`,
    noDrafts: '没有草稿',
    moreThanBatchNote: (batch: number) =>
      `这份清单一次装 ${batch} 个，够格的比这多——翻完这几屏也看不到剩下的那些，它们这一轮进不了清单，也就点不到。`,
    empty: '此刻没有够格的访客——这是好消息，不是这个入口坏了。',
    recountIdle: '重新数一遍',
    recountBusy: '数中…',
    applyIdle: (n: number) => `收走这 ${n} 个`,
    applyBusy: '回收中…',
    failedNotice: (detail: string) => `没做成：${detail}`,
    noReceipt: '没收到回执',
    requestFailed: '请求没走通',
  },
  en: {
    sectionAria: 'Reclaim expired guests',
    heading: 'Reclaim expired guests',
    rule: (graceDays: number) =>
      `The criterion is silence: ${graceDays} days after the last session expired — each session lives ${graceDays} days, so from this person’s last visit it is roughly two months. Claimed (registered), published works in their name, or live API tokens — none of those are in this round. Reclaiming walks the six deletion steps: drafts to the recycle bin, sessions and credentials revoked — rows are not wiped from the library (ADR-0025 / ADR-0072).`,
    counts: (stale: number, eligible: number, skippedPublished: number, skippedLiveToken: number, batch: number) =>
      `Silent past the line ${stale} · eligible ${eligible} · published, untouched ${skippedPublished} · live-token, untouched ${skippedLiveToken} · at most ${batch} per round`,
    pickAllAria: 'Select every candidate listed on this screen',
    pickAll: (selected: number, shown: number) => `Select all (${selected}/${shown})`,
    prevPage: '← Previous page',
    nextPage: 'Next page →',
    pageInfo: (current: number, pages: number, shown: number, total: number) =>
      `Page ${current}/${pages} · this screen shows ${shown} rows · ${total} eligible in total`,
    reclaimOneAria: (name: string) => `Reclaim ${name}`,
    reasonOrphan: 'No session has ever existed',
    reasonExpired: (day: string) => `Last session ended ${day}`,
    registeredOn: (day: string) => `Registered ${day}`,
    draftsTogether: (n: number) => `${n} draft${n === 1 ? '' : 's'} collected together`,
    noDrafts: 'No drafts',
    moreThanBatchNote: (batch: number) =>
      `This list loads ${batch} at a time and there are more eligible than that — paging through every screen still will not reach the rest, they cannot enter this list, and cannot be clicked.`,
    empty: 'No eligible guests right now — that is good news, not a broken entry.',
    recountIdle: 'Recount',
    recountBusy: 'Counting…',
    applyIdle: (n: number) => `Reclaim these ${n}`,
    applyBusy: 'Reclaiming…',
    failedNotice: (detail: string) => `Did not go through: ${detail}`,
    noReceipt: 'No receipt received',
    requestFailed: 'The request did not go through',
  },
} as const;

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

function dayOf(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-CN');
}

export function GuestReclaimPanel({ scan, locale = 'zh' }: { scan: GuestReclaimScan; locale?: Locale }) {
  const c = COPY[locale];
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
        setNotice(c.failedNotice(body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`));
        return;
      }
      const next = body?.scan;
      if (next) setLive((prev) => adoptScan(prev, next));
      setNotice(body?.message ?? c.noReceipt);
      if (!dryRun && (body?.reclaimed?.length ?? 0) > 0) {
        // 换过读数之后"全勾"指的是新一屏列出来的这些，不是刚才收掉的那几个
        setPicked(null);
        router.refresh();
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : c.requestFailed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className="au-reclaimRoot"
      data-reclaim-root
      aria-label={c.sectionAria}
    >
      <h2 className="au-sectionTitle">{c.heading}</h2>
      <p className="adm-capNote" data-reclaim-rule>
        {c.rule(live.graceDays)}
      </p>

      <p className="au-counts" data-reclaim-counts>
        {c.counts(live.stale, totalEligible, live.skippedPublished, live.skippedLiveToken, live.batch)}
        {scanCaveats(live, locale).map((s) => (
          <span key={s}> · {s}</span>
        ))}
      </p>

      {shown.length > 0 ? (
        <>
          <label className="au-pickAll">
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
              aria-label={c.pickAllAria}
            />
            {c.pickAll(selected.length, shownIds.length)}
          </label>
          {pages > 1 ? (
            // 屏号单独一行，是因为「全选（8/8）」这句光看像"全部"：够格的一共几个、这一屏几个，
            // 得并排说出来人才知道自己在第几屏上（ADR-0072 决定九）
            <div className="au-pageRow" data-reclaim-page>
              <button
                type="button"
                onClick={() => goPage(current - 1)}
                disabled={busy !== null || current === 0}
                className="au-navBtn"
                data-reclaim-prev
              >
                {c.prevPage}
              </button>
              {c.pageInfo(current + 1, pages, shownIds.length, totalEligible)}
              <button
                type="button"
                onClick={() => goPage(current + 1)}
                disabled={busy !== null || current >= pages - 1}
                className="au-navBtn"
                data-reclaim-next
              >
                {c.nextPage}
              </button>
            </div>
          ) : null}
          <ul className="am-findingsList" data-reclaim-list>
            {shown.map((cand) => (
              <li key={cand.id} className="au-reclaimRow" data-reclaim-row={cand.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(cand.id)}
                  onChange={() => toggleOne(cand.id)}
                  data-reclaim-pick={cand.id}
                  aria-label={COPY[locale].reclaimOneAria(cand.name)}
                />
                <span className="au-counts">{cand.name}</span>
                <span>{cand.reason === 'orphan' ? c.reasonOrphan : c.reasonExpired(dayOf(cand.lastExpiry!, locale))}</span>
                <span>{c.registeredOn(dayOf(cand.createdAt, locale))}</span>
                <span>{cand.drafts > 0 ? c.draftsTogether(cand.drafts) : c.noDrafts}</span>
              </li>
            ))}
            {live.moreThanBatch ? (
              <li className="adm-capNote" data-reclaim-truncated>
                {c.moreThanBatchNote(live.batch)}
              </li>
            ) : null}
          </ul>
        </>
      ) : (
        <p className="adm-capNote" data-reclaim-empty>
          {c.empty}
        </p>
      )}

      <div className="au-pageRow">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void call(true)}
          className="au-ghostBtn"
          data-recount-button
        >
          {busy === 'count' ? c.recountBusy : c.recountIdle}
        </button>
        <button
          type="button"
          disabled={busy !== null || selected.length === 0}
          onClick={() => void call(false)}
          className="au-applyBtn"
          data-reclaim-apply
        >
          {busy === 'apply' ? c.applyBusy : c.applyIdle(selected.length)}
        </button>
      </div>

      {notice ? (
        // 这一行是那次批量动作的回执。刻意不做成带边框的一小块——那一长看就像颗还能点的按钮，
        // 而它什么都不做；要它显眼，靠的是这一屏里唯一加粗的一行字
        <p className="au-notice" data-reclaim-notice aria-live="polite">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
