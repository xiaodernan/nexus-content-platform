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

/**
 * 勾着的到底是哪几行。`picked === null` 是"没动过勾选"，默认全勾这一屏列出来的候选。
 *
 * 那一步 `filter` 是这一片的**范围**所在：读数一换（重新数一遍、或收完之后 refresh 送下来新的），
 * 不在新清单上的 id 自动作废。不筛的话，人上一轮勾的那几个会跟着请求一起发出去——
 * 而其中有些人这一轮根本不在屏幕上，甚至已经不在库里了。爆炸半径必须是"这一屏看得见的"，
 * 不是"这台浏览器历史上勾过的"（ADR-0072 决定八）。
 */
export function selectionOf(picked: string[] | null, shownIds: string[]): string[] {
  return (picked ?? shownIds).filter((id) => shownIds.includes(id));
}

/** 全选那颗框的状态：清单空时不算全选，否则按钮会显示"收走这 0 个"却是勾着的 */
export function allCheckedOf(picked: string[] | null, shownIds: string[]): boolean {
  return shownIds.length > 0 && selectionOf(picked, shownIds).length === shownIds.length;
}

/**
 * 取消/勾选一行。基数取"当前勾着的"而不是 `picked`，这样第一次点击是"从全勾里去掉这一行"，
 * 而不是"别人都不勾、只勾这一个"——后者会让一次误点把范围扩大成整屏之外的东西。
 */
export function toggleId(picked: string[] | null, shownIds: string[], id: string): string[] {
  const base = selectionOf(picked, shownIds);
  return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
}
