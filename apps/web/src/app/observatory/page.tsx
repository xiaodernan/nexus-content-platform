import type { Metadata } from 'next';
import { getLocale, type Locale } from '@/lib/i18n';
import { PulsePublicView } from '@/components/PulsePublicView';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '公共观测大厅 — NEXUS',
        description: '平台级聚合统计，公开围观：流量、通关、改编、关注——规则外推预测 + 下一步优化建议。口令 123（公开的）。',
        robots: { index: false, follow: false },
      }
    : {
        title: 'The Public Observation Hall — NEXUS',
        description: 'Platform-wide aggregates open to everyone: opens, clears, remixes, follows — rule-based projections and next-step optimization suggestions. Passphrase: 123 (public).',
        robots: { index: false, follow: false },
      };
}

/**
 * §PUB-1 `/observatory`——§九 公共观测大厅
 *
 * 为什么存在：说白了就是 ["密码 123 就能进，所有用户都知道密码也都能进管理员页面"](user 原话)。
 * 所谓「管理员页面」里只放「聚合匿名」读数，零个人信息（无邮箱、无名称、无 per-event）——
 * 本页面 = public 围观格，mirrors /pulse 的集合口径外加规则预测与行动项。
 *
 * 纪律：
 * - 公开围观格（这里）：看趋势、问预测、列行动项
 * - 角色=admin 的审核/删/退回仍只在 /admin
 * - 123 不是安全边界，只是围观提醒——页面里写清
 */
export default async function ObservatoryPage() {
  const locale = await getLocale();
  return (
    <main className="pl-page" data-pulse-public-page data-pulse-locale={locale as Locale}>
      <PulsePublicView locale={locale as Locale} />
    </main>
  );
}
