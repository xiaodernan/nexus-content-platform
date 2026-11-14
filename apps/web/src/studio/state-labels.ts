import type { NodeState } from '@nexus/creative-model';

/** 状态名的界面口径：面板页签、撤销标签、剪贴板说明都从这里读，不各写一份 */
export const STATE_LABELS: Record<NodeState, string> = {
  hover: '悬停',
  active: '按下',
  focus: '聚焦',
  disabled: '禁用',
  loading: '加载中',
  error: '错误',
  success: '成功',
};

/** v755: 英文口径（键序与中文表严格一致）；面板按 locale 取，不再各写一份 */
export const STATE_LABELS_EN: Record<NodeState, string> = {
  hover: 'Hover',
  active: 'Pressed',
  focus: 'Focused',
  disabled: 'Disabled',
  loading: 'Loading',
  error: 'Error',
  success: 'Success',
};

export function stateLabel(state: NodeState, locale: 'zh' | 'en'): string {
  return (locale === 'en' ? STATE_LABELS_EN : STATE_LABELS)[state];
}
