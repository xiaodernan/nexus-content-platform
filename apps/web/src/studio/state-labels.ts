import type { NodeState } from '@nexus/design-model';

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
