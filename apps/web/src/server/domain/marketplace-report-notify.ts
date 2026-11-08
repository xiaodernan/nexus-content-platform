import { emit, type EmitResult } from './notifications';
import type { ReportStatus } from './marketplace';

/**
 * §123 × §164：举报工单进入终态（成立 / 驳回）时通知举报人一次。
 *
 * 只认终态：`pending` 是刚提交、`reviewing` 是"有人在看了"——两个都不是结论，
 * 发一条只会让举报人以为处理完了。`skipped` 与 `emit` 的 `suppressed` 分开报，
 * 测试才能问出"这次没发"是规则挡的还是受理中这一类本来就不发。
 *
 * 通知的正文只说工单结论：结案 / 驳回都不自动下架物品，物品去留是人工复核台另一件事
 * （与「我的举报」页同一句边界）。工单终态不可改写，所以一个工单只会有一条结论通知。
 */
export async function notifyReportOutcome(input: {
  reporterId: string;
  reportId: string;
  itemTitle: string;
  status: ReportStatus;
}): Promise<EmitResult | 'skipped'> {
  if (input.status !== 'resolved' && input.status !== 'dismissed') return 'skipped';
  return emit({
    kind: 'marketplace_report',
    recipientId: input.reporterId,
    reportId: input.reportId,
    itemTitle: input.itemTitle,
    status: input.status,
  });
}
