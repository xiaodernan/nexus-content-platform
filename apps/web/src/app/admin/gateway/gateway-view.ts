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

/**
 * 共享缓存的诚实读数（§SC-50 / ADR-0125）：`driver='redis'` 只表示**配了** `NEXUS_REDIS_URL`，
 * 不代表**此刻连着**。连接实况要看 `fallbacks`（>0 = 发生过 fail-open 回退）与 `lastError`。
 * 把这两件事分开说，才不会让"配了却断了"在面板上看着像"跨实例共享健康"。
 *
 * 纯函数、坏回执不崩（线路/API 的字节不可信）：driver 非两种已知值按中性处理，
 * fallbacks 非数当 0、lastError 非串当 null，返回值绝不出现 `undefined` / `NaN`。
 */
export interface SharedHealthView {
  /** 页脚那句主文案。 */
  readonly label: string;
  /** 回退次数 + 最近错误，没发生回退时为空串。 */
  readonly detail: string;
  /** 是否确实在 fail-open 回退（给圆点/强调用；没接上过不亮"生效"灯）。 */
  readonly active: boolean;
}

export function sharedHealthView(input: {
  driver: unknown;
  fallbacks: unknown;
  lastError: unknown;
}): SharedHealthView {
  const fallbacks = typeof input.fallbacks === 'number' && Number.isFinite(input.fallbacks) && input.fallbacks > 0 ? input.fallbacks : 0;
  const lastError = typeof input.lastError === 'string' && input.lastError.length > 0 ? input.lastError : null;
  const configured = input.driver === 'redis';

  if (!configured) {
    // in-process 与任何未知/坏值都按中性说法：单实例进程内，不提 Redis、不亮生效灯。
    return { label: '共享缓存：进程内（单实例）', detail: '', active: false };
  }

  if (fallbacks > 0 || lastError !== null) {
    const parts: string[] = [];
    if (fallbacks > 0) parts.push(`已回退 ${fallbacks} 次到进程内`);
    if (lastError !== null) parts.push(`最近错误：${lastError}`);
    return { label: '共享缓存：Redis 已配置，正在回退', detail: parts.join(' · '), active: true };
  }

  // 配了、但还没观察到失败：只能说"已配置"，不能说"已连接健康"——此刻可能正断着、
  // 也可能 lazyConnect 还没发过第一条命令，面板没有瞬时权威去断言连着。
  return {
    label: '共享缓存：已配置 Redis（连接实况看错误/回退计数）',
    detail: '',
    active: false,
  };
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
