import type { GuestReclaimScan } from '@/server/domain/guest-reclaim';

/**
 * 面板手上那份读数该不该换成服务端刚送下来的这一份。
 *
 * 抽出来只因为一条：这一判错了，界面会**停在一张已经作废的清单上**——
 * 2026-10-30 截图见证跑到过一次：真收走之后回执写着"收走了 2 个"，列表还是那 2 行，
 * 因为 `useState(scan)` 只在挂载时读 props，`router.refresh()` 送下来的新快照没人接。
 *
 * 判据是 `now`（每份快照自己的时刻），不是数组长度：刷新与"重新数一遍"两条路都会换快照，
 * 只有"谁新听谁的"这一句能同时说对它们。
 */
export function adoptScan(prev: GuestReclaimScan, next: GuestReclaimScan): GuestReclaimScan {
  return Date.parse(next.now) >= Date.parse(prev.now) ? next : prev;
}
