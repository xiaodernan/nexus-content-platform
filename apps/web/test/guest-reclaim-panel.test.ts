import { describe, expect, it } from 'vitest';
import { adoptScan } from '@/app/admin/users/reclaim-state';
import type { GuestReclaimCandidate, GuestReclaimScan } from '@/server/domain/guest-reclaim';

/**
 * 回收面板"手上那份读数该换成哪一份"那一判（`reclaim-state.ts`）。
 *
 * 这一格是 2026-10-30 截图见证真撞出来的：`useState(scan)` 不接 props 的后续变化，
 * 于是"收走了 2 个"的回执与屏幕上那 2 行候选同时挂在页面上——界面在说一件库里已经不做的事。
 * 修它的那一句只有两行，所以钉它的测试也只判这一句：**新的换掉旧的，旧的不许换掉新的**。
 *
 * 每条否定断言都配一个换个 `now` 就成立的对照，免得这条门其实什么都没判。
 */

const candidate = (id: string): GuestReclaimCandidate => ({
  id,
  name: `访客 ${id}`,
  handle: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  lastExpiry: '2026-08-20T00:00:00.000Z',
  reason: 'expired',
  drafts: 0,
});

function scan(overrides: Partial<GuestReclaimScan> & { now: string }): GuestReclaimScan {
  return {
    cutoff: '2026-09-29T00:00:00.000Z',
    graceDays: 30,
    batch: 50,
    stale: 0,
    skippedPublished: 0,
    skippedLiveToken: 0,
    candidates: [],
    moreThanBatch: false,
    scanTruncated: false,
    ...overrides,
  };
}

describe('adoptScan（面板换读数的方向）', () => {
  it('服务端送来更晚的一份：换掉手上这份，包括候选清空那种换法', () => {
    const held = scan({ now: '2026-10-30T00:00:00.000Z', candidates: [candidate('a'), candidate('b')], stale: 2 });
    const fresh = scan({ now: '2026-10-30T00:05:00.000Z', candidates: [], stale: 0 });
    const next = adoptScan(held, fresh);
    // 这就是截图见证那一格：数变少不是"留着旧的"的理由，恰恰是刚做完事的证据
    expect(next).toBe(fresh);
    expect(next.candidates).toHaveLength(0);
  });

  it('迟到的旧快照不许盖掉刚数出来的那份', () => {
    const held = scan({ now: '2026-10-30T00:05:00.000Z', candidates: [candidate('a')] });
    const late = scan({ now: '2026-10-30T00:00:00.000Z', candidates: [candidate('a'), candidate('b')] });
    expect(adoptScan(held, late)).toBe(held);
    // 对照：把两条 `now` 换个个儿，同一句判据就站在另一边
    expect(adoptScan(late, held)).toBe(held);
  });

  it('同一时刻的两份取后到的那份——refresh 送来的常是同一趟的读数，不能因为不比大小就停在旧引用上', () => {
    const first = scan({ now: '2026-10-30T00:05:00.000Z', candidates: [candidate('a')] });
    const same = scan({ now: '2026-10-30T00:05:00.000Z', candidates: [candidate('a'), candidate('b')] });
    expect(adoptScan(first, same)).toBe(same);
  });

  it('判的是时间不是数组长度：更长的一份如果是旧的，照样不接', () => {
    const held = scan({ now: '2026-10-30T00:09:00.000Z', candidates: [candidate('a')] });
    const longerButOlder = scan({ now: '2026-10-30T00:01:00.000Z', candidates: [candidate('a'), candidate('b'), candidate('c')] });
    expect(adoptScan(held, longerButOlder).candidates).toHaveLength(1);
  });
});
