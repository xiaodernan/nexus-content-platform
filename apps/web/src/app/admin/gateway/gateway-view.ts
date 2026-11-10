/**
 * 网关态势面板的**展示判据**（与 `reclaim-state.ts` 同一范式：判据抽成纯模块，组件只消费）。
 *
 * 为什么这些一行函数值得单独成文件、单独测：它们各自守着一句能被读反的话，而渲染层一旦把
 * 其中一句写反，界面会说出一个具体的谎，测试却还绿（断言的是文字不是语义）：
 *   - `numberOrDash(null)` 若显示成 0，运维会去查一个不存在的事故（"注册实例 0"其实是"没测到"）；
 *   - `healthView('UNKNOWN')` 若染成红色/写"中断"，就把"没答上"说成了"死了"（ServiceHealthProbe
 *     花整段注释区分这两者，UI 是最后一道闸，不能在这里塌掉）；
 *   - `pollAllowed` 若在后台标签仍返回 true，面板就在没人看时给网关制造流量。
 *
 * 全部纯函数，零 React、零 DOM、零网络，判据可逐支验电。
 */

import type { GatewaySnapshot, JoinedService, ServiceHealthView } from '@/server/gateway/snapshot';
import type { ReadoutState } from '@/server/gateway/types';

/** CSS Module 已改为全局 `.gw-` 类（见 globals.css 的 §SC-40 段），这里返回类名字符串。 */
export interface HealthBadge {
  readonly dot: string;
  readonly text: string;
}

export function numberOrDash(value: number | null): string {
  return value === null ? '—（未测）' : String(value);
}

/** 五种健康态逐一映射：UNKNOWN 与没测到各有自己的中性说法，绝不归到 DOWN。 */
export function healthView(h: ServiceHealthView): HealthBadge {
  switch (h) {
    case 'UP':
      return { dot: 'gw-dotUp', text: '正常' };
    case 'DOWN':
      return { dot: 'gw-dotDown', text: '中断' };
    case 'UNKNOWN':
      return { dot: 'gw-dotUnknown', text: '没答上' };
    case 'NOT_PROBED':
      return { dot: 'gw-dotUnmeasured', text: '无实例' };
    case 'NOT_MEASURED':
      return { dot: 'gw-dotUnmeasured', text: '未测' };
  }
}

export const CLASS_LABEL: Record<JoinedService['classification'], string> = {
  'routed-healthy': '已纳管·正常',
  'routed-degraded': '已纳管·待查',
  'routed-down': '已纳管·中断',
  unrouted: '注册了·无路由',
  dangling: '有路由·无实例',
};

export const STATE_LABEL: Record<ReadoutState, string> = {
  fresh: '本次实测',
  cached: '缓存',
  stale: '旧快照',
  unavailable: '未测到',
};

/** 后台标签不轮询；只有 visible 才发。判据用字符串注入，不需要真的 document。 */
export function pollAllowed(visibilityState: 'visible' | 'hidden' | 'prerender'): boolean {
  return visibilityState === 'visible';
}

/**
 * 拉取失败时**不清空上一帧**：返回 true 表示"仍渲染旧快照"。
 * 一次失败的读什么都没证明；旧图带日期，比空白诚实。
 */
export function keepPreviousOnError(hasPrevious: boolean): boolean {
  return hasPrevious;
}

/** 一列该不该打"旧"标：只有 cached / stale 是带日期的旧事实；fresh 不算旧。 */
export function isDatedSnapshot(state: ReadoutState): boolean {
  return state === 'cached' || state === 'stale';
}

/** 页脚那句"三列不同时刻"是否该出现：任一列带 date 或三列 measuredAt 不全相同就出现。 */
export function shouldShowNonAtomicNote(snapshot: GatewaySnapshot): boolean {
  const times = [snapshot.columns.routes.measuredAt, snapshot.columns.services.measuredAt, snapshot.columns.health.measuredAt];
  return times.some((t) => t === null) || new Set(times).size > 1;
}
