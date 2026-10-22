/**
 * 举报原因：值这一列同时喂给路由的 zod 与界面下拉，标签这一列只给界面。
 * 数据库的 CHECK（infra/migrations/0026）是第三处同名单，只能靠迁移跟着改。
 * 放在 lib 而不是域层，是因为提交面板是客户端组件——域层会把数据库带进浏览器包。
 */
export const REPORT_REASONS = ['fraud', 'spam', 'copyright', 'inappropriate', 'other'] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  fraud: '欺诈 / 虚假宣传',
  spam: '垃圾信息 / 刷量',
  copyright: '侵权（未经授权使用他人内容）',
  inappropriate: '不当内容',
  other: '其他',
};
