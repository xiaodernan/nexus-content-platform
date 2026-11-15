import type { ReactElement } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserOrNull } from '@/server/domain/session';
import { ApiTokensPanel } from '@/components/ApiTokensPanel';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '公开 API 凭据 · Public API tokens — NEXUS',
  description: '给平台外的程序用：Authorization: Bearer。发得出、认得出、收得回。/ Programmatic credentials: issue, recognize, revoke.',
};

/**
 * §188 M8（MCP / 外部 Agent / 公开 API）的账号侧入口：这一页只管一件事——
 * 发得出、认得出、收得回一枚给平台外程序用的凭据。
 * §FE-20：门面化只换 className，零行为。v782：双语化（文案与钩子不变式守恒）。
 */
const COPY: Record<Locale, { title: string; lede: string; lede2: string; back: string }> = {
  zh: {
    title: '公开 API 凭据',
    lede: '给平台外的程序（外部 Agent、脚本、CI）用：',
    lede2: '。今天 v1 是三个只读端点加一个写端点（PATCH …/design，要 design:write）：写发的是补丁而不是整份文档，删除类动作在这一侧一律拒。',
    back: '回创作页',
  },
  en: {
    title: 'Public API tokens',
    lede: 'For programs outside the platform (external Agents, scripts, CI):',
    lede2: '. Today v1 is three read endpoints plus one write endpoint (PATCH …/design, requires design:write): the write sends a patch, not the whole document, and delete-class actions are always refused on this side.',
    back: 'Back to Studio',
  },
};

export default async function ApiTokensPage(): Promise<ReactElement> {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) redirect('/');
  return (
    <main className="at-page" data-api-tokens-page>
      <header className="at-head">
        <h1 className="at-title">{c.title}</h1>
        <p className="at-lede">
          {c.lede}
          <code className="at-codeInline">Authorization: Bearer &lt;token&gt;</code>
          {c.lede2}
          <Link href="/" className="at-backlink">
            {c.back}
          </Link>
        </p>
      </header>
      <ApiTokensPanel locale={locale} />
    </main>
  );
}
