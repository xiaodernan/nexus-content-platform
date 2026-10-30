import { describe, expect, it } from 'vitest';
import { adoptScan, allCheckedOf, selectionOf, toggleId } from '@/app/admin/users/reclaim-state';
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

/**
 * 勾选那一句（第三十片，ADR-0072 决定八）：**这一次要点名收走的是哪几行**。
 *
 * 面板上"收走这 N 个"那颗按钮发出去的 `ids` 就是这里的返回值，所以这一判直接决定爆炸半径：
 * 收的必须是**这一屏列出来的**，既不能是"此刻全库够格的"（少筛一步就会多收屏幕外的人），
 * 也不能是"这台浏览器历史上勾过的"（读数换了却不筛，就会把已经不在这屏上的 id 一起发出去）。
 */
describe('selectionOf / allCheckedOf / toggleId（勾选的范围）', () => {
  const screen = ['a', 'b', 'c'];

  it('没动过勾选 = 全勾这一屏；一行动过就只剩这一行', () => {
    expect(selectionOf(null, screen)).toEqual(['a', 'b', 'c']);
    expect(selectionOf(['b'], screen)).toEqual(['b']);
    expect(allCheckedOf(null, screen)).toBe(true);
    expect(allCheckedOf(['b'], screen)).toBe(false);
  });

  it('勾着的 id 里有已经不在新清单上的：那些自动作废，不许跟着请求一起发出去', () => {
    // 上一轮勾了 a 与 z，这一轮 refresh 送下来的清单只剩 b、c、z 里的 b 与 c
    expect(selectionOf(['a', 'z'], ['b', 'c'])).toEqual([]);
    expect(selectionOf(['a', 'b'], ['b', 'c'])).toEqual(['b']);
    // 对照：全都还在屏上时，一个都不该被筛掉——证明筛的是"在不在这一屏"，不是长度
    expect(selectionOf(['a', 'b', 'c'], screen)).toEqual(['a', 'b', 'c']);
  });

  it('空清单不算全选：按钮该是禁用的"收走这 0 个"，不是勾着的空范围', () => {
    expect(selectionOf(null, [])).toEqual([]);
    expect(allCheckedOf(null, [])).toBe(false);
    expect(allCheckedOf([], [])).toBe(false);
  });

  it('第一次取消勾选是从"全勾"里去掉这一行，不是变成"只勾这一行"', () => {
    expect(toggleId(null, screen, 'b')).toEqual(['a', 'c']);
    // 再点一次点回来；从空清单起点点第一行才是只勾一行
    expect(toggleId(['a', 'c'], screen, 'b')).toEqual(['a', 'c', 'b']);
    expect(toggleId([], screen, 'b')).toEqual(['b']);
    // 屏幕外的 id 被点进来也不碍事：发出去之前 `selectionOf` 按这一筛掉，范围仍然只有这一屏
    expect(toggleId(null, screen, 'zzz')).toEqual(['a', 'b', 'c', 'zzz']);
    expect(selectionOf(toggleId(null, screen, 'zzz'), screen)).toEqual(['a', 'b', 'c']);
  });
});
