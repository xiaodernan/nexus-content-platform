import type { ReactElement } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserOrNull } from '@/server/domain/session';
import { ApiTokensPanel } from '@/components/ApiTokensPanel';
import { BrandTitle } from '@/components/BrandTitle';

export const dynamic = 'force-dynamic';

/**
 * §188 M8（MCP / 外部 Agent / 公开 API）的账号侧入口：这一页只管一件事——
 * 发得出、认得出、收得回一枚给平台外程序用的凭据。
 */
export default async function ApiTokensPage(): Promise<ReactElement> {
  const user = await currentUserOrNull();
  if (!user) redirect('/');
  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-[var(--nexus-space-5)] px-[var(--nexus-space-4)] py-[var(--nexus-space-6)]" data-api-tokens-page>
      <header className="flex flex-col gap-2">
        <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
          TOKENS
        </span>
        <BrandTitle          className="relative inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight"
          data-api-tokens-title
        >
          公开 API 凭据
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
          />
        </BrandTitle>
        <p className="max-w-2xl text-13 leading-6 text-fg-2">
          给平台外的程序（外部 Agent、脚本、CI）用<code className="text-fg-2">Authorization: Bearer &lt;token&gt;</code>。今天 v1 是三个只读端点加一个写端点（<code className="text-fg-2">PATCH - design</code>，要<code className="text-fg-2">design:write</code>）：写发的是补丁而不是整份文档，删除类动作在这一侧一律拒。
          <Link href="/" className="ml-2 text-accent-2-ink underline">
            回创作页
          </Link>
        </p>
      </header>
      <ApiTokensPanel />
    </main>
  );
}
